create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  old_cost numeric,
  new_cost numeric not null,
  changed_at timestamptz not null default now(),
  source text default 'manual'
);

create index if not exists price_history_product_id_idx
on price_history(product_id);

create index if not exists price_history_changed_at_idx
on price_history(changed_at);