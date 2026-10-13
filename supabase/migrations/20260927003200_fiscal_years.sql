-- Fiscal years (SPEC §25).
--
-- A close must preserve every historical transaction, record the closing
-- position, give the next year an opening position, stop the closed period
-- being edited by accident, and stay auditable.
--
-- The one thing it deliberately does NOT do is write new ledger rows for the
-- carried-forward balances. The party ledger and the stock ledger are
-- continuous, so posting an opening entry on top of them would count every
-- balance twice. The closing position is recorded as a snapshot instead: a
-- statement of where things stood, not a transaction.

create type public.fiscal_year_status as enum ('open', 'closed');

create table public.fiscal_years (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,

  -- How the shop refers to it, e.g. "2082/83" or "2026-27".
  name       text not null,
  starts_on  date not null,
  ends_on    date not null,

  status     public.fiscal_year_status not null default 'open',
  closed_at  timestamptz,
  closed_by  uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fiscal_years_name_not_blank check (length(trim(name)) > 0),
  constraint fiscal_years_ordered check (ends_on > starts_on),
  constraint fiscal_years_closed_has_stamp check (
    (status = 'open'  and closed_at is null and closed_by is null) or
    (status = 'closed' and closed_at is not null)
  )
);

create unique index fiscal_years_start_key
  on public.fiscal_years (business_id, starts_on);
create index fiscal_years_range_idx
  on public.fiscal_years (business_id, starts_on, ends_on);
-- Several years may be open at once: a shop that has not got round to closing
-- last year is still trading in this one. The current year is simply the one
-- containing today, and closing proceeds oldest first.
create index fiscal_years_open_idx
  on public.fiscal_years (business_id, starts_on)
  where status = 'open';

create trigger fiscal_years_touch_updated_at
  before update on public.fiscal_years
  for each row execute function app.touch_updated_at();

-- The closing position, per thing that carries a balance.
create table public.fiscal_year_balances (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  fiscal_year_id uuid not null references public.fiscal_years (id) on delete cascade,

  kind     text not null,
  ref_id   uuid not null,
  label    text not null,

  -- Stock for a product; money for a party or an account.
  quantity numeric(18, 4),
  amount   numeric(18, 2) not null default 0,

  created_at timestamptz not null default now(),

  constraint fiscal_year_balances_kind_known
    check (kind in ('party', 'product', 'account')),
  constraint fiscal_year_balances_unique unique (fiscal_year_id, kind, ref_id)
);

create index fiscal_year_balances_year_idx
  on public.fiscal_year_balances (business_id, fiscal_year_id, kind);

-- ---------------------------------------------------------------------------
-- Working out which year a date belongs to
-- ---------------------------------------------------------------------------

