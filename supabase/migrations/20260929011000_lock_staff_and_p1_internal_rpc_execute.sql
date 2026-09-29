-- Follow-up to 20260929010000: internal SECURITY DEFINER helpers must never
-- be callable with a public or student JWT. All uses audited in src/ invoke
-- the higher-level authorized RPC or a service-role server function.
DO $$
DECLARE
  signature text;
  fn regprocedure;
  caller text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'link_staff_profile_account(uuid,uuid)',
    'check_and_record_rate_limit(text,text,integer,integer,integer)',
    'audit_resolve_role(uuid)',
    'count_admins()',
    'student_has_approved_grades_for_transcript(uuid)',
    'p1_actor_is_test_only(uuid)',
    'p1_active_student_profile(uuid)',
    'p1_current_level_number(uuid)',
    'p1_enrollment_result(uuid)',
    'p1_passed_course_ids(uuid)',
    'p1_october_remaining_requirements(uuid)',
    'p1_assert_october_eligibility(uuid,uuid[])',
    'p1_assert_replacement_card_eligibility(uuid)',
    'p1_final_result_published_at(uuid)',
    'p1_assert_final_result_appeal_eligibility(uuid,uuid,timestamptz)',
    'p1_assert_department_transfer_level(uuid)',
    'p1_assert_step_actor(uuid,text,uuid)',
    'p1_assert_payment_confirmed(uuid)',
    'p1_grade_appeal_department(uuid)',
    'p1_grade_appeal_section_faculty(uuid)',
    'p1_grade_appeal_section_id(uuid)',
    'p1_runtime_step_department_scope(text,text,uuid)',
    'p1_step_is_contextual_instructor(text,text,text,text)',
    'p1_current_user_is_appeal_section_instructor(uuid)',
    'p1_current_user_matches_appeal_department_scope(uuid)',
    'p1_repair_testonly_runtime_assignments(text)'
  ] LOOP
    fn := to_regprocedure('public.' || signature);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'INTERNAL_RPC_MISSING: %', signature;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    FOREACH caller IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(caller, fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'INTERNAL_RPC_EXECUTE_STILL_GRANTED: % / %', fn, caller;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'INTERNAL_RPC_SERVICE_ROLE_MISSING: %', fn;
    END IF;
  END LOOP;
END;
$$;

-- has_any_role is used by authenticated RLS policies and cannot be revoked
-- from that role without changing their execution context.
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, text[]) FROM PUBLIC, anon;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.has_any_role(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'ANON_ROLE_PROBE_EXECUTE_STILL_GRANTED';
  END IF;
END $$;

-- PostgreSQL grants EXECUTE to PUBLIC on newly created functions by default.
-- Global defaults must be changed in addition to Supabase's per-schema role
-- grants; per-schema REVOKE alone cannot undo the global PUBLIC default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
