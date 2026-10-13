-- Business settings and staff management (SPEC §24, §26).
--
-- Two gaps closed here:
--   1. Members could not see each other. profiles_select_own meant a staff
--      list could only ever show the signed-in user's own name.
--   2. A manager could promote themselves to owner, or demote the owner,
--      because the member UPDATE policy treats owner and manager alike.

-- ---------------------------------------------------------------------------
-- Co-members may read each other's profile
-- ---------------------------------------------------------------------------

-- security definer so the policy can look at business_members without
-- recursing through that table's own policies.
create or replace function app.shares_business(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.business_members mine
    join public.business_members theirs
      on theirs.business_id = mine.business_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = target_user
  );
$$;

revoke all on function app.shares_business(uuid) from public, anon;
grant execute on function app.shares_business(uuid) to authenticated;

create policy profiles_select_comembers on public.profiles
  for select to authenticated
  using (app.shares_business(id));

-- ---------------------------------------------------------------------------
-- Only an owner may grant or withdraw ownership
-- ---------------------------------------------------------------------------

create or replace function app.guard_owner_role_changes()
returns trigger
language plpgsql
as $$
declare
  target_business uuid := coalesce(new.business_id, old.business_id);
  touches_owner boolean :=
    coalesce(new.role = 'owner', false) or coalesce(old.role = 'owner', false);
begin
  -- Only ownership itself is restricted; managers still manage everyone else.
  if not touches_owner then
    return coalesce(new, old);
  end if;

  -- app.create_business() writes the founding owner row before any membership
  -- exists, so it cannot be judged by has_role.
  if tg_op = 'INSERT' and not exists (
    select 1 from public.business_members
    where business_id = target_business and role = 'owner'
  ) then
    return new;
  end if;

  if not app.has_role(target_business, array['owner']::public.member_role[]) then
    raise exception 'Only an owner can grant or withdraw ownership'
      using errcode = 'insufficient_privilege';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger business_members_guard_owner_role
  before insert or update or delete on public.business_members
  for each row execute function app.guard_owner_role_changes();

comment on function app.guard_owner_role_changes() is
  'Keeps the owner role out of reach of managers (SPEC §26, §53).';
