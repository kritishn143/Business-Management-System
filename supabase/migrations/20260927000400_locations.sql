-- Stock lives at a location, even when a shop only ever has one (SPEC §32).

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  code        text,
  address     text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint locations_name_not_blank check (length(trim(name)) > 0)
);

create index locations_business_idx on public.locations (business_id, is_active);

create unique index locations_code_key
  on public.locations (business_id, lower(code))
  where code is not null;

-- Exactly one default per business.
create unique index locations_single_default
  on public.locations (business_id)
  where is_default;

create trigger locations_touch_updated_at
  before update on public.locations
  for each row execute function app.touch_updated_at();
