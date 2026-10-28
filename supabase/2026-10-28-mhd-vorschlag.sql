-- myfood MHD-Vorschlag. Run once in the Supabase SQL editor, after schema.sql.
-- Learns per product how many days the best-before date usually lies after the day of entry.

alter table public.products
  add column mhd_days_sum int not null default 0 check (mhd_days_sum >= 0),
  add column mhd_days_count int not null default 0 check (mhd_days_count >= 0);

-- Stored on the product because consume() deletes used-up stock rows.
-- Start values from the current stock; typos and expired dates (outside 0..1825 days) are ignored.
update public.products p
  set mhd_days_sum = s.days_sum, mhd_days_count = s.days_count
  from (
    select product_id, sum(days) as days_sum, count(*) as days_count
    from (
      select product_id, best_before - (created_at at time zone 'Europe/Berlin')::date as days
      from public.stock where best_before is not null
    ) d
    where days between 0 and 1825
    group by product_id
  ) s
  where p.id = s.product_id;

-- Same as before (merges same product + best-before date), plus learning.
-- A date equal to the current suggestion (floor of the mean) is a taken-over suggestion,
-- not a new measurement, and is not counted. Same signature, so finish_list and grants stay.
create or replace function public.add_stock(p_product_id uuid, p_quantity int, p_best_before date default null)
returns public.stock language plpgsql set search_path = '' as $$
declare
  v_row public.stock;
  v_days int := p_best_before - (now() at time zone 'Europe/Berlin')::date;
begin
  insert into public.stock (product_id, quantity, best_before)
  values (p_product_id, p_quantity, p_best_before)
  on conflict (product_id, best_before)
    do update set quantity = stock.quantity + excluded.quantity
  returning * into v_row;

  update public.products
    set mhd_days_sum = mhd_days_sum + v_days, mhd_days_count = mhd_days_count + 1
    where id = p_product_id
      and v_days between 0 and 1825 -- null without a date
      and (mhd_days_count = 0 or v_days <> mhd_days_sum / mhd_days_count);
  return v_row;
end $$;
