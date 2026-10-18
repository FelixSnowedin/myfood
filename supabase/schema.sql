-- myfood schema. Run once in the Supabase SQL editor.

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  barcode text unique,
  category text not null default 'Sonstiges',
  min_stock int not null default 0 check (min_stock >= 0),
  created_at timestamptz not null default now()
);

create table stock (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  quantity int not null check (quantity >= 1),
  best_before date,
  fill_level text not null default 'voll' check (fill_level in ('voll', 'angebrochen', 'fast_leer')),
  planned_for text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (product_id, best_before)
);

-- One household: every signed-in user may do everything, anonymous users nothing.
alter table products enable row level security;
alter table stock enable row level security;
create policy household on products for all to authenticated using (true) with check (true);
create policy household on stock for all to authenticated using (true) with check (true);

-- Same product + same best-before date is merged into one row.
create function add_stock(p_product_id uuid, p_quantity int, p_best_before date)
returns stock language sql as $$
  insert into stock (product_id, quantity, best_before)
  values (p_product_id, p_quantity, p_best_before)
  on conflict (product_id, best_before)
    do update set quantity = stock.quantity + excluded.quantity
  returning *;
$$;

-- Takes one unit, resets fill level for the next pack, deletes at zero.
-- Returns the row as it was before (for undo), or null if it no longer exists.
create function consume(p_stock_id uuid)
returns stock language plpgsql as $$
declare prev stock;
begin
  select * into prev from stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.quantity <= 1 then
    delete from stock where id = p_stock_id;
  else
    update stock set quantity = quantity - 1, fill_level = 'voll' where id = p_stock_id;
  end if;
  return prev;
end $$;

-- voll -> angebrochen -> fast_leer -> consume.
create function advance_fill(p_stock_id uuid)
returns stock language plpgsql as $$
declare prev stock;
begin
  select * into prev from stock where id = p_stock_id for update;
  if not found then return null; end if;
  if prev.fill_level = 'fast_leer' then
    return consume(p_stock_id);
  end if;
  update stock
    set fill_level = case prev.fill_level when 'voll' then 'angebrochen' else 'fast_leer' end
    where id = p_stock_id;
  return prev;
end $$;

alter publication supabase_realtime add table products, stock;
