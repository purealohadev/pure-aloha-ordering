create extension if not exists pgcrypto;

create table if not exists public.price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid null,
  sku text,
  brand_name text,
  product_name text,
  distributor text,
  unit_cost numeric,
  previous_unit_cost numeric,
  change_amount numeric,
  change_percent numeric,
  change_direction text,
  imported_at timestamptz not null default now(),
  source text
);

create index if not exists price_history_product_id_imported_at_idx
  on public.price_history (product_id, imported_at desc);

create index if not exists price_history_sku_imported_at_idx
  on public.price_history (sku, imported_at desc);

create index if not exists price_history_brand_name_product_name_distributor_idx
  on public.price_history (brand_name, product_name, distributor, imported_at desc);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  sku text,
  brand_name text,
  product_name text,
  distributor text,
  old_price numeric,
  new_price numeric,
  change_amount numeric,
  change_percent numeric,
  change_direction text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create unique index if not exists price_alerts_dedupe_idx
  on public.price_alerts (
    coalesce(sku, ''),
    coalesce(brand_name, ''),
    coalesce(product_name, ''),
    coalesce(distributor, ''),
    coalesce(new_price::text, ''),
    coalesce(change_direction, '')
  );

create index if not exists price_alerts_status_created_at_idx
  on public.price_alerts (status, created_at desc);

create index if not exists price_alerts_change_direction_idx
  on public.price_alerts (change_direction);

alter table public.price_history enable row level security;
alter table public.price_alerts enable row level security;

drop policy if exists "Authenticated users can read price history" on public.price_history;
create policy "Authenticated users can read price history"
on public.price_history
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can read price alerts" on public.price_alerts;
create policy "Authenticated users can read price alerts"
on public.price_alerts
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can update price alerts" on public.price_alerts;
create policy "Authenticated users can update price alerts"
on public.price_alerts
for update
to authenticated
using (true)
with check (true);
