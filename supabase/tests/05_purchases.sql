-- Purchase tests (SPEC §13, §36). The stock-in side must mirror sales.

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('77777777-7777-7777-7777-777777777777', 'kamal@example.test', '{"full_name":"Kamal Thapa"}');

do $$
declare
  shop uuid;
  loc  uuid;
  pc   uuid;
  box  uuid;
  pen  uuid;
  supp uuid;
  pur  public.purchases;
  bal  record;
begin
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
  shop := (public.create_business('Kamal Wholesale')).id;

  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc  from public.units where business_id = shop and name = 'Piece';
  select id into box from public.units where business_id = shop and name = 'Box';

  insert into public.products (business_id, name, base_unit_id, purchase_price, selling_price)
  values (shop, 'Marker', pc, 0, 60) returning id into pen;

  insert into public.parties (business_id, type, name, phone)
  values (shop, 'supplier', 'Ink Traders', '9822222222') returning id into supp;

  -- Buy 100 pieces at 30, paid in full.
  pur := public.complete_purchase(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 100, 'unit_cost', 30)),
    supp, 3000
  );

  perform app.ok(pur.status = 'posted', 'a completed purchase is posted');
  perform app.ok(pur.invoice_number = 'PUR-000001', 'the first bill is PUR-000001');
  perform app.ok(pur.total_amount = 3000, 'the total is 100 x 30');
  perform app.ok(pur.due_amount = 0, 'a fully paid purchase owes nothing');

  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 100, 'the purchase brought in 100');
  perform app.ok(bal.average_cost = 30, 'average cost is the purchase cost');
  perform app.ok(
    public.party_balance(supp) = 0,
    'a paid purchase leaves nothing on the supplier ledger'
  );
  perform app.ok(
    (select purchase_price from public.products where id = pen) = 30,
    'the product cost was refreshed from the purchase'
  );

  -- Buy 5 boxes of 12 at 240 per box, unpaid. That is 60 pieces at 20 each.
  pur := public.complete_purchase(
    jsonb_build_array(jsonb_build_object(
      'product_id', pen, 'quantity', 5, 'unit_id', box, 'unit_cost', 240)),
    supp, 0
  );

  perform app.ok(pur.total_amount = 1200, 'five boxes at 240 is 1200');
  perform app.ok(pur.due_amount = 1200, 'an unpaid purchase owes the full amount');

  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 160, 'five boxes of twelve added 60 pieces');
  -- (100 x 30 + 60 x 20) / 160 = 26.25
  perform app.ok(
    bal.average_cost = 26.25,
    'the box cost was converted per piece before averaging'
  );
  perform app.ok(
    public.party_balance(supp) = -1200,
    'an unpaid purchase becomes a payable on the supplier ledger'
  );

  -- Paying the supplier clears it.
  perform public.record_party_payment(supp, 1200, 'out', 'bank');
  perform app.ok(public.party_balance(supp) = 0, 'paying the bill clears the payable');
end;
$$;

-- Refusals, idempotency and immutability.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kamal-wholesale');
  pen  uuid := (select id from public.products where business_id = shop and name = 'Marker');
  supp uuid := (select id from public.parties where business_id = shop limit 1);
  a public.purchases;
  b public.purchases;
  p uuid;
begin
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);

  a := public.complete_purchase(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1, 'unit_cost', 10)),
    supp, 10, null, 0, 0, 0, null, null, 'dev-p-001');
  b := public.complete_purchase(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1, 'unit_cost', 10)),
    supp, 10, null, 0, 0, 0, null, null, 'dev-p-001');
  perform app.ok(a.id = b.id, 'a retried purchase returns the original');

  perform app.denies(
    format($f$select public.complete_purchase(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1, 'unit_cost', 10)),
      null, 0)$f$, pen),
    'leaving an amount owing without a supplier is refused'
  );
  perform app.denies(
    format($f$select public.complete_purchase(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1, 'unit_cost', 10)),
      %L, 9999)$f$, pen, supp),
    'paying more than the purchase total is refused'
  );
  perform app.denies(
    'select public.complete_purchase(''[]''::jsonb)',
    'a purchase with no items is refused'
  );

  select id into p from public.purchases where status = 'posted' limit 1;
  perform app.denies(
    format('update public.purchases set total_amount = 1 where id = %L', p),
    'a posted purchase cannot be repriced'
  );
  perform app.denies(
    format('update public.purchases set purchase_date = now() - interval ''10 days'' where id = %L', p),
    'a posted purchase cannot be backdated'
  );
end;
$$;

-- A cashier may sell but must not buy.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'sita-traders');
  pen  uuid := (select id from public.products where business_id = shop and name = 'Ball Pen');
begin
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  perform app.denies(
    format($f$select public.complete_purchase(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1, 'unit_cost', 5)),
      null, 5)$f$, pen),
    'a cashier cannot record a purchase'
  );
end;
$$;

select 'PURCHASE TESTS PASSED' as result;
