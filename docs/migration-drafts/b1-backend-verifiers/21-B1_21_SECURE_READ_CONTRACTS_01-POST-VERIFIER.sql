-- READ ONLY
-- Post-verifier for B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01
-- Catalog/grants checks only — no data mutation.

begin;

do $$
declare
  r text;
  procs text[] := array[
    'public.get_b1_secure_read_runtime_capability()',
    'public.get_b1_request_form_options(text)',
    'public.get_b1_request_draft_for_student(uuid)',
    'public.get_b1_request_details_for_student(uuid)',
    'public.list_b1_requests_for_student(integer,integer)',
    'public.get_b1_assigned_inbox_for_actor(integer,integer)',
    'public.get_b1_assigned_request_details_for_actor(uuid)',
    'public.get_b1_step_allowed_actions(uuid)',
    'public.list_b1_request_attachments_for_viewer(uuid)'
  ];
begin
  foreach r in array procs loop
    if to_regprocedure(r) is null then
      raise exception 'POST_FAIL: missing %', r;
    end if;
    if has_function_privilege('anon', r::regprocedure, 'execute') then
      raise exception 'POST_FAIL: anon can execute %', r;
    end if;
    if has_function_privilege('public', r::regprocedure, 'execute') then
      raise exception 'POST_FAIL: public can execute %', r;
    end if;
    if not has_function_privilege('authenticated', r::regprocedure, 'execute') then
      raise exception 'POST_FAIL: authenticated missing execute on %', r;
    end if;
    if not exists (
      select 1
      from pg_proc p
      where p.oid = r::regprocedure
        and p.prosecdef
        and p.provolatile = 's'
        and p.proconfig @> array['search_path=public, pg_temp']
    ) then
      raise exception 'POST_FAIL: SECURITY DEFINER/stable/search_path drift on %', r;
    end if;
  end loop;

  -- Internal helpers must not be granted to any client role.
  foreach r in array array[
    'public.b1_require_auth_uid()',
    'public.b1_deny_read()',
    'public.b1_list_attachment_metas_for_request(uuid)'
  ] loop
    if has_function_privilege('authenticated', r::regprocedure, 'execute')
      or has_function_privilege('anon', r::regprocedure, 'execute')
      or has_function_privilege('public', r::regprocedure, 'execute') then
      raise exception 'POST_FAIL: internal helper client-executable: %', r;
    end if;
  end loop;

  if position('''available'', true' in pg_get_functiondef(
    'public.get_b1_secure_read_runtime_capability()'::regprocedure
  )) > 0 then
    raise exception 'POST_FAIL: runtime capability is hard-coded true';
  end if;
  if position('''viewer''' in pg_get_functiondef(
    'public.get_b1_secure_read_runtime_capability()'::regprocedure
  )) > 0 then
    raise exception 'POST_FAIL: runtime capability exposes viewer identity';
  end if;
end $$;

select 'POST_OK_B1_SECURE_READ_CONTRACTS_01' as status;

ROLLBACK;
