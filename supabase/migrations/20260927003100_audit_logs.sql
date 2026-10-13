-- Audit trail (SPEC §40, §69).
--
-- Written by triggers rather than by the application, so an event cannot be
-- skipped by reaching the table a different way — from another client, from
-- SQL, or from a future RPC nobody remembered to instrument.

create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,

  -- Who, as far as the request could tell. Null for a cascade or a job.
  user_id     uuid references auth.users (id) on delete set null,

  action      text not null,
  entity_type text not null,
  entity_id   uuid,

  old_data    jsonb,
  new_data    jsonb,

  ip_address  inet,
  user_agent  text,

  created_at  timestamptz not null default now(),

  constraint audit_logs_action_known
    check (action in ('created', 'updated', 'deleted'))
);

-- The questions this table gets asked: what happened here lately, and what
-- ever happened to this record (SPEC §66).
create index audit_logs_recent_idx
  on public.audit_logs (business_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (business_id, entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx
  on public.audit_logs (business_id, user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The recorder
-- ---------------------------------------------------------------------------

-- Supabase forwards the request headers as a GUC. Absent in SQL sessions and
-- in cron, so every read here is best-effort and never fails the write.
create or replace function app.request_header(name text)
returns text
language plpgsql
stable
as $$
declare
  headers jsonb;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    return null;
  end;
  return headers ->> name;
end;
$$;

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_now  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_was  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  subject  jsonb := coalesce(row_now, row_was);
  target   uuid;
  client   text := app.request_header('x-forwarded-for');
begin
  -- The businesses table is its own tenant; everything else carries a key.
  if tg_table_name = 'businesses' then
    target := (subject ->> 'id')::uuid;
  else
    target := (subject ->> 'business_id')::uuid;
  end if;

  -- A cascade from a deleted business has nothing left to file the event
  -- against, and the business row's own deletion is already recorded.
  if target is null or not exists (select 1 from public.businesses where id = target) then
    return null;
  end if;

  insert into public.audit_logs (
    business_id, user_id, action, entity_type, entity_id,
    old_data, new_data, ip_address, user_agent
  )
  values (
    target,
    -- A cascade can fire while the actor's own account is being deleted, so
    -- only record an actor who is still there to be referenced.
    (select u.id from auth.users u where u.id = auth.uid()),
    case tg_op when 'INSERT' then 'created'
               when 'UPDATE' then 'updated'
               else 'deleted' end,
    tg_table_name,
    (subject ->> 'id')::uuid,
    row_was,
    row_now,
    -- The first hop is the client; the rest are proxies.
    nullif(split_part(coalesce(client, ''), ',', 1), '')::inet,
    app.request_header('user-agent')
  );

  return null;
end;
$$;

comment on function app.audit_row() is
  'Generic AFTER trigger: files one audit event per changed row (SPEC §40).';

-- ---------------------------------------------------------------------------
-- What gets watched
-- ---------------------------------------------------------------------------

-- Money, stock, and the permissions that govern them. Deliberately not the
-- catalogue's every price tweak or the audit table itself.
do $$
declare
  t text;
begin
  foreach t in array array[
    'businesses', 'business_members',
    'sales', 'sale_items', 'sale_payments', 'sale_returns', 'sale_return_items',
    'purchases', 'purchase_items', 'purchase_returns', 'purchase_return_items',
    'stock_movements', 'party_ledger_entries',
    'expenses', 'income_entries', 'accounts', 'parties', 'products'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function app.audit_row()',
      t || '_audit', t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading, and never rewriting
-- ---------------------------------------------------------------------------

alter table public.audit_logs enable row level security;
alter table public.audit_logs force row level security;

-- An audit trail the audited can edit is worth nothing, so there is no insert,
-- update or delete policy at all: only the definer trigger writes here.
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated
  using (
    app.has_role(business_id, array['owner', 'manager', 'accountant']::public.member_role[])
  );

create or replace function app.deny_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.businesses where id = old.business_id)
  then
    -- The business is gone; this is the cascade clearing up after it.
    return old;
  end if;

  -- Deleting a user nulls user_id. Allow exactly that, and only once the
  -- account really is gone: the event itself stays on the record.
  if tg_op = 'UPDATE'
     and new.user_id is null
     and old.user_id is not null
     and not exists (select 1 from auth.users where id = old.user_id)
     and new.id          =                  old.id
     and new.business_id =                  old.business_id
     and new.action      =                  old.action
     and new.entity_type =                  old.entity_type
     and new.created_at  =                  old.created_at
     and new.entity_id   is not distinct from old.entity_id
     and new.old_data    is not distinct from old.old_data
     and new.new_data    is not distinct from old.new_data
     and new.ip_address  is not distinct from old.ip_address
     and new.user_agent  is not distinct from old.user_agent
  then
    return new;
  end if;

  raise exception 'The audit trail cannot be changed.'
    using errcode = 'check_violation';
end;
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.deny_audit_mutation();

grant select on public.audit_logs to authenticated;
