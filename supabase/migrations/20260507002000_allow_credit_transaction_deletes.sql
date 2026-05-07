drop policy if exists "Authenticated users can delete credit transactions" on public.credit_transactions;
create policy "Authenticated users can delete credit transactions"
on public.credit_transactions
for delete
to authenticated
using (true);
