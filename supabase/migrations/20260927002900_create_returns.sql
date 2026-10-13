-- Return RPCs (SPEC §9, §14). Each return restores stock, reverses revenue and
-- adjusts the party ledger in one transaction. Returning more than was sold —
-- across several partial returns — must be impossible.

-- How much of a sale line has already come back.
create or replace function app.returned_quantity(target_sale_item uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(r.quantity), 0)
  from public.sale_return_items r
  join public.sale_returns sr on sr.id = r.sale_return_id
  where r.sale_item_id = target_sale_item
    and sr.status = 'posted';
$$;

create or replace function public.create_sale_return(
  p_sale_id uuid,
  p_items   jsonb,                 -- [{sale_item_id, quantity}]
  p_refund_amount numeric default null,
  p_reason  text default null,
  p_notes   text default null,
  p_client_transaction_id text default null
)
returns public.sale_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_sale     public.sales;
  v_return   public.sale_returns;
  v_item     jsonb;
  v_line     record;
  v_qty      numeric(18, 4);
  v_already  numeric(18, 4);
  v_amount   numeric(18, 2);
  v_subtotal numeric(18, 2) := 0;
  v_refund   numeric(18, 2);
  v_existing public.sale_returns;
  v_total_sold numeric(18, 4);
  v_total_returned numeric(18, 4);
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'That sale does not exist' using errcode = 'no_data_found';
  end if;

  if v_sale.status not in ('posted', 'partially_returned') then
    raise exception 'Only a posted sale can be returned'
      using errcode = 'check_violation';
  end if;

  if not app.has_role(
    v_sale.business_id, array['owner','manager','cashier']::public.member_role[]
  ) then
    raise exception 'You do not have permission to accept returns'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return' using errcode = 'check_violation';
  end if;

  if p_client_transaction_id is not null then
    select * into v_existing from public.sale_returns
    where business_id = v_sale.business_id
      and client_transaction_id = p_client_transaction_id;
    if found then
      return v_existing;
    end if;
  end if;

  insert into public.sale_returns (
    business_id, sale_id, location_id, customer_id,
    return_number, return_date, reason, notes, created_by, client_transaction_id
  )
  values (
    v_sale.business_id, v_sale.id, v_sale.location_id, v_sale.customer_id,
    app.next_document_number(v_sale.business_id, 'sale_return'),
    now(), nullif(trim(p_reason), ''), nullif(trim(p_notes), ''),
    v_user, p_client_transaction_id
  )
  returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select si.*, p.track_inventory
    into v_line
    from public.sale_items si
    join public.products p on p.id = si.product_id
    where si.id = (v_item ->> 'sale_item_id')::uuid
      and si.sale_id = v_sale.id;

    if not found then
      raise exception 'That line is not part of this sale' using errcode = 'no_data_found';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Enter a return quantity greater than zero'
        using errcode = 'check_violation';
    end if;

    -- The crux: partial returns must accumulate, not each be checked alone.
    v_already := app.returned_quantity(v_line.id);
    if v_already + v_qty > v_line.quantity then
      raise exception '%', app.returnable_message(v_line.quantity, v_already)
        using errcode = 'check_violation';
    end if;

    -- Refund at the price actually paid, including any line discount.
    v_amount := round(v_qty * (v_line.line_total / v_line.quantity), 2);
    v_subtotal := v_subtotal + v_amount;

    insert into public.sale_return_items (
      business_id, sale_return_id, sale_item_id, product_id,
      quantity, unit_price, cost_price, line_total
    )
    values (
      v_sale.business_id, v_return.id, v_line.id, v_line.product_id,
      v_qty, v_line.unit_price, v_line.cost_price, v_amount
    );

    if v_line.track_inventory then
      insert into public.stock_movements (
        business_id, product_id, location_id, movement_type,
        quantity, unit_cost, reference_type, reference_id, created_by
      )
      values (
        v_sale.business_id, v_line.product_id, v_sale.location_id, 'sale_return',
        v_qty, nullif(v_line.cost_price, 0), 'sale_return', v_return.id, v_user
      );
    end if;
  end loop;

  -- Default: refund cash only up to what was actually paid on the sale.
  v_refund := coalesce(p_refund_amount, least(v_subtotal, v_sale.paid_amount));
  if v_refund > v_subtotal then
    raise exception 'You cannot refund more than the value returned'
      using errcode = 'check_violation';
  end if;

  update public.sale_returns
  set status = 'posted',
      subtotal = v_subtotal,
      total_amount = v_subtotal,
      refunded_amount = v_refund
  where id = v_return.id
  returning * into v_return;

  -- Anything not refunded in cash reduces what the customer owes.
  if v_sale.customer_id is not null and v_subtotal - v_refund > 0 then
    insert into public.party_ledger_entries (
      business_id, party_id, entry_type, debit, credit,
      reference_type, reference_id, description, created_by
    )
    values (
      v_sale.business_id, v_sale.customer_id, 'sale_return', 0, v_subtotal - v_refund,
      'sale_return', v_return.id,
      'Return ' || v_return.return_number, v_user
    );
  end if;

  -- Mark the sale fully or partially returned.
  select sum(si.quantity), sum(app.returned_quantity(si.id))
  into v_total_sold, v_total_returned
  from public.sale_items si
  where si.sale_id = v_sale.id;

  update public.sales
  set status = case
        when v_total_returned >= v_total_sold then 'returned'
        else 'partially_returned'
      end::public.sale_status
  where id = v_sale.id;

  return v_return;
