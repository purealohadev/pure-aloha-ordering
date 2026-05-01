create table if not exists public.sales_history (
  id uuid primary key default gen_random_uuid(),
  sku text,
  product_name text not null,
  brand_name text,
  quantity_sold integer not null default 0,
  sale_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists sales_history_sale_date_idx on public.sales_history (sale_date);
create index if not exists sales_history_sku_idx on public.sales_history (sku);
create index if not exists sales_history_brand_name_product_name_idx
  on public.sales_history (brand_name, product_name);
