-- complete_sale (SPEC §7, §43). One transaction creates the sale, its items,
-- its payments and its stock movements, and assigns the invoice number.
-- A sale never partially completes.

create or replace function public.complete_sale(
  p_items      jsonb,
  p_payments   jsonb default '[]'::jsonb,
  p_customer_id uuid default null,
  p_discount   numeric default 0,
  p_additional_charge numeric default 0,
  p_round_off  numeric default 0,
  p_notes      text default null,
  p_location_id uuid default null,
  p_client_transaction_id text default null
)
returns public.sales
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_business uuid;
  v_location uuid;
  v_sale     public.sales;
  v_item     jsonb;
  v_payment  jsonb;
  v_product  record;
  v_qty      numeric(18, 4);
  v_base_qty numeric(18, 4);
  v_price    numeric(18, 4);
  v_discount numeric(18, 2);
  v_line     numeric(18, 2);
  v_subtotal numeric(18, 2) := 0;
  v_total    numeric(18, 2);
  v_paid     numeric(18, 2) := 0;
  v_conv     numeric(18, 6);
  v_cost     numeric(18, 4);
  v_existing public.sales;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'A sale needs at least one item' using errcode = 'check_violation';
  end if;

  -- Resolve the business from the first product, never from the caller.
  select p.business_id into v_business
  from public.products p
  where p.id = (p_items -> 0 ->> 'product_id')::uuid;

  if v_business is null then
    raise exception 'That product does not exist' using errcode = 'no_data_found';
  end if;

  if not app.has_role(
    v_business,
    array['owner','manager','cashier']::public.member_role[]
  ) then
    raise exception 'You do not have permission to record sales'
      using errcode = '42501';
  end if;

  -- Idempotency: a retried request returns the original sale (SPEC §52).
  if p_client_transaction_id is not null then
    select * into v_existing
    from public.sales
    where business_id = v_business
      and client_transaction_id = p_client_transaction_id;

    if found then
      return v_existing;
    end if;
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where business_id = v_business and is_default limit 1)
  );

  if v_location is null then
    raise exception 'This business has no location to sell from'
      using errcode = 'no_data_found';
  end if;

  insert into public.sales (
    business_id, location_id, customer_id, status, sale_date,
    discount_amount, additional_charge, round_off, notes,
    created_by, client_transaction_id
  )
  values (
    v_business, v_location, p_customer_id, 'draft', now(),
    coalesce(p_discount, 0), coalesce(p_additional_charge, 0),
    coalesce(p_round_off, 0), nullif(trim(p_notes), ''),
    v_user, p_client_transaction_id
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select p.id, p.business_id, p.base_unit_id, p.track_inventory, p.selling_price
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

    v_price := coalesce((v_item ->> 'unit_price')::numeric, v_product.selling_price);
    v_discount := coalesce((v_item ->> 'discount_amount')::numeric, 0);

    -- Quantity may arrive in a packaging unit; stock always moves in the base.
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

    -- Cost is captured now, from the current weighted average.
    select coalesce(average_cost, 0) into v_cost
    from public.inventory_balances
    where business_id = v_business
      and product_id = v_product.id
      and location_id = v_location;

    v_line := round(v_qty * v_price - v_discount, 2);
    if v_line < 0 then
      raise exception 'A line discount cannot exceed the line total'
        using errcode = 'check_violation';
    end if;

    v_subtotal := v_subtotal + v_line;

    insert into public.sale_items (
      business_id, sale_id, product_id, unit_id,
      quantity, unit_price, discount_amount, cost_price, line_total
    )
    values (
      v_business, v_sale.id, v_product.id,
      coalesce((v_item ->> 'unit_id')::uuid, v_product.base_unit_id),
      v_qty, v_price, v_discount, coalesce(v_cost, 0), v_line
    );

    if v_product.track_inventory then
      insert into public.stock_movements (
        business_id, product_id, location_id, movement_type,
        quantity, unit_cost, reference_type, reference_id, created_by
      )
      values (
        v_business, v_product.id, v_location, 'sale',
        -v_base_qty, nullif(v_cost, 0), 'sale', v_sale.id, v_user
      );
    end if;
  end loop;

  v_total := round(
    v_subtotal - coalesce(p_discount, 0) + coalesce(p_additional_charge, 0)
      + coalesce(p_round_off, 0),
    2
  );

  if v_total < 0 then
    raise exception 'The discount cannot exceed the sale total'
      using errcode = 'check_violation';
  end if;

  for v_payment in select * from jsonb_array_elements(coalesce(p_payments, '[]'::jsonb)) loop
    insert into public.sale_payments (business_id, sale_id, method, amount, reference)
    values (
      v_business, v_sale.id,
      (v_payment ->> 'method')::public.payment_method,
      (v_payment ->> 'amount')::numeric,
      nullif(trim(v_payment ->> 'reference'), '')
    );
    v_paid := v_paid + (v_payment ->> 'amount')::numeric;
  end loop;

  if v_paid > v_total then
    raise exception 'Payments cannot exceed the sale total'
      using errcode = 'check_violation';
  end if;

  if v_paid < v_total and p_customer_id is null then
    raise exception 'Choose a customer to leave an amount owing'
      using errcode = 'check_violation';
  end if;

  update public.sales
  set status         = 'posted',
      invoice_number = app.next_document_number(v_business, 'sale'),
      subtotal       = v_subtotal,
      total_amount   = v_total,
      paid_amount    = v_paid,
      due_amount     = v_total - v_paid
  where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end;
$$;

revoke all on function public.complete_sale(
  jsonb, jsonb, uuid, numeric, numeric, numeric, text, uuid, text
) from public, anon;
grant execute on function public.complete_sale(
  jsonb, jsonb, uuid, numeric, numeric, numeric, text, uuid, text
) to authenticated;