end;
$$;

revoke all on function public.create_sale_return(uuid, jsonb, numeric, text, text, text)
  from public, anon;
grant execute on function public.create_sale_return(uuid, jsonb, numeric, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Purchase returns: stock goes back to the supplier and the payable shrinks.
-- ---------------------------------------------------------------------------

create or replace function app.purchase_returned_quantity(target_item uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(r.quantity), 0)
  from public.purchase_return_items r
  join public.purchase_returns pr on pr.id = r.purchase_return_id
  where r.purchase_item_id = target_item
    and pr.status = 'posted';
$$;

create or replace function public.create_purchase_return(
  p_purchase_id uuid,
  p_items   jsonb,                 -- [{purchase_item_id, quantity}]
  p_refund_amount numeric default null,
  p_reason  text default null,
  p_notes   text default null,
  p_client_transaction_id text default null
)
returns public.purchase_returns
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_purchase public.purchases;
  v_return   public.purchase_returns;
  v_item     jsonb;
  v_line     record;
  v_qty      numeric(18, 4);
  v_base_qty numeric(18, 4);
  v_already  numeric(18, 4);
  v_amount   numeric(18, 2);
  v_subtotal numeric(18, 2) := 0;
  v_refund   numeric(18, 2);
  v_conv     numeric(18, 6);
  v_stock    numeric(18, 4);
  v_existing public.purchase_returns;
  v_total numeric(18, 4);
  v_returned numeric(18, 4);
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_purchase from public.purchases where id = p_purchase_id;
  if not found then
    raise exception 'That purchase does not exist' using errcode = 'no_data_found';
  end if;

  if v_purchase.status not in ('posted', 'partially_returned') then
    raise exception 'Only a posted purchase can be returned'
      using errcode = 'check_violation';
  end if;

  if not app.has_role(
    v_purchase.business_id,
    array['owner','manager','inventory_manager']::public.member_role[]
  ) then
    raise exception 'You do not have permission to return stock to a supplier'
      using errcode = '42501';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return' using errcode = 'check_violation';
  end if;

  if p_client_transaction_id is not null then
    select * into v_existing from public.purchase_returns
    where business_id = v_purchase.business_id
      and client_transaction_id = p_client_transaction_id;
    if found then
      return v_existing;
    end if;
  end if;

  insert into public.purchase_returns (
    business_id, purchase_id, location_id, supplier_id,
    return_number, return_date, reason, notes, created_by, client_transaction_id
  )
  values (
    v_purchase.business_id, v_purchase.id, v_purchase.location_id,
    v_purchase.supplier_id,
    app.next_document_number(v_purchase.business_id, 'purchase_return'),
    now(), nullif(trim(p_reason), ''), nullif(trim(p_notes), ''),
    v_user, p_client_transaction_id
  )
  returning * into v_return;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select pi.*, p.track_inventory, p.base_unit_id
    into v_line
    from public.purchase_items pi
    join public.products p on p.id = pi.product_id
    where pi.id = (v_item ->> 'purchase_item_id')::uuid
      and pi.purchase_id = v_purchase.id;

    if not found then
      raise exception 'That line is not part of this purchase'
        using errcode = 'no_data_found';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Enter a return quantity greater than zero'
        using errcode = 'check_violation';
    end if;

    v_already := app.purchase_returned_quantity(v_line.id);
    if v_already + v_qty > v_line.quantity then
      raise exception '%',
        replace(app.returnable_message(v_line.quantity, v_already), 'were sold', 'were bought')
        using errcode = 'check_violation';
    end if;

    -- Quantities on a purchase line may be in a packaging unit.
    v_conv := 1;
    if v_line.unit_id is not null and v_line.unit_id <> v_line.base_unit_id then
      select conversion_to_base into v_conv
      from public.product_units
      where product_id = v_line.product_id and unit_id = v_line.unit_id;
      if v_conv is null then
        select conversion_factor into v_conv
        from public.units where id = v_line.unit_id;
      end if;
      v_conv := coalesce(v_conv, 1);
    end if;
    v_base_qty := v_qty * v_conv;

    if v_line.track_inventory then
      select coalesce(quantity, 0) into v_stock
      from public.inventory_balances
      where business_id = v_purchase.business_id
        and product_id = v_line.product_id
        and location_id = v_purchase.location_id;

      -- You cannot send back stock you no longer hold.
      if coalesce(v_stock, 0) < v_base_qty then
        raise exception
          'You only have % in stock, so % cannot go back to the supplier',
          trim_scale(coalesce(v_stock, 0)), trim_scale(v_base_qty)
          using errcode = 'check_violation';
      end if;
    end if;

    v_amount := round(v_qty * (v_line.line_total / v_line.quantity), 2);
    v_subtotal := v_subtotal + v_amount;

    insert into public.purchase_return_items (
      business_id, purchase_return_id, purchase_item_id, product_id,
      quantity, unit_cost, line_total
    )
    values (
      v_purchase.business_id, v_return.id, v_line.id, v_line.product_id,
      v_qty, v_line.unit_cost, v_amount
    );

    if v_line.track_inventory then
      insert into public.stock_movements (
        business_id, product_id, location_id, movement_type,
        quantity, reference_type, reference_id, created_by
      )
      values (
        v_purchase.business_id, v_line.product_id, v_purchase.location_id,
        'purchase_return', -v_base_qty, 'purchase_return', v_return.id, v_user
      );
    end if;
  end loop;

  v_refund := coalesce(p_refund_amount, 0);
  if v_refund > v_subtotal then
    raise exception 'You cannot take back more than the value returned'
      using errcode = 'check_violation';
  end if;

  update public.purchase_returns
  set status = 'posted',
      subtotal = v_subtotal,
      total_amount = v_subtotal,
      refunded_amount = v_refund
  where id = v_return.id
  returning * into v_return;

  -- Anything not refunded in cash reduces what we owe the supplier: a debit.
  if v_purchase.supplier_id is not null and v_subtotal - v_refund > 0 then
    insert into public.party_ledger_entries (
      business_id, party_id, entry_type, debit, credit,
      reference_type, reference_id, description, created_by
    )
    values (
      v_purchase.business_id, v_purchase.supplier_id, 'purchase_return',
      v_subtotal - v_refund, 0,
      'purchase_return', v_return.id,
      'Return ' || v_return.return_number, v_user
    );
  end if;

  select sum(pi.quantity), sum(app.purchase_returned_quantity(pi.id))
  into v_total, v_returned
  from public.purchase_items pi
  where pi.purchase_id = v_purchase.id;

  update public.purchases
  set status = case
        when v_returned >= v_total then 'returned'
        else 'partially_returned'
      end::public.purchase_status
  where id = v_purchase.id;

  return v_return;
end;
$$;

revoke all on function public.create_purchase_return(uuid, jsonb, numeric, text, text, text)
  from public, anon;
grant execute on function public.create_purchase_return(uuid, jsonb, numeric, text, text, text)
  to authenticated;
