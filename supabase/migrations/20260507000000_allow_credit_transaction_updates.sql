drop policy if exists "Authenticated users can update credit transactions" on public.credit_transactions;
create policy "Authenticated users can update credit transactions"
on public.credit_transactions
for update
to authenticated
using (true)
with check (true);
