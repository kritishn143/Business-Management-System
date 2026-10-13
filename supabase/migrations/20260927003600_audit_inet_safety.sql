-- An unparseable client address must never cost a shop its sale.
--
-- app.audit_row() cast the first entry of x-forwarded-for straight to inet.
-- That header is set by whatever proxies sit in front of the request, and it is
-- not always an address: some send the literal "unknown", some append the source
-- port. Either raised inside an AFTER trigger and aborted the whole
-- transaction, so recording a sale would have failed for a reason that has
-- nothing to do with the sale.
--
-- The address was always meant to be best-effort. Now it really is.

create or replace function app.to_inet(value text)
returns inet
language plpgsql
immutable
as $$
declare
  candidate text := btrim(coalesce(value, ''));
begin
  if candidate = '' then
    return null;
  end if;

  begin
    return candidate::inet;
  exception when others then
    -- An IPv4 address with a port appended: the address is still usable.
    if candidate ~ '^\d{1,3}(\.\d{1,3}){3}:\d+$' then
      begin
        return split_part(candidate, ':', 1)::inet;
      exception when others then
        return null;
      end;
    end if;
    -- Anything else is not an address. Record the event without one.
    return null;
  end;
end;
$$;

comment on function app.to_inet(text) is
  'Parses a client address, or returns null rather than failing the caller.';

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_now  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_was  jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  subject  jsonb := coalesce(row_now, row_was);
  target   uuid;
  client   text := app.request_header('x-forwarded-for');
begin
  -- The businesses table is its own tenant; everything else carries a key.
  if tg_table_name = 'businesses' then
    target := (subject ->> 'id')::uuid;
  else
    target := (subject ->> 'business_id')::uuid;
  end if;

  -- A cascade from a deleted business has nothing left to file the event
  -- against, and the business row's own deletion is already recorded.
  if target is null or not exists (select 1 from public.businesses where id = target) then
    return null;
  end if;

  insert into public.audit_logs (
    business_id, user_id, action, entity_type, entity_id,
    old_data, new_data, ip_address, user_agent
  )
  values (
    target,
    -- A cascade can fire while the actor's own account is being deleted, so
    -- only record an actor who is still there to be referenced.
    (select u.id from auth.users u where u.id = auth.uid()),
    case tg_op when 'INSERT' then 'created'
               when 'UPDATE' then 'updated'
               else 'deleted' end,
    tg_table_name,
    (subject ->> 'id')::uuid,
    row_was,
    row_now,
    -- The first hop is the client; the rest are proxies. Best-effort: a header
    -- that is not an address is recorded as no address, never as an error.
    app.to_inet(split_part(coalesce(client, ''), ',', 1)),
    app.request_header('user-agent')
  );

  return null;
end;
$$;
