-- Row Level Security. Every business-owned table is gated on membership
-- (SPEC §44). Policies never trust a client-supplied business_id.

-- ---------------------------------------------------------------------------
-- Helpers. SECURITY DEFINER so membership can be read without re-entering the
-- policy that is asking — otherwise business_members recurses infinitely.
-- ---------------------------------------------------------------------------

create or replace function app.is_member(target_business uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function app.has_role(
  target_business uuid,
  allowed public.member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.business_members
    where business_id = target_business
      and user_id = auth.uid()
      and status = 'active'
      and role = any (allowed)
  );
$$;

revoke all on function app.is_member(uuid) from public, anon;
revoke all on function app.has_role(uuid, public.member_role[]) from public, anon;
grant execute on function app.is_member(uuid) to authenticated;
grant execute on function app.has_role(uuid, public.member_role[]) to authenticated;

-- Roles permitted to change the catalogue.
create or replace function app.can_manage_catalog(target_business uuid)
returns boolean
language sql
stable
as $$
  select app.has_role(
    target_business,
    array['owner', 'manager', 'inventory_manager']::public.member_role[]
  );
$$;
grant execute on function app.can_manage_catalog(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No insert/delete policy: rows are created by the signup trigger and removed
-- by the auth.users cascade.

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

alter table public.businesses enable row level security;
alter table public.businesses force row level security;

create policy businesses_select_member on public.businesses
  for select to authenticated
  using (app.is_member(id));

create policy businesses_update_owner on public.businesses
  for update to authenticated
  using (app.has_role(id, array['owner']::public.member_role[]))
  with check (app.has_role(id, array['owner']::public.member_role[]));

create policy businesses_delete_owner on public.businesses
  for delete to authenticated
  using (app.has_role(id, array['owner']::public.member_role[]));

-- Businesses are created through app.create_business(), which also writes the
-- owner membership in the same transaction. No direct INSERT policy.

-- ---------------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------------

alter table public.business_members enable row level security;
alter table public.business_members force row level security;

create policy business_members_select on public.business_members
  for select to authenticated
  using (user_id = auth.uid() or app.is_member(business_id));

create policy business_members_insert_admin on public.business_members
  for insert to authenticated
  with check (
    app.has_role(business_id, array['owner', 'manager']::public.member_role[])
  );

create policy business_members_update_admin on public.business_members
  for update to authenticated
  using (app.has_role(business_id, array['owner', 'manager']::public.member_role[]))
  with check (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

create policy business_members_delete_admin on public.business_members
  for delete to authenticated
  using (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- Business-owned tables. Read for any active member; write for the roles that
-- own that part of the product.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['locations', 'categories', 'units', 'products', 'product_units']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($p$
      create policy %1$I_select_member on public.%1$I
        for select to authenticated
        using (app.is_member(business_id))
    $p$, t);

    execute format($p$
      create policy %1$I_insert_manager on public.%1$I
        for insert to authenticated
        with check (app.can_manage_catalog(business_id))
    $p$, t);

    execute format($p$
      create policy %1$I_update_manager on public.%1$I
        for update to authenticated
        using (app.can_manage_catalog(business_id))
        with check (app.can_manage_catalog(business_id))
    $p$, t);

    execute format($p$
      create policy %1$I_delete_manager on public.%1$I
        for delete to authenticated
        using (app.can_manage_catalog(business_id))
    $p$, t);
  end loop;
end;
$$;

-- Locations are business configuration, not catalogue: restrict to owner/manager.
drop policy locations_insert_manager on public.locations;
drop policy locations_update_manager on public.locations;
drop policy locations_delete_manager on public.locations;

create policy locations_insert_admin on public.locations
  for insert to authenticated
  with check (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

create policy locations_update_admin on public.locations
  for update to authenticated
  using (app.has_role(business_id, array['owner', 'manager']::public.member_role[]))
  with check (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

create policy locations_delete_admin on public.locations
  for delete to authenticated
  using (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- anon must never reach business data.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
