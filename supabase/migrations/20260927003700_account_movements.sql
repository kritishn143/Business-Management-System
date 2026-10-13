-- Managing the money a shop actually holds (SPEC §17, §37).
--
-- An account's balance is never stored. It is the sum of everything that moved
-- through the account, exactly as a party's balance is the sum of its ledger and
-- stock is the sum of its movements.
--
-- Most movements already have a home: an expense row, an income row. Only two
-- kinds have nowhere else to live — moving money between your own accounts, and
-- correcting a balance against a count. Those get a table; everything else is
-- read where it already is, so the two can never disagree.

create type public.account_movement_type as enum (
  'adjustment', 'transfer_in', 'transfer_out'
);

create table public.account_movements (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  account_id  uuid not null,

  movement_type public.account_movement_type not null,

  money_in  numeric(18, 2) not null default 0,
  money_out numeric(18, 2) not null default 0,

  -- The two halves of one transfer share this, so a transfer can be read back
  -- as a single act rather than two unrelated movements.
  transfer_id uuid,

  note     text,
  moved_on date not null default current_date,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint account_movements_one_side check (
    (money_in > 0 and money_out = 0) or (money_out > 0 and money_in = 0)
  ),
  constraint account_movements_account_same_business
    foreign key (account_id, business_id)
    references public.accounts (id, business_id) on delete cascade
);

create index account_movements_account_idx
  on public.account_movements (business_id, account_id, moved_on desc);
create index account_movements_transfer_idx
  on public.account_movements (business_id, transfer_id);

-- ---------------------------------------------------------------------------
-- Everything that has moved through an account, from wherever it lives
-- ---------------------------------------------------------------------------

-- A function rather than a view: it runs as the caller on every Postgres
-- version, so row level security on the tables underneath applies. A view
-- would need `security_invoker`, which is Postgres 15 and later only.
create or replace function public.account_ledger(target_account uuid default null)
returns table (
  account_id  uuid,
  business_id uuid,
  kind        text,
  moved_on    date,
  happened_at timestamptz,
  description text,
  money_in    numeric,
  money_out   numeric,
  reference_id uuid
)
language sql
stable
as $$
  -- What the shop said was in the account when it started keeping books here.
  select
    a.id, a.business_id, 'opening'::text,
    a.created_at::date, a.created_at,
    'Opening balance'::text,
    greatest(a.opening_balance, 0),
    greatest(-a.opening_balance, 0),
    a.id
  from public.accounts a
  where a.opening_balance <> 0
    and (target_account is null or a.id = target_account)

  union all

  select
    m.account_id, m.business_id, m.movement_type::text,
    m.moved_on, m.created_at,
    coalesce(
      m.note,
      case m.movement_type
        when 'transfer_in'  then 'Transferred in'
        when 'transfer_out' then 'Transferred out'
        else 'Balance correction'
      end
    ),
    m.money_in, m.money_out, m.id
  from public.account_movements m
  where target_account is null or m.account_id = target_account

  union all

  select
    i.account_id, i.business_id, 'income',
    i.income_date, i.created_at,
    coalesce(nullif(trim(i.description), ''), 'Other income'),
    i.amount, 0, i.id
  from public.income_entries i
  where i.account_id is not null
    and (target_account is null or i.account_id = target_account)

  union all

  select
    e.account_id, e.business_id, 'expense',
    e.expense_date, e.created_at,
    coalesce(nullif(trim(e.description), ''), 'Expense'),
    0, e.amount, e.id
  from public.expenses e
  where e.account_id is not null
    and (target_account is null or e.account_id = target_account);
$$;

comment on function public.account_ledger(uuid) is
  'Every movement through an account, read from wherever it already lives.';

revoke all on function public.account_ledger(uuid) from public, anon;
grant execute on function public.account_ledger(uuid) to authenticated;

-- Not security definer: a balance must be as visible as the rows behind it, so
-- asking for another business's account returns zero rather than its balance.
create or replace function public.account_balance(target_account uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(money_in - money_out), 0)
  from public.account_ledger(target_account);
$$;

revoke all on function public.account_balance(uuid) from public, anon;
grant execute on function public.account_balance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Moving money between your own accounts
-- ---------------------------------------------------------------------------

