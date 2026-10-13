-- Recording a payment against a party (SPEC §43). Always a ledger entry;
-- a party's balance is never written directly.

create or replace function public.record_party_payment(
  p_party_id uuid,
  p_amount   numeric,
  p_direction text,            -- 'in' when they pay us, 'out' when we pay them
  p_method   public.payment_method default 'cash',
  p_reference text default null,
  p_notes    text default null
)
returns public.party_ledger_entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_entry    public.party_ledger_entries;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero'
      using errcode = 'check_violation';
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'A payment must be either in or out'
      using errcode = 'check_violation';
  end if;

  select business_id into v_business from public.parties where id = p_party_id;

  if v_business is null then
    raise exception 'That contact does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_parties(v_business) then
    raise exception 'You do not have permission to record payments'
      using errcode = '42501';
  end if;

  insert into public.party_ledger_entries (
    business_id, party_id, entry_type, debit, credit,
    reference_type, description, created_by
  )
  values (
    v_business, p_party_id,
    (case when p_direction = 'in' then 'payment_in' else 'payment_out' end)::public.ledger_entry_type,
    -- Money received reduces what they owe, so it is a credit.
    case when p_direction = 'in' then 0 else p_amount end,
    case when p_direction = 'in' then p_amount else 0 end,
    'payment',
    coalesce(nullif(trim(p_notes), ''), initcap(p_method::text) || ' payment'),
    v_user
  )
  returning * into v_entry;

  return v_entry;
end;
$$;

revoke all on function public.record_party_payment(
  uuid, numeric, text, public.payment_method, text, text
) from public, anon;
grant execute on function public.record_party_payment(
  uuid, numeric, text, public.payment_method, text, text
) to authenticated;

-- A credit sale must post to the customer's ledger in the same transaction as
-- the sale itself, so the two can never disagree.
create or replace function app.post_sale_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'posted'
     and (old.status is distinct from 'posted')
     and new.customer_id is not null
     and new.due_amount > 0
  then
    insert into public.party_ledger_entries (
      business_id, party_id, entry_type, debit, credit,
      reference_type, reference_id, description, created_by
    )
    values (
      new.business_id, new.customer_id, 'sale', new.due_amount, 0,
      'sale', new.id, 'Invoice ' || coalesce(new.invoice_number, ''), new.created_by
    );
  end if;

  return new;
end;
$$;

create trigger sales_post_to_ledger
  after update on public.sales
  for each row execute function app.post_sale_to_ledger();
