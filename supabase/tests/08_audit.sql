-- Audit trail tests (SPEC §40, §69).

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-9999-9999-9999-999999999999', 'roshan@example.test', '{"full_name":"Roshan Bista"}'),
  ('aaaaaaaa-9999-9999-9999-999999999999', 'puja@example.test',  '{"full_name":"Puja Karki"}');

-- ---------------------------------------------------------------------------
-- Events are filed without anyone asking
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid;
  acct uuid;
  cat  uuid;
  exp  uuid;
begin
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
  shop := (public.create_business('Nabin Traders')).id;

  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where business_id = shop and entity_type = 'businesses' and action = 'created'
    ),
    'creating a business is recorded'
  );
  perform app.ok(
    (select user_id from public.audit_logs
     where business_id = shop and entity_type = 'businesses' and action = 'created')
      = '99999999-9999-9999-9999-999999999999',
    'the event names who did it'
  );

  select id into acct from public.accounts where business_id = shop and is_default;
  select id into cat from public.expense_categories where business_id = shop and name = 'Rent';

  insert into public.expenses (business_id, category_id, account_id, amount, description)
  values (shop, cat, acct, 9000, 'Rent')
  returning id into exp;

  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where entity_type = 'expenses' and entity_id = exp and action = 'created'
    ),
    'an expense is recorded'
  );
  perform app.ok(
    (select new_data ->> 'description' from public.audit_logs
     where entity_type = 'expenses' and entity_id = exp and action = 'created') = 'Rent',
    'the event keeps the row as it was written'
  );

  update public.expenses set description = 'Rent for Kartik' where id = exp;

  perform app.ok(
    (select old_data ->> 'description' from public.audit_logs
     where entity_type = 'expenses' and entity_id = exp and action = 'updated') = 'Rent',
    'an edit keeps what the value used to be'
  );
  perform app.ok(
    (select new_data ->> 'description' from public.audit_logs
     where entity_type = 'expenses' and entity_id = exp and action = 'updated')
      = 'Rent for Kartik',
    'an edit keeps what the value became'
  );

  delete from public.expenses where id = exp;

  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where entity_type = 'expenses' and entity_id = exp and action = 'deleted'
    ),
    'a deletion is recorded'
  );
  perform app.ok(
    (select count(*) from public.audit_logs
     where entity_type = 'expenses' and entity_id = exp) = 3,
    'the expense leaves behind its whole history'
  );
end;
$$;

-- A sale writes one event per row it touches, in the same transaction.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'nabin-traders');
  loc  uuid := (select id from public.locations where business_id = shop and is_default);
  unit uuid := (select id from public.units where business_id = shop and conversion_factor = 1);
  prod uuid;
  sale uuid;
  before_count bigint;
