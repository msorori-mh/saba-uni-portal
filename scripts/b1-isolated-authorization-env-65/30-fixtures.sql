-- PORTAL-B1-ISOLATED-NONPRODUCTION-AUTHORIZATION-ENVIRONMENT-65
-- 30 — TEST_ONLY runtime fixtures: one request per (service, step) so that every
-- one of the 24 B1 staff steps has an ACTIVE runtime step to test against.
-- Advancement uses the production RPC only (act_on_b1_student_request_step_atomic)
-- executed under the exact direct assignee identity.
-- ISOLATED CLUSTER ONLY.

DO $guard$
BEGIN
  IF current_database() <> 'isodb' THEN
    RAISE EXCEPTION 'ISO_ENV_GUARD: refusing to seed database %', current_database();
  END IF;
END $guard$;

DO $fixtures$
DECLARE
  v_service record;
  v_target integer;
  v_seq integer := 0;
  v_request_id uuid;
  v_request_number text;
  v_step record;
  v_actor uuid;
  v_action text;
  v_active_key text;
  v_student_user_id uuid;
  v_student_profile_id uuid;
BEGIN
  FOR v_service IN SELECT * FROM (VALUES
    ('excused_absence'::text, 3),
    ('enrollment_suspension'::text, 3),
    ('file_withdrawal'::text, 7),
    ('final_chance'::text, 5),
    ('department_transfer'::text, 6)
  ) AS s(canonical_code, step_count)
  LOOP
    FOR v_target IN 1..v_service.step_count LOOP
      v_seq := v_seq + 1;
      v_request_id := ('e5600000-0000-4000-8000-' || lpad(v_seq::text, 12, '0'))::uuid;
      v_request_number := 'ISO-TESTONLY-' || lpad(v_seq::text, 4, '0');

      CONTINUE WHEN EXISTS (SELECT 1 FROM public.student_requests r WHERE r.id = v_request_id);

      -- One isolated TEST_ONLY student per fixture: service validators forbid
      -- more than one open request of the same type per student.
      v_student_user_id := ('e5510000-0000-4000-8000-' || lpad(v_seq::text, 12, '0'))::uuid;
      v_student_profile_id := ('e5550000-0000-4000-8000-' || lpad(v_seq::text, 12, '0'))::uuid;

      INSERT INTO auth.users(id, email, email_confirmed_at, raw_user_meta_data)
      SELECT v_student_user_id,
             'student.fixture' || lpad(v_seq::text, 4, '0') || '@test-only.invalid',
             now(), jsonb_build_object('test_only', true)
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_student_user_id);

      INSERT INTO public.user_roles(user_id, role)
      SELECT v_student_user_id, 'student'::public.app_role
      WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r
                        WHERE r.user_id = v_student_user_id AND r.role='student'::public.app_role);

      INSERT INTO public.student_profiles(
        id,user_id,academic_number,full_name_ar,email,department_id,program_id,status,must_change_password)
      SELECT v_student_profile_id, v_student_user_id,
             'TO-STU-' || lpad(v_seq::text, 4, '0'),
             'طالب اختباري معزول TEST_ONLY ' || v_seq,
             'student.fixture' || lpad(v_seq::text, 4, '0') || '@test-only.invalid',
             'e5100000-0000-4000-8000-000000000001'::uuid,
             'e5110000-0000-4000-8000-000000000001'::uuid, 'active', false
      WHERE NOT EXISTS (SELECT 1 FROM public.student_profiles p WHERE p.id = v_student_profile_id);

      INSERT INTO public.student_academic_status(
        student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
      SELECT v_student_profile_id,
             (SELECT id FROM public.academic_years ORDER BY is_current DESC, start_date DESC LIMIT 1),
             (SELECT id FROM public.semesters ORDER BY is_current DESC, start_date DESC LIMIT 1),
             (SELECT id FROM public.academic_levels ORDER BY level_number LIMIT 1),
             'active'
      WHERE NOT EXISTS (SELECT 1 FROM public.student_academic_status s
                        WHERE s.student_profile_id = v_student_profile_id);

      PERFORM set_config('b1.atomic_init', '1', true);

      INSERT INTO public.student_requests(
        id, student_profile_id, request_type, title, status, submitted_at, request_number, form_data)
      VALUES (
        v_request_id, v_student_profile_id, v_service.canonical_code,
        'TEST_ONLY isolated authorization fixture', 'submitted', now(), v_request_number,
        jsonb_build_object('test_only', true, 'fixture_target_step_order', v_target));

      IF v_service.canonical_code = 'file_withdrawal' THEN
        INSERT INTO public.file_withdrawal_details(request_id, withdrawal_reason, impact_ack)
        VALUES (v_request_id, 'TEST_ONLY isolated authorization fixture', true);
      END IF;

      IF v_service.canonical_code = 'department_transfer' THEN
        INSERT INTO public.transfer_request_details(request_id, current_department_id, requested_department_id)
        VALUES (v_request_id,
          'e5100000-0000-4000-8000-000000000001'::uuid,
          'e5100000-0000-4000-8000-000000000002'::uuid);
      END IF;

      PERFORM public.initialize_b1_request_workflow_strict(v_request_id, v_service.canonical_code);
      PERFORM set_config('b1.atomic_init', '', true);

      -- Advance through predecessors as the exact direct assignee of each step.
      WHILE (SELECT s.step_order FROM public.student_request_workflow_steps s
             WHERE s.student_request_id = v_request_id AND s.status = 'active') < v_target
      LOOP
        SELECT s.* INTO v_step FROM public.student_request_workflow_steps s
        WHERE s.student_request_id = v_request_id AND s.status = 'active';

        SELECT COALESCE(
          v_step.assigned_user_id,
          (SELECT sp.user_id FROM public.staff_profiles sp WHERE sp.id = v_step.assigned_staff_profile_id),
          (SELECT fp.user_id FROM public.faculty_profiles fp WHERE fp.id = v_step.assigned_faculty_profile_id),
          (SELECT pa.user_id FROM public.position_assignments pa WHERE pa.id = v_step.assigned_position_assignment_id)
        ) INTO v_actor;

        v_action := v_step.metadata->>'action_type';

        PERFORM set_config('request.jwt.claims',
          json_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

        IF v_action = 'confirm_payment' THEN
          PERFORM public.record_external_university_payment_confirmation(
            v_step.id, 'ISO_TESTONLY_FIXTURE');
        ELSE
          PERFORM public.act_on_b1_student_request_step_atomic(
            v_step.id, v_action, 'ISO_TESTONLY_FIXTURE', '{}'::jsonb);
        END IF;

        PERFORM set_config('request.jwt.claims', '', true);
      END LOOP;

      SELECT s.step_key INTO v_active_key FROM public.student_request_workflow_steps s
      WHERE s.student_request_id = v_request_id AND s.status = 'active';

      RAISE NOTICE 'FIXTURE % % target_order=% active_step=%',
        v_request_number, v_service.canonical_code, v_target, COALESCE(v_active_key, '<none>');
    END LOOP;
  END LOOP;
END $fixtures$;
