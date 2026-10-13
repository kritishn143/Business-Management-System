-- Party ledger tests (SPEC §33, §34). Balances must always be derived.

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('66666666-6666-6666-6666-666666666666', 'nabin@example.test', '{"full_name":"Nabin Shah"}');

do $$
declare
  shop uuid;
  loc  uuid;
  pc   uuid;
  pen  uuid;
  cust uuid;
  supp uuid;
  sale public.sales;
begin
  perform set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
  shop := (public.create_business('Nabin Supplies')).id;

  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc from public.units where business_id = shop and name = 'Piece';

  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'A4 Paper', pc, 500, 400) returning id into pen;
  perform public.adjust_stock(pen, 100, 'opening_stock', loc, 400);

  insert into public.parties (business_id, type, name, phone, opening_balance)
  values (shop, 'customer', 'Hari Sharma', '9800000001', 0) returning id into cust;
  -- One signed balance: positive means they owe us, negative means we owe them.
  -- We owe this supplier 2,500, so it opens negative.
  insert into public.parties (business_id, type, name, phone, opening_balance)
  values (shop, 'supplier', 'Paper Mills', '9800000002', -2500) returning id into supp;

  perform app.ok(public.party_balance(cust) = 0, 'a new customer starts at zero');
  perform app.ok(
    public.party_balance(supp) = -2500,
    'an opening payable is carried as a negative balance'
  );

  -- A credit sale must appear on the customer ledger automatically.
  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 2)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 400)),
    cust
  );
  perform app.ok(sale.due_amount = 600, 'the sale leaves 600 owing');
  perform app.ok(
    public.party_balance(cust) = 600,
    'a credit sale posts to the customer ledger in the same transaction'
  );
  perform app.ok(
    (select count(*) from public.party_ledger_entries
     where party_id = cust and reference_id = sale.id) = 1,
    'the ledger entry is linked to its invoice'
  );

  -- A part payment reduces the balance.
  perform public.record_party_payment(cust, 250, 'in', 'cash');
  perform app.ok(public.party_balance(cust) = 350, 'a payment reduces what they owe');

  -- Paying the rest clears it.
  perform public.record_party_payment(cust, 350, 'in', 'qr');
  perform app.ok(public.party_balance(cust) = 0, 'paying the balance clears it');

  -- Paying a supplier reduces what we owe them.
  perform public.record_party_payment(supp, 1000, 'out', 'bank');
  perform app.ok(
    public.party_balance(supp) = -1500,
    'paying a supplier moves the payable toward zero'
  );

  -- A fully paid sale must not touch the ledger.
  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 500)),
    cust
  );
  perform app.ok(
    public.party_balance(cust) = 0,
    'a fully paid sale leaves the customer balance untouched'
  );
end;
$$;

-- Refusals and immutability.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'nabin-supplies');
  cust uuid := (select id from public.parties where business_id = shop and name = 'Hari Sharma');
  other uuid := (select id from public.parties where business_id <> shop limit 1);
  entry uuid := (select id from public.party_ledger_entries where party_id = cust limit 1);
begin
  perform set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);

  perform app.denies(
    format('select public.record_party_payment(%L, 0, ''in'')', cust),
    'a payment of zero is refused'
  );
  perform app.denies(
    format('select public.record_party_payment(%L, -50, ''in'')', cust),
    'a negative payment is refused'
  );
  perform app.denies(
    format('select public.record_party_payment(%L, 100, ''sideways'')', cust),
    'a payment must be in or out'
  );
  perform app.denies(
    format('update public.party_ledger_entries set credit = 9999 where id = %L', entry),
    'a ledger entry cannot be edited'
  );
  perform app.denies(
    format('delete from public.party_ledger_entries where id = %L', entry),
    'a ledger entry cannot be deleted'
  );
  perform app.denies(
    format($f$insert into public.party_ledger_entries
             (business_id, party_id, entry_type, debit, credit)
             values (%L, %L, 'adjustment', 50, 50)$f$, shop, cust),
    'an entry cannot be both a debit and a credit'
  );
  perform app.denies(
    format($f$insert into public.parties (business_id, type, name, phone)
             values (%L, 'customer', 'Duplicate', '9800000001')$f$, shop),
    'two contacts cannot share a phone number'
  );
end;
$$;

-- Tenant isolation for parties.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'nabin-supplies');
  cust uuid := (select id from public.parties where business_id = shop limit 1);
begin
  grant select, insert, update, delete on public.parties to authenticated;
  grant select on public.party_ledger_entries to authenticated;
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  perform app.ok(
    (select count(*) from public.parties where id = cust) = 0,
    'another business cannot see these contacts'
  );
  perform app.ok(
    (select count(*) from public.party_ledger_entries where party_id = cust) = 0,
    'another business cannot see this ledger'
  );
end;
$$;

-- A sale cannot name a customer from another business.
do $$
declare
  shop  uuid := (select id from public.businesses where slug = 'sita-traders');
  pen   uuid := (select id from public.products where business_id = shop and name = 'Ball Pen');
  other uuid := (select id from public.parties
                 where business_id = (select id from public.businesses where slug = 'nabin-supplies')
                 limit 1);
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  perform app.denies(
    format($f$select public.complete_sale(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
      '[]'::jsonb, %L)$f$, pen, other),
    'a sale cannot be billed to another business''s customer'
  );
end;
$$;

select 'PARTY TESTS PASSED' as result;
