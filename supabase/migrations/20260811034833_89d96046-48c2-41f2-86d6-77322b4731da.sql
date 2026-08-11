DO $$
DECLARE
  v_student uuid := '1c44550b-a1d3-44ca-9f79-b5c513641c85';
  v_registrar uuid := '4c261c1c-97fb-42da-a544-e8a59853ebe3';
  v_manager_user uuid := '640b6cce-781a-4831-8950-c4b889204908';
  v_specialist_profile uuid := 'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f';
  v_dept uuid := '11111111-1111-4111-8111-111111111111';
  v_program uuid := '8df96335-4197-4e33-85ca-a970608f6a63';
  v_decision_id uuid;
  v_record_id uuid;
  v_survey_id uuid;
  v_version_id uuid;
BEGIN
  -- 1) account continuity policy
  IF NOT EXISTS (SELECT 1 FROM public.graduate_account_continuity_policies
                 WHERE policy_code = 'graduate-account-continuity' AND is_current) THEN
    INSERT INTO public.graduate_account_continuity_policies (
      policy_code, policy_state, allow_portal_sign_in, allow_university_email_reuse,
      allowed_capabilities, valid_from, decided_by, decided_at, is_current
    ) VALUES (
      'graduate-account-continuity', 'approved', true, false,
      '["portal_sign_in","profile_self_service","survey_participation","event_participation","employment_reporting","contact_management"]'::jsonb,
      now() - interval '1 day', v_registrar, now(), true
    );
  END IF;

  -- 2) official decision + graduate record
  SELECT id INTO v_decision_id FROM public.graduate_official_decisions
  WHERE source_reference = 'TEST_ONLY_GA_E2E_01';

  IF v_decision_id IS NULL THEN
    INSERT INTO public.graduate_official_decisions (
      student_profile_id, source_kind, source_reference, decision_state,
      approved_at, approved_by, effective_graduation_date, program_id, department_id,
      academic_snapshot, source_payload_sha256
    ) VALUES (
      v_student, 'registrar_approved_decision', 'TEST_ONLY_GA_E2E_01', 'approved',
      now(), v_registrar, current_date - 30, v_program, v_dept,
      jsonb_build_object('gpa', 3.4, 'total_credits', 132, 'tag', 'TEST_ONLY_GA_E2E_01'),
      encode(sha256(convert_to('TEST_ONLY_GA_E2E_01','UTF8')), 'hex')
    )
    RETURNING id INTO v_decision_id;
  END IF;

  v_record_id := public.create_graduate_record_from_official_decision(v_decision_id);
  IF v_record_id IS NULL THEN
    RAISE EXCEPTION 'GA_FIXTURE_RECORD_NOT_CREATED';
  END IF;

  -- 3) survey + published version
  SELECT id INTO v_survey_id FROM public.graduate_surveys WHERE title = 'استبيان توظيف الخريجين — TEST_ONLY_GA_E2E_01';
  IF v_survey_id IS NULL THEN
    INSERT INTO public.graduate_surveys (purpose_code, title, state, minimum_report_cell_size)
    VALUES ('survey_participation', 'استبيان توظيف الخريجين — TEST_ONLY_GA_E2E_01', 'active', 5)
    RETURNING id INTO v_survey_id;
  END IF;

  SELECT id INTO v_version_id FROM public.graduate_survey_versions WHERE survey_id = v_survey_id AND version = 1;
  IF v_version_id IS NULL THEN
    INSERT INTO public.graduate_survey_versions (survey_id, version, notice_version, questions, published_at)
    VALUES (
      v_survey_id, 1, 'ga-notice-v1',
      '[{"key":"employment_status","kind":"single_choice","required":true,"options":["employed","seeking_work","continuing_education"]},{"key":"comments","kind":"free_text","required":false,"maxLength":500}]'::jsonb,
      now()
    )
    RETURNING id INTO v_version_id;
  END IF;

  -- 4) published event
  IF NOT EXISTS (SELECT 1 FROM public.graduate_events WHERE title = 'ملتقى الخريجين المهني — TEST_ONLY_GA_E2E_01') THEN
    INSERT INTO public.graduate_events (title, event_type, purpose_code, notice_version, starts_at, ends_at, audience_scope, state)
    VALUES ('ملتقى الخريجين المهني — TEST_ONLY_GA_E2E_01', 'career', 'event_participation', 'ga-notice-v1',
            now() + interval '14 days', now() + interval '14 days 4 hours',
            jsonb_build_object('all_graduates', true), 'published');
  END IF;

  -- 5) published opportunity
  IF NOT EXISTS (SELECT 1 FROM public.graduate_opportunities WHERE title = 'مطور تطبيقات — TEST_ONLY_GA_E2E_01') THEN
    INSERT INTO public.graduate_opportunities (opportunity_type, title, description, audience_scope, state, published_at, closes_at, moderated_by)
    VALUES ('job', 'مطور تطبيقات — TEST_ONLY_GA_E2E_01', 'فرصة اختبارية معزولة لنظام شؤون الخريجين.',
            jsonb_build_object('department_ids', jsonb_build_array(v_dept::text)),
            'published', now(), now() + interval '30 days', v_manager_user);
  END IF;

  -- 6) specialist department scope
  IF NOT EXISTS (SELECT 1 FROM public.staff_profile_departments
                 WHERE staff_profile_id = v_specialist_profile AND department_id = v_dept) THEN
    INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
    VALUES (v_specialist_profile, v_dept);
  END IF;

  RAISE NOTICE 'GA_FIXTURES_READY record=% survey_version=%', v_record_id, v_version_id;
END $$;