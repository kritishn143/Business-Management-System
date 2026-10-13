-- Local stand-in for the parts of a Supabase database our migrations depend
-- on. Only used by `npm run db:test`; never applied to a real project.

create schema if not exists auth;
create schema if not exists extensions;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text unique,
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- Mirrors Supabase's auth.uid(): reads the JWT claims set for the session.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema auth to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Storage, as much of it as our migrations touch (SPEC §54)
-- ---------------------------------------------------------------------------

create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supabase ships storage.objects with row level security already on. The
-- harness must match, or the policies our migrations add would be tested
-- against a table that ignores them.
alter table storage.objects enable row level security;

-- Supabase splits an object path into its folder segments with this.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
