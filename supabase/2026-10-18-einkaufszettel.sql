-- myfood: Einkaufszettel. Run once in the Supabase SQL editor, after schema.sql.

create table public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
-- At most one open list.
create unique index shopping_lists_one_open on public.shopping_lists ((finished_at is null)) where finished_at is null;

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null check (length(trim(name)) > 0),
  quantity int not null default 1 check (quantity >= 1),
  checked boolean not null default false,
  created_at timestamptz not null default now()
);
-- A product appears at most once per list.
create unique index shopping_items_one_per_product on public.shopping_items (list_id, product_id) where product_id is not null;

-- Same rules as stock: every signed-in household member may do everything, anonymous users nothing.
alter table public.shopping_lists enable row level security;
alter table public.shopping_items enable row level security;
create policy household on public.shopping_lists for all to authenticated using (true) with check (true);
create policy household on public.shopping_items for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.shopping_lists, public.shopping_items to authenticated;
revoke all on table public.shopping_lists, public.shopping_items from anon;

-- Id of the open list; creates it if there is none (the partial index keeps it unique under races).
create function public.open_list()
returns uuid language plpgsql set search_path = '' as $$
declare v_list uuid;
begin
  select id into v_list from public.shopping_lists where finished_at is null;
  if found then return v_list; end if;
  insert into public.shopping_lists default values on conflict do nothing returning id into v_list;
  if v_list is null then
    select id into v_list from public.shopping_lists where finished_at is null;
  end if;
  return v_list;
end $$;

-- Adds to the open list; an item already on it (same product, or same free text) gets more quantity.
create function public.add_to_list(p_product_id uuid, p_name text, p_quantity int default 1)
returns public.shopping_items language plpgsql set search_path = '' as $$
declare
  v_list uuid := public.open_list();
  v_item public.shopping_items;
begin
  if p_product_id is not null then
    insert into public.shopping_items (list_id, product_id, name, quantity)
    values (v_list, p_product_id, trim(p_name), p_quantity)
    on conflict (list_id, product_id) where product_id is not null
      do update set quantity = shopping_items.quantity + excluded.quantity
    returning * into v_item;
  else
    update public.shopping_items set quantity = quantity + p_quantity
      where list_id = v_list and product_id is null and lower(trim(name)) = lower(trim(p_name))
      returning * into v_item;
    if not found then
      insert into public.shopping_items (list_id, name, quantity)
      values (v_list, trim(p_name), p_quantity)
      returning * into v_item;
    end if;
  end if;
  return v_item;
end $$;

-- Copies all items of an archived list (unchecked) into the open list, skipping what is already there.
create function public.copy_list(p_from uuid)
returns int language plpgsql set search_path = '' as $$
declare
  v_list uuid := public.open_list();
  v_count int;
begin
  insert into public.shopping_items (list_id, product_id, name, quantity)
  select v_list, i.product_id, i.name, i.quantity
  from public.shopping_items i
  where i.list_id = p_from and i.list_id <> v_list
    and not exists (
      select 1 from public.shopping_items o
      where o.list_id = v_list
        and (o.product_id = i.product_id
             or (i.product_id is null and o.product_id is null and lower(trim(o.name)) = lower(trim(i.name))))
    );
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Books the given checked items into stock, archives the list, opens a new one and
-- moves the unchecked items onto it. All or nothing.
-- p_bookings: [{ "item_id": uuid, "quantity": int, "best_before": "YYYY-MM-DD" | null }]
create function public.finish_list(p_list uuid, p_bookings jsonb)
returns int language plpgsql set search_path = '' as $$
declare
  v_finished timestamptz;
  v_new uuid;
  v_booking jsonb;
  v_item public.shopping_items;
  v_product uuid;
  v_count int := 0;
begin
  select finished_at into v_finished from public.shopping_lists where id = p_list for update;
  if not found then raise exception 'Diesen Einkauf gibt es nicht mehr.'; end if;
  if v_finished is not null then raise exception 'Dieser Einkauf wurde schon abgeschlossen.'; end if;

  for v_booking in select value from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) loop
    select * into v_item from public.shopping_items
      where id = (v_booking->>'item_id')::uuid and list_id = p_list and checked;
    if not found then continue; end if;
    v_product := v_item.product_id;
    if v_product is null then
      select id into v_product from public.products where lower(trim(name)) = lower(trim(v_item.name)) limit 1;
      if v_product is null then
        insert into public.products (name) values (trim(v_item.name)) returning id into v_product;
      end if;
    end if;
    perform public.add_stock(v_product, (v_booking->>'quantity')::int, nullif(v_booking->>'best_before', '')::date);
    v_count := v_count + 1;
  end loop;

  update public.shopping_lists set finished_at = now() where id = p_list;
  insert into public.shopping_lists default values returning id into v_new;
  update public.shopping_items set list_id = v_new where list_id = p_list and not checked;
  return v_count;
end $$;

revoke execute on function public.open_list(), public.add_to_list(uuid, text, int), public.copy_list(uuid), public.finish_list(uuid, jsonb) from public, anon;
grant execute on function public.open_list(), public.add_to_list(uuid, text, int), public.copy_list(uuid), public.finish_list(uuid, jsonb) to authenticated;

alter publication supabase_realtime add table public.shopping_lists, public.shopping_items;
