-- RLS for the ledger. Reads for any member; writes only through RPCs, so
-- there is no INSERT policy on stock_movements for ordinary clients — the
-- ledger must never be written ad hoc from a browser (SPEC §11, §43).

alter table public.stock_movements enable row level security;
alter table public.stock_movements force row level security;

alter table public.inventory_balances enable row level security;
alter table public.inventory_balances force row level security;

create policy stock_movements_select_member on public.stock_movements
  for select to authenticated
  using (app.is_member(business_id));

create policy inventory_balances_select_member on public.inventory_balances
  for select to authenticated
  using (app.is_member(business_id));

-- No insert/update/delete policies: the immutability trigger blocks mutation
-- and all inserts arrive through SECURITY DEFINER functions.

revoke all on public.stock_movements from anon;
revoke all on public.inventory_balances from anon;
