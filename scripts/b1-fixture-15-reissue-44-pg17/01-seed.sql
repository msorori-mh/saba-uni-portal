-- Seed 19 TEST_ONLY fixtures; Fixture 15 starts in documented CONSUMED state
-- with the exact authoritative seven-step file_withdrawal contract.
INSERT INTO public.request_types(code, name_ar, is_active, student_visible) VALUES
  ('enrollment_suspension','وقف قيد', true, false),
  ('excused_absence','غياب بعذر', true, false),
  ('department_transfer','تحويل', true, false),
  ('final_chance','فرصة أخيرة', true, false),
  ('file_withdrawal','سحب ملف', true, false),
  ('enrollment_certificate','إفادة قيد', true, true);

INSERT INTO public.request_processing_units(id, code, name_ar) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'student_affairs', 'شؤون الطلاب'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'registrar', 'التسجيل'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'finance', 'المالية'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'dean', 'العمادة'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'archive', 'الأرشيف'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'library', 'المكتبة'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'labs', 'المعامل');

INSERT INTO public.request_processing_roles(id, unit_id, code, name_ar) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'student_affairs_specialist', 'مختص'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'student_affairs_manager', 'مدير'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 'registrar_general', 'مسجل'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000003', 'revenue_finance_officer', 'مالية'),
  ('bbbbbbbb-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000005', 'archive_officer', 'أرشيف'),
  ('bbbbbbbb-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000006', 'library_officer', 'مكتبة'),
  ('bbbbbbbb-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000007', 'labs_manager', 'معامل');

-- Principal user_id == staff_profile.id (same pattern as Fixture-13 seed principals).
INSERT INTO public.staff_profiles(id, user_id, full_name_ar) VALUES
  ('c8a94548-4782-4252-86f9-23559d3b95bd', 'c8a94548-4782-4252-86f9-23559d3b95bd', 'SA Specialist'),
  ('aac0e62d-4e8b-4440-b649-caa388d34837', 'aac0e62d-4e8b-4440-b649-caa388d34837', 'SA Manager'),
  ('4c261c1c-97fb-42da-a544-e8a59853ebe3', '4c261c1c-97fb-42da-a544-e8a59853ebe3', 'Registrar'),
  ('79783c0f-8d95-4110-8239-0ac504d63a24', '79783c0f-8d95-4110-8239-0ac504d63a24', 'Finance'),
  ('e7a93314-bb06-4525-b412-5315198c668a', 'e7a93314-bb06-4525-b412-5315198c668a', 'Library'),
  ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', 'Labs'),
  ('aec1303e-de6a-4580-94cf-7205c17b5535', 'aec1303e-de6a-4580-94cf-7205c17b5535', 'Archive');

INSERT INTO public.request_type_workflows(id, request_type_id, code, name_ar, is_active, status)
SELECT 'cccccccc-0000-4000-8000-0000000000aa'::uuid, id, 'file_withdrawal_free_workflow', 'سحب الملف', true, 'active'
  FROM public.request_types WHERE code = 'file_withdrawal';

