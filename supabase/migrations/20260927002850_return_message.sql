-- The over-return message is read by a shopkeeper at the counter, so it should
-- say "2" and "10", not "2.0000" and "10.0000". trim_scale drops the trailing
-- zeros a numeric(18,4) column otherwise carries into the text.

create or replace function app.returnable_message(
  sold numeric,
  already numeric
)
returns text
language sql
immutable
as $$
  select format(
    'Only %s of that item can still be returned. %s were sold and %s already came back.',
    trim_scale(sold - already), trim_scale(sold), trim_scale(already)
  );
$$;
grant execute on function app.returnable_message(numeric, numeric) to authenticated;
