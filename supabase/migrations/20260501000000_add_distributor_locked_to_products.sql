alter table public.products
  add column if not exists distributor_locked boolean not null default false;

