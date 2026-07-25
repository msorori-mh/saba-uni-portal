-- READ ONLY
-- Preflight for B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01
-- Confirms prerequisite helpers exist and secure-read RPCs are not yet installed.

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
  if to_regprocedure('public.user_matches_workflow_runtime_step(uuid)') is null then
    raise exception 'PREFLIGHT_FAIL: user_matches_workflow_runtime_step missing';
  end if;
  if to_regprocedure('public.can_current_user_act_on_step(uuid,text)') is null then
    raise exception 'PREFLIGHT_FAIL: can_current_user_act_on_step missing';
  end if;
  if to_regclass('public.student_requests') is null then
    raise exception 'PREFLIGHT_FAIL: student_requests missing';
  end if;
  if to_regclass('public.student_request_workflow_steps') is null then
    raise exception 'PREFLIGHT_FAIL: student_request_workflow_steps missing';
  end if;
  if to_regclass('public.request_types') is null
    or to_regclass('public.request_type_workflows') is null
    or to_regclass('public.student_profiles') is null
    or to_regclass('public.student_request_attachment_uploads') is null then
    raise exception 'PREFLIGHT_FAIL: required secure-read relation missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'request_types'
      and column_name = 'student_visible'
  ) then
    raise exception 'PREFLIGHT_FAIL: request_types.student_visible missing';
  end if;
  foreach r in array procs loop
    if to_regprocedure(r) is not null then
      raise exception 'PREFLIGHT_FAIL: secure read contract already installed: %', r;
    end if;
  end loop;
end $$;

select 'PREFLIGHT_OK_B1_SECURE_READ_CONTRACTS_01' as status;

ROLLBACK;
