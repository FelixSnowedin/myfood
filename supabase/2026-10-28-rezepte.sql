-- myfood: Rezepte. Run once in the Supabase SQL editor, after 2026-10-18-einkaufszettel.sql
-- and 2026-10-28-mhd-vorschlag.sql.
-- A recipe is a named group of ingredients that can be put on the shopping list in one go.
-- What is put on the list or found free in stock for it is reserved for the recipe, so a second
-- recipe does not count it again, and finishing the purchase books it with "Geplant für".

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- [{ "product_id": uuid | null, "name": text, "quantity": int }]
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index recipes_name on public.recipes (lower(trim(name)));

alter table public.recipes enable row level security;
create policy household on public.recipes for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.recipes to authenticated;
revoke all on table public.recipes from anon;

-- How much of an item is reserved for which recipe, e.g. { "Lasagne": 1 }. The rest is free.
alter table public.shopping_items
  add column reserved jsonb not null default '{}' check (jsonb_typeof(reserved) = 'object');

-- Stock planned for something is its own row, so part of a row can be reserved.
-- The old (product_id, best_before) constraint is the only unique one on stock; found by type, not by name.
do $$
declare v_name text;
begin
  select conname into strict v_name from pg_constraint where conrelid = 'public.stock'::regclass and contype = 'u';
  execute format('alter table public.stock drop constraint %I', v_name);
end $$;
alter table public.stock add constraint stock_product_best_before_planned
  unique nulls not distinct (product_id, best_before, planned_for);

-- Same as before (merge + MHD learning), now merging per "Geplant für" as well.
drop function public.add_stock(uuid, int, date);
create function public.add_stock(p_product_id uuid, p_quantity int, p_best_before date default null, p_planned_for text default null)
returns public.stock language plpgsql set search_path = '' as $$
declare
  v_row public.stock;
  v_days int := p_best_before - (now() at time zone 'Europe/Berlin')::date;
begin
  insert into public.stock (product_id, quantity, best_before, planned_for)
  values (p_product_id, p_quantity, p_best_before, nullif(trim(p_planned_for), ''))
  on conflict (product_id, best_before, planned_for)
    do update set quantity = stock.quantity + excluded.quantity
  returning * into v_row;

  update public.products
    set mhd_days_sum = mhd_days_sum + v_days, mhd_days_count = mhd_days_count + 1
    where id = p_product_id
      and v_days between 0 and 1825 -- null without a date
      and (mhd_days_count = 0 or v_days <> mhd_days_sum / mhd_days_count);
  return v_row;
end $$;

-- Moves p_qty units of a stock row to the row of the same product and MHD planned for p_planned
-- (merging with it; the source shrinks or disappears). A split-off part starts as a full pack.
create function public.move_stock(p_id uuid, p_qty int, p_planned text)
returns void language plpgsql set search_path = '' as $$
declare
  v_src public.stock;
  v_target uuid;
begin
  select * into v_src from public.stock where id = p_id for update;
  if not found or p_qty < 1 or v_src.planned_for is not distinct from p_planned then return; end if;
  p_qty := least(p_qty, v_src.quantity);
  select id into v_target from public.stock
    where product_id = v_src.product_id and best_before is not distinct from v_src.best_before
      and planned_for is not distinct from p_planned
    for update;
  if v_target is null and p_qty = v_src.quantity then
    update public.stock set planned_for = p_planned where id = p_id;
    return;
  end if;
  if v_target is null then
    insert into public.stock (product_id, quantity, best_before, planned_for)
    values (v_src.product_id, p_qty, v_src.best_before, p_planned);
  else
    update public.stock set quantity = quantity + p_qty where id = v_target;
  end if;
  if p_qty = v_src.quantity then
    delete from public.stock where id = p_id;
  else
    update public.stock set quantity = quantity - p_qty where id = p_id;
  end if;
end $$;

