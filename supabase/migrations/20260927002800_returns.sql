-- Returns (SPEC §9, §14). A return is always a new transaction linked to the
-- original, never an edit of it. Partial returns are the normal case.

-- A return is built as a draft, then finalised in the same transaction, so the
-- immutability guard below has a clean 'not yet posted' state to allow.
create type public.return_status as enum ('draft', 'posted', 'void');

create table public.sale_returns (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  sale_id        uuid not null,
  location_id    uuid not null references public.locations (id) on delete restrict,
  customer_id    uuid,

  return_number  text not null,
  status         public.return_status not null default 'draft',
  return_date    timestamptz not null default now(),

  subtotal       numeric(18, 2) not null default 0,
  total_amount   numeric(18, 2) not null default 0,
  -- How much cash went back to the customer now; the rest reduces what they owe.
  refunded_amount numeric(18, 2) not null default 0,

  reason     text,
  notes      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  client_transaction_id text,

  constraint sale_returns_amounts_non_negative check (
    subtotal >= 0 and total_amount >= 0 and refunded_amount >= 0
  ),
  constraint sale_returns_refund_within_total check (refunded_amount <= total_amount),
  constraint sale_returns_sale_same_business
    foreign key (sale_id, business_id)
    references public.sales (id, business_id) on delete cascade,
  constraint sale_returns_customer_same_business
    foreign key (customer_id, business_id)
    references public.parties (id, business_id) on delete restrict
);

create unique index sale_returns_number_key
  on public.sale_returns (business_id, return_number);
create unique index sale_returns_client_transaction_key
  on public.sale_returns (business_id, client_transaction_id)
  where client_transaction_id is not null;
create index sale_returns_sale_idx on public.sale_returns (business_id, sale_id);
create index sale_returns_date_idx on public.sale_returns (business_id, return_date desc);

alter table public.sale_returns
  add constraint sale_returns_id_business_key unique (id, business_id);

create table public.sale_return_items (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  sale_return_id uuid not null,
  sale_item_id   uuid not null,
  product_id     uuid not null,

  quantity   numeric(18, 4) not null,
  unit_price numeric(18, 4) not null,
  cost_price numeric(18, 4) not null default 0,
  line_total numeric(18, 2) not null,
  created_at timestamptz not null default now(),

  constraint sale_return_items_quantity_positive check (quantity > 0),
  constraint sale_return_items_return_same_business
    foreign key (sale_return_id, business_id)
    references public.sale_returns (id, business_id) on delete cascade,
  constraint sale_return_items_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete restrict
);

create index sale_return_items_return_idx
  on public.sale_return_items (business_id, sale_return_id);
create index sale_return_items_sale_item_idx
  on public.sale_return_items (business_id, sale_item_id);

-- ---------------------------------------------------------------------------

create table public.purchase_returns (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  purchase_id    uuid not null,
  location_id    uuid not null references public.locations (id) on delete restrict,
  supplier_id    uuid,

  return_number  text not null,
  status         public.return_status not null default 'draft',
  return_date    timestamptz not null default now(),

  subtotal        numeric(18, 2) not null default 0,
  total_amount    numeric(18, 2) not null default 0,
  refunded_amount numeric(18, 2) not null default 0,

  reason     text,
  notes      text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  client_transaction_id text,

  constraint purchase_returns_amounts_non_negative check (
    subtotal >= 0 and total_amount >= 0 and refunded_amount >= 0
  ),
  constraint purchase_returns_refund_within_total check (refunded_amount <= total_amount),
  constraint purchase_returns_purchase_same_business
    foreign key (purchase_id, business_id)
    references public.purchases (id, business_id) on delete cascade,
  constraint purchase_returns_supplier_same_business
    foreign key (supplier_id, business_id)
    references public.parties (id, business_id) on delete restrict
);

create unique index purchase_returns_number_key
  on public.purchase_returns (business_id, return_number);
create unique index purchase_returns_client_transaction_key
  on public.purchase_returns (business_id, client_transaction_id)
  where client_transaction_id is not null;
create index purchase_returns_purchase_idx
  on public.purchase_returns (business_id, purchase_id);

alter table public.purchase_returns
  add constraint purchase_returns_id_business_key unique (id, business_id);

create table public.purchase_return_items (
  id                 uuid primary key default gen_random_uuid(),
  business_id        uuid not null references public.businesses (id) on delete cascade,
  purchase_return_id uuid not null,
  purchase_item_id   uuid not null,
  product_id         uuid not null,

  quantity   numeric(18, 4) not null,
  unit_cost  numeric(18, 4) not null,
  line_total numeric(18, 2) not null,
  created_at timestamptz not null default now(),

  constraint purchase_return_items_quantity_positive check (quantity > 0),
  constraint purchase_return_items_return_same_business
    foreign key (purchase_return_id, business_id)
    references public.purchase_returns (id, business_id) on delete cascade,
  constraint purchase_return_items_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete restrict
);

create index purchase_return_items_return_idx
  on public.purchase_return_items (business_id, purchase_return_id);

-- ---------------------------------------------------------------------------
-- RLS and immutability
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'sale_returns', 'sale_return_items',
    'purchase_returns', 'purchase_return_items'
  ] loop
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

-- A posted return is as immutable as the sale it reverses.
create or replace function app.guard_posted_return()
returns trigger
language plpgsql
as $$
begin
  -- A draft is still being assembled by its RPC.
  if old.status = 'draft' then
    return new;
  end if;

  if new.status is distinct from old.status
     and new.total_amount = old.total_amount
     and new.return_date = old.return_date
  then
    return new;
  end if;

  if new.created_by is null
     and old.created_by is not null
     and not exists (select 1 from auth.users where id = old.created_by)
  then
    return new;
  end if;

  raise exception 'A posted return cannot be edited.'
    using errcode = 'check_violation';
end;
$$;

create trigger sale_returns_guard
  before update on public.sale_returns
  for each row execute function app.guard_posted_return();

create trigger purchase_returns_guard
  before update on public.purchase_returns
  for each row execute function app.guard_posted_return();
