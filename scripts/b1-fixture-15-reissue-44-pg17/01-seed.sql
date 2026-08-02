-- Seed 19 TEST_ONLY fixtures; Fixture 15 starts in documented CONSUMED state.
INSERT INTO public.request_types(code, name_ar, is_active, student_visible) VALUES
  ('enrollment_suspension','وقف قيد', true, false),
  ('excused_absence','غياب بعذر', true, false),
  ('department_transfer','تحويل', true, false),
  ('final_chance','فرصة أخيرة', true, false),
  ('file_withdrawal','سحب ملف', true, false),
  ('enrollment_certificate','إفادة قيد', true, true);

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
  r record;
  v_req uuid;
  v_step uuid;
  v_ord int;
  v_active_order int;
  v_service text;
  v_steps int;
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
      submitted_at, request_number, current_step_index, form_data, internal_notes
    ) VALUES (
      v_req, k_profile, v_service,
      k_marker || ' — ' || v_service || ' @ step ' || v_active_order,
      k_marker,
      CASE WHEN v_ord = 15 THEN 'completed' ELSE 'in_review' END,
      now(),
      'SR-20260801-13' || lpad(v_ord::text, 6, '0'),
      v_active_order,
      jsonb_build_object('test_only_marker', k_marker),
      k_marker
    );

    IF v_ord = 15 THEN
      UPDATE public.student_requests SET completed_at = now() WHERE id = v_req;
    END IF;

    FOR i IN 1..v_steps LOOP
      v_step := ('f1300001-0000-4000-8000-'
                 || lpad(v_ord::text, 6, '0')
                 || lpad(i::text, 6, '0'))::uuid;
      INSERT INTO public.student_request_workflow_steps(
        id, student_request_id, step_key, step_name_ar, step_order,
        assigned_staff_profile_id, status, entered_at, completed_at, completed_by,
        metadata
      ) VALUES (
        v_step, v_req,
        CASE WHEN v_service = 'file_withdrawal' AND i = 7 THEN 'archive'
             WHEN i = v_active_order THEN 'active_step'
             ELSE 'prior_step' END,
        'step', i,
        CASE WHEN v_service = 'file_withdrawal' AND i = 7 THEN 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid ELSE NULL END,
        CASE
          WHEN v_ord = 15 THEN 'completed'
          WHEN i < v_active_order THEN 'completed'
          WHEN i = v_active_order THEN 'active'
          ELSE 'pending'
        END,
        now(),
        CASE
          WHEN v_ord = 15 THEN now()
          WHEN i < v_active_order THEN now()
          ELSE NULL
        END,
        CASE
          WHEN v_ord = 15 AND i = 7 THEN k_archive
          WHEN i < v_active_order THEN k_archive
          ELSE NULL
        END,
        jsonb_build_object(
          'test_only_marker', k_marker,
          'fixture_initialized', true,
          'action_type', CASE WHEN v_service='file_withdrawal' AND i=7 THEN 'archive' ELSE 'review' END
        )
      );
    END LOOP;

    IF v_ord = 15 THEN
      -- Singular identity on archive step for activation stub realism.
      UPDATE public.student_request_workflow_steps
         SET assigned_staff_profile_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
             decision = 'archived',
             comment = 'TEST_ONLY consumed archive'
       WHERE id = 'f1300001-0000-4000-8000-000015000007';

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

-- Pre-repair invariants for the harness.
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
