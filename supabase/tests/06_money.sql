-- Money tests (SPEC §17-19).

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'maya@example.test', '{"full_name":"Maya Gurung"}');

do $$
declare
  shop uuid;
  acct uuid;
  cat  uuid;
begin
  perform set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', false);
  shop := (public.create_business('Maya Store')).id;

  perform app.ok(
    (select count(*) from public.accounts where business_id = shop and is_default) = 1,
    'a new business gets one default cash account'
  );
  perform app.ok(
    (select count(*) from public.expense_categories where business_id = shop) = 9,
    'a new business gets the starter expense categories'
  );
  perform app.ok(
    (select count(*) from public.income_categories where business_id = shop) = 3,
    'a new business gets the starter income categories'
  );

  select id into acct from public.accounts where business_id = shop and is_default;
  select id into cat from public.expense_categories where business_id = shop and name = 'Rent';

  insert into public.expenses (business_id, category_id, account_id, amount, description)
  values (shop, cat, acct, 15000, 'Shop rent for Aswin');

  perform app.ok(
    (select sum(amount) from public.expenses where business_id = shop) = 15000,
    'an expense is recorded'
  );

  insert into public.income_entries (business_id, account_id, amount, description)
  select shop, acct, 2500, 'Photocopy income';

  perform app.ok(
    (select sum(amount) from public.income_entries where business_id = shop) = 2500,
    'other income is recorded'
  );
end;
$$;

-- Constraints and permissions.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'maya-store');
  acct uuid := (select id from public.accounts where business_id = shop limit 1);
  other_acct uuid := (select id from public.accounts where business_id <> shop limit 1);
begin
  perform app.denies(
    format($f$insert into public.expenses (business_id, account_id, amount)
             values (%L, %L, 0)$f$, shop, acct),
    'an expense of zero is refused'
  );
  perform app.denies(
    format($f$insert into public.expenses (business_id, account_id, amount)
             values (%L, %L, -100)$f$, shop, acct),
    'a negative expense is refused'
  );
  perform app.denies(
    format($f$insert into public.accounts (business_id, name, is_default)
             values (%L, 'Second default', true)$f$, shop),
    'a business cannot have two default accounts'
  );
  perform app.denies(
    format($f$insert into public.accounts (business_id, name) values (%L, 'cash')$f$, shop),
    'account names are unique per business, case-insensitively'
  );

  if other_acct is not null then
    perform app.denies(
      format($f$insert into public.expenses (business_id, account_id, amount)
               values (%L, %L, 100)$f$, shop, other_acct),
      'an expense cannot be paid from another business''s account'
    );
  end if;
end;
$$;

-- A cashier must not touch the books.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'sita-traders');
begin
  grant select, insert, update, delete on public.expenses, public.accounts to authenticated;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);

  perform app.denies(
    format($f$insert into public.expenses (business_id, amount) values (%L, 500)$f$, shop),
    'a cashier cannot record an expense'
  );
  perform app.ok(
    (select count(*) from public.accounts where business_id = shop) >= 1,
    'a cashier can still see the accounts'
  );

  -- Correcting or removing a record is the same permission as writing one.
  perform app.changes_nothing(
    format($f$update public.expenses set amount = 1 where business_id = %L$f$, shop),
    'a cashier cannot correct an expense'
  );
  perform app.changes_nothing(
    format($f$delete from public.expenses where business_id = %L$f$, shop),
    'nor remove one'
  );
end;
$$;

select 'MONEY TESTS PASSED' as result;
