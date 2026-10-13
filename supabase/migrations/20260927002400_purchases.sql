-- Purchases (SPEC §13, §36). Mirrors sales: only a posted purchase moves
-- stock and money, and posting is one transaction.

create type public.purchase_status as enum (
  'draft', 'posted', 'void', 'returned', 'partially_returned'
);

create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  location_id    uuid not null references public.locations (id) on delete restrict,
  supplier_id    uuid,

  invoice_number   text,
  supplier_invoice text,
  status           public.purchase_status not null default 'draft',
  purchase_date    timestamptz not null default now(),

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

  client_transaction_id text,

  constraint purchases_amounts_non_negative check (
    subtotal >= 0 and discount_amount >= 0 and additional_charge >= 0
    and tax_amount >= 0 and total_amount >= 0 and paid_amount >= 0
  ),
  constraint purchases_posted_has_invoice check (
    status = 'draft' or invoice_number is not null
  ),
  constraint purchases_supplier_same_business
    foreign key (supplier_id, business_id)
    references public.parties (id, business_id) on delete restrict
);

create unique index purchases_invoice_number_key
  on public.purchases (business_id, invoice_number)
  where invoice_number is not null;

create unique index purchases_client_transaction_key
  on public.purchases (business_id, client_transaction_id)
  where client_transaction_id is not null;

create index purchases_date_idx on public.purchases (business_id, purchase_date desc);
create index purchases_supplier_idx on public.purchases (business_id, supplier_id);

create trigger purchases_touch_updated_at
  before update on public.purchases
  for each row execute function app.touch_updated_at();

alter table public.purchases
  add constraint purchases_id_business_key unique (id, business_id);

create table public.purchase_items (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_id uuid not null,
  product_id  uuid not null,
  unit_id     uuid not null,

  quantity        numeric(18, 4) not null,
  unit_cost       numeric(18, 4) not null,
  discount_amount numeric(18, 2) not null default 0,
  tax_amount      numeric(18, 2) not null default 0,
  line_total      numeric(18, 2) not null,
  created_at      timestamptz not null default now(),

  constraint purchase_items_quantity_positive check (quantity > 0),
  constraint purchase_items_amounts_non_negative check (
    unit_cost >= 0 and discount_amount >= 0 and tax_amount >= 0
  ),
  constraint purchase_items_purchase_same_business
    foreign key (purchase_id, business_id)
    references public.purchases (id, business_id) on delete cascade,
  constraint purchase_items_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete restrict,
  constraint purchase_items_unit_same_business
    foreign key (unit_id, business_id)
    references public.units (id, business_id) on delete restrict
);

create index purchase_items_purchase_idx
  on public.purchase_items (business_id, purchase_id);
create index purchase_items_product_idx
  on public.purchase_items (business_id, product_id);

-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['purchases', 'purchase_items'] loop
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

create or replace function app.guard_posted_purchase()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'draft' then
    return new;
  end if;

  if new.id                =              old.id
     and new.business_id   =              old.business_id
     and new.location_id   =              old.location_id
     and new.purchase_date =              old.purchase_date
     and new.subtotal      =              old.subtotal
     and new.total_amount  =              old.total_amount
     and new.created_at    =              old.created_at
     and new.supplier_id   is not distinct from old.supplier_id
     and new.invoice_number is not distinct from old.invoice_number
     and new.notes         is not distinct from old.notes
  then
    return new;
  end if;

  raise exception
    'A posted purchase cannot be edited. Create a return instead.'
    using errcode = 'check_violation';
end;
$$;

create trigger purchases_guard_posted
  before update on public.purchases
  for each row execute function app.guard_posted_purchase();

-- A purchase left unpaid becomes a payable on the supplier's ledger.
create or replace function app.post_purchase_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'posted'
     and (old.status is distinct from 'posted')
     and new.supplier_id is not null
     and new.due_amount > 0
  then
    -- We owe them, so the balance moves negative: a credit.
    insert into public.party_ledger_entries (
      business_id, party_id, entry_type, debit, credit,
      reference_type, reference_id, description, created_by
    )
    values (
      new.business_id, new.supplier_id, 'purchase', 0, new.due_amount,
      'purchase', new.id, 'Bill ' || coalesce(new.invoice_number, ''), new.created_by
    );
  end if;

  return new;
end;
$$;

create trigger purchases_post_to_ledger
  after update on public.purchases
  for each row execute function app.post_purchase_to_ledger();
