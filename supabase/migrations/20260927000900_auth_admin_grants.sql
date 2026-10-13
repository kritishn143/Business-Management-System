-- GoTrue runs as supabase_auth_admin. Because auth.users carries our
-- profile-provisioning trigger, that role needs to reach the schema the
-- trigger function lives in — otherwise every sign-in and sign-up fails with
-- "Database error querying schema".
--
-- Guarded so the migration also applies to a local test database, which has
-- no Supabase service roles.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.handle_new_user() to supabase_auth_admin;
    grant insert, select on public.profiles to supabase_auth_admin;
  end if;
end;
$$;
