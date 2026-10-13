-- Tenant isolation and permission tests (SPEC §78). Every check raises on
-- failure, so a non-zero exit from run.sh means the suite failed.

\set ON_ERROR_STOP on

create or replace function app.ok(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', label;
  else
    raise exception 'FAIL  %', label;
  end if;
end;
$$;

-- Asserts a statement is rejected, by RLS or by a constraint.
create or replace function app.denies(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS  %', label;
    return;
  end;
  raise exception 'FAIL  % — the statement was allowed', label;
end;
$$;

-- For UPDATE/DELETE, RLS blocks by filtering rows out, not by raising. The
-- meaningful assertion is that the statement changed nothing.
create or replace function app.changes_nothing(stmt text, label text)
returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    raise notice 'PASS  % (rejected)', label;
    return;
  end;
  if n = 0 then
    raise notice 'PASS  % (0 rows)', label;
  else
    raise exception 'FAIL  % — % row(s) changed', label, n;
  end if;
end;
$$;

-- Runs a statement as a given user with RLS enforced.
create or replace function app.as_user(claim uuid, stmt text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', claim::text, true);
  execute stmt;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'asha@example.test',    '{"full_name":"Asha Rai"}'),
  ('22222222-2222-2222-2222-222222222222', 'bikash@example.test',  '{"full_name":"Bikash Thapa"}'),
  ('33333333-3333-3333-3333-333333333333', 'chandra@example.test', '{"full_name":"Chandra Lama"}');

do $$
begin
  perform app.ok(
    (select count(*) from public.profiles) = 3,
    'signup trigger creates a profile for every user'
  );
  perform app.ok(
    (select full_name from public.profiles
     where id = '11111111-1111-1111-1111-111111111111') = 'Asha Rai',
    'profile carries full_name from signup metadata'
  );
end;
$$;

-- Asha and Bikash each create a business via the transactional RPC.
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  perform public.create_business('Asha Stationers', 'retail', 'stationery');
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  perform public.create_business('Bikash Book House', 'retail', 'stationery');
end;
$$;

-- Chandra is a cashier at Asha's shop.
insert into public.business_members (business_id, user_id, role, status, joined_at)
select id, '33333333-3333-3333-3333-333333333333', 'cashier', 'active', now()
from public.businesses where slug = 'asha-stationers';

-- ---------------------------------------------------------------------------
-- create_business() side effects
-- ---------------------------------------------------------------------------

do $$
declare a uuid := (select id from public.businesses where slug = 'asha-stationers');
begin
  perform app.ok(
    (select role from public.business_members
     where business_id = a and user_id = '11111111-1111-1111-1111-111111111111') = 'owner',
    'create_business makes the caller an owner'
  );
  perform app.ok(
    (select count(*) from public.locations where business_id = a and is_default) = 1,
    'create_business creates exactly one default location'
  );
  perform app.ok(
    (select count(*) from public.units where business_id = a) = 4,
    'create_business seeds the starter unit family'
  );
  perform app.ok(
    (select conversion_factor from public.units where business_id = a and name = 'Box') = 12,
    'Box converts to 12 base units'
  );
end;
$$;

do $$
begin
  -- Slugs must stay unique across tenants.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  perform public.create_business('Asha Stationers');
  perform app.ok(
    (select count(*) from public.businesses where slug like 'asha-stationers%') = 2,
    'duplicate business names get distinct slugs'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenant isolation. This is the mandatory check (SPEC §78).
-- ---------------------------------------------------------------------------

create or replace function app.visible_businesses(claim uuid)
returns bigint language plpgsql security invoker as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', claim::text, true);
  select count(*) into n from public.businesses;
  return n;
end;
$$;

-- Everything below runs as `authenticated`, so policies actually apply.
grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

set role authenticated;

do $$
declare
  a uuid;
  b uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select id into a from public.businesses where slug = 'asha-stationers';

  perform app.ok(a is not null, 'Asha can see her own business');
  perform app.ok(
    (select count(*) from public.businesses) = 1,
    'Asha sees only her business, not the other two'
  );

  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select id into b from public.businesses where slug = 'bikash-book-house';
  perform app.ok(
    (select count(*) from public.businesses) = 2,
    'Bikash sees exactly the two businesses he owns'
  );

  -- The crux: B must not reach A's rows by id.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform app.ok(
    (select count(*) from public.businesses where id = a) = 0,
    'Business B cannot read Business A by id'
  );
  perform app.ok(
    (select count(*) from public.locations where business_id = a) = 0,
    'Business B cannot read Business A locations'
  );
  perform app.ok(
    (select count(*) from public.units where business_id = a) = 0,
    'Business B cannot read Business A units'
  );
  perform app.ok(
    (select count(*) from public.business_members where business_id = a) = 0,
    'Business B cannot read Business A membership'
  );
end;
$$;

-- Writes across the tenant boundary must fail too.
do $$
declare a uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select id into a from public.businesses where slug = 'asha-stationers';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  perform app.denies(
    format('insert into public.categories (business_id, name) values (%L, %L)', a, 'Smuggled'),
    'Business B cannot insert a category into Business A'
  );
  perform app.changes_nothing(
    format('update public.businesses set name = %L where id = %L', 'Hijacked', a),
    'Business B cannot rename Business A'
  );
  perform app.changes_nothing(
    format('delete from public.businesses where id = %L', a),
    'Business B cannot delete Business A'
  );
  perform app.denies(
    format($f$insert into public.business_members (business_id, user_id, role)
             values (%L, '22222222-2222-2222-2222-222222222222', 'owner')$f$, a),
    'Business B cannot grant itself membership of Business A'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Role permissions within one business
-- ---------------------------------------------------------------------------

do $$
declare
  a    uuid;
  unit uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select id into a from public.businesses where slug = 'asha-stationers';
  select id into unit from public.units where business_id = a and name = 'Piece';

  insert into public.categories (business_id, name) values (a, 'Writing');
  perform app.ok(
    (select count(*) from public.categories where business_id = a) = 1,
    'an owner can create a category'
  );

  insert into public.products (business_id, name, base_unit_id, selling_price)
  values (a, 'Gel Pen 0.5mm', unit, 25);
  perform app.ok(
    (select count(*) from public.products where business_id = a) = 1,
    'an owner can create a product'
  );

  -- Chandra is a cashier: read yes, write no.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform app.ok(
    (select count(*) from public.products where business_id = a) = 1,
    'a cashier can read the catalogue'
  );
  perform app.denies(
    format('insert into public.categories (business_id, name) values (%L, %L)', a, 'Nope'),
    'a cashier cannot create a category'
  );
  perform app.changes_nothing(
    format('update public.products set selling_price = 1 where business_id = %L', a),
    'a cashier cannot reprice a product'
  );
  perform app.changes_nothing(
    format('update public.businesses set name = %L where id = %L', 'Renamed', a),
    'a cashier cannot edit business settings'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles are visible to the shop, editable only by their owner
-- ---------------------------------------------------------------------------

-- A staff list has to be able to name its staff, so co-members can read each
-- other's profile (SPEC §26). Nobody outside the shop can.
do $$
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform app.ok(
    (select count(*) from public.profiles) = 2,
    'an owner sees their own profile and their cashier''s'
  );
  perform app.ok(
    not exists (
      select 1 from public.profiles
      where id = '22222222-2222-2222-2222-222222222222'
    ),
    'an owner cannot see a profile from an unrelated business'
  );
  perform app.changes_nothing(
    $f$update public.profiles set full_name = 'Hacked'
       where id = '33333333-3333-3333-3333-333333333333'$f$,
    'an owner cannot edit their cashier''s profile'
  );
  perform app.changes_nothing(
    $f$update public.profiles set full_name = 'Hacked'
       where id = '22222222-2222-2222-2222-222222222222'$f$,
    'a user cannot edit someone else''s profile'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ownership cannot be handed around by managers
-- ---------------------------------------------------------------------------

do $$
declare
  asha    uuid := '11111111-1111-1111-1111-111111111111';
  chandra uuid := '33333333-3333-3333-3333-333333333333';
  a       uuid;
begin
  -- Promote Chandra to manager as the owner, which is allowed. The claim has
  -- to be set before anything is read, or RLS hides the fixture.
  perform set_config('request.jwt.claim.sub', asha::text, true);
  select id into a from public.businesses where slug = 'asha-stationers';
  update public.business_members set role = 'manager'
  where business_id = a and user_id = chandra;
  perform app.ok(
    (select role from public.business_members
     where business_id = a and user_id = chandra) = 'manager',
    'an owner can promote a cashier to manager'
  );

  -- As that manager, ownership is off limits in both directions.
  perform set_config('request.jwt.claim.sub', chandra::text, true);
  perform app.denies(
    format($f$update public.business_members set role = 'owner'
             where business_id = %L and user_id = %L$f$, a, chandra),
    'a manager cannot promote themselves to owner'
  );
  perform app.denies(
    format($f$update public.business_members set role = 'cashier'
             where business_id = %L and user_id = %L$f$, a, asha),
    'a manager cannot demote the owner'
  );
  perform app.denies(
    format($f$delete from public.business_members
             where business_id = %L and user_id = %L$f$, a, asha),
    'a manager cannot remove the owner'
  );
  perform app.ok(
    (select role from public.business_members
     where business_id = a and user_id = asha) = 'owner',
    'the owner is still the owner'
  );

  -- And the last owner cannot step down, whoever asks.
  perform set_config('request.jwt.claim.sub', asha::text, true);
  perform app.denies(
    format($f$update public.business_members set role = 'cashier'
             where business_id = %L and user_id = %L$f$, a, asha),
    'the only owner cannot demote themselves'
  );

  -- Put the fixture back for any later test.
  update public.business_members set role = 'cashier'
  where business_id = a and user_id = chandra;
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Constraints that protect the books
-- ---------------------------------------------------------------------------

do $$
declare
  a    uuid := (select id from public.businesses where slug = 'asha-stationers');
  b    uuid := (select id from public.businesses where slug = 'bikash-book-house');
  unit uuid;
begin
  select id into unit from public.units where business_id = b and name = 'Piece';

  -- Composite FKs make a cross-tenant reference structurally impossible.
  perform app.denies(
    format($f$insert into public.products (business_id, name, base_unit_id)
             values (%L, 'Stolen Unit', %L)$f$, a, unit),
    'a product cannot reference another business''s unit'
  );

  perform app.denies(
    format($f$update public.business_members set status = 'suspended'
             where business_id = %L and role = 'owner'$f$, a),
    'the last active owner cannot be suspended'
  );

  select id into unit from public.units where business_id = a and name = 'Piece';
  insert into public.products (business_id, name, base_unit_id, sku)
  values (a, 'Notebook A5', unit, 'NB-A5');

  perform app.denies(
    format($f$insert into public.products (business_id, name, base_unit_id, sku)
             values (%L, 'Duplicate', %L, 'nb-a5')$f$, a, unit),
    'SKUs are unique per business, case-insensitively'
  );

  perform app.ok(
    (select count(*) from public.products where business_id = b and sku = 'NB-A5') = 0,
    'the same SKU is still free in another business'
  );

  perform app.denies(
    format($f$insert into public.products (business_id, name, base_unit_id, selling_price)
             values (%L, 'Negative', %L, -1)$f$, a, unit),
    'a product cannot have a negative price'
  );

  perform app.denies(
    format($f$insert into public.locations (business_id, name, is_default)
             values (%L, 'Second default', true)$f$, a),
    'a business cannot have two default locations'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Cascade deletes must not be blocked by the last-owner guard
-- ---------------------------------------------------------------------------

do $$
declare
  b uuid := (select id from public.businesses where slug = 'bikash-book-house');
begin
  -- Deleting a business cascades to its members; the guard must stand aside.
  delete from public.businesses where id = b;
  perform app.ok(
    (select count(*) from public.business_members where business_id = b) = 0,
    'deleting a business cascades to its membership'
  );

  -- Deleting an account must never be blocked by an owned business.
  delete from auth.users where id = '22222222-2222-2222-2222-222222222222';
  perform app.ok(
    (select count(*) from public.profiles
     where id = '22222222-2222-2222-2222-222222222222') = 0,
    'deleting a user removes their profile'
  );
  perform app.ok(
    (select count(*) from public.business_members
     where user_id = '22222222-2222-2222-2222-222222222222') = 0,
    'deleting a user removes their memberships'
  );
  perform app.ok(
    (select created_by from public.businesses where slug like 'asha-stationers-%') is null,
    'a business survives its creator with created_by nulled out'
  );

  -- But the realistic mistake is still caught.
  perform app.denies(
    $f$delete from public.business_members
       where business_id = (select id from public.businesses where slug = 'asha-stationers')
         and role = 'owner'$f$,
    'removing the last owner of a live business is still refused'
  );
end;
$$;

select 'ALL TESTS PASSED' as result;
