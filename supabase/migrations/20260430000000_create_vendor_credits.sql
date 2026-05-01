create extension if not exists pgcrypto;

create table if not exists public.vendor_credits (
  id uuid primary key default gen_random_uuid(),
  distributor text not null,
  vendor_name text not null,
  credit_limit numeric default 0,
  current_balance numeric default 0,
  available_credit numeric default 0,
  payment_terms text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_vendor_credits_updated_at on public.vendor_credits;

create trigger set_vendor_credits_updated_at
before update on public.vendor_credits
for each row
execute function public.set_updated_at();

alter table public.vendor_credits enable row level security;

drop policy if exists "Authenticated users can read vendor credits" on public.vendor_credits;
create policy "Authenticated users can read vendor credits"
on public.vendor_credits
for select
to authenticated
using (true);

drop policy if exists "Authenticated users can insert vendor credits" on public.vendor_credits;
create policy "Authenticated users can insert vendor credits"
on public.vendor_credits
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update vendor credits" on public.vendor_credits;
create policy "Authenticated users can update vendor credits"
on public.vendor_credits
for update
to authenticated
using (true)
with check (true);
