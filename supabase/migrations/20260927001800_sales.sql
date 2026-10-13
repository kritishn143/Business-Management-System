-- Sales (SPEC §35). Only a posted sale affects stock, balances and reports
-- (SPEC §70); a draft is freely editable and touches nothing.

create type public.sale_status as enum (
  'draft', 'posted', 'void', 'returned', 'partially_returned'
);

create type public.payment_method as enum (
  'cash', 'bank', 'qr', 'card', 'wallet', 'credit', 'other'
);

create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  location_id    uuid not null references public.locations (id) on delete restrict,
  -- Intentionally unconstrained until the parties table lands; a composite FK
  -- to parties(id, business_id) is added with it.
  customer_id    uuid,

  invoice_number text,
  status         public.sale_status not null default 'draft',
  sale_date      timestamptz not null default now(),

  subtotal          numeric(18, 2) not null default 0,
  discount_amount   numeric(18, 2) not null default 0,
  additional_charge numeric(18, 2) not null default 0,
  tax_amount        numeric(18, 2) not null default 0,
  round_off         numeric(18, 2) not null default 0,
  total_amount      numeric(18, 2) not null default 0,
  paid_amount       numeric(18, 2) not null default 0,
  due_amount        numeric(18, 2) not null default 0,

  notes      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Offline safety: a retried request must not create a second sale (SPEC §52).
  client_transaction_id text,

  constraint sales_amounts_non_negative check (
    subtotal >= 0 and discount_amount >= 0 and additional_charge >= 0
    and tax_amount >= 0 and total_amount >= 0 and paid_amount >= 0
  ),
  constraint sales_posted_has_invoice check (
    status = 'draft' or invoice_number is not null
  )
);

create unique index sales_invoice_number_key
  on public.sales (business_id, invoice_number)
  where invoice_number is not null;

-- The idempotency key (SPEC §52).
create unique index sales_client_transaction_key
  on public.sales (business_id, client_transaction_id)
  where client_transaction_id is not null;

create index sales_date_idx on public.sales (business_id, sale_date desc);
create index sales_status_idx on public.sales (business_id, status);
create index sales_customer_idx on public.sales (business_id, customer_id);

create trigger sales_touch_updated_at
  before update on public.sales
  for each row execute function app.touch_updated_at();

alter table public.sales
  add constraint sales_id_business_key unique (id, business_id);

create table public.sale_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id     uuid not null,
  product_id  uuid not null,
  unit_id     uuid not null,

  quantity        numeric(18, 4) not null,
  unit_price      numeric(18, 4) not null,
  discount_amount numeric(18, 2) not null default 0,
  tax_amount      numeric(18, 2) not null default 0,
  -- Captured at the time of sale so historical profit never drifts (SPEC §35).
  cost_price      numeric(18, 4) not null default 0,
  line_total      numeric(18, 2) not null,
  created_at      timestamptz not null default now(),

  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_amounts_non_negative check (
    unit_price >= 0 and discount_amount >= 0 and tax_amount >= 0 and cost_price >= 0
  ),
  constraint sale_items_sale_same_business
    foreign key (sale_id, business_id)
    references public.sales (id, business_id) on delete cascade,
  constraint sale_items_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete restrict,
  constraint sale_items_unit_same_business
    foreign key (unit_id, business_id)
    references public.units (id, business_id) on delete restrict
);

create index sale_items_sale_idx on public.sale_items (business_id, sale_id);
create index sale_items_product_idx on public.sale_items (business_id, product_id);

create table public.sale_payments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  sale_id     uuid not null,
  method      public.payment_method not null,
  amount      numeric(18, 2) not null,
  reference   text,
  created_at  timestamptz not null default now(),

  constraint sale_payments_amount_positive check (amount > 0),
  constraint sale_payments_sale_same_business
    foreign key (sale_id, business_id)
    references public.sales (id, business_id) on delete cascade
);

create index sale_payments_sale_idx on public.sale_payments (business_id, sale_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['sales', 'sale_items', 'sale_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format($p$
      create policy %1$I_select_member on public.%1$I
        for select to authenticated using (app.is_member(business_id))
    $p$, t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Posted sales are immutable except for the status transitions a return or a
-- void performs, which go through RPCs (SPEC §69).
create or replace function app.guard_posted_sale()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.subtotal = old.subtotal
     and new.total_amount = old.total_amount
     and new.discount_amount = old.discount_amount
     and new.sale_date = old.sale_date
     and new.invoice_number is not distinct from old.invoice_number
  then
    return new;
  end if;

  -- Payments may still be recorded against a credit sale.
  if new.status = old.status
     and new.subtotal = old.subtotal
     and new.total_amount = old.total_amount
     and new.invoice_number is not distinct from old.invoice_number
  then
    return new;
  end if;

  raise exception
    'A posted sale cannot be edited. Create a return or void it instead.'
    using errcode = 'check_violation';
end;
$$;

create trigger sales_guard_posted
  before update on public.sales
  for each row execute function app.guard_posted_sale();
