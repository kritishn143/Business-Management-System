-- complete_purchase (SPEC §13, §43). One transaction: the bill, its lines, the
-- stock it brings in and the payable it leaves behind.

create or replace function public.complete_purchase(
  p_items      jsonb,
  p_supplier_id uuid default null,
  p_paid_amount numeric default 0,
  p_supplier_invoice text default null,
  p_discount   numeric default 0,
  p_additional_charge numeric default 0,
  p_round_off  numeric default 0,
  p_notes      text default null,
  p_location_id uuid default null,
  p_client_transaction_id text default null
)
returns public.purchases
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_location uuid;
  v_purchase public.purchases;
  v_item     jsonb;
  v_product  record;
  v_qty      numeric(18, 4);
  v_base_qty numeric(18, 4);
  v_cost     numeric(18, 4);
  v_base_cost numeric(18, 4);
  v_discount numeric(18, 2);
  v_line     numeric(18, 2);
  v_subtotal numeric(18, 2) := 0;
  v_total    numeric(18, 2);
  v_conv     numeric(18, 6);
  v_existing public.purchases;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase needs at least one item' using errcode = 'check_violation';
  end if;

  select p.business_id into v_business
  from public.products p
  where p.id = (p_items -> 0 ->> 'product_id')::uuid;

  if v_business is null then
    raise exception 'That product does not exist' using errcode = 'no_data_found';
  end if;

  if not app.has_role(
    v_business, array['owner','manager','inventory_manager']::public.member_role[]
  ) then
    raise exception 'You do not have permission to record purchases'
      using errcode = '42501';
  end if;

  if p_client_transaction_id is not null then
    select * into v_existing
    from public.purchases
    where business_id = v_business and client_transaction_id = p_client_transaction_id;
    if found then
      return v_existing;
    end if;
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where business_id = v_business and is_default limit 1)
  );

  if v_location is null then
    raise exception 'This business has no location to receive stock into'
      using errcode = 'no_data_found';
  end if;

  insert into public.purchases (
    business_id, location_id, supplier_id, status, purchase_date,
    supplier_invoice, discount_amount, additional_charge, round_off, notes,
    created_by, client_transaction_id
  )
  values (
    v_business, v_location, p_supplier_id, 'draft', now(),
    nullif(trim(p_supplier_invoice), ''), coalesce(p_discount, 0),
    coalesce(p_additional_charge, 0), coalesce(p_round_off, 0),
    nullif(trim(p_notes), ''), v_user, p_client_transaction_id
  )
  returning * into v_purchase;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.business_id, p.base_unit_id, p.track_inventory
    into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid;

    if not found then
      raise exception 'One of the products no longer exists'
        using errcode = 'no_data_found';
    end if;

    if v_product.business_id <> v_business then
      raise exception 'All items must belong to the same business'
        using errcode = '42501';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Every line needs a quantity greater than zero'
        using errcode = 'check_violation';
    end if;

    v_cost := coalesce((v_item ->> 'unit_cost')::numeric, 0);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);

    v_conv := 1;
    if (v_item ? 'unit_id') and (v_item ->> 'unit_id') is not null
       and (v_item ->> 'unit_id')::uuid <> v_product.base_unit_id then
      select conversion_to_base into v_conv
      from public.product_units
      where product_id = v_product.id and unit_id = (v_item ->> 'unit_id')::uuid;

      if v_conv is null then
        select conversion_factor into v_conv
        from public.units
        where id = (v_item ->> 'unit_id')::uuid and business_id = v_business;
      end if;

      if v_conv is null then
        raise exception 'That unit is not available for this product'
          using errcode = 'no_data_found';
      end if;
    end if;

    v_base_qty := v_qty * v_conv;
    -- Buying a box of 12 for 240 means each piece cost 20.
    v_base_cost := round(v_cost / v_conv, 4);

    v_line := round(v_qty * v_cost - v_discount, 2);
    if v_line < 0 then
      raise exception 'A line discount cannot exceed the line total'
        using errcode = 'check_violation';
    end if;

    v_subtotal := v_subtotal + v_line;

    insert into public.purchase_items (
      business_id, purchase_id, product_id, unit_id,
      quantity, unit_cost, discount_amount, line_total
    )
    values (
      v_business, v_purchase.id, v_product.id,
      coalesce((v_item ->> 'unit_id')::uuid, v_product.base_unit_id),
      v_qty, v_cost, v_discount, v_line
    );

    if v_product.track_inventory then
      insert into public.stock_movements (
        business_id, product_id, location_id, movement_type,
        quantity, unit_cost, reference_type, reference_id, created_by
      )
      values (
        v_business, v_product.id, v_location, 'purchase',
        v_base_qty, v_base_cost, 'purchase', v_purchase.id, v_user
      );
    end if;

    -- Keep the catalogue's reference cost current.
    update public.products
    set purchase_price = v_base_cost
    where id = v_product.id and v_base_cost > 0;
  end loop;

  v_total := round(
    v_subtotal - coalesce(p_discount, 0) + coalesce(p_additional_charge, 0)
      + coalesce(p_round_off, 0),
    2
  );

  if v_total < 0 then
    raise exception 'The discount cannot exceed the purchase total'
      using errcode = 'check_violation';
  end if;

  if coalesce(p_paid_amount, 0) > v_total then
    raise exception 'You cannot pay more than the purchase total'
      using errcode = 'check_violation';
  end if;

  if coalesce(p_paid_amount, 0) < v_total and p_supplier_id is null then
    raise exception 'Choose a supplier to leave an amount owing'
      using errcode = 'check_violation';
  end if;

  update public.purchases
  set status         = 'posted',
      invoice_number = app.next_document_number(v_business, 'purchase'),
      subtotal       = v_subtotal,
      total_amount   = v_total,
      paid_amount    = coalesce(p_paid_amount, 0),
      due_amount     = v_total - coalesce(p_paid_amount, 0)
  where id = v_purchase.id
  returning * into v_purchase;

  return v_purchase;
end;
$$;

revoke all on function public.complete_purchase(
  jsonb, uuid, numeric, text, numeric, numeric, numeric, text, uuid, text
) from public, anon;
grant execute on function public.complete_purchase(
  jsonb, uuid, numeric, text, numeric, numeric, numeric, text, uuid, text
) to authenticated;
