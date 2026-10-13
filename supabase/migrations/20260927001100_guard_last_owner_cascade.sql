-- The last-owner guard must not fire when the membership is disappearing as a
-- consequence of its parent disappearing:
--
--   * deleting a business cascades to its members — there is no business left
--     to protect;
--   * deleting a user account cascades to their memberships — refusing that
--     would make accounts permanently undeletable, which is far worse than a
--     temporarily ownerless business.
--
-- The guard still covers the realistic mistake: demoting, suspending or
-- removing the final owner through the application.

create or replace function app.guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining int;
  target_business uuid := coalesce(old.business_id, new.business_id);
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Parent already gone: this is a cascade, not a demotion.
    if not exists (select 1 from public.businesses where id = old.business_id) then
      return old;
    end if;
    if not exists (select 1 from auth.users where id = old.user_id) then
      return old;
    end if;
  end if;

  select count(*) into remaining
  from public.business_members
  where business_id = target_business
    and role = 'owner'
    and status = 'active'
    and id <> old.id;

  if remaining = 0 then
    raise exception 'A business must keep at least one active owner'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;
