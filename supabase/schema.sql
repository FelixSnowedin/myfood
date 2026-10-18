-- myfood schema. Run once in the Supabase SQL editor.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  barcode text unique check (barcode is null or length(trim(barcode)) > 0),
  category text not null default 'Sonstiges',
  min_stock int not null default 0 check (min_stock >= 0),
  created_at timestamptz not null default now()
);

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity int not null check (quantity >= 1),
  best_before date,
  fill_level text not null default 'voll' check (fill_level in ('voll', 'angebrochen', 'fast_leer')),
  planned_for text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (product_id, best_before)
);

-- One household: every signed-in user may do everything, anonymous users nothing.
-- Self sign-up must be disabled in Supabase Auth, otherwise anyone could join.
alter table public.products enable row level security;
alter table public.stock enable row level security;
create policy household on public.products for all to authenticated using (true) with check (true);
create policy household on public.stock for all to authenticated using (true) with check (true);
grant select, insert, update, delete on table public.products, public.stock to authenticated;
revoke all on table public.products, public.stock from anon;

-- Same product + same best-before date is merged into one row.
create function public.add_stock(p_product_id uuid, p_quantity int, p_best_before date default null)
returns public.stock language sql set search_path = '' as $$
  insert into public.stock (product_id, quantity, best_before)
  values (p_product_id, p_quantity, p_best_before)
  on conflict (product_id, best_before)
    do update set quantity = stock.quantity + excluded.quantity
  returning *;
$$;

-- Takes one unit, resets fill level for the next pack, deletes at zero.
-- Returns the row as it was before (for undo), or null if it no longer exists.
create function public.consume(p_stock_id uuid)
returns public.stock language plpgsql set search_path = '' as $$
declare prev public.stock;
begin
  select * into prev from public.stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.quantity <= 1 then
    delete from public.stock where id = p_stock_id;
  else
    update public.stock set quantity = quantity - 1, fill_level = 'voll' where id = p_stock_id;
  end if;
  return prev;
end $$;

-- voll -> angebrochen -> fast_leer -> consume.
create function public.advance_fill(p_stock_id uuid)
returns public.stock language plpgsql set search_path = '' as $$
declare prev public.stock;
begin
  select * into prev from public.stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.fill_level = 'fast_leer' then
    return public.consume(p_stock_id);
  end if;
  update public.stock
    set fill_level = case prev.fill_level when 'voll' then 'angebrochen' else 'fast_leer' end
    where id = p_stock_id;
  return prev;
end $$;

revoke execute on function public.add_stock(uuid, int, date), public.consume(uuid), public.advance_fill(uuid) from public, anon;
grant execute on function public.add_stock(uuid, int, date), public.consume(uuid), public.advance_fill(uuid) to authenticated;

alter publication supabase_realtime add table public.products, public.stock;