-- The year that contains a date, derived from the shop's configured start.
create or replace function app.fiscal_year_bounds(
  target_business uuid,
  on_date date
)
returns table (starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_month smallint;
  v_day   smallint;
  v_start date;
begin
  select fiscal_year_start_month, fiscal_year_start_day
    into v_month, v_day
  from public.businesses
  where id = target_business;

  if v_month is null then
    return;
  end if;

  -- A start day the month is too short for lands on the month's last day.
  v_start := (
    make_date(extract(year from on_date)::int, v_month, 1)
    + least(
        v_day - 1,
        extract(day from (date_trunc('month', make_date(extract(year from on_date)::int, v_month, 1))
                          + interval '1 month - 1 day'))::int - 1
      )
  );

  -- Before this calendar year's start date, the fiscal year began a year ago.
  if on_date < v_start then
    v_start := v_start - interval '1 year';
  end if;

  return query
    select v_start, (v_start + interval '1 year - 1 day')::date;
end;
$$;

/** A readable name for a year, using both calendar years when it straddles them. */
create or replace function app.fiscal_year_name(starts_on date, ends_on date)
returns text
language sql
immutable
as $$
  select case
    when extract(year from starts_on) = extract(year from ends_on)
      then extract(year from starts_on)::text
    else extract(year from starts_on)::text || '/'
         || to_char(ends_on, 'YY')
  end;
$$;

/** Creates the year containing a date if the shop has not got it yet. */
create or replace function app.ensure_fiscal_year(
  target_business uuid,
  on_date date default current_date
)
returns public.fiscal_years
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bounds record;
  v_year   public.fiscal_years;
begin
  select * into v_bounds from app.fiscal_year_bounds(target_business, on_date);
  if v_bounds is null then
    return null;
  end if;

  select * into v_year
  from public.fiscal_years
  where business_id = target_business and starts_on = v_bounds.starts_on;

  if found then
    return v_year;
  end if;

  insert into public.fiscal_years (business_id, name, starts_on, ends_on)
  values (
    target_business,
    app.fiscal_year_name(v_bounds.starts_on, v_bounds.ends_on),
    v_bounds.starts_on,
    v_bounds.ends_on
  )
  -- Another session may have created it between the check and the insert.
  on conflict (business_id, starts_on) do nothing
  returning * into v_year;

  if v_year is null then
    select * into v_year
    from public.fiscal_years
    where business_id = target_business and starts_on = v_bounds.starts_on;
  end if;

  return v_year;
end;
$$;

-- ---------------------------------------------------------------------------
-- The lock on a closed period
-- ---------------------------------------------------------------------------

create or replace function app.is_period_closed(
  target_business uuid,
  on_date date
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fiscal_years
    where business_id = target_business
      and status = 'closed'
      and on_date between starts_on and ends_on
  );
$$;

revoke all on function app.is_period_closed(uuid, date) from public, anon;
grant execute on function app.is_period_closed(uuid, date) to authenticated;

-- Refuses a transaction dated inside a year that has been closed. Reads the
-- table's own date column, so one function guards them all.
create or replace function app.guard_closed_period()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row      jsonb := to_jsonb(coalesce(new, old));
  v_business uuid  := (v_row ->> 'business_id')::uuid;
  v_date     date;
begin
  -- A cascade from a deleted business has no period left to protect.
  if v_business is null
     or not exists (select 1 from public.businesses where id = v_business) then
    return coalesce(new, old);
  end if;

  v_date := coalesce(
    (v_row ->> 'sale_date')::date,
    (v_row ->> 'purchase_date')::date,
    (v_row ->> 'return_date')::date,
    (v_row ->> 'expense_date')::date,
    (v_row ->> 'income_date')::date,
    (v_row ->> 'created_at')::date
  );

  if v_date is null then
    return coalesce(new, old);
  end if;

  if app.is_period_closed(v_business, v_date) then
    raise exception
      'That date falls in a closed financial year. Reopen the year, or date this in the current one.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

comment on function app.guard_closed_period() is
  'Keeps a closed year''s books from changing (SPEC §25, §69).';

do $$
declare
  t text;
begin
  foreach t in array array[
    'sales', 'sale_items', 'sale_payments', 'sale_returns', 'sale_return_items',
    'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items',
    'stock_movements', 'party_ledger_entries', 'expenses', 'income_entries'
  ]
  loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I
         for each row execute function app.guard_closed_period()',
      t || '_closed_period', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Closing and reopening
-- ---------------------------------------------------------------------------

create or replace function public.close_fiscal_year(p_fiscal_year_id uuid)
returns public.fiscal_years
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_year     public.fiscal_years;
  v_business uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_year from public.fiscal_years where id = p_fiscal_year_id;
  if not found then
    raise exception 'That financial year does not exist' using errcode = 'no_data_found';
  end if;

  v_business := v_year.business_id;

  -- Closing the books is an owner's or accountant's decision.
  if not app.has_role(
    v_business, array['owner', 'accountant']::public.member_role[]
  ) then
    raise exception 'You do not have permission to close a financial year'
      using errcode = '42501';
  end if;

  if v_year.status = 'closed' then
    raise exception 'That year is already closed' using errcode = 'check_violation';
  end if;

  -- Closing a year that has not finished would lock the shop out of trading.
  if v_year.ends_on >= current_date then
    raise exception 'That year has not ended yet. It can be closed from %.',
      to_char(v_year.ends_on + 1, 'DD Mon YYYY')
      using errcode = 'check_violation';
  end if;

  -- An earlier year still open would make this one's opening figures a guess.
  if exists (
    select 1 from public.fiscal_years
    where business_id = v_business
      and status = 'open'
      and starts_on < v_year.starts_on
  ) then
    raise exception 'Close the earlier financial year first'
      using errcode = 'check_violation';
  end if;

  -- The closing position, as at the last day of the year. Historical rows are
  -- read, never touched (SPEC §25).
  insert into public.fiscal_year_balances (
    business_id, fiscal_year_id, kind, ref_id, label, quantity, amount
  )
  select
    v_business, v_year.id, 'party', p.id, p.name, null,
    p.opening_balance + coalesce((
      select sum(l.debit - l.credit)
      from public.party_ledger_entries l
      where l.party_id = p.id
        and l.created_at::date <= v_year.ends_on
    ), 0)
  from public.parties p
  where p.business_id = v_business;

  insert into public.fiscal_year_balances (
    business_id, fiscal_year_id, kind, ref_id, label, quantity, amount
  )
  select
    v_business, v_year.id, 'product', pr.id, pr.name,
    coalesce(m.quantity, 0),
    coalesce(m.value, 0)
  from public.products pr
  left join (
    select
      product_id,
      sum(quantity) as quantity,
      sum(quantity * coalesce(unit_cost, 0)) as value
    from public.stock_movements
    where business_id = v_business
      and created_at::date <= v_year.ends_on
    group by product_id
  ) m on m.product_id = pr.id
  where pr.business_id = v_business;

  insert into public.fiscal_year_balances (
    business_id, fiscal_year_id, kind, ref_id, label, quantity, amount
  )
  select
    v_business, v_year.id, 'account', a.id, a.name, null,
    a.opening_balance
      + coalesce((
          select sum(i.amount) from public.income_entries i
          where i.account_id = a.id and i.income_date <= v_year.ends_on
        ), 0)
      - coalesce((
          select sum(e.amount) from public.expenses e
          where e.account_id = a.id and e.expense_date <= v_year.ends_on
        ), 0)
  from public.accounts a
  where a.business_id = v_business;

  update public.fiscal_years
  set status = 'closed', closed_at = now(), closed_by = v_user
  where id = v_year.id
  returning * into v_year;

  -- The shop keeps trading, so the next year must exist and be open.
  perform app.ensure_fiscal_year(v_business, v_year.ends_on + 1);

  return v_year;
end;
$$;

revoke all on function public.close_fiscal_year(uuid) from public, anon;
grant execute on function public.close_fiscal_year(uuid) to authenticated;

-- Reopening is allowed, because a mistake found later must be fixable — but
-- only by an owner, and the audit trail records it like any other change.
create or replace function public.reopen_fiscal_year(p_fiscal_year_id uuid)
returns public.fiscal_years
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_year public.fiscal_years;
begin
  select * into v_year from public.fiscal_years where id = p_fiscal_year_id;
  if not found then
    raise exception 'That financial year does not exist' using errcode = 'no_data_found';
  end if;

  if not app.has_role(
    v_year.business_id, array['owner']::public.member_role[]
  ) then
    raise exception 'Only an owner can reopen a financial year'
      using errcode = '42501';
  end if;

  if v_year.status = 'open' then
    raise exception 'That year is already open' using errcode = 'check_violation';
  end if;

  -- A later year that is already closed took its opening position from this
  -- one, so reopening this one underneath it would leave the two disagreeing.
  if exists (
    select 1 from public.fiscal_years
    where business_id = v_year.business_id
      and status = 'closed'
      and starts_on > v_year.starts_on
  ) then
    raise exception 'Reopen the later financial year first'
      using errcode = 'check_violation';
  end if;

  -- The snapshot described a position that is about to change again.
  delete from public.fiscal_year_balances where fiscal_year_id = v_year.id;

  update public.fiscal_years
  set status = 'open', closed_at = null, closed_by = null
  where id = v_year.id
  returning * into v_year;

  return v_year;
end;
$$;

revoke all on function public.reopen_fiscal_year(uuid) from public, anon;
grant execute on function public.reopen_fiscal_year(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.fiscal_years enable row level security;
alter table public.fiscal_years force row level security;
alter table public.fiscal_year_balances enable row level security;
alter table public.fiscal_year_balances force row level security;

create policy fiscal_years_select on public.fiscal_years
  for select to authenticated
  using (app.is_member(business_id));

-- Years are created by app.ensure_fiscal_year() and changed only by the two
-- RPCs above, both of which check the role themselves.
create policy fiscal_year_balances_select on public.fiscal_year_balances
  for select to authenticated
  using (
    app.has_role(
      business_id, array['owner', 'manager', 'accountant']::public.member_role[]
    )
  );

grant select on public.fiscal_years to authenticated;
grant select on public.fiscal_year_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Every shop starts with the year it is trading in
-- ---------------------------------------------------------------------------

create or replace function app.seed_fiscal_year()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.ensure_fiscal_year(new.id, current_date);
  return new;
end;
$$;

create trigger businesses_seed_fiscal_year
  after insert on public.businesses
  for each row execute function app.seed_fiscal_year();

-- Businesses that predate this migration get theirs now.
do $$
declare b uuid;
begin
  for b in select id from public.businesses loop
    perform app.ensure_fiscal_year(b, current_date);
  end loop;
end;
$$;

-- The close itself belongs in the audit trail.
create trigger fiscal_years_audit
  after insert or update or delete on public.fiscal_years
  for each row execute function app.audit_row();
