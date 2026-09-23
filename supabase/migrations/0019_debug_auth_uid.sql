create or replace function get_auth_uid_debug()
returns uuid
language sql
security invoker
stable
as $$
  select auth.uid();
$$;
