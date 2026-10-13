-- One row per authenticated user (SPEC §28).

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_full_name_length check (char_length(full_name) <= 120)
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Provision the profile inside the signup transaction so no code path can
-- create a user without one.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();
