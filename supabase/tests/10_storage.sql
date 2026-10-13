-- Storage isolation tests (SPEC §54).

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Reading a business out of a path
-- ---------------------------------------------------------------------------

do $$
begin
  perform app.ok(
    app.storage_business('business/11111111-1111-1111-1111-111111111111/branding/logo.png')
      = '11111111-1111-1111-1111-111111111111',
    'a well-formed path names its business'
  );
  perform app.ok(
    app.storage_business('business/11111111-1111-1111-1111-111111111111/products/x/y/z.jpg')
      = '11111111-1111-1111-1111-111111111111',
    'however deep the path goes'
  );
  perform app.ok(
    app.storage_business('logo.png') is null,
    'a path with no business is nobody''s'
  );
  perform app.ok(
    app.storage_business('business/not-a-uuid/logo.png') is null,
    'nor is one whose second segment is not an id'
  );
  perform app.ok(
    app.storage_business('other/11111111-1111-1111-1111-111111111111/logo.png') is null,
    'nor one that does not start with business/'
  );
  perform app.ok(
    app.storage_business('business/11111111-1111-1111-1111-111111111111') is null,
    'nor one with no file in it'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may put a file where
-- ---------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'indira@example.test', '{"full_name":"Indira Rana"}'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'jeev@example.test',   '{"full_name":"Jeev Adhikari"}');

do $$
declare shop uuid;
begin
  perform set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', false);
  shop := (public.create_business('Indira Stationery')).id;

  -- Jeev sells at the counter but does not maintain the catalogue.
  insert into public.business_members (business_id, user_id, role, status, joined_at)
  values (shop, 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'cashier', 'active', now());
end;
$$;

set role authenticated;

do $$
declare
  shop  uuid;
  other uuid;
begin
  perform set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
  select id into shop from public.businesses where slug = 'indira-stationery';

  -- An owner may upload into their own shop's folder.
  insert into storage.objects (bucket_id, name, owner)
  values ('business-files', 'business/' || shop || '/branding/logo.png',
          'dddddddd-dddd-dddd-dddd-dddddddddddd');
  perform app.ok(true, 'an owner can upload into their own shop''s folder');

  perform app.ok(
    (select count(*) from storage.objects
     where name = 'business/' || shop || '/branding/logo.png') = 1,
    'and read it back'
  );

  -- But not into a folder naming no business at all.
  perform app.denies(
    $f$insert into storage.objects (bucket_id, name)
       values ('business-files', 'logo.png')$f$,
    'a file outside any business folder is refused'
  );
  perform app.denies(
    $f$insert into storage.objects (bucket_id, name)
       values ('business-files', 'business/not-a-uuid/logo.png')$f$,
    'a folder that is not a business id is refused'
  );

  -- Nor into another shop's folder, even knowing its id.
  select id into other from public.businesses where slug <> 'indira-stationery' limit 1;
end;
$$;

reset role;

-- The other shop's id has to be captured before RLS hides it.
create temporary table storage_target as
select id from public.businesses where slug = 'gita-stationers';
grant select on storage_target to authenticated;

set role authenticated;

do $$
declare
  shop  uuid;
  other uuid := (select id from storage_target);
begin
  perform set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
  select id into shop from public.businesses where slug = 'indira-stationery';

  perform app.ok(other is not null, 'there really is another shop to attack');

  perform app.denies(
    format($f$insert into storage.objects (bucket_id, name)
             values ('business-files', 'business/%s/branding/logo.png')$f$, other),
    'uploading into another shop''s folder is refused'
  );

  -- A cashier may look at the shop's files but not change them.
  perform set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);
  perform app.ok(
    (select count(*) from storage.objects
     where name = 'business/' || shop || '/branding/logo.png') = 1,
    'a cashier can read the shop''s files'
  );
  perform app.denies(
    format($f$insert into storage.objects (bucket_id, name)
             values ('business-files', 'business/%s/branding/other.png')$f$, shop),
    'a cashier cannot upload one'
  );
  perform app.changes_nothing(
    format($f$delete from storage.objects
             where name = 'business/%s/branding/logo.png'$f$, shop),
    'a cashier cannot delete one'
  );
end;
$$;

do $$
declare shop uuid;
begin
  -- Someone from another business sees none of these files at all.
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  perform app.ok(
    (select count(*) from storage.objects
     where name like 'business/%/branding/%') = 0,
    'an outsider sees none of another shop''s files'
  );
end;
$$;

-- And an owner can replace and remove their own.
do $$
declare shop uuid;
begin
  perform set_config('request.jwt.claim.sub', 'dddddddd-dddd-dddd-dddd-dddddddddddd', true);
  select id into shop from public.businesses where slug = 'indira-stationery';

  update storage.objects
  set metadata = '{"size": 1024}'::jsonb
  where name = 'business/' || shop || '/branding/logo.png';
  perform app.ok(
    (select metadata ->> 'size' from storage.objects
     where name = 'business/' || shop || '/branding/logo.png') = '1024',
    'an owner can replace their own file'
  );

  delete from storage.objects where name = 'business/' || shop || '/branding/logo.png';
  perform app.ok(
    (select count(*) from storage.objects
     where name = 'business/' || shop || '/branding/logo.png') = 0,
    'and delete it'
  );
end;
$$;

reset role;
drop table storage_target;


-- ---------------------------------------------------------------------------
-- Invoice settings (SPEC §21)
-- ---------------------------------------------------------------------------

do $$
declare shop uuid := (select id from public.businesses where slug = 'indira-stationery');
begin
  perform app.ok(
    (select count(*) from public.invoice_settings where business_id = shop) = 1,
    'a new business gets exactly one invoice configuration'
  );
  perform app.ok(
    (select heading from public.invoice_settings where business_id = shop) = 'Tax invoice',
    'with a sensible default heading'
  );
  perform app.ok(
    (select default_format from public.invoice_settings where business_id = shop) = 'a4',
    'and A4 as the paper it opens on'
  );

  perform app.denies(
    format($f$update public.invoice_settings set default_format = 'letter'
             where business_id = %L$f$, shop),
    'a paper size we cannot print is refused'
  );
  perform app.denies(
    format($f$update public.invoice_settings set heading = '   '
             where business_id = %L$f$, shop),
    'a blank heading is refused'
  );

  -- A logo path must live inside this business's own folder (SPEC §54).
  perform app.denies(
    format($f$update public.invoice_settings
             set logo_path = 'business/99999999-9999-9999-9999-999999999999/branding/logo.png'
             where business_id = %L$f$, shop),
    'a logo path pointing at another business is refused'
  );

  update public.invoice_settings
  set logo_path = 'business/' || shop || '/branding/logo.png'
  where business_id = shop;
  perform app.ok(true, 'a logo inside the shop''s own folder is accepted');
end;
$$;

set role authenticated;

do $$
declare shop uuid;
begin
  -- A cashier prints invoices, so must read the settings, but not change them.
  perform set_config('request.jwt.claim.sub', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', true);
  select id into shop from public.businesses where slug = 'indira-stationery';

  perform app.ok(
    (select count(*) from public.invoice_settings where business_id = shop) = 1,
    'a cashier can read the invoice settings'
  );
  perform app.changes_nothing(
    format($f$update public.invoice_settings set heading = 'Bill'
             where business_id = %L$f$, shop),
    'but cannot change them'
  );

  -- And another shop's settings are invisible.
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', true);
  perform app.ok(
    (select count(*) from public.invoice_settings where business_id = shop) = 0,
    'an outsider cannot read another shop''s invoice settings'
  );
end;
$$;

reset role;

select 'STORAGE AND INVOICE TESTS PASSED' as result;