INSERT INTO public.request_type_workflow_steps(
  id, workflow_id, step_key, step_name_ar, step_order,
  processing_unit_id, processing_role_id, action_type
) VALUES
  ('cccccccc-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-0000000000aa', 'student_affairs_intake', 'استلام', 1,
   'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'review'),
  ('cccccccc-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-0000000000aa', 'library_clearance', 'مكتبة', 2,
   'aaaaaaaa-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000006', 'clear'),
  ('cccccccc-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-0000000000aa', 'labs_clearance', 'معامل', 3,
   'aaaaaaaa-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000007', 'clear'),
  ('cccccccc-0000-4000-8000-000000000004', 'cccccccc-0000-4000-8000-0000000000aa', 'activities_clearance', 'أنشطة', 4,
   'aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'clear'),
  ('cccccccc-0000-4000-8000-000000000005', 'cccccccc-0000-4000-8000-0000000000aa', 'finance_clearance', 'مالية', 5,
   'aaaaaaaa-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000004', 'clear'),
  ('cccccccc-0000-4000-8000-000000000006', 'cccccccc-0000-4000-8000-0000000000aa', 'registrar_apply', 'تسجيل', 6,
   'aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000003', 'apply_decision'),
  ('cccccccc-0000-4000-8000-000000000007', 'cccccccc-0000-4000-8000-0000000000aa', 'archive', 'أرشفة', 7,
   'aaaaaaaa-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000005', 'archive');

INSERT INTO public.student_profiles(id, user_id, academic_number)
VALUES ('b1e20002-0000-4000-8000-000000000002', '57e805dc-f975-4834-b1cb-f99c09756980', 'TEST_ONLY_B1_0002');

INSERT INTO public.enrollment_certificate_document_details(id, marker, payload)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ec-protected', 'fingerprint-v1');
INSERT INTO public.official_documents(id, marker, payload)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'ec-doc', 'fingerprint-v1');

DO $seed$
DECLARE
  k_marker text := 'TEST_ONLY_B1_FIXTURE_13';
  k_profile uuid := 'b1e20002-0000-4000-8000-000000000002';
  k_archive uuid := 'aec1303e-de6a-4580-94cf-7205c17b5535';
  k_wf uuid := 'cccccccc-0000-4000-8000-0000000000aa';
  r record;
  v_req uuid;
  v_step uuid;
  v_ord int;
  v_active_order int;
  v_service text;
  v_steps int;
  v_cfg record;
  v_status text;
BEGIN
  PERFORM set_config('b1.atomic_init', '1', true);
  FOR r IN
    SELECT * FROM (VALUES
      (1,'department_transfer',2,6),
      (2,'department_transfer',3,6),
      (3,'department_transfer',4,6),
      (4,'department_transfer',5,6),
      (5,'department_transfer',6,6),
      (6,'enrollment_suspension',2,3),
      (7,'enrollment_suspension',3,3),
      (8,'excused_absence',2,3),
      (9,'excused_absence',3,3),
      (10,'file_withdrawal',2,7),
      (11,'file_withdrawal',3,7),
      (12,'file_withdrawal',4,7),
      (13,'file_withdrawal',5,7),
      (14,'file_withdrawal',6,7),
      (15,'file_withdrawal',7,7),
      (16,'final_chance',2,5),
      (17,'final_chance',3,5),
      (18,'final_chance',4,5),
      (19,'final_chance',5,5)
    ) AS x(ord, service, active_order, step_count)
  LOOP
    v_ord := r.ord; v_service := r.service; v_active_order := r.active_order; v_steps := r.step_count;
    v_req := ('f1300000-0000-4000-8000-' || lpad(v_ord::text, 12, '0'))::uuid;

    INSERT INTO public.student_requests(
      id, student_profile_id, request_type, title, description, status,
      submitted_at, request_number, current_step_index, form_data, internal_notes, completed_at
    ) VALUES (
      v_req, k_profile, v_service,
      k_marker || ' — ' || v_service || ' @ step ' || v_active_order,
      k_marker,
      CASE WHEN v_ord = 15 THEN 'completed' ELSE 'in_review' END,
      now(),
      'SR-20260801-13' || lpad(v_ord::text, 6, '0'),
      v_active_order,
      jsonb_build_object('test_only_marker', k_marker),
      k_marker,
      CASE WHEN v_ord = 15 THEN now() ELSE NULL END
    );

    IF v_service = 'file_withdrawal' THEN
      FOR v_cfg IN
        SELECT * FROM public.request_type_workflow_steps
         WHERE workflow_id = k_wf
         ORDER BY step_order
      LOOP
        v_step := ('f1300001-0000-4000-8000-'
                   || lpad(v_ord::text, 6, '0')
                   || lpad(v_cfg.step_order::text, 6, '0'))::uuid;
        IF v_ord = 15 THEN
          v_status := 'completed';
        ELSIF v_cfg.step_order < v_active_order THEN
          v_status := 'completed';
        ELSIF v_cfg.step_order = v_active_order THEN
          v_status := 'active';
        ELSE
          v_status := 'pending';
        END IF;

        INSERT INTO public.student_request_workflow_steps(
          id, student_request_id, workflow_id, workflow_step_id,
          step_key, step_name_ar, step_order,
          processing_unit_id, processing_role_id,
          assigned_staff_profile_id, assigned_user_id,
          assigned_faculty_profile_id, assigned_position_assignment_id,
          status, entered_at, completed_at, completed_by, decision, comment, metadata
        ) VALUES (
          v_step, v_req, k_wf, v_cfg.id,
          v_cfg.step_key, v_cfg.step_name_ar, v_cfg.step_order,
          v_cfg.processing_unit_id, v_cfg.processing_role_id,
          (SELECT sp.id FROM public.staff_profiles sp
            JOIN public.request_processing_roles rr ON rr.id = v_cfg.processing_role_id
            JOIN public.request_processing_units uu ON uu.id = rr.unit_id
           WHERE sp.user_id = CASE rr.code
             WHEN 'student_affairs_specialist' THEN 'c8a94548-4782-4252-86f9-23559d3b95bd'::uuid
             WHEN 'library_officer' THEN 'e7a93314-bb06-4525-b412-5315198c668a'::uuid
             WHEN 'labs_manager' THEN '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'::uuid
             WHEN 'student_affairs_manager' THEN 'aac0e62d-4e8b-4440-b649-caa388d34837'::uuid
             WHEN 'revenue_finance_officer' THEN '79783c0f-8d95-4110-8239-0ac504d63a24'::uuid
             WHEN 'registrar_general' THEN '4c261c1c-97fb-42da-a544-e8a59853ebe3'::uuid
             WHEN 'archive_officer' THEN k_archive
           END),
          NULL, NULL, NULL,
          v_status,
          now(),
          CASE WHEN v_status = 'completed' THEN now() ELSE NULL END,
          CASE
            WHEN v_ord = 15 AND v_cfg.step_order = 7 THEN k_archive
            WHEN v_status = 'completed' THEN k_archive
            ELSE NULL
          END,
          CASE WHEN v_ord = 15 AND v_cfg.step_order = 7 THEN 'archived' ELSE NULL END,
          CASE WHEN v_ord = 15 AND v_cfg.step_order = 7 THEN 'TEST_ONLY consumed archive' ELSE NULL END,
          jsonb_build_object(
            'test_only_marker', k_marker,
            'fixture_initialized', true,
            'action_type', v_cfg.action_type
          )
        );
      END LOOP;
    ELSE
      FOR i IN 1..v_steps LOOP
        v_step := ('f1300001-0000-4000-8000-'
                   || lpad(v_ord::text, 6, '0')
                   || lpad(i::text, 6, '0'))::uuid;
        INSERT INTO public.student_request_workflow_steps(
          id, student_request_id, step_key, step_name_ar, step_order,
          assigned_staff_profile_id, status, entered_at, completed_at, completed_by, metadata
        ) VALUES (
          v_step, v_req,
          CASE WHEN i = v_active_order THEN 'active_step' ELSE 'prior_step' END,
          'step', i,
          'c8a94548-4782-4252-86f9-23559d3b95bd',
          CASE
            WHEN i < v_active_order THEN 'completed'
            WHEN i = v_active_order THEN 'active'
            ELSE 'pending'
          END,
          now(),
          CASE WHEN i < v_active_order THEN now() ELSE NULL END,
          CASE WHEN i < v_active_order THEN k_archive ELSE NULL END,
          jsonb_build_object('test_only_marker', k_marker, 'fixture_initialized', true, 'action_type', 'review')
        );
      END LOOP;
    END IF;

    IF v_ord = 15 THEN
      INSERT INTO public.student_request_workflow_events(
        id, student_request_id, workflow_step_runtime_id, event_type,
        actor_user_id, message_ar, payload, created_at
      ) VALUES (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        v_req,
        'f1300001-0000-4000-8000-000015000007',
        'archived',
        k_archive,
        'TEST_ONLY archive event',
        jsonb_build_object('action','archive','action_result','archived'),
        now()
      );
    END IF;
  END LOOP;
END
$seed$;

DO $$
DECLARE v_active int; v_req_status text; v_events int;
BEGIN
  SELECT count(*) INTO v_active
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests r ON r.id = s.student_request_id
   WHERE r.internal_notes = 'TEST_ONLY_B1_FIXTURE_13' AND s.status = 'active';
  IF v_active IS DISTINCT FROM 18 THEN
    RAISE EXCEPTION 'SEED_ACTIVE_EXPECTED_18 got %', v_active;
  END IF;
  SELECT status INTO v_req_status FROM public.student_requests
   WHERE id = 'f1300000-0000-4000-8000-000000000015';
  IF v_req_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'SEED_FIXTURE15_NOT_CONSUMED';
  END IF;
  SELECT count(*) INTO v_events FROM public.student_request_workflow_events
   WHERE student_request_id = 'f1300000-0000-4000-8000-000000000015';
  IF v_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'SEED_EVENT_COUNT %', v_events;
  END IF;
END $$;
