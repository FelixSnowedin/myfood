-- myfood: Nachbesserungen Rezepte. Run once in the Supabase SQL editor, after 2026-10-28-rezepte.sql.

-- Saves a recipe; on a rename, reservations on the open list and stock planned for the old name
-- move to the new name. All or nothing.
create function public.update_recipe(p_id uuid, p_name text, p_items jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  v_old text;
  v_new text := trim(p_name);
  v_stock public.stock;
begin
  select name into v_old from public.recipes where id = p_id for update;
  if not found then raise exception 'Das Rezept gibt es nicht mehr.'; end if;
  update public.recipes set name = v_new, items = p_items where id = p_id;
  if v_old = v_new then return; end if;
  update public.shopping_items
    set reserved = (reserved - v_old) || jsonb_build_object(v_new, coalesce((reserved->>v_new)::int, 0) + (reserved->>v_old)::int)
    where list_id = public.open_list() and reserved ? v_old;
  for v_stock in select * from public.stock where planned_for = v_old loop
    perform public.move_stock(v_stock.id, v_stock.quantity, v_new);
  end loop;
end $$;

-- Same as before, plus p_also: further "Geplant für" texts that mean this recipe
-- (e.g. „pizza am Freitag“ for „Pizza“); stock planned for them becomes free as well.
drop function public.unplan_recipe(text);
create function public.unplan_recipe(p_recipe text, p_also text[] default '{}')
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
  for v_stock in select * from public.stock where planned_for = v_name or planned_for = any(p_also) loop
    perform public.move_stock(v_stock.id, v_stock.quantity, null);
  end loop;
end $$;

revoke execute on function public.update_recipe(uuid, text, jsonb), public.unplan_recipe(text, text[]) from public, anon;
grant execute on function public.update_recipe(uuid, text, jsonb), public.unplan_recipe(text, text[]) to authenticated;

-- Recipe ideas someone dismissed, for the whole household.
create table public.recipe_ideas_dismissed (
  key text primary key check (length(key) > 0),
  created_at timestamptz not null default now()
);
alter table public.recipe_ideas_dismissed enable row level security;
create policy household on public.recipe_ideas_dismissed for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.recipe_ideas_dismissed to authenticated;
revoke all on table public.recipe_ideas_dismissed from anon;

alter publication supabase_realtime add table public.recipe_ideas_dismissed;
