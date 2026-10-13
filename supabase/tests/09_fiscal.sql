-- Fiscal year tests (SPEC §25).

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'gita@example.test',  '{"full_name":"Gita Thapa"}'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'hari@example.test',  '{"full_name":"Hari Joshi"}');

-- ---------------------------------------------------------------------------
-- Which year a date belongs to
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid;
  r    record;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
  shop := (public.create_business('Gita Stationers')).id;

  perform app.ok(
    (select count(*) from public.fiscal_years where business_id = shop) = 1,
    'a new business starts with one financial year'
  );
  perform app.ok(
    (select status from public.fiscal_years where business_id = shop) = 'open',
    'that year is open'
  );

  -- Default start is 1 April, so a year runs April to March.
  update public.businesses
  set fiscal_year_start_month = 4, fiscal_year_start_day = 1
  where id = shop;

  select * into r from app.fiscal_year_bounds(shop, '2026-06-15');
  perform app.ok(
    r.starts_on = '2026-04-01' and r.ends_on = '2027-03-31',
    'a June date falls in the April-to-March year that began that April'
  );

  select * into r from app.fiscal_year_bounds(shop, '2026-02-15');
  perform app.ok(
    r.starts_on = '2025-04-01' and r.ends_on = '2026-03-31',
    'a February date still belongs to the year that began the previous April'
  );

  select * into r from app.fiscal_year_bounds(shop, '2026-04-01');
  perform app.ok(
    r.starts_on = '2026-04-01',
    'the first day of a year belongs to that year, not the one before'
  );

  -- A start day the chosen month is too short for lands on its last day.
  update public.businesses
  set fiscal_year_start_month = 2, fiscal_year_start_day = 30
  where id = shop;
  select * into r from app.fiscal_year_bounds(shop, '2026-06-15');
  perform app.ok(
    r.starts_on = '2026-02-28',
    '30 February is clamped to the end of the month'
  );
  select * into r from app.fiscal_year_bounds(shop, '2024-06-15');
  perform app.ok(
    r.starts_on = '2024-02-29',
    'and to the 29th in a leap year'
  );

  update public.businesses
  set fiscal_year_start_month = 1, fiscal_year_start_day = 1
  where id = shop;
  select * into r from app.fiscal_year_bounds(shop, '2026-06-15');
  perform app.ok(
    r.starts_on = '2026-01-01' and r.ends_on = '2026-12-31',
    'a January start gives a plain calendar year'
  );

  update public.businesses
  set fiscal_year_start_month = 4, fiscal_year_start_day = 1
  where id = shop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing a year
-- ---------------------------------------------------------------------------

-- A finished year with real trade in it, so the closing snapshot has something
-- to record.
do $$
declare
  shop  uuid := (select id from public.businesses where slug = 'gita-stationers');
  loc   uuid;
  pc    uuid;
  pen   uuid;
  cust  uuid;
  acct  uuid;
  cat   uuid;
  last_year uuid;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

  select id into loc from public.locations where business_id = shop and is_default;
  select id into pc  from public.units where business_id = shop and name = 'Piece';
  select id into acct from public.accounts where business_id = shop and is_default;
  select id into cat from public.expense_categories where business_id = shop and name = 'Rent';

  insert into public.products (business_id, name, base_unit_id, selling_price, purchase_price)
  values (shop, 'Register', pc, 120, 80) returning id into pen;

  insert into public.parties (business_id, type, name, opening_balance)
  values (shop, 'customer', 'Shree Academy', 500) returning id into cust;

  -- Stock bought today, i.e. after the year being closed had ended.
  perform public.adjust_stock(pen, 100, 'opening_stock', loc, 80);

  -- Trade dated inside the year that is about to be closed.
  insert into public.fiscal_years (business_id, name, starts_on, ends_on)
  values (shop, '2024/25', '2024-04-01', '2025-03-31')
  returning id into last_year;

  -- And stock that was on the shelf during that year.
  insert into public.stock_movements
    (business_id, product_id, location_id, movement_type, quantity, unit_cost,
     reference_type, reason, created_at)
  values (shop, pen, loc, 'adjustment', 60, 80, 'adjustment', 'opening_stock',
          '2024-12-02');

  insert into public.party_ledger_entries
    (business_id, party_id, entry_type, debit, credit, description, created_at)
  values (shop, cust, 'sale', 1000, 0, 'Invoice in the old year', '2024-12-01');

  insert into public.expenses
    (business_id, category_id, account_id, amount, expense_date)
  values (shop, cat, acct, 3000, '2024-12-05');

  insert into public.income_entries
    (business_id, account_id, amount, income_date)
  values (shop, acct, 800, '2024-12-06');

  perform app.ok(true, 'trade can be recorded in a year while it is open');
