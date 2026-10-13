-- Tenant-scoped file storage (SPEC §41, §54).
--
-- One private bucket, and paths that begin with the owning business:
--
--   business/{business_id}/branding/logo.png
--   business/{business_id}/products/{product_id}/...
--
-- The path is not a convention the client is trusted to follow — the policies
-- below read the business id out of it and check membership, so a path naming
-- someone else's business is refused by the database.

insert into storage.buckets (id, name, public)
values ('business-files', 'business-files', false)
on conflict (id) do nothing;

-- The business a path belongs to, or null if the path is not shaped like ours.
create or replace function app.storage_business(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  parts text[] := string_to_array(object_name, '/');
begin
  if array_length(parts, 1) < 3 or parts[1] <> 'business' then
    return null;
  end if;

  begin
    return parts[2]::uuid;
  exception when others then
    -- Not a uuid in the second segment: not one of our paths.
    return null;
  end;
end;
$$;

revoke all on function app.storage_business(text) from public, anon;
grant execute on function app.storage_business(text) to authenticated;

comment on function app.storage_business(text) is
  'Reads the owning business out of a storage path (SPEC §54).';

-- Any member of the business may read its files.
create policy business_files_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'business-files'
    and app.is_member(app.storage_business(name))
  );

-- Writing is for the roles that maintain the catalogue and the brand.
create policy business_files_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'business-files'
    and app.can_manage_catalog(app.storage_business(name))
  );

create policy business_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'business-files'
    and app.can_manage_catalog(app.storage_business(name))
  )
  with check (
    bucket_id = 'business-files'
    and app.can_manage_catalog(app.storage_business(name))
  );

create policy business_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'business-files'
    and app.can_manage_catalog(app.storage_business(name))
  );
