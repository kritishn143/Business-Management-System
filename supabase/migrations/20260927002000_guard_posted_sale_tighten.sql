-- The payment branch of the posted-sale guard was too permissive: it checked
-- only the money totals, so sale_date, customer_id and notes could still be
-- rewritten after posting. Backdating a posted sale is an audit hole (SPEC §69).
--
-- Now a posted sale admits exactly two changes:
--   1. a status transition (void / returned), performed by an RPC;
--   2. paid_amount and due_amount moving as payments are recorded.
-- Everything else is refused.

create or replace function app.guard_posted_sale()
returns trigger
language plpgsql
as $$
declare
  v_identical_except_money boolean;
begin
  if old.status = 'draft' then
    return new;
  end if;

  -- Every field that defines what the sale *is* must be untouched.
  v_identical_except_money :=
        new.id                =              old.id
    and new.business_id       =              old.business_id
    and new.location_id       =              old.location_id
    and new.sale_date         =              old.sale_date
    and new.subtotal          =              old.subtotal
    and new.discount_amount   =              old.discount_amount
    and new.additional_charge =              old.additional_charge
    and new.tax_amount        =              old.tax_amount
    and new.round_off         =              old.round_off
    and new.total_amount      =              old.total_amount
    and new.created_at        =              old.created_at
    and new.customer_id       is not distinct from old.customer_id
    and new.invoice_number    is not distinct from old.invoice_number
    and new.notes             is not distinct from old.notes
    and new.client_transaction_id is not distinct from old.client_transaction_id;

  if not v_identical_except_money then
    raise exception
      'A posted sale cannot be edited. Create a return or void it instead.'
      using errcode = 'check_violation';
  end if;

  -- created_by may only be nulled out by an account deletion.
  if new.created_by is distinct from old.created_by
     and not (new.created_by is null
              and not exists (select 1 from auth.users where id = old.created_by))
  then
    raise exception 'A posted sale cannot change who recorded it'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
