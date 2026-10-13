-- A business must outlive the account that created it: deleting a user should
-- never destroy financial history, but it must not be blocked either.
-- created_by becomes nullable and nulls out on account deletion (SPEC §69).

alter table public.businesses
  alter column created_by drop not null;

alter table public.businesses
  drop constraint businesses_created_by_fkey,
  add constraint businesses_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;
