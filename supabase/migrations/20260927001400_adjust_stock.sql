-- Stock adjustment (SPEC §12). Every change to stock is a ledger entry with a
-- reason attached; nothing edits a quantity in place.

create or replace function public.adjust_stock(
  p_product_id  uuid,
  p_quantity    numeric,
  p_reason      public.adjustment_reason,
  p_location_id uuid default null,
  p_unit_cost   numeric default null,
  p_notes       text default null
)
returns public.stock_movements
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_location uuid;
  v_movement public.stock_movements;
  v_tracked  boolean;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_quantity is null or p_quantity = 0 then
    raise exception 'Enter a quantity other than zero'
      using errcode = 'check_violation';
  end if;

  -- Resolve the business from the product, never from the client (SPEC §44).
  select business_id, track_inventory into v_business, v_tracked
  from public.products
  where id = p_product_id;

  if v_business is null then
    raise exception 'That product does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_catalog(v_business) then
    raise exception 'You do not have permission to adjust stock'
      using errcode = '42501';
  end if;

  if not v_tracked then
    raise exception 'This product does not track inventory'
      using errcode = 'check_violation';
  end if;

  -- The ledger's direction constraint would otherwise reject these with an
  -- opaque check-violation message.
  if p_reason = 'opening_stock' and p_quantity < 0 then
    raise exception 'Opening stock cannot be negative'
      using errcode = 'check_violation';
  end if;

  if p_reason in ('damaged', 'lost', 'expired') and p_quantity > 0 then
    raise exception 'Recording % must reduce stock, so use a negative quantity', p_reason
      using errcode = 'check_violation';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations
     where business_id = v_business and is_default limit 1)
  );

  if v_location is null then
    raise exception 'This business has no location to hold stock'
      using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1 from public.locations
    where id = v_location and business_id = v_business
  ) then
    raise exception 'That location belongs to a different business'
      using errcode = '42501';
  end if;

  insert into public.stock_movements (
    business_id, product_id, location_id, movement_type,
    quantity, unit_cost, reason, notes, created_by
  )
  values (
    v_business, p_product_id, v_location,
    (case when p_reason = 'opening_stock' then 'opening'
          when p_reason = 'damaged' then 'damage'
          else 'adjustment' end)::public.movement_type,
    p_quantity, p_unit_cost, p_reason, nullif(trim(p_notes), ''), v_user
  )
  returning * into v_movement;

  return v_movement;
end;
$$;

revoke all on function public.adjust_stock(
  uuid, numeric, public.adjustment_reason, uuid, numeric, text
) from public, anon;
grant execute on function public.adjust_stock(
  uuid, numeric, public.adjustment_reason, uuid, numeric, text
) to authenticated;
