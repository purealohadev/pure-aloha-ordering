create extension if not exists pgcrypto;

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  distributor text,
  vendor_name text,
  credit_type text,
  credit_amount numeric,
  credit_date date,
  status text,
  notes text,
  created_at timestamptz default now()
);

alter table public.credit_transactions enable row level security;

drop policy if exists "Authenticated users can read credit transactions" on public.credit_transactions;
create policy "Authenticated users can read credit transactions"
on public.credit_transactions
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert credit transactions" on public.credit_transactions;
create policy "Authenticated users can insert credit transactions"
on public.credit_transactions
for insert
to authenticated
with check (true);
