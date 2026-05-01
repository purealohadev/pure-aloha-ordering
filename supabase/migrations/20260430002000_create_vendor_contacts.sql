create table if not exists public.vendor_contacts (
  id uuid primary key default gen_random_uuid(),
  distributor text,
  vendor_name text,
  rep_name text,
  rep_email text,
  rep_phone text,
  ordering_email text,
  accounting_email text,
  payment_terms text,
  notes text,
  last_contacted date,
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists vendor_contacts_distributor_vendor_name_idx
  on public.vendor_contacts (distributor, vendor_name);
