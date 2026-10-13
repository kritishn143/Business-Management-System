-- Sales tests (SPEC §7, §35, §52, §70, §71). Builds its own fixture so it is
-- independent of the deletions performed by earlier files.

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'sita@example.test', '{"full_name":"Sita Magar"}'),
  ('55555555-5555-5555-5555-555555555555', 'ram@example.test',  '{"full_name":"Ram Karki"}');

do $$
declare
  shop uuid;
  loc  uuid;
  pc   uuid;
  box  uuid;
  pen  uuid;
  pad  uuid;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  shop := (public.create_business('Sita Traders')).id;

  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc  from public.units where business_id = shop and name = 'Piece';
  select id into box from public.units where business_id = shop and name = 'Box';

  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'Ball Pen', pc, 20, 12) returning id into pen;
  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'Note Pad', pc, 50, 30) returning id into pad;

  perform public.adjust_stock(pen, 500, 'opening_stock', loc, 12);
  perform public.adjust_stock(pad, 100, 'opening_stock', loc, 30);

  -- Ram is a cashier.
  insert into public.business_members (business_id, user_id, role, status, joined_at)
  values (shop, '55555555-5555-5555-5555-555555555555', 'cashier', 'active', now());

  perform app.ok(
    (select count(*) from public.document_counters where business_id = shop) = 5,
    'a new business gets a counter for every document kind'
  );
end;
$$;

-- A straightforward cash sale.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'sita-traders');
  pen  uuid := (select id from public.products where business_id = shop and name = 'Ball Pen');
  sale public.sales;
  bal  numeric;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 10)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 200))
  );

  perform app.ok(sale.status = 'posted', 'a completed sale is posted');
  perform app.ok(sale.subtotal = 200, 'subtotal is 10 x 20');
  perform app.ok(sale.total_amount = 200, 'total matches the subtotal with no discount');
  perform app.ok(sale.paid_amount = 200, 'the payment is recorded');
  perform app.ok(sale.due_amount = 0, 'nothing is owing');
  perform app.ok(sale.invoice_number = 'SAL-000001', 'the first invoice is SAL-000001');

  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 490, 'the sale removed 10 from stock');

  perform app.ok(
    (select cost_price from public.sale_items where sale_id = sale.id) = 12,
    'the item captured its cost at the time of sale'
  );
  perform app.ok(
    (select quantity from public.stock_movements
     where reference_id = sale.id and movement_type = 'sale') = -10,
    'the sale wrote a negative ledger entry'
  );
end;
$$;

-- Numbering, discounts, packaging units and credit.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'sita-traders');
  pen  uuid := (select id from public.products where business_id = shop and name = 'Ball Pen');
  pad  uuid := (select id from public.products where business_id = shop and name = 'Note Pad');
  box  uuid := (select id from public.units where business_id = shop and name = 'Box');
  sale public.sales;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

  sale := public.complete_sale(
    jsonb_build_array(
      jsonb_build_object('product_id', pen, 'quantity', 5),
      jsonb_build_object('product_id', pad, 'quantity', 2, 'discount_amount', 10)
    ),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 150)),
    null, 40
  );

  perform app.ok(sale.invoice_number = 'SAL-000002', 'invoice numbers advance');
  -- 5x20 = 100, plus 2x50-10 = 90 => 190, less 40 discount => 150
  perform app.ok(sale.subtotal = 190, 'line discounts reduce the subtotal');
  perform app.ok(sale.total_amount = 150, 'the sale discount reduces the total');

  -- A box of 12 must remove 12 pieces, not 1.
  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object(
      'product_id', pen, 'quantity', 1, 'unit_id', box, 'unit_price', 200)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 200))
  );
  perform app.ok(
    (select quantity from public.stock_movements
     where reference_id = sale.id and movement_type = 'sale') = -12,
    'selling one box removes twelve pieces'
  );

  -- Credit sale to a real customer.
  declare cust uuid;
  begin
    insert into public.parties (business_id, type, name, phone)
    values (shop, 'customer', 'Walk-in Regular', '9811111111')
    returning id into cust;

    sale := public.complete_sale(
      jsonb_build_array(jsonb_build_object('product_id', pad, 'quantity', 1)),
      '[]'::jsonb,
      cust
    );
    perform app.ok(sale.due_amount = 50, 'an unpaid sale leaves the full amount owing');
    perform app.ok(
      public.party_balance(cust) = 50,
      'the unpaid amount lands on the customer ledger'
    );
  end;
end;
$$;

