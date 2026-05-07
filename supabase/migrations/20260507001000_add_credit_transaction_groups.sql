alter table public.credit_transactions
add column if not exists group_id uuid,
add column if not exists group_name text;

create index if not exists credit_transactions_group_id_idx
on public.credit_transactions (group_id);
