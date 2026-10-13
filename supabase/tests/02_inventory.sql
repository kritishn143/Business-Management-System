-- Inventory ledger tests (SPEC §11, §12, §20). Run after 01_rls.sql, which
-- leaves Asha's business in place.

\set ON_ERROR_STOP on

do $$
declare
  a       uuid := (select id from public.businesses where slug = 'asha-stationers');
  loc     uuid;
  unit    uuid;
  pen     uuid;
  bal     record;
  mv      uuid;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

  select id into loc from public.locations where business_id = a and is_default;
  select id into unit from public.units where business_id = a and name = 'Piece';
  select id into pen from public.products where business_id = a and name = 'Gel Pen 0.5mm';

  -- Opening stock: 100 @ 10
  perform public.adjust_stock(pen, 100, 'opening_stock', loc, 10);
  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 100, 'opening stock sets quantity to 100');
  perform app.ok(bal.average_cost = 10, 'opening stock sets average cost to 10');
  perform app.ok(bal.stock_value = 1000, 'stock value is 100 x 10');

  -- Buy 100 more @ 20 -> weighted average must be 15, not 20.
  insert into public.stock_movements
    (business_id, product_id, location_id, movement_type, quantity, unit_cost, created_by)
  values (a, pen, loc, 'purchase', 100, 20, '11111111-1111-1111-1111-111111111111');

  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 200, 'purchase raises quantity to 200');
  perform app.ok(bal.average_cost = 15, 'weighted average cost is 15, not last cost 20');
  perform app.ok(bal.stock_value = 3000, 'stock value follows the weighted average');

  -- Sell 50: quantity drops, average cost must not move.
  insert into public.stock_movements
    (business_id, product_id, location_id, movement_type, quantity, created_by)
  values (a, pen, loc, 'sale', -50, '11111111-1111-1111-1111-111111111111');

  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 150, 'a sale reduces quantity to 150');
  perform app.ok(bal.average_cost = 15, 'a sale does not change average cost');
  perform app.ok(bal.stock_value = 2250, 'stock value tracks the remaining quantity');

  -- A second product, so some ledger history outlives the deletions below.
  declare nb uuid := (select id from public.products where business_id = a and sku = 'NB-A5');
  begin
    perform public.adjust_stock(nb, 25, 'opening_stock', loc, 40);
  end;

  -- Damage 10
  perform public.adjust_stock(pen, -10, 'damaged', loc);
  select * into bal from public.inventory_balances where product_id = pen;
  perform app.ok(bal.quantity = 140, 'damage reduces quantity to 140');

  perform app.ok(
    (select count(*) from public.stock_movements where product_id = pen) = 4,
    'every change left a ledger entry'
  );
end;
$$;

-- The ledger is append-only.
do $$
declare mv uuid := (select id from public.stock_movements limit 1);
begin
  perform app.denies(
    format('update public.stock_movements set quantity = 999 where id = %L', mv),
    'a posted stock movement cannot be edited'
  );
  perform app.denies(
    format('delete from public.stock_movements where id = %L', mv),
    'a posted stock movement cannot be deleted'
  );
  perform app.denies(
    $f$insert into public.stock_movements
         (business_id, product_id, location_id, movement_type, quantity)
       select business_id, product_id, location_id, 'sale'::public.movement_type, 5
       from public.stock_movements limit 1$f$,
    'a sale movement cannot have a positive quantity'
  );
  perform app.denies(
    $f$insert into public.stock_movements
         (business_id, product_id, location_id, movement_type, quantity)
       select business_id, product_id, location_id, 'adjustment'::public.movement_type, 0
       from public.stock_movements limit 1$f$,
    'a movement of zero is rejected'
  );
end;
$$;

-- Permissions and tenant boundaries on adjust_stock.
do $$
declare
  a   uuid := (select id from public.businesses where slug = 'asha-stationers');
  pen uuid := (select id from public.products where business_id = a and name = 'Gel Pen 0.5mm');
begin
  -- A cashier may not adjust stock.
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  perform app.denies(
    format('select public.adjust_stock(%L, 5, ''correction''::public.adjustment_reason)', pen),
    'a cashier cannot adjust stock'
  );

  -- Opening stock cannot be negative; damage cannot be positive.
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  perform app.denies(
    format('select public.adjust_stock(%L, -5, ''opening_stock''::public.adjustment_reason)', pen),
    'opening stock cannot be negative'
  );
  perform app.denies(
    format('select public.adjust_stock(%L, 5, ''damaged''::public.adjustment_reason)', pen),
    'damage cannot increase stock'
  );
  perform app.denies(
    format('select public.adjust_stock(%L, 0, ''correction''::public.adjustment_reason)', pen),
    'an adjustment of zero is rejected'
  );
end;
$$;

-- Cascades must not be blocked by immutability.
do $$
declare
  a   uuid := (select id from public.businesses where slug = 'asha-stationers');
  pen uuid := (select id from public.products where business_id = a and name = 'Gel Pen 0.5mm');
begin
  -- Deleting the product takes its ledger with it.
  delete from public.products where id = pen;
  perform app.ok(
    (select count(*) from public.stock_movements where product_id = pen) = 0,
    'deleting a product cascades to its stock movements'
  );
  perform app.ok(
    (select count(*) from public.inventory_balances where product_id = pen) = 0,
    'deleting a product cascades to its balances'
  );

  -- Deleting the account that posted a movement must not be blocked.
  delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
  perform app.ok(
    (select count(*) from public.stock_movements
     where business_id = a and created_by is not null) = 0,
    'deleting a user nulls created_by on their movements rather than blocking'
  );
  perform app.ok(
    (select count(*) from public.stock_movements where business_id = a) > 0,
    'the movements themselves survive the account deletion'
  );
end;
$$;

select 'INVENTORY TESTS PASSED' as result;
