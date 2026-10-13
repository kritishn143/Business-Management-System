-- Make cross-tenant rows structurally impossible, not merely policed.
-- A composite FK forces the child's business_id to match its parent's.

-- The composite keys below supersede the single-column FKs created inline
-- with each table, so drop those to avoid duplicate constraints.
alter table public.products
  drop constraint products_category_id_fkey,
  drop constraint products_base_unit_id_fkey;

alter table public.product_units
  drop constraint product_units_product_id_fkey,
  drop constraint product_units_unit_id_fkey;

alter table public.categories
  drop constraint categories_parent_id_fkey;

alter table public.units
  drop constraint units_base_unit_id_fkey;


alter table public.products
  add constraint products_id_business_key unique (id, business_id);

alter table public.categories
  add constraint categories_id_business_key unique (id, business_id);

alter table public.units
  add constraint units_id_business_key unique (id, business_id);

alter table public.products
  add constraint products_category_same_business
    foreign key (category_id, business_id)
    references public.categories (id, business_id) on delete set null,
  add constraint products_base_unit_same_business
    foreign key (base_unit_id, business_id)
    references public.units (id, business_id) on delete restrict;

alter table public.product_units
  add constraint product_units_product_same_business
    foreign key (product_id, business_id)
    references public.products (id, business_id) on delete cascade,
  add constraint product_units_unit_same_business
    foreign key (unit_id, business_id)
    references public.units (id, business_id) on delete restrict;

alter table public.categories
  add constraint categories_parent_same_business
    foreign key (parent_id, business_id)
    references public.categories (id, business_id) on delete set null;

alter table public.units
  add constraint units_base_unit_same_business
    foreign key (base_unit_id, business_id)
    references public.units (id, business_id) on delete restrict;
