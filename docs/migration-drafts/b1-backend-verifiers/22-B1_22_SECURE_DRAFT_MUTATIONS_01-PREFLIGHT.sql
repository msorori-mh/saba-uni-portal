-- READ ONLY
-- Preflight for B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01
-- Confirms secure-read helpers + trusted refs exist and draft mutation RPCs are not yet installed.

begin;

do $$
begin
  if to_regprocedure('public.assert_b1_academic_period_reference(uuid,uuid)') is null then
    raise exception 'PREFLIGHT_FAIL: assert_b1_academic_period_reference missing';
  end if;
  if to_regprocedure('public.assert_b1_active_course_enrollment(uuid,uuid)') is null then
    raise exception 'PREFLIGHT_FAIL: assert_b1_active_course_enrollment missing';
  end if;
  if to_regprocedure('public.assert_b1_target_program_department(uuid,uuid)') is null then
    raise exception 'PREFLIGHT_FAIL: assert_b1_target_program_department missing';
  end if;
  if to_regclass('public.student_request_attachment_uploads') is null then
    raise exception 'PREFLIGHT_FAIL: student_request_attachment_uploads missing';
  end if;
  if to_regclass('public.enrollment_suspension_details') is null then
    raise exception 'PREFLIGHT_FAIL: enrollment_suspension_details missing';
  end if;
  if to_regprocedure('public.create_b1_request_draft_for_student(text,text)') is not null then
    raise exception 'PREFLIGHT_FAIL: draft create RPC already installed';
  end if;
  if to_regprocedure('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)') is not null then
    raise exception 'PREFLIGHT_FAIL: draft save RPC already installed';
  end if;
end $$;

select 'PREFLIGHT_OK_B1_SECURE_DRAFT_MUTATIONS_01' as status;

ROLLBACK;
