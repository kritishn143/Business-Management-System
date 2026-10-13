-- Parties (SPEC §33). Customers and suppliers share a table because they share
-- behaviour: a balance derived from a ledger, a statement, and payments.

create type public.party_type as enum ('customer', 'supplier', 'both');

create type public.ledger_entry_type as enum (
  'opening', 'sale', 'sale_return', 'purchase', 'purchase_return',
  'payment_in', 'payment_out', 'adjustment'
);

create table public.parties (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  type        public.party_type not null default 'customer',

  name        text not null,
  phone       text,
  email       text,
  address     text,

  -- One signed balance for both roles:
  --   positive = they owe us   (a receivable, typical of a customer)
  --   negative = we owe them   (a payable, typical of a supplier)
  -- Debits move it up, credits move it down, so a customer's credit sale is a
  -- debit and our payment to a supplier is also a debit (toward zero).
  opening_balance numeric(18, 2) not null default 0,
  credit_limit    numeric(18, 2),

  notes      text,
  image_url  text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint parties_name_not_blank check (length(trim(name)) > 0),
  constraint parties_credit_limit_non_negative check (
    credit_limit is null or credit_limit >= 0
  )
);

create index parties_business_idx on public.parties (business_id, type, is_active);
create index parties_name_idx on public.parties (business_id, lower(name));

-- A phone number identifies a person; duplicates cause mis-posted payments.
create unique index parties_phone_key
  on public.parties (business_id, phone)
  where phone is not null and phone <> '';

create index parties_name_trgm_idx
  on public.parties using gin (name extensions.gin_trgm_ops);

create trigger parties_touch_updated_at
  before update on public.parties
  for each row execute function app.touch_updated_at();

alter table public.parties
  add constraint parties_id_business_key unique (id, business_id);

-- ---------------------------------------------------------------------------
-- Ledger. A party's balance is derived from these rows, never overwritten
-- on the party itself (SPEC §34).
-- ---------------------------------------------------------------------------

create table public.party_ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  party_id    uuid not null,

  entry_type  public.ledger_entry_type not null,
  -- Debit increases what they owe us; credit reduces it.
  debit       numeric(18, 2) not null default 0,
  credit      numeric(18, 2) not null default 0,

  reference_type text,
  reference_id   uuid,
  description    text,
  due_date       date,

  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint party_ledger_amounts_non_negative check (debit >= 0 and credit >= 0),
  constraint party_ledger_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  ),
  constraint party_ledger_party_same_business
    foreign key (party_id, business_id)
    references public.parties (id, business_id) on delete cascade
);

create index party_ledger_party_idx
  on public.party_ledger_entries (business_id, party_id, created_at desc);
create index party_ledger_reference_idx
  on public.party_ledger_entries (business_id, reference_type, reference_id);
create index party_ledger_due_idx
  on public.party_ledger_entries (business_id, due_date)
  where due_date is not null;

-- Ledger entries are immutable, with the same cascade allowances the stock
-- ledger needs.
create or replace function app.deny_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.businesses where id = old.business_id) then
      return old;
    end if;
    if not exists (select 1 from public.parties where id = old.party_id) then
      return old;
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.created_by is null
     and old.created_by is not null
     and not exists (select 1 from auth.users where id = old.created_by)
     and new.id          =              old.id
     and new.business_id =              old.business_id
     and new.party_id    =              old.party_id
     and new.entry_type  =              old.entry_type
     and new.debit       =              old.debit
     and new.credit      =              old.credit
     and new.created_at  =              old.created_at
  then
    return new;
  end if;

  raise exception
    'Ledger entries are immutable. Post a correcting entry instead.'
    using errcode = 'check_violation';
end;
$$;

create trigger party_ledger_immutable
  before update or delete on public.party_ledger_entries
  for each row execute function app.deny_ledger_mutation();

-- Balance is always derived (SPEC §34).
create or replace function public.party_balance(target_party uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.opening_balance from public.parties p where p.id = target_party), 0
  ) + coalesce(
    (select sum(l.debit - l.credit)
     from public.party_ledger_entries l
     where l.party_id = target_party), 0
  );
$$;

grant execute on function public.party_balance(uuid) to authenticated;

-- Now that parties exist, a sale's customer must be a real party in the same
-- business (the column was deliberately unconstrained until this point).
alter table public.sales
  add constraint sales_customer_same_business
    foreign key (customer_id, business_id)
    references public.parties (id, business_id) on delete restrict;
