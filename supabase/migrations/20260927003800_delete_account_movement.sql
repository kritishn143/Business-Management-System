-- Removing a mistake from an account's history (SPEC §12, §69).
--
-- The delete policy shipped with account_movements allowed a single row to be
-- deleted. For a correction that is fine — it simply restores the balance that
-- was there before. For a transfer it is not: deleting one half leaves the
-- other standing, and money appears or disappears between two accounts.
--
-- So the direct policy goes, and deletion happens through a function that
-- removes both halves of a transfer together.

drop policy if exists account_movements_delete on public.account_movements;

create or replace function public.delete_account_movement(p_movement uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_movement public.account_movements;
  v_removed  integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into v_movement from public.account_movements where id = p_movement;
  if not found then
    raise exception 'That entry does not exist' using errcode = 'no_data_found';
  end if;

  if not app.can_manage_money(v_movement.business_id) then
    raise exception 'You do not have permission to remove this entry'
      using errcode = '42501';
  end if;

  if app.is_period_closed(v_movement.business_id, v_movement.moved_on) then
    raise exception
      'That entry is in a closed financial year. Reopen the year to change it.'
      using errcode = 'check_violation';
  end if;

  if v_movement.transfer_id is not null then
    -- Both sides go, or neither: a transfer is one act.
    delete from public.account_movements
    where transfer_id = v_movement.transfer_id
      and business_id = v_movement.business_id;
  else
    delete from public.account_movements where id = v_movement.id;
  end if;

  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.delete_account_movement(uuid) from public, anon;
grant execute on function public.delete_account_movement(uuid) to authenticated;

comment on function public.delete_account_movement(uuid) is
  'Removes a correction, or both halves of a transfer (SPEC §17).';

-- The function is the only way in, so the table itself takes no direct delete.
revoke delete on public.account_movements from authenticated;
