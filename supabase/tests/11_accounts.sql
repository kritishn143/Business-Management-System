-- Account balance, transfers and corrections (SPEC §17, §37).

\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'kabita@example.test', '{"full_name":"Kabita Rai"}'),
  ('f1f1f1f1-ffff-ffff-ffff-ffffffffffff', 'lalit@example.test',  '{"full_name":"Lalit Basnet"}');

do $$
declare
  shop uuid;
  cash uuid;
  bank uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);
  shop := (public.create_business('Kabita Books')).id;

  select id into cash from public.accounts where business_id = shop and is_default;

  perform app.ok(
    public.account_balance(cash) = 0,
    'a new account starts at nothing'
  );

  -- A bank account with money already in it.
  insert into public.accounts (business_id, name, type, opening_balance)
  values (shop, 'NIC Asia', 'bank', 1000) returning id into bank;

  perform app.ok(
    public.account_balance(bank) = 1000,
    'an opening balance is the account''s first movement'
  );
  perform app.ok(
    (select count(*) from public.account_ledger(bank)) = 1,
    'and shows up in its history'
  );
  perform app.ok(
    (select kind from public.account_ledger(bank)) = 'opening',
    'labelled as the opening balance'
  );

  -- Lalit is a cashier: he sells, but he does not move money between accounts.
  insert into public.business_members (business_id, user_id, role, status, joined_at)
  values (shop, 'f1f1f1f1-ffff-ffff-ffff-ffffffffffff', 'cashier', 'active', now());
end;
$$;

-- ---------------------------------------------------------------------------
-- Expenses and income move the balance, without being copied anywhere
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  bank uuid := (select id from public.accounts where business_id = shop and name = 'NIC Asia');
  cat  uuid := (select id from public.expense_categories where business_id = shop and name = 'Rent');
  exp  uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);

  insert into public.expenses (business_id, category_id, account_id, amount, expense_date)
  values (shop, cat, bank, 250, current_date) returning id into exp;

  perform app.ok(
    public.account_balance(bank) = 750,
    'an expense paid from the account reduces its balance'
  );

  insert into public.income_entries (business_id, account_id, amount, income_date, description)
  values (shop, bank, 400, current_date, 'Photocopying');

  perform app.ok(
    public.account_balance(bank) = 1150,
    'income paid into it raises the balance'
  );

  -- Because the balance is read from the expense row itself, editing the
  -- expense moves the balance with it. Nothing has to be kept in step.
  update public.expenses set amount = 50 where id = exp;
  perform app.ok(
    public.account_balance(bank) = 1350,
    'correcting the expense corrects the balance, with nothing to re-sync'
  );

  delete from public.expenses where id = exp;
  perform app.ok(
    public.account_balance(bank) = 1400,
    'and deleting it takes it back out'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Moving money between your own accounts
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  cash uuid := (select id from public.accounts where business_id = shop and is_default);
  bank uuid := (select id from public.accounts where business_id = shop and name = 'NIC Asia');
  t    uuid;
  before_total numeric;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);

  before_total := public.account_balance(cash) + public.account_balance(bank);

  t := public.transfer_between_accounts(bank, cash, 500);

  perform app.ok(public.account_balance(bank) = 900, 'a transfer leaves the account it came from');
  perform app.ok(public.account_balance(cash) = 500, 'and arrives in the other');
  perform app.ok(
    public.account_balance(cash) + public.account_balance(bank) = before_total,
    'a transfer creates no money and destroys none'
  );
  perform app.ok(
    (select count(*) from public.account_movements where transfer_id = t) = 2,
    'both halves are recorded against the one transfer'
  );

  perform app.denies(
    format('select public.transfer_between_accounts(%L, %L, 100)', cash, cash),
    'money cannot be transferred to the same account'
  );
  perform app.denies(
    format('select public.transfer_between_accounts(%L, %L, 0)', cash, bank),
    'a transfer of nothing is refused'
  );
  perform app.denies(
    format('select public.transfer_between_accounts(%L, %L, -50)', cash, bank),
    'a negative transfer is refused'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Correcting a balance against what was counted
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  cash uuid := (select id from public.accounts where business_id = shop and is_default);
  delta numeric;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);

  -- The drawer holds 480, not the 500 the books say.
  delta := public.adjust_account_balance(cash, 480, 'Counted the drawer');

  perform app.ok(delta = -20, 'a correction records the difference, not the total');
  perform app.ok(public.account_balance(cash) = 480, 'and the balance becomes what was counted');
  perform app.ok(
    (select count(*) from public.account_ledger(cash) where kind = 'adjustment') = 1,
    'the correction stays in the history rather than overwriting it'
  );
  perform app.ok(
    (select count(*) from public.account_ledger(cash)) = 2,
    'so the earlier movement is still there'
  );

  perform app.denies(
    format('select public.adjust_account_balance(%L, 480)', cash),
    'correcting to the balance it already has is refused'
  );

  -- Counting more than the books say is just as valid.
  perform app.ok(
    public.adjust_account_balance(cash, 600) = 120,
    'finding more than expected is recorded as money in'
  );
  perform app.ok(public.account_balance(cash) = 600, 'and the balance follows');
