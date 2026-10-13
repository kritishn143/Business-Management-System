-- Extensions and the private helper schema used by RLS policies.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- Helpers live outside `public` so they are never exposed over PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- Keeps updated_at honest without trusting the client.
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