end;
$$;

-- Permissions.
insert into public.business_members (business_id, user_id, role, status, joined_at)
select id, 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'cashier', 'active', now()
from public.businesses where slug = 'gita-stationers';

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'gita-stationers');
  y    uuid := (select id from public.fiscal_years
                where business_id = shop and starts_on = '2024-04-01');
  this_year uuid := (select id from public.fiscal_years
                     where business_id = shop and starts_on <> '2024-04-01');
begin
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
  perform app.denies(
    format('select public.close_fiscal_year(%L)', y),
    'a cashier cannot close a financial year'
  );

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
  perform app.denies(
    format('select public.close_fiscal_year(%L)', this_year),
    'the year in progress cannot be closed'
  );
end;
$$;

-- The close itself.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'gita-stationers');
  y    uuid := (select id from public.fiscal_years
                where business_id = shop and starts_on = '2024-04-01');
  cust uuid := (select id from public.parties where business_id = shop limit 1);
  prod uuid := (select id from public.products where business_id = shop limit 1);
  acct uuid := (select id from public.accounts where business_id = shop and is_default);
  closed public.fiscal_years;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

  closed := public.close_fiscal_year(y);

  perform app.ok(closed.status = 'closed', 'an owner can close a finished year');
  perform app.ok(closed.closed_at is not null, 'the close is stamped with a time');
  perform app.ok(
    closed.closed_by = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'and with who closed it'
  );

  -- Opening balance 500 plus a 1000 debit inside the year.
  perform app.ok(
    (select amount from public.fiscal_year_balances
     where fiscal_year_id = y and kind = 'party' and ref_id = cust) = 1500,
    'a party closing balance includes its opening balance and the year''s entries'
  );
  -- 60 moved during the year; the 100 dated today is not part of it.
  perform app.ok(
    (select quantity from public.fiscal_year_balances
     where fiscal_year_id = y and kind = 'product' and ref_id = prod) = 60,
    'a product closing balance counts only movements up to the year end'
  );
  perform app.ok(
    (select amount from public.fiscal_year_balances
     where fiscal_year_id = y and kind = 'product' and ref_id = prod) = 4800,
    'and values that stock at what it cost'
  );
  -- Cash: 800 in, 3000 out.
  perform app.ok(
    (select amount from public.fiscal_year_balances
     where fiscal_year_id = y and kind = 'account' and ref_id = acct) = -2200,
    'an account closing balance nets its income against its expenses'
  );

  perform app.ok(
    (select count(*) from public.party_ledger_entries
     where business_id = shop and created_at::date <= '2025-03-31') = 1,
    'closing writes no new ledger entry, so nothing is counted twice'
  );

  perform app.ok(
    exists (
      select 1 from public.fiscal_years
      where business_id = shop and starts_on = '2025-04-01' and status = 'open'
    ),
    'closing opens the year that follows'
  );

  perform app.ok(
    exists (
      select 1 from public.audit_logs
      where business_id = shop and entity_type = 'fiscal_years' and action = 'updated'
    ),
    'the close is recorded in the audit trail'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- A closed year is locked
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'gita-stationers');
  cust uuid := (select id from public.parties where business_id = shop limit 1);
  acct uuid := (select id from public.accounts where business_id = shop and is_default);
  cat  uuid := (select id from public.expense_categories where business_id = shop and name = 'Rent');
  old_expense uuid;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

  perform app.ok(
    app.is_period_closed(shop, '2024-12-01'),
    'a date inside the closed year reads as closed'
  );
  perform app.ok(
    not app.is_period_closed(shop, '2025-12-01'),
    'a date after it does not'
  );

  perform app.denies(
    format($f$insert into public.expenses
             (business_id, category_id, account_id, amount, expense_date)
             values (%L, %L, %L, 100, '2024-12-20')$f$, shop, cat, acct),
    'an expense cannot be backdated into a closed year'
  );
  perform app.denies(
    format($f$insert into public.party_ledger_entries
             (business_id, party_id, entry_type, debit, credit, created_at)
             values (%L, %L, 'sale', 50, 0, '2024-12-20')$f$, shop, cust),
    'a ledger entry cannot be backdated into a closed year'
  );

  select id into old_expense from public.expenses
  where business_id = shop and expense_date = '2024-12-05';

  perform app.denies(
    format('update public.expenses set amount = 9999 where id = %L', old_expense),
    'an expense inside a closed year cannot be edited'
  );
  perform app.denies(
    format('delete from public.expenses where id = %L', old_expense),
    'nor deleted'
  );

  -- And trading in the open year is unaffected.
  insert into public.expenses
    (business_id, category_id, account_id, amount, expense_date)
  values (shop, cat, acct, 250, current_date);
  perform app.ok(true, 'the shop can still record today''s expenses');
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing in order, and reopening
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'gita-stationers');
  y2024 uuid := (select id from public.fiscal_years
                 where business_id = shop and starts_on = '2024-04-01');
  y2025 uuid := (select id from public.fiscal_years
                 where business_id = shop and starts_on = '2025-04-01');
  y2023 uuid;
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);

  perform app.denies(
    format('select public.close_fiscal_year(%L)', y2024),
    'a year that is already closed cannot be closed again'
  );

  -- An older year left open must be dealt with first.
  insert into public.fiscal_years (business_id, name, starts_on, ends_on)
  values (shop, '2023/24', '2023-04-01', '2024-03-31')
  returning id into y2023;

  perform app.denies(
    format('select public.close_fiscal_year(%L)', y2025),
    'a later year cannot be closed while an earlier one is still open'
  );

  perform app.ok(
    (select count(*) from public.fiscal_years
     where business_id = shop and status = 'open') = 3,
    'several years can be open at once, as they are for a shop behind on its books'
  );

  -- Reopening: owner only, and not underneath a closed later year.
  perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', false);
  perform app.denies(
    format('select public.reopen_fiscal_year(%L)', y2024),
    'a cashier cannot reopen a year'
  );

  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);
  perform app.ok(
    (public.reopen_fiscal_year(y2024)).status = 'open',
    'an owner can reopen a closed year'
  );
  perform app.ok(
    (select count(*) from public.fiscal_year_balances where fiscal_year_id = y2024) = 0,
    'reopening clears the snapshot it no longer describes'
  );
  perform app.ok(
    not app.is_period_closed(shop, '2024-12-01'),
    'and the period is editable again'
  );

  perform app.denies(
    format('select public.reopen_fiscal_year(%L)', y2024),
    'a year that is already open cannot be reopened'
  );
