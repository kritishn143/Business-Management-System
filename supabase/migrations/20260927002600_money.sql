-- Money (SPEC §17, §18, §19). Deliberately not a general ledger: an MVP shop
-- needs cash, bank and a record of what went out, with room to grow later.

create type public.account_type as enum ('cash', 'bank', 'wallet', 'other');

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  type        public.account_type not null default 'cash',
  opening_balance numeric(18, 2) not null default 0,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint accounts_name_not_blank check (length(trim(name)) > 0)
);

create index accounts_business_idx on public.accounts (business_id, is_active);
create unique index accounts_name_key on public.accounts (business_id, lower(name));
create unique index accounts_single_default
  on public.accounts (business_id) where is_default;

create trigger accounts_touch_updated_at
  before update on public.accounts
  for each row execute function app.touch_updated_at();

alter table public.accounts
  add constraint accounts_id_business_key unique (id, business_id);

-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint expense_categories_name_not_blank check (length(trim(name)) > 0)
);

create unique index expense_categories_name_key
  on public.expense_categories (business_id, lower(name));

alter table public.expense_categories
  add constraint expense_categories_id_business_key unique (id, business_id);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  account_id  uuid,
  amount      numeric(18, 2) not null,
  expense_date date not null default current_date,
  description text,
  attachment_url text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint expenses_amount_positive check (amount > 0),
  constraint expenses_category_same_business
    foreign key (category_id, business_id)
    references public.expense_categories (id, business_id) on delete set null,
  constraint expenses_account_same_business
    foreign key (account_id, business_id)
    references public.accounts (id, business_id) on delete set null
);

create index expenses_date_idx on public.expenses (business_id, expense_date desc);
create index expenses_category_idx on public.expenses (business_id, category_id);

create trigger expenses_touch_updated_at
  before update on public.expenses
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------

create table public.income_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint income_categories_name_not_blank check (length(trim(name)) > 0)
);

create unique index income_categories_name_key
  on public.income_categories (business_id, lower(name));

alter table public.income_categories
  add constraint income_categories_id_business_key unique (id, business_id);

create table public.income_entries (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id uuid,
  account_id  uuid,
  amount      numeric(18, 2) not null,
  income_date date not null default current_date,
  description text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint income_entries_amount_positive check (amount > 0),
  constraint income_entries_category_same_business
    foreign key (category_id, business_id)
    references public.income_categories (id, business_id) on delete set null,
  constraint income_entries_account_same_business
    foreign key (account_id, business_id)
    references public.accounts (id, business_id) on delete set null
);

create index income_date_idx on public.income_entries (business_id, income_date desc);

create trigger income_entries_touch_updated_at
  before update on public.income_entries
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

create or replace function app.can_manage_money(target_business uuid)
returns boolean
language sql
stable
as $$
  select app.has_role(
    target_business,
    array['owner', 'manager', 'accountant']::public.member_role[]
  );
$$;
grant execute on function app.can_manage_money(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'accounts', 'expense_categories', 'expenses',
    'income_categories', 'income_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);

    execute format($p$
      create policy %1$I_select_member on public.%1$I
        for select to authenticated using (app.is_member(business_id))
    $p$, t);
    execute format($p$
      create policy %1$I_insert on public.%1$I
        for insert to authenticated with check (app.can_manage_money(business_id))
    $p$, t);
    execute format($p$
      create policy %1$I_update on public.%1$I
        for update to authenticated
        using (app.can_manage_money(business_id))
        with check (app.can_manage_money(business_id))
    $p$, t);
    execute format($p$
      create policy %1$I_delete on public.%1$I
        for delete to authenticated using (app.can_manage_money(business_id))
    $p$, t);

    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Seed each new business with a cash account and sensible categories.
create or replace function app.seed_money(target_business uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.accounts (business_id, name, type, is_default)
  values (target_business, 'Cash', 'cash', true)
  on conflict do nothing;

  insert into public.expense_categories (business_id, name)
  select target_business, c
  from unnest(array[
    'Rent', 'Electricity', 'Internet', 'Salary', 'Transport',
    'Supplies', 'Maintenance', 'Marketing', 'Miscellaneous'
  ]) as c
  on conflict do nothing;

  insert into public.income_categories (business_id, name)
  select target_business, c
  from unnest(array['Commission', 'Service income', 'Miscellaneous']) as c
  on conflict do nothing;
end;
$$;