begin
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);

  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'Exercise book', unit, 60, 40)
  returning id into prod;

  perform public.adjust_stock(prod, 50, 'opening_stock', loc, 40);

  select count(*) into before_count from public.audit_logs where business_id = shop;

  sale := (public.complete_sale(
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', prod, 'unit_id', unit, 'quantity', 2, 'unit_price', 60)
    ),
    p_payments => jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 120))
  )).id;

  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where entity_type = 'sales' and entity_id = sale and action = 'created'
    ),
    'completing a sale is recorded'
  );
  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where business_id = shop and entity_type = 'stock_movements' and action = 'created'
    ),
    'the stock movement behind the sale is recorded too'
  );
  perform app.ok(
    (select count(*) from public.audit_logs where business_id = shop) > before_count,
    'the sale added to the trail rather than replacing it'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The trail cannot be rewritten, and is not for everyone to read
-- ---------------------------------------------------------------------------

set role authenticated;

do $$
declare
  shop  uuid;
  entry uuid;
  nabin uuid := '99999999-9999-9999-9999-999999999999';
  puja  uuid := 'aaaaaaaa-9999-9999-9999-999999999999';
begin
  perform set_config('request.jwt.claim.sub', nabin::text, true);
  select id into shop from public.businesses where slug = 'nabin-traders';
  select id into entry from public.audit_logs where business_id = shop limit 1;

  perform app.ok(
    (select count(*) from public.audit_logs where business_id = shop) > 0,
    'an owner can read the trail'
  );
  -- No update or delete policy exists, so RLS filters the row out before the
  -- immutability trigger is ever reached. Either way nothing changes.
  perform app.changes_nothing(
    format($f$update public.audit_logs set action = 'created' where id = %L$f$, entry),
    'an owner cannot rewrite an event'
  );
  perform app.changes_nothing(
    format($f$delete from public.audit_logs where id = %L$f$, entry),
    'an owner cannot delete an event'
  );
  perform app.denies(
    format($f$insert into public.audit_logs (business_id, action, entity_type)
             values (%L, 'created', 'sales')$f$, shop),
    'nobody can forge an event by hand'
  );
end;
$$;

reset role;

-- Puja joins as a cashier: she may sell, but the trail is not hers to read.
insert into public.business_members (business_id, user_id, role, status, joined_at)
select id, 'aaaaaaaa-9999-9999-9999-999999999999', 'cashier', 'active', now()
from public.businesses where slug = 'nabin-traders';

set role authenticated;

do $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-9999-9999-9999-999999999999', true);
  perform app.ok(
    (select count(*) from public.audit_logs) = 0,
    'a cashier cannot read the audit trail'
  );
end;
$$;

do $$
declare other uuid;
begin
  -- And no business can read another's trail.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select id into other from public.businesses where slug = 'nabin-traders';
  perform app.ok(
    other is null,
    'an unrelated owner cannot even see the other business'
  );
  perform app.ok(
    (select count(*) from public.audit_logs al
     join public.businesses b on b.id = al.business_id
     where b.slug = 'nabin-traders') = 0,
    'an unrelated owner reads none of its events'
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- A client address the proxy mangled must not cost a shop its sale
-- ---------------------------------------------------------------------------

do $$
begin
  perform app.ok(app.to_inet('203.0.113.9') = '203.0.113.9'::inet,
    'a plain IPv4 address parses');
  perform app.ok(app.to_inet('2001:db8::1') = '2001:db8::1'::inet,
    'an IPv6 address parses');
  perform app.ok(app.to_inet('  203.0.113.9  ') = '203.0.113.9'::inet,
    'surrounding whitespace is ignored');
  perform app.ok(app.to_inet('203.0.113.9:44321') = '203.0.113.9'::inet,
    'a port is dropped and the address kept');
  perform app.ok(app.to_inet('unknown') is null,
    'a header that is not an address becomes no address');
  perform app.ok(app.to_inet('') is null, 'an empty header becomes no address');
  perform app.ok(app.to_inet(null) is null, 'a missing header becomes no address');
  perform app.ok(app.to_inet('999.999.999.999') is null,
    'a nonsense address becomes no address');
end;
$$;

-- The point of the fix: the write goes through whatever the header says.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'nabin-traders');
  hdr  text;
  made int;
begin
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);

  foreach hdr in array array[
    '203.0.113.9',
    '203.0.113.9, 70.41.3.18, 150.172.238.178',
    '203.0.113.9:44321',
    'unknown',
    'not an address at all',
    ''
  ]
  loop
    perform set_config('request.headers',
      json_build_object('x-forwarded-for', hdr, 'user-agent', 'Test')::text, false);

    insert into public.parties (business_id, type, name)
    values (shop, 'customer', 'Header customer ' || md5(hdr));
  end loop;

  select count(*) into made from public.parties
  where business_id = shop and name like 'Header customer %';

  perform app.ok(made = 6,
    'a sale is recorded whatever the proxy put in x-forwarded-for'
  );
  perform app.ok(
    (select count(*) from public.audit_logs
     where business_id = shop and entity_type = 'parties'
       and new_data ->> 'name' like 'Header customer %') = 6,
    'and every one of them is still audited'
  );
  perform app.ok(
    (select count(*) from public.audit_logs
     where business_id = shop and entity_type = 'parties'
       and new_data ->> 'name' like 'Header customer %'
       and ip_address is null) = 3,
    'the three unusable headers are recorded as no address'
  );

  perform set_config('request.headers', '', false);
end;
$$;

select 'AUDIT TESTS PASSED' as result;