end;
$$;

-- Tenant isolation: one shop cannot see or close another's years.

-- The id is captured before RLS is in force, or the test would be asserting
-- against a null it could not see in the first place.
create temporary table fiscal_target as
select id from public.fiscal_years
where business_id = (select id from public.businesses where slug = 'gita-stationers')
  and starts_on = '2025-04-01';

grant select on fiscal_target to authenticated;

set role authenticated;

do $$
declare other uuid := (select id from fiscal_target);
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

  perform app.ok(other is not null, 'the other shop really does have a year to attack');
  perform app.ok(
    (select count(*) from public.fiscal_years fy
     join public.businesses b on b.id = fy.business_id
     where b.slug = 'gita-stationers') = 0,
    'an unrelated owner sees none of another shop''s financial years'
  );
  perform app.ok(
    not exists (select 1 from public.fiscal_years where id = other),
    'not even by asking for it by id'
  );
  perform app.denies(
    format('select public.close_fiscal_year(%L)', other),
    'and cannot close one'
  );
  perform app.denies(
    format('select public.reopen_fiscal_year(%L)', other),
    'nor reopen one'
  );
  perform app.ok(
    (select count(*) from public.fiscal_year_balances) = 0,
    'nor read another shop''s closing balances'
  );
end;
$$;

reset role;
drop table fiscal_target;

select 'FISCAL YEAR TESTS PASSED' as result;