end;
$$;

-- ---------------------------------------------------------------------------
-- Taking an entry back, and putting it back
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  cash uuid := (select id from public.accounts where business_id = shop and is_default);
  bank uuid := (select id from public.accounts where business_id = shop and name = 'NIC Asia');
  before_cash numeric;
  before_bank numeric;
  correction uuid;
  half uuid;
  t uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);

  before_cash := public.account_balance(cash);

  perform public.adjust_account_balance(cash, before_cash + 75, 'Typo');
  select id into correction from public.account_movements
  where account_id = cash and movement_type = 'adjustment'
  order by created_at desc limit 1;

  perform app.ok(
    public.account_balance(cash) = before_cash + 75,
    'a correction moves the balance'
  );

  perform app.ok(
    public.set_movement_undone(correction, true) = 1,
    'and can be taken back'
  );
  perform app.ok(
    public.account_balance(cash) = before_cash,
    'which puts the balance back where it was'
  );
  perform app.ok(
    (select count(*) from public.account_movements where id = correction) = 1,
    'without throwing the entry away'
  );
  perform app.ok(
    (select undone from public.account_ledger(cash) where reference_id = correction),
    'the history still shows it, marked as taken back'
  );

  perform app.ok(
    public.set_movement_undone(correction, false) = 1,
    'and it can be put back'
  );
  perform app.ok(
    public.account_balance(cash) = before_cash + 75,
    'which counts it again'
  );

  perform app.denies(
    format('select public.set_movement_undone(%L, false)', correction),
    'putting back an entry that was never taken back is refused'
  );

  -- Tidy up, so later assertions start from a known balance.
  perform public.set_movement_undone(correction, true);

  -- A transfer is one act: both sides go together.
  before_cash := public.account_balance(cash);
  before_bank := public.account_balance(bank);

  t := public.transfer_between_accounts(bank, cash, 200);
  select id into half from public.account_movements
  where transfer_id = t and movement_type = 'transfer_in';

  perform app.ok(
    public.set_movement_undone(half, true) = 2,
    'taking back one half of a transfer takes back both'
  );
  perform app.ok(
    public.account_balance(cash) = before_cash
      and public.account_balance(bank) = before_bank,
    'so both accounts go back to what they held'
  );

  perform app.ok(
    public.set_movement_undone(half, false) = 2,
    'and putting it back restores both halves'
  );
  perform app.ok(
    public.account_balance(bank) = before_bank - 200,
    'money leaves the account it came from again'
  );
  perform app.ok(
    public.account_balance(cash) = before_cash + 200,
    'and arrives in the other again'
  );
end;
$$;

