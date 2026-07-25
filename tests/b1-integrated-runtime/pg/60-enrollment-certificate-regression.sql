-- enrollment_certificate protected-path regression (source + catalog probes).

do $$
declare
  src text;
begin
  -- submit_student_request still exists (legacy) and B1 submit is separate
  perform b1_e2e.note(
    'ec/submit_student_request_present',
    'regression',
    to_regprocedure('public.submit_student_request(uuid)') is not null,
    'legacy submit present'
  );
  perform b1_e2e.note(
    'ec/b1_submit_separate',
    'regression',
    to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') is not null,
    'b1 atomic submit present'
  );

  -- create/save drafts may read student_visible for gating, but must never write it.
  src := pg_get_functiondef('public.create_b1_request_draft_for_student(text,text)'::regprocedure)
    || E'\n'
    || pg_get_functiondef('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure);
  perform b1_e2e.note(
    'ec/create_draft_no_student_visible_write',
    'regression',
    src !~* 'update[[:space:]]+.*student_visible'
      and src !~* 'set[[:space:]]+student_visible[[:space:]]*='
      and src !~* 'student_visible[[:space:]]*=',
    'draft RPCs do not assign student_visible'
  );

  -- enrollment_certificate workflow not among locally activated five
  perform b1_e2e.note(
    'ec/certificate_workflow_not_activated_here',
    'regression',
    not exists (
      select 1 from public.request_type_workflows w
      where w.code ilike '%enrollment_certificate%'
        and w.status = 'active' and w.is_active = true
    ),
    'no active enrollment_certificate workflow in harness activation set'
  );

  -- official documents download helpers unchanged presence if exist
  perform b1_e2e.note(
    'ec/no_new_certificate_grant_surface',
    'regression',
    to_regprocedure('public.create_b1_request_draft_for_student(text,text)') is not null
      and not exists (
        select 1 from information_schema.routine_privileges
        where routine_name ilike '%enrollment_certificate%'
          and grantee = 'anon'
          and privilege_type = 'EXECUTE'
      ),
    'anon has no enrollment_certificate execute grants'
  );
end $$;
