-- Transaction numbering (SPEC §71). A per-business, per-kind counter row is
-- locked for update, so two concurrent sales can never take the same number.
-- Never SELECT MAX(...) + 1.

create type public.document_kind as enum (
  'sale', 'purchase', 'sale_return', 'purchase_return', 'payment'
);

create table public.document_counters (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind        public.document_kind not null,
  prefix      text not null,
  padding     smallint not null default 6,
  next_value  bigint not null default 1,
  updated_at  timestamptz not null default now(),

  primary key (business_id, kind),
  constraint document_counters_padding_range check (padding between 1 and 12),
  constraint document_counters_next_positive check (next_value > 0)
);

alter table public.document_counters enable row level security;
alter table public.document_counters force row level security;

create policy document_counters_select_member on public.document_counters
  for select to authenticated
  using (app.is_member(business_id));

create policy document_counters_update_admin on public.document_counters
  for update to authenticated
  using (app.has_role(business_id, array['owner','manager']::public.member_role[]))
  with check (app.has_role(business_id, array['owner','manager']::public.member_role[]));

revoke all on public.document_counters from anon;

create or replace function app.default_prefix(k public.document_kind)
returns text
language sql
immutable
as $$
  select case k
    when 'sale'            then 'SAL'
    when 'purchase'        then 'PUR'
    when 'sale_return'     then 'SRT'
    when 'purchase_return' then 'PRT'
    when 'payment'         then 'PAY'
  end;
$$;

-- Hands out the next number and advances the counter atomically.
create or replace function app.next_document_number(
  target_business uuid,
  target_kind public.document_kind
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix  text;
  v_padding smallint;
  v_value   bigint;
begin
  -- Row lock serialises concurrent callers on this counter only.
  update public.document_counters
  set next_value = next_value + 1,
      updated_at = now()
  where business_id = target_business and kind = target_kind
  returning prefix, padding, next_value - 1
  into v_prefix, v_padding, v_value;

  if not found then
    insert into public.document_counters (business_id, kind, prefix, next_value)
    values (target_business, target_kind, app.default_prefix(target_kind), 2)
    on conflict (business_id, kind) do update
      set next_value = public.document_counters.next_value + 1
    returning prefix, padding, next_value - 1
    into v_prefix, v_padding, v_value;
  end if;

  return v_prefix || '-' || lpad(v_value::text, v_padding, '0');
end;
$$;

-- Give every new business its counters up front.
create or replace function app.seed_document_counters(target_business uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.document_counters (business_id, kind, prefix)
  select target_business, k, app.default_prefix(k)
  from unnest(enum_range(null::public.document_kind)) as k
  on conflict do nothing;
$$;
