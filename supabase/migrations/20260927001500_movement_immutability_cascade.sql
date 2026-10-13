-- Immutability must not make rows undeletable *with their parent*, nor make
-- accounts undeletable. The trigger now stands aside for exactly two cases,
-- and still refuses every ordinary edit.

create or replace function app.deny_movement_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    -- Parent already gone: this is a cascade, not an attempt to rewrite history.
    if not exists (select 1 from public.businesses where id = old.business_id) then
      return old;
    end if;
    if not exists (select 1 from public.products where id = old.product_id) then
      return old;
    end if;
  end if;

  -- Deleting a user nulls created_by. Allow that single field to change, and
  -- only when the account really is gone and nothing else was touched.
  if tg_op = 'UPDATE'
     and new.created_by is null
     and old.created_by is not null
     and not exists (select 1 from auth.users where id = old.created_by)
     and new.id             =              old.id
     and new.business_id    =              old.business_id
     and new.product_id     =              old.product_id
     and new.location_id    =              old.location_id
     and new.movement_type  =              old.movement_type
     and new.quantity       =              old.quantity
     and new.created_at     =              old.created_at
     and new.unit_cost      is not distinct from old.unit_cost
     and new.reference_type is not distinct from old.reference_type
     and new.reference_id   is not distinct from old.reference_id
     and new.reason         is not distinct from old.reason
     and new.notes          is not distinct from old.notes
  then
    return new;
  end if;

  raise exception
    'Stock movements are immutable. Post a correcting adjustment instead.'
    using errcode = 'check_violation';
end;
$$;
