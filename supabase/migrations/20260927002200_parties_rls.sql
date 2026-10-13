-- RLS for parties. Reading is open to any member; editing a party is a
-- customer-facing action allowed to owners, managers and cashiers, while the
-- ledger is only ever written by RPCs.

alter table public.parties enable row level security;
alter table public.parties force row level security;
alter table public.party_ledger_entries enable row level security;
alter table public.party_ledger_entries force row level security;

create or replace function app.can_manage_parties(target_business uuid)
returns boolean
language sql
stable
as $$
  select app.has_role(
    target_business,
    array['owner', 'manager', 'cashier', 'accountant']::public.member_role[]
  );
$$;
grant execute on function app.can_manage_parties(uuid) to authenticated;

create policy parties_select_member on public.parties
  for select to authenticated
  using (app.is_member(business_id));

create policy parties_insert on public.parties
  for insert to authenticated
  with check (app.can_manage_parties(business_id));

create policy parties_update on public.parties
  for update to authenticated
  using (app.can_manage_parties(business_id))
  with check (app.can_manage_parties(business_id));

create policy parties_delete_admin on public.parties
  for delete to authenticated
  using (app.has_role(business_id, array['owner','manager']::public.member_role[]));

create policy party_ledger_select_member on public.party_ledger_entries
  for select to authenticated
  using (app.is_member(business_id));

revoke all on public.parties from anon;
revoke all on public.party_ledger_entries from anon;