-- The window closes after a week.
do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  cash uuid := (select id from public.accounts where business_id = shop and is_default);
  old_entry uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);

  perform public.record_account_change(cash, 10, 'in', 'Old entry');
  select id into old_entry from public.account_movements
  where account_id = cash order by created_at desc limit 1;

  perform app.ok(
    (select can_undo from public.account_ledger(cash) where reference_id = old_entry),
    'a fresh entry can be taken back'
  );

  -- Age it past the window. Only a test may do this; the column is otherwise
  -- written by the database itself.
  update public.account_movements
  set created_at = now() - interval '8 days'
  where id = old_entry;

  perform app.ok(
    not (select can_undo from public.account_ledger(cash) where reference_id = old_entry),
    'after a week it is marked as no longer changeable'
  );
  perform app.denies(
    format('select public.set_movement_undone(%L, true)', old_entry),
    'and taking it back is refused'
  );
  perform app.ok(
    (select count(*) from public.account_ledger(cash) where reference_id = old_entry) = 1,
    'but it is still there to look at'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Putting money in and taking it out directly
-- ---------------------------------------------------------------------------

do $$
declare
  shop uuid := (select id from public.businesses where slug = 'kabita-books');
  bank uuid := (select id from public.accounts where business_id = shop and name = 'NIC Asia');
  before_bank numeric;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', false);
  before_bank := public.account_balance(bank);

  perform public.record_account_change(bank, 300, 'in', 'Cash deposited');
  perform app.ok(
    public.account_balance(bank) = before_bank + 300,
    'adding money raises the balance'
  );

  perform public.record_account_change(bank, 100, 'out', 'Bank charge');
  perform app.ok(
    public.account_balance(bank) = before_bank + 200,
    'taking money out lowers it'
  );

  perform app.denies(
    format($f$select public.record_account_change(%L, 50, 'sideways')$f$, bank),
    'money goes in or out, nowhere else'
  );
  perform app.denies(
    format($f$select public.record_account_change(%L, 0, 'in')$f$, bank),
    'adding nothing is refused'
  );
  perform app.denies(
    format($f$select public.record_account_change(%L, -5, 'in')$f$, bank),
    'a negative amount is refused'
  );
end;
$$;

set role authenticated;

do $$
declare
  shop uuid;
  cash uuid;
  entry uuid;
begin
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);
  select id into shop from public.businesses where slug = 'kabita-books';
  select id into cash from public.accounts where business_id = shop and is_default;
  select id into entry from public.account_movements where account_id = cash limit 1;

  -- The table takes no direct write at all: the functions are the only way in,
  -- because they are what keep a transfer's halves together.
  perform app.changes_nothing(
    format('update public.account_movements set undone_at = null where id = %L', entry),
    'an entry cannot be changed directly, even by an owner'
  );
  perform app.changes_nothing(
    format('delete from public.account_movements where id = %L', entry),
    'nor deleted'
  );

  perform set_config('request.jwt.claim.sub', 'f1f1f1f1-ffff-ffff-ffff-ffffffffffff', true);
  perform app.denies(
    format('select public.set_movement_undone(%L, true)', entry),
    'a cashier cannot take an entry back'
  );
  perform app.denies(
    format($f$select public.record_account_change(%L, 10, 'in')$f$, cash),
    'nor put money into an account'
  );
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Permissions and isolation
-- ---------------------------------------------------------------------------

set role authenticated;

do $$
declare
  shop uuid;
  cash uuid;
  bank uuid;
begin
  -- A cashier may look at the money but not move it.
  perform set_config('request.jwt.claim.sub', 'f1f1f1f1-ffff-ffff-ffff-ffffffffffff', true);
  select id into shop from public.businesses where slug = 'kabita-books';
  select id into cash from public.accounts where business_id = shop and is_default;
  select id into bank from public.accounts where business_id = shop and name = 'NIC Asia';

  perform app.ok(
    (select count(*) from public.account_ledger(cash)) > 0,
    'a cashier can see what moved through an account'
  );
  perform app.denies(
    format('select public.transfer_between_accounts(%L, %L, 10)', cash, bank),
    'a cashier cannot move money between accounts'
  );
  perform app.denies(
    format('select public.adjust_account_balance(%L, 1)', cash),
    'nor correct a balance'
  );
  perform app.denies(
    format($f$insert into public.account_movements
             (business_id, account_id, movement_type, money_in)
             values (%L, %L, 'transfer_in', 9999)$f$, shop, cash),
    'nor write a movement by hand'
  );
end;
$$;

do $$
declare shop uuid; cash uuid;
begin
  -- An owner cannot write a lone half of a transfer either: there is no insert
  -- policy at all, so the pair can only come from the function.
  perform set_config('request.jwt.claim.sub', 'ffffffff-ffff-ffff-ffff-ffffffffffff', true);
  select id into shop from public.businesses where slug = 'kabita-books';
  select id into cash from public.accounts where business_id = shop and is_default;

  perform app.denies(
    format($f$insert into public.account_movements
             (business_id, account_id, movement_type, money_in)
             values (%L, %L, 'transfer_in', 9999)$f$, shop, cash),
    'not even an owner can write half a transfer by hand'
  );
end;
$$;

reset role;

create temporary table account_target as
select id from public.accounts
where business_id = (select id from public.businesses where slug = 'kabita-books')
  and name = 'NIC Asia';
grant select on account_target to authenticated;

set role authenticated;

do $$
declare other uuid := (select id from account_target);
begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);

  perform app.ok(other is not null, 'there really is another shop''s account to attack');
  perform app.ok(
    (select count(*) from public.account_ledger(other)) = 0,
    'an outsider reads none of another shop''s movements'
  );
  perform app.ok(
    public.account_balance(other) = 0,
    'and is told nothing by asking for its balance'
  );
  perform app.denies(
    format('select public.adjust_account_balance(%L, 999999)', other),
    'nor can they correct it'
  );
end;
$$;

reset role;
drop table account_target;

select 'ACCOUNT TESTS PASSED' as result;
