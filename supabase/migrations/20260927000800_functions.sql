-- Transactional business creation (SPEC §43). A business, its owner
-- membership, its default location and its starter units must all exist or
-- none of them must.

create or replace function app.slugify(input text)
returns text
language sql
immutable
as $$
  select trim(both '-' from
    regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g')
  );
$$;

create or replace function public.create_business(
  p_name text,
  p_business_type text default null,
  p_category text default null,
  p_currency_code text default 'NPR',
  p_timezone text default 'Asia/Kathmandu',
  p_date_system public.date_system default 'AD',
  p_location_name text default 'Main counter'
)
returns public.businesses
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business public.businesses;
  v_slug     text;
  v_suffix   int := 0;
  v_base     text;
  v_piece    uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Business name is required' using errcode = 'check_violation';
  end if;

  v_base := nullif(app.slugify(p_name), '');
  if v_base is null then
    v_base := 'shop';
  end if;

  -- Slug collisions are resolved here rather than surfaced to the user.
  v_slug := v_base;
  while exists (select 1 from public.businesses where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix;
  end loop;

  insert into public.businesses (
    name, slug, business_type, category,
    currency_code, timezone, date_system, created_by
  )
  values (
    trim(p_name), v_slug, p_business_type, p_category,
    upper(p_currency_code), p_timezone, p_date_system, v_user
  )
  returning * into v_business;

  insert into public.business_members (business_id, user_id, role, status, joined_at)
  values (v_business.id, v_user, 'owner', 'active', now());

  insert into public.locations (business_id, name, is_default, is_active)
  values (v_business.id, coalesce(nullif(trim(p_location_name), ''), 'Main counter'), true, true);

  -- Every business starts with a base unit so products can be created at once.
  insert into public.units (business_id, name, symbol, conversion_factor, decimal_places)
  values (v_business.id, 'Piece', 'pc', 1, 0)
  returning id into v_piece;

  insert into public.units
    (business_id, name, symbol, base_unit_id, conversion_factor, decimal_places)
  values
    (v_business.id, 'Packet', 'pkt', v_piece, 10, 0),
    (v_business.id, 'Box',    'box', v_piece, 12, 0),
    (v_business.id, 'Dozen',  'dzn', v_piece, 12, 0);

  return v_business;
end;
$$;

revoke all on function public.create_business(
  text, text, text, text, text, public.date_system, text
) from public, anon;
grant execute on function public.create_business(
  text, text, text, text, text, public.date_system, text
) to authenticated;
