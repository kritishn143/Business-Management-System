-- Undo and redo, for a week (SPEC §12, §69).
--
-- Deleting an entry threw away the fact that it ever happened. Undoing keeps
-- it: the row stays exactly as written and is simply no longer counted, so the
-- history still shows what was done and what was taken back. Redo puts it back.
--
-- After seven days an entry is history, and history is read-only. That window
-- is long enough to catch a mistake and short enough that last month's books
-- cannot quietly change.

alter table public.account_movements
  add column undone_at timestamptz,
  add column undone_by uuid references auth.users (id) on delete set null;

comment on column public.account_movements.undone_at is
  'When this entry was taken back. Null means it counts (SPEC §69).';

-- Deleting is superseded: nothing should remove an entry outright any more.
drop function if exists public.delete_account_movement(uuid);

create or replace function app.movement_undo_window()
returns interval
language sql
immutable
as $$ select interval '7 days' $$;

-- ---------------------------------------------------------------------------
-- The ledger now says which entries count, and which can still be changed
-- ---------------------------------------------------------------------------

-- Two columns are being added to what it returns, so the old one goes first.
-- account_balance depends on it, and is recreated below.
drop function if exists public.account_balance(uuid);
drop function if exists public.account_ledger(uuid);

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
  reference_id uuid,
  undone      boolean,
  can_undo    boolean
)
language sql
stable
as $$
  select
    a.id, a.business_id, 'opening'::text,
    a.created_at::date, a.created_at,
    'Opening balance'::text,
    greatest(a.opening_balance, 0),
    greatest(-a.opening_balance, 0),
    a.id,
    false, false
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
    m.money_in, m.money_out, m.id,
    m.undone_at is not null,
    -- Still within the window, and the year it belongs to is still open.
    m.created_at > now() - app.movement_undo_window()
      and not app.is_period_closed(m.business_id, m.moved_on)
  from public.account_movements m
  where target_account is null or m.account_id = target_account

  union all

  select
    i.account_id, i.business_id, 'income',
    i.income_date, i.created_at,
    coalesce(nullif(trim(i.description), ''), 'Other income'),
    i.amount, 0, i.id,
    false, false
  from public.income_entries i
  where i.account_id is not null
    and (target_account is null or i.account_id = target_account)

  union all

  select
    e.account_id, e.business_id, 'expense',
    e.expense_date, e.created_at,
    coalesce(nullif(trim(e.description), ''), 'Expense'),
    0, e.amount, e.id,
    false, false
  from public.expenses e
  where e.account_id is not null
    and (target_account is null or e.account_id = target_account);
$$;

revoke all on function public.account_ledger(uuid) from public, anon;
grant execute on function public.account_ledger(uuid) to authenticated;

-- An undone entry is still in the history; it just does not count.
create or replace function public.account_balance(target_account uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(money_in - money_out), 0)
  from public.account_ledger(target_account)
  where not undone;
$$;

-- ---------------------------------------------------------------------------
-- Taking an entry back, and putting it back
-- ---------------------------------------------------------------------------

create or replace function public.set_movement_undone(
  p_movement uuid,
  p_undone   boolean
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_movement public.account_movements;
  v_changed  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_movement from public.account_movements where id = p_movement;
  if not found then
    raise exception 'That entry does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_money(v_movement.business_id) then
    raise exception 'You do not have permission to change this entry'
      using errcode = '42501';
  end if;

  if v_movement.created_at <= now() - app.movement_undo_window() then
    raise exception
      'This entry is more than a week old, so it can only be viewed now. Record a correction instead.'
      using errcode = 'check_violation';
  end if;

  if app.is_period_closed(v_movement.business_id, v_movement.moved_on) then
    raise exception
      'That entry is in a closed financial year. Reopen the year to change it.'
      using errcode = 'check_violation';
  end if;

  if (v_movement.undone_at is not null) = p_undone then
    raise exception 'That entry is already in that state'
      using errcode = 'check_violation';
  end if;

  -- A transfer is one act: both sides are taken back, or neither.
  if v_movement.transfer_id is not null then
    update public.account_movements
    set undone_at = case when p_undone then now() else null end,
        undone_by = case when p_undone then v_user else null end
    where transfer_id = v_movement.transfer_id
      and business_id = v_movement.business_id;
  else
    update public.account_movements
    set undone_at = case when p_undone then now() else null end,
        undone_by = case when p_undone then v_user else null end
    where id = v_movement.id;
  end if;

  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

revoke all on function public.set_movement_undone(uuid, boolean) from public, anon;
grant execute on function public.set_movement_undone(uuid, boolean) to authenticated;

comment on function public.set_movement_undone(uuid, boolean) is
  'Takes an entry back, or puts it back, within a week (SPEC §69).';

-- Only the two undo columns may be written directly, and only by this
-- function, which is why the table still has no update policy of its own.

-- ---------------------------------------------------------------------------
-- Putting money in or taking it out, by an amount rather than to a total
-- ---------------------------------------------------------------------------

create or replace function public.record_account_change(
  p_account   uuid,
  p_amount    numeric,
  p_direction text,             -- 'in' to add, 'out' to reduce
  p_note      text default null,
  p_moved_on  date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_id       uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_direction not in ('in', 'out') then
    raise exception 'Money is either going in or coming out'
      using errcode = 'check_violation';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero'
      using errcode = 'check_violation';
  end if;

  select business_id into v_business from public.accounts where id = p_account;
  if v_business is null then
    raise exception 'That account does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_money(v_business) then
    raise exception 'You do not have permission to change this account'
      using errcode = '42501';
  end if;

  insert into public.account_movements
    (business_id, account_id, movement_type, money_in, money_out, note, moved_on, created_by)
  values (
    v_business, p_account, 'adjustment',
    case when p_direction = 'in' then p_amount else 0 end,
    case when p_direction = 'out' then p_amount else 0 end,
    coalesce(nullif(trim(p_note), ''),
             case when p_direction = 'in' then 'Money added' else 'Money taken out' end),
    p_moved_on, v_user
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_account_change(uuid, numeric, text, text, date)
  from public, anon;
grant execute on function public.record_account_change(uuid, numeric, text, text, date)
  to authenticated;