-- Plans a recipe. p_items: [{ "product_id": uuid | null, "name": text, "add": int, "quantity": int }]
-- "add" goes onto the open list, reserved for the recipe. The rest of "quantity" is reserved from
-- what is free: first unreserved quantity of the same item on the list, then unreserved stock
-- (soonest MHD first). All or nothing.
create function public.plan_recipe(p_recipe text, p_items jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_name text := trim(p_recipe);
  v_list uuid := public.open_list();
  v_line jsonb;
  v_product uuid;
  v_add int;
  v_rest int;
  v_take int;
  v_item public.shopping_items;
  v_stock public.stock;
begin
  if v_name = '' then raise exception 'Das Rezept braucht einen Namen.'; end if;
  for v_line in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_product := nullif(v_line->>'product_id', '')::uuid;
    v_add := greatest(coalesce((v_line->>'add')::int, 0), 0);
    v_rest := greatest(coalesce((v_line->>'quantity')::int, 0) - v_add, 0);

    if v_add > 0 then
      v_item := public.add_to_list(v_product, v_line->>'name', v_add);
      update public.shopping_items
        set reserved = reserved || jsonb_build_object(v_name, coalesce((reserved->>v_name)::int, 0) + v_add)
        where id = v_item.id;
    end if;

    if v_rest > 0 then
      select * into v_item from public.shopping_items
        where list_id = v_list and not checked
          and (product_id = v_product
               or (v_product is null and product_id is null and lower(trim(name)) = lower(trim(v_line->>'name'))))
        order by created_at limit 1
        for update;
      if found then
        v_take := least(v_rest, v_item.quantity - (select coalesce(sum(value::int), 0) from jsonb_each_text(v_item.reserved)));
        if v_take > 0 then
          update public.shopping_items
            set reserved = reserved || jsonb_build_object(v_name, coalesce((reserved->>v_name)::int, 0) + v_take)
            where id = v_item.id;
          v_rest := v_rest - v_take;
        end if;
      end if;
    end if;

    if v_rest > 0 and v_product is not null then
      for v_stock in
        select * from public.stock where product_id = v_product and planned_for is null
        order by best_before nulls last, created_at
      loop
        exit when v_rest = 0;
        v_take := least(v_rest, v_stock.quantity);
        perform public.move_stock(v_stock.id, v_take, v_name);
        v_rest := v_rest - v_take;
      end loop;
    end if;
  end loop;
  update public.recipes set last_used_at = now() where lower(trim(name)) = lower(v_name);
end $$;

-- Takes a recipe off the plan: what was reserved for it leaves the open list (what is already
-- in the cart stays), stock planned for it becomes free again.
create function public.unplan_recipe(p_recipe text)
returns void language plpgsql set search_path = '' as $$
declare
  v_name text := trim(p_recipe);
  v_list uuid := public.open_list();
  v_stock public.stock;
begin
  delete from public.shopping_items
    where list_id = v_list and not checked and reserved ? v_name and quantity <= (reserved->>v_name)::int;
  update public.shopping_items
    set quantity = quantity - (reserved->>v_name)::int, reserved = reserved - v_name
    where list_id = v_list and not checked and reserved ? v_name;
  for v_stock in select * from public.stock where planned_for = v_name loop
    perform public.move_stock(v_stock.id, v_stock.quantity, null);
  end loop;
end $$;

-- Same as before, plus "planned_for" per booking (one booking per recipe of an item).
-- p_bookings: [{ "item_id": uuid, "quantity": int, "best_before": "YYYY-MM-DD" | null, "planned_for": text | null }]
create or replace function public.finish_list(p_list uuid, p_bookings jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  v_finished timestamptz;
  v_new uuid;
  v_booking jsonb;
  v_item public.shopping_items;
  v_product uuid;
  v_qty int;
  v_count int := 0;
begin
  select finished_at into v_finished from public.shopping_lists where id = p_list for update;
  if not found then raise exception 'Diesen Einkauf gibt es nicht mehr.'; end if;
  if v_finished is not null then raise exception 'Dieser Einkauf wurde schon abgeschlossen.'; end if;
  -- Freeze the items: a check/uncheck during finishing must not book and move the same item.
  perform 1 from public.shopping_items where list_id = p_list for update;

  for v_booking in select value from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) loop
    select * into v_item from public.shopping_items
      where id = (v_booking->>'item_id')::uuid and list_id = p_list and checked;
    if not found then continue; end if;
    v_qty := (v_booking->>'quantity')::int;
    if v_qty is null or v_qty < 1 then
      raise exception 'Menge für „%“ muss mindestens 1 sein.', v_item.name;
    end if;
    v_product := v_item.product_id;
    if v_product is null then
      select id into v_product from public.products
        where lower(trim(name)) = lower(trim(v_item.name)) order by created_at limit 1;
      if v_product is null then
        insert into public.products (name) values (trim(v_item.name)) returning id into v_product;
      end if;
    end if;
    perform public.add_stock(v_product, v_qty, nullif(v_booking->>'best_before', '')::date, v_booking->>'planned_for');
    v_count := v_count + 1;
  end loop;

  update public.shopping_lists set finished_at = now() where id = p_list;
  insert into public.shopping_lists default values returning id into v_new;
  update public.shopping_items set list_id = v_new where list_id = p_list and not checked;
  return v_count;
end $$;

revoke execute on function public.add_stock(uuid, int, date, text), public.move_stock(uuid, int, text),
  public.plan_recipe(text, jsonb), public.unplan_recipe(text) from public, anon;
grant execute on function public.add_stock(uuid, int, date, text), public.move_stock(uuid, int, text),
  public.plan_recipe(text, jsonb), public.unplan_recipe(text) to authenticated;

alter publication supabase_realtime add table public.recipes;
