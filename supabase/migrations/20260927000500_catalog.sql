-- Categories, units and products (SPEC §29, §30).

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  parent_id   uuid references public.categories (id) on delete set null,
  name        text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint categories_name_not_blank check (length(trim(name)) > 0),
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

create index categories_business_idx on public.categories (business_id, is_active);
create unique index categories_name_key
  on public.categories (business_id, lower(name));

create trigger categories_touch_updated_at
  before update on public.categories
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------

create table public.units (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  name              text not null,
  symbol            text not null,
  -- Null marks this unit as the base of its own family (e.g. piece).
  base_unit_id      uuid references public.units (id) on delete restrict,
  conversion_factor numeric(18, 6) not null default 1,
  decimal_places    smallint not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint units_name_not_blank check (length(trim(name)) > 0),
  constraint units_conversion_positive check (conversion_factor > 0),
  constraint units_decimal_places_range check (decimal_places between 0 and 6),
  constraint units_base_is_identity check (
    base_unit_id is not null or conversion_factor = 1
  )
);

create index units_business_idx on public.units (business_id, is_active);
create unique index units_name_key on public.units (business_id, lower(name));

create trigger units_touch_updated_at
  before update on public.units
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references public.businesses (id) on delete cascade,
  category_id      uuid references public.categories (id) on delete set null,
  -- The canonical unit stock is counted in (SPEC §10).
  base_unit_id     uuid not null references public.units (id) on delete restrict,

  name             text not null,
  sku              text,
  barcode          text,
  description      text,
  brand            text,

  -- Money is numeric, never float (SPEC §67).
  purchase_price   numeric(18, 4) not null default 0,
  selling_price    numeric(18, 4) not null default 0,
  wholesale_price  numeric(18, 4),
  mrp              numeric(18, 4),
  tax_rate         numeric(9, 4) not null default 0,

  minimum_stock    numeric(18, 4) not null default 0,
  reorder_quantity numeric(18, 4) not null default 0,
  track_inventory  boolean not null default true,

  image_url        text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_prices_non_negative check (
    purchase_price >= 0
    and selling_price >= 0
    and (wholesale_price is null or wholesale_price >= 0)
    and (mrp is null or mrp >= 0)
  ),
  constraint products_tax_rate_range check (tax_rate >= 0 and tax_rate <= 100),
  constraint products_stock_levels_non_negative check (
    minimum_stock >= 0 and reorder_quantity >= 0
  )
);

-- Unique per business only where a value exists (SPEC §29).
create unique index products_sku_key
  on public.products (business_id, lower(sku))
  where sku is not null;
create unique index products_barcode_key
  on public.products (business_id, barcode)
  where barcode is not null;

create index products_business_idx on public.products (business_id, is_active);
create index products_category_idx on public.products (business_id, category_id);
create index products_created_idx on public.products (business_id, created_at desc);

-- Fast product search for the POS (SPEC §49, §65).
create index products_name_trgm_idx
  on public.products using gin (name extensions.gin_trgm_ops);

create trigger products_touch_updated_at
  before update on public.products
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Packaging: 1 box = 12 pieces, etc. (SPEC §30)

create table public.product_units (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  product_id        uuid not null references public.products (id) on delete cascade,
  unit_id           uuid not null references public.units (id) on delete restrict,
  conversion_to_base numeric(18, 6) not null,
  purchase_price    numeric(18, 4),
  selling_price     numeric(18, 4),
  barcode           text,
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint product_units_unique unique (product_id, unit_id),
  constraint product_units_conversion_positive check (conversion_to_base > 0)
);

create index product_units_product_idx on public.product_units (business_id, product_id);

create unique index product_units_single_default
  on public.product_units (product_id)
  where is_default;

create unique index product_units_barcode_key
  on public.product_units (business_id, barcode)
  where barcode is not null;

create trigger product_units_touch_updated_at
  before update on public.product_units
  for each row execute function app.touch_updated_at();