create or replace function public.transfer_between_accounts(
  p_from_account uuid,
  p_to_account   uuid,
  p_amount       numeric,
  p_moved_on     date default current_date,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_to_business uuid;
  v_transfer uuid := gen_random_uuid();
  v_from_name text;
  v_to_name   text;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_from_account = p_to_account then
    raise exception 'Choose two different accounts'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero'
      using errcode = 'check_violation';
  end if;

  select business_id, name into v_business, v_from_name
  from public.accounts where id = p_from_account;
  select business_id, name into v_to_business, v_to_name
  from public.accounts where id = p_to_account;

  if v_business is null or v_to_business is null then
    raise exception 'That account does not exist' using errcode = 'no_data_found';
  end if;

  -- Money cannot cross between businesses, whatever the client sends.
  if v_business <> v_to_business then
    raise exception 'Both accounts must belong to the same business'
      using errcode = 'check_violation';
  end if;

  if not app.can_manage_money(v_business) then
    raise exception 'You do not have permission to move money'
      using errcode = '42501';
  end if;

  insert into public.account_movements
    (business_id, account_id, movement_type, money_out, transfer_id, note, moved_on, created_by)
  values
    (v_business, p_from_account, 'transfer_out', p_amount, v_transfer,
     coalesce(nullif(trim(p_note), ''), 'To ' || v_to_name), p_moved_on, v_user);

  insert into public.account_movements
    (business_id, account_id, movement_type, money_in, transfer_id, note, moved_on, created_by)
  values
    (v_business, p_to_account, 'transfer_in', p_amount, v_transfer,
     coalesce(nullif(trim(p_note), ''), 'From ' || v_from_name), p_moved_on, v_user);

  return v_transfer;
end;
$$;

revoke all on function public.transfer_between_accounts(uuid, uuid, numeric, date, text)
  from public, anon;
grant execute on function public.transfer_between_accounts(uuid, uuid, numeric, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Correcting a balance against what is actually there
-- ---------------------------------------------------------------------------

-- Takes the balance the shop counted, works out the difference itself, and
-- records that difference. A correction is a movement like any other, so the
-- history still adds up to the balance.
create or replace function public.adjust_account_balance(
  p_account      uuid,
  p_counted      numeric,
  p_note         text default null,
  p_moved_on     date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_current  numeric;
  v_delta    numeric;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_counted is null then
    raise exception 'Enter the amount you counted'
      using errcode = 'check_violation';
  end if;

  select business_id into v_business from public.accounts where id = p_account;
  if v_business is null then
    raise exception 'That account does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_money(v_business) then
    raise exception 'You do not have permission to adjust an account'
      using errcode = '42501';
  end if;

  v_current := public.account_balance(p_account);
  v_delta := round(p_counted - v_current, 2);

  if v_delta = 0 then
    raise exception 'That is already the balance, so there is nothing to correct'
      using errcode = 'check_violation';
  end if;

  insert into public.account_movements
    (business_id, account_id, movement_type, money_in, money_out, note, moved_on, created_by)
  values (
    v_business, p_account, 'adjustment',
    greatest(v_delta, 0), greatest(-v_delta, 0),
    coalesce(nullif(trim(p_note), ''), 'Corrected to counted balance'),
    p_moved_on, v_user
  );

  return v_delta;
end;
$$;

revoke all on function public.adjust_account_balance(uuid, numeric, text, date)
  from public, anon;
grant execute on function public.adjust_account_balance(uuid, numeric, text, date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.account_movements enable row level security;
alter table public.account_movements force row level security;

create policy account_movements_select on public.account_movements
  for select to authenticated
  using (app.is_member(business_id));

-- Movements are written by the two functions above, which check the role and
-- keep a transfer's halves together. There is no insert policy, so a lone half
-- of a transfer cannot be written by hand.
create policy account_movements_delete on public.account_movements
  for delete to authenticated
  using (app.can_manage_money(business_id));

revoke all on public.account_movements from anon;
grant select, delete on public.account_movements to authenticated;


-- Corrections and transfers are money, so they are audited and cannot be
-- backdated into a closed year.
create trigger account_movements_audit
  after insert or update or delete on public.account_movements
  for each row execute function app.audit_row();

create trigger account_movements_closed_period
  before insert or update or delete on public.account_movements
  for each row execute function app.guard_closed_period();
