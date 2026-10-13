-- Tenants and membership (SPEC §27, §28).

create type public.business_status as enum ('active', 'suspended', 'closed');
create type public.member_role as enum (
  'owner', 'manager', 'cashier', 'inventory_manager', 'accountant'
);
create type public.member_status as enum ('active', 'invited', 'suspended');
create type public.currency_position as enum ('before', 'after');
create type public.date_system as enum ('AD', 'BS');

create table public.businesses (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null,
  logo_url            text,
  category            text,
  business_type       text,
  phone               text,
  email               text,
  address             text,
  province            text,
  district            text,
  municipality        text,
  registration_number text,

  -- Localisation is configurable; nothing assumes Nepal (SPEC §24).
  currency_code       text not null default 'NPR',
  currency_position   public.currency_position not null default 'before',
  timezone            text not null default 'Asia/Kathmandu',
  date_system         public.date_system not null default 'AD',
  date_format         text not null default 'dd MMM yyyy',
  number_format       text not null default 'en-IN',

  -- Month/day the fiscal year opens on, stored without a year so it repeats.
  fiscal_year_start_month smallint not null default 4,
  fiscal_year_start_day   smallint not null default 1,

  status      public.business_status not null default 'active',
  created_by  uuid not null references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint businesses_name_not_blank check (length(trim(name)) > 0),
  constraint businesses_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint businesses_currency_code_format check (currency_code ~ '^[A-Z]{3}$'),
  constraint businesses_fy_month_range check (fiscal_year_start_month between 1 and 12),
  constraint businesses_fy_day_range check (fiscal_year_start_day between 1 and 31)
);

create unique index businesses_slug_key on public.businesses (slug);

create trigger businesses_touch_updated_at
  before update on public.businesses
  for each row execute function app.touch_updated_at();

create table public.business_members (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        public.member_role not null default 'cashier',
  status      public.member_status not null default 'active',
  joined_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint business_members_unique unique (business_id, user_id)
);

create index business_members_user_idx on public.business_members (user_id, status);
create index business_members_business_idx on public.business_members (business_id, status);

create trigger business_members_touch_updated_at
  before update on public.business_members
  for each row execute function app.touch_updated_at();

-- A business must never be left without an owner.
create or replace function app.guard_last_owner()
returns trigger
language plpgsql
as $$
declare
  remaining int;
  target_business uuid := coalesce(old.business_id, new.business_id);
begin
  if old.role <> 'owner' then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE' and new.role = 'owner' and new.status = 'active' then
    return new;
  end if;

  select count(*) into remaining
  from public.business_members
  where business_id = target_business
    and role = 'owner'
    and status = 'active'
    and id <> old.id;

  if remaining = 0 then
    raise exception 'A business must keep at least one active owner'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger business_members_guard_last_owner
  before update or delete on public.business_members
  for each row execute function app.guard_last_owner();