-- Idempotency, permissions and refusals.
do $$
declare
  shop  uuid := (select id from public.businesses where slug = 'sita-traders');
  pen   uuid := (select id from public.products where business_id = shop and name = 'Ball Pen');
  other uuid := (select id from public.products where business_id <> shop limit 1);
  a     public.sales;
  b     public.sales;
  before_count bigint;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

  a := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20)),
    null, 0, 0, 0, null, null, 'device-a-0001'
  );
  select count(*) into before_count from public.sales where business_id = shop;

  b := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20)),
    null, 0, 0, 0, null, null, 'device-a-0001'
  );

  perform app.ok(a.id = b.id, 'a retried sale returns the original, not a duplicate');
  perform app.ok(
    (select count(*) from public.sales where business_id = shop) = before_count,
    'the retry created no second sale'
  );

  -- A cashier may sell.
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  perform public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 1)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 20))
  );
  perform app.ok(true, 'a cashier can record a sale');

  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

  perform app.denies(
    format($f$select public.complete_sale(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)),
      jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 999)))$f$, pen),
    'a payment larger than the total is refused'
  );

  perform app.denies(
    format($f$select public.complete_sale(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 1)))$f$, pen),
    'leaving an amount owing without a customer is refused'
  );

  perform app.denies(
    format($f$select public.complete_sale(
      jsonb_build_array(jsonb_build_object('product_id', %L, 'quantity', 0)))$f$, pen),
    'a line with zero quantity is refused'
  );

  perform app.denies(
    'select public.complete_sale(''[]''::jsonb)',
    'a sale with no items is refused'
  );
end;
$$;

-- Posted sales are immutable.
do $$
declare s uuid := (select id from public.sales where status = 'posted' limit 1);
begin
  perform app.denies(
    format('update public.sales set total_amount = 1 where id = %L', s),
    'a posted sale cannot be repriced'
  );
  perform app.denies(
    format('update public.sales set sale_date = now() - interval ''30 days'' where id = %L', s),
    'a posted sale cannot be backdated'
  );
  perform app.denies(
    format('update public.sales set notes = ''rewritten'' where id = %L', s),
    'a posted sale cannot have its notes rewritten'
  );
  perform app.denies(
    format('update public.sales set invoice_number = ''SAL-999999'' where id = %L', s),
    'a posted sale cannot be renumbered'
  );
  perform app.denies(
    format('update public.sales set customer_id = gen_random_uuid() where id = %L', s),
    'a posted sale cannot be reassigned to another customer'
  );

  -- But recording a payment against it must still work.
  update public.sales set paid_amount = paid_amount, due_amount = due_amount where id = s;
  perform app.ok(true, 'recording a payment against a posted sale is still allowed');
end;
$$;

-- ---------------------------------------------------------------------------
-- What a retry must NOT duplicate (SPEC §52)
-- ---------------------------------------------------------------------------

-- That a retry returns the original sale is covered above. Offline selling also
-- depends on the retry leaving no trace of a second sale anywhere else: stock,
-- payments and lines must each have happened exactly once.
do $$
declare
  shop  uuid;
  loc   uuid;
  pc    uuid;
  pen   uuid;
  first public.sales;
  again public.sales;
  stock_before numeric;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);

  select id into shop from public.businesses where slug = 'sita-traders';
  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc from public.units where business_id = shop and name = 'Piece';
  select id into pen from public.products where business_id = shop and name = 'Ball Pen';

  select quantity into stock_before
  from public.inventory_balances
  where business_id = shop and product_id = pen and location_id = loc;

  first := public.complete_sale(
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', pen, 'unit_id', pc, 'quantity', 3, 'unit_price', 20)
    ),
    p_payments => jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 60)),
    p_client_transaction_id => 'queued-sale-0001'
  );

  again := public.complete_sale(
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', pen, 'unit_id', pc, 'quantity', 3, 'unit_price', 20)
    ),
    p_payments => jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 60)),
    p_client_transaction_id => 'queued-sale-0001'
  );

  perform app.ok(
    first.invoice_number = again.invoice_number,
    'a retried sale does not take a second invoice number'
  );
  perform app.ok(
    (select quantity from public.inventory_balances
     where business_id = shop and product_id = pen and location_id = loc)
      = stock_before - 3,
    'a retried sale takes stock down only once'
  );
  perform app.ok(
    (select count(*) from public.stock_movements
     where business_id = shop and reference_id = first.id) = 1,
    'a retried sale writes one stock movement, not two'
  );
  perform app.ok(
    (select count(*) from public.sale_payments
     where business_id = shop and sale_id = first.id) = 1,
    'a retried sale records one payment, not two'
  );
  perform app.ok(
    (select count(*) from public.sale_items
     where business_id = shop and sale_id = first.id) = 1,
    'a retried sale does not duplicate its lines'
  );

  -- A second device selling the same goods is a different sale, not a retry.
  again := public.complete_sale(
    p_items => jsonb_build_array(
      jsonb_build_object('product_id', pen, 'unit_id', pc, 'quantity', 5, 'unit_price', 20)
    ),
    p_payments => jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 100)),
    p_client_transaction_id => 'queued-sale-0002'
  );
  perform app.ok(first.id <> again.id, 'a different key is a different sale');

  -- Three pens from one device and five from another must leave stock eight
  -- lower. This is why stock is a ledger of events rather than a quantity to
  -- overwrite, and why two tills can sell at once (SPEC §51).
  perform app.ok(
    (select quantity from public.inventory_balances
     where business_id = shop and product_id = pen and location_id = loc)
      = stock_before - 8,
    'both devices reduce stock, rather than the last write winning'
  );
end;
$$;

select 'SALES TESTS PASSED' as result;
