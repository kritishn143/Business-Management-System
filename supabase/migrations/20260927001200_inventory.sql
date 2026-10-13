-- The inventory ledger (SPEC §11). stock_movements is append-only and is the
-- single source of truth; inventory_balances is a projection maintained by
-- trigger so the UI never has to sum the ledger.

create type public.movement_type as enum (
  'opening',
  'purchase',
  'purchase_return',
  'sale',
  'sale_return',
  'adjustment',
  'damage',
  'transfer_in',
  'transfer_out'
);

create type public.adjustment_reason as enum (
  'opening_stock',
  'physical_count',
  'damaged',
  'lost',
  'expired',
  'found',
  'correction',
  'transfer',
  'other'
);

create table public.stock_movements (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  product_id     uuid not null,
  location_id    uuid not null references public.locations (id) on delete restrict,

  movement_type  public.movement_type not null,
  -- Signed, always in the product's base unit. Positive adds, negative removes.
  quantity       numeric(18, 4) not null,
  unit_cost      numeric(18, 4),

  -- What caused this movement, without a hard FK: the referenced table varies.
  reference_type text,
  reference_id   uuid,

  reason         public.adjustment_reason,
  notes          text,

  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),

  constraint stock_movements_quantity_non_zero check (quantity <> 0),
  constraint stock_movements_unit_cost_non_negative check (
    unit_cost is null or unit_cost >= 0
  ),
  -- Direction must match the movement's meaning, so the ledger cannot lie.
  constraint stock_movements_direction check (
    case movement_type
      when 'sale'            then quantity < 0
      when 'damage'          then quantity < 0
      when 'purchase_return' then quantity < 0
      when 'transfer_out'    then quantity < 0
      when 'purchase'        then quantity > 0
      when 'sale_return'     then quantity > 0
      when 'transfer_in'     then quantity > 0
      when 'opening'         then quantity > 0
      else true -- 'adjustment' may go either way
    end
  ),
  constraint stock_movements_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade
);

create index stock_movements_product_idx
  on public.stock_movements (business_id, product_id, created_at desc);
create index stock_movements_location_idx
  on public.stock_movements (business_id, location_id, created_at desc);
create index stock_movements_reference_idx
  on public.stock_movements (business_id, reference_type, reference_id);
create index stock_movements_created_idx
  on public.stock_movements (business_id, created_at desc);

-- Posted movements are immutable (SPEC §11, §69). Corrections are new rows.
create or replace function app.deny_movement_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'Stock movements are immutable. Post a correcting adjustment instead.'
    using errcode = 'check_violation';
end;
$$;

create trigger stock_movements_immutable
  before update or delete on public.stock_movements
  for each row execute function app.deny_movement_mutation();

-- ---------------------------------------------------------------------------
-- Projection
-- ---------------------------------------------------------------------------

create table public.inventory_balances (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  product_id        uuid not null,
  location_id       uuid not null references public.locations (id) on delete cascade,

  quantity          numeric(18, 4) not null default 0,
  reserved_quantity numeric(18, 4) not null default 0,
  -- Weighted average cost, recomputed on every inbound movement.
  average_cost      numeric(18, 4) not null default 0,
  stock_value       numeric(18, 4) not null default 0,
  updated_at        timestamptz not null default now(),

  constraint inventory_balances_unique unique (business_id, product_id, location_id),
  constraint inventory_balances_reserved_non_negative check (reserved_quantity >= 0),
  constraint inventory_balances_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade
);

create index inventory_balances_product_idx
  on public.inventory_balances (business_id, product_id);

-- Applies one movement to the projection. Weighted average cost only moves on
-- inbound movements that carry a cost; outbound movements consume at the
-- current average, which keeps stock value consistent (SPEC §20).
create or replace function app.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  prev_qty  numeric(18, 4);
  prev_cost numeric(18, 4);
  new_qty   numeric(18, 4);
  new_cost  numeric(18, 4);
begin
  insert into public.inventory_balances (business_id, product_id, location_id)
  values (new.business_id, new.product_id, new.location_id)
  on conflict (business_id, product_id, location_id) do nothing;

  select quantity, average_cost into prev_qty, prev_cost
  from public.inventory_balances
  where business_id = new.business_id
    and product_id = new.product_id
    and location_id = new.location_id
  for update;

  new_qty := prev_qty + new.quantity;

  if new.quantity > 0 and new.unit_cost is not null then
    if new_qty <= 0 then
      new_cost := new.unit_cost;
    else
      new_cost := ((greatest(prev_qty, 0) * prev_cost) + (new.quantity * new.unit_cost))
                  / new_qty;
    end if;
  else
    new_cost := prev_cost;
  end if;

  update public.inventory_balances
  set quantity     = new_qty,
      average_cost = round(new_cost, 4),
      stock_value  = round(new_qty * new_cost, 4),
      updated_at   = now()
  where business_id = new.business_id
    and product_id = new.product_id
    and location_id = new.location_id;

  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function app.apply_stock_movement();
