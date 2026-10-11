RESET ROLE;
-- Disposable fixture: intentionally start with both direct and PUBLIC grants.
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid,text[]) TO authenticated;
DO $$ DECLARE sig text; BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'link_faculty_profile_account(uuid,uuid)',
    'replace_class_schedule_for_context(uuid[],jsonb)',
    'link_staff_profile_account(uuid,uuid)',
    'reconcile_department_head_council_memberships(uuid)',
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
    IF to_regprocedure('public.' || sig) IS NULL THEN
      EXECUTE 'CREATE FUNCTION public.' || sig || ' RETURNS void LANGUAGE plpgsql AS $stub$ BEGIN RETURN; END $stub$';
    END IF;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || sig || ' TO PUBLIC,anon,authenticated';
  END LOOP;
END $$;
