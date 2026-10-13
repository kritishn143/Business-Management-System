-- Return tests (SPEC §9, §14). The dangerous case is cumulative over-return
-- across several partial returns.

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('99999999-0000-0000-0000-000000000001', 'rita@example.test', '{"full_name":"Rita Shrestha"}');

do $$
declare
  shop uuid;
  loc  uuid;
  pc   uuid;
  pen  uuid;
  cust uuid;
  supp uuid;
  sale public.sales;
  item uuid;
  ret  public.sale_returns;
  bal  numeric;
begin
  perform set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', false);
  shop := (public.create_business('Rita Retail')).id;

  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc from public.units where business_id = shop and name = 'Piece';

  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'Notebook', pc, 100, 60) returning id into pen;
  perform public.adjust_stock(pen, 200, 'opening_stock', loc, 60);

  insert into public.parties (business_id, type, name, phone)
  values (shop, 'customer', 'Bina Rai', '9866666661') returning id into cust;

  -- Cash sale of 10 at 100.
  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 10)),
    jsonb_build_array(jsonb_build_object('method', 'cash', 'amount', 1000))
  );
  select id into item from public.sale_items where sale_id = sale.id;

  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 190, 'the sale removed 10');

  -- Return 3 of the 10.
  ret := public.create_sale_return(
    sale.id,
    jsonb_build_array(jsonb_build_object('sale_item_id', item, 'quantity', 3)),
    null, 'Damaged'
  );

  perform app.ok(ret.return_number = 'SRT-000001', 'the first return is SRT-000001');
  perform app.ok(ret.total_amount = 300, 'returning 3 at 100 is worth 300');
  perform app.ok(ret.refunded_amount = 300, 'a paid sale refunds the value in cash');

  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 193, 'the return put 3 back into stock');

  perform app.ok(
    (select status from public.sales where id = sale.id) = 'partially_returned',
    'the sale is marked partially returned'
  );
  perform app.ok(
    (select quantity from public.stock_movements
     where reference_id = ret.id and movement_type = 'sale_return') = 3,
    'the return wrote a positive ledger entry'
  );

  -- Return 5 more: cumulative 8 of 10, still fine.
  perform public.create_sale_return(
    sale.id,
    jsonb_build_array(jsonb_build_object('sale_item_id', item, 'quantity', 5))
  );
  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 198, 'a second partial return accumulates');

  -- Returning 3 more would make 11 of 10. This is the case that must fail.
  perform app.denies(
    format($f$select public.create_sale_return(%L,
      jsonb_build_array(jsonb_build_object('sale_item_id', %L, 'quantity', 3)))$f$,
      sale.id, item),
    'returning more than was sold, across several returns, is refused'
  );

  -- The remaining 2 complete it.
  perform public.create_sale_return(
    sale.id,
    jsonb_build_array(jsonb_build_object('sale_item_id', item, 'quantity', 2))
  );
  perform app.ok(
    (select status from public.sales where id = sale.id) = 'returned',
    'returning everything marks the sale returned'
  );
  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 200, 'stock is back where it started');
end;
$$;

-- A credit sale's return reduces what the customer owes rather than paying cash.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'rita-retail');
  pen  uuid := (select id from public.products where business_id = shop limit 1);
  cust uuid := (select id from public.parties where business_id = shop limit 1);
  sale public.sales;
  item uuid;
  ret  public.sale_returns;
begin
  perform set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', false);

  sale := public.complete_sale(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 4)),
    '[]'::jsonb, cust
  );
  perform app.ok(public.party_balance(cust) = 400, 'the credit sale put 400 on account');

  select id into item from public.sale_items where sale_id = sale.id;
  ret := public.create_sale_return(
    sale.id,
    jsonb_build_array(jsonb_build_object('sale_item_id', item, 'quantity', 2))
  );

  perform app.ok(ret.refunded_amount = 0, 'an unpaid sale refunds no cash');
  perform app.ok(
    public.party_balance(cust) = 200,
    'the return reduces what the customer owes instead'
  );
end;
$$;

-- Purchase returns.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'rita-retail');
  pen  uuid := (select id from public.products where business_id = shop limit 1);
  supp uuid;
  pur  public.purchases;
  item uuid;
  ret  public.purchase_returns;
  bal  numeric;
begin
  perform set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', false);

  insert into public.parties (business_id, type, name, phone)
  values (shop, 'supplier', 'Paper Co', '9866666662') returning id into supp;

  pur := public.complete_purchase(
    jsonb_build_array(jsonb_build_object('product_id', pen, 'quantity', 50, 'unit_cost', 60)),
    supp, 0
  );
  perform app.ok(public.party_balance(supp) = -3000, 'the unpaid bill is a payable of 3000');

  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 248, 'the purchase brought stock in');

  select id into item from public.purchase_items where purchase_id = pur.id;
  ret := public.create_purchase_return(
    pur.id,
    jsonb_build_array(jsonb_build_object('purchase_item_id', item, 'quantity', 10)),
    null, 'Wrong item'
  );

  perform app.ok(ret.return_number = 'PRT-000001', 'the first purchase return is PRT-000001');
  perform app.ok(ret.total_amount = 600, 'returning 10 at 60 is worth 600');

  select quantity into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal = 238, 'the returned stock left our shelves');
  perform app.ok(
    public.party_balance(supp) = -2400,
    'the return reduced what we owe the supplier'
  );

  perform app.denies(
    format($f$select public.create_purchase_return(%L,
      jsonb_build_array(jsonb_build_object('purchase_item_id', %L, 'quantity', 45)))$f$,
      pur.id, item),
    'returning more than was bought is refused'
  );
end;
$$;

-- Refusals.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'rita-retail');
  sale uuid := (select id from public.sales where business_id = shop limit 1);
  item uuid := (select id from public.sale_items where sale_id = sale limit 1);
  ret  uuid := (select id from public.sale_returns where business_id = shop limit 1);
begin
  perform set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', false);

  perform app.denies(
    format('select public.create_sale_return(%L, ''[]''::jsonb)', sale),
    'a return with no items is refused'
  );
  perform app.denies(
    format($f$select public.create_sale_return(%L,
      jsonb_build_array(jsonb_build_object('sale_item_id', %L, 'quantity', 0)))$f$, sale, item),
    'a return quantity of zero is refused'
  );
  perform app.denies(
    format('update public.sale_returns set total_amount = 1 where id = %L', ret),
    'a posted return cannot be edited'
  );
  perform app.denies(
    format($f$select public.create_sale_return(%L,
      jsonb_build_array(jsonb_build_object(
        'sale_item_id', (select id from public.sale_items
                         where sale_id <> %L limit 1), 'quantity', 1)))$f$, sale, sale),
    'a line from a different sale cannot be returned against this one'
  );
end;
$$;

select 'RETURN TESTS PASSED' as result;
