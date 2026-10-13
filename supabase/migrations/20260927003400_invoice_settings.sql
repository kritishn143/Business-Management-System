-- Invoice configuration (SPEC §21).
--
-- Kept out of the transaction tables on purpose: how an invoice *looks* must
-- never be baked into what was *sold*. Reprinting a two-year-old invoice after
-- the shop changes its terms shows the current terms, and the sale is untouched.

create table public.invoice_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,

  -- Path inside the business-files bucket, never a public URL (SPEC §54).
  logo_path text,

  heading   text not null default 'Tax invoice',
  terms     text,
  footer    text,
  bank_details text,

  signature_label text not null default 'Authorised signature',

  show_logo      boolean not null default true,
  show_signature boolean not null default true,
  show_terms     boolean not null default true,
  show_bank      boolean not null default false,
  /** Whether a thermal receipt repeats the shop's full address. */
  show_address_on_receipt boolean not null default true,

  /** The paper the print screen opens on. */
  default_format text not null default 'a4',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoice_settings_heading_not_blank check (length(trim(heading)) > 0),
  constraint invoice_settings_format_known
    check (default_format in ('a4', 'a5', '80mm', '58mm')),
  constraint invoice_settings_logo_path_scoped check (
    logo_path is null or logo_path like 'business/' || business_id::text || '/%'
  )
);

create trigger invoice_settings_touch_updated_at
  before update on public.invoice_settings
  for each row execute function app.touch_updated_at();

alter table public.invoice_settings enable row level security;
alter table public.invoice_settings force row level security;

-- Everyone who can print an invoice needs to read these.
create policy invoice_settings_select on public.invoice_settings
  for select to authenticated
  using (app.is_member(business_id));

create policy invoice_settings_write on public.invoice_settings
  for update to authenticated
  using (app.has_role(business_id, array['owner', 'manager']::public.member_role[]))
  with check (app.has_role(business_id, array['owner', 'manager']::public.member_role[]));

-- Rows are created with the business, so there is no insert policy: a shop
-- always has exactly one.
create or replace function app.seed_invoice_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.invoice_settings (business_id)
  values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

create trigger businesses_seed_invoice_settings
  after insert on public.businesses
  for each row execute function app.seed_invoice_settings();

-- Businesses that predate this migration get theirs now.
insert into public.invoice_settings (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

grant select, update on public.invoice_settings to authenticated;

create trigger invoice_settings_audit
  after insert or update or delete on public.invoice_settings
  for each row execute function app.audit_row();
