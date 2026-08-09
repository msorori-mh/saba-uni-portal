-- ============================================================================
-- PORTAL-B1-PR310 Definitive Operator Architecture — LONGRUN-14
-- Canonical fixture: production B1 service request sentinel replicas
--
-- The MATRIX negative cases reference five production request numbers that do
-- not exist in Fixture-13. This file inserts them as read-only TEST_ONLY
-- sentinel rows so every negative case has a real runtime step to target.
--
-- These sentinel requests are NEVER mutated by the 267 cases. They are
-- protected by the same RLS policies as ordinary requests and are only
-- inspectable through the narrow observer allowlist.
-- ============================================================================
\set ON_ERROR_STOP on

-- The runtime mutation boundary guard requires an explicit fixture-init flag.
-- This is a provisioning session; the flag is session-local and never affects
-- the RPC harness, which must set its own boundary flags.
SELECT set_config('b1.atomic_init', '1', false);

-- ---------------------------------------------------------------------------
-- Required actor identities that are referenced by the negative matrix but
-- have no other fixture presence.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('3a279561-f8e6-41d9-b8ca-ce60682c9eab', 'test-owner-sentinel@usr.edu.ye'),
  ('b522b4c7-86f8-475c-a8f3-5790d7a22bf1', 'test-unassigned-admin-sentinel@usr.edu.ye'),
  ('323c4f8e-c248-42ac-82ed-92528a11ee55', 'test-unassigned-system-admin-sentinel@usr.edu.ye')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.student_profiles (
  id, user_id, academic_number, full_name_ar, full_name_en,
  department_id, program_id, status
) VALUES
  ('3a279561-f8e6-41d9-b8ca-ce60682c9eab', '3a279561-f8e6-41d9-b8ca-ce60682c9eab',
   'TEST_ONLY_SENTINEL_OWNER', 'طالب تجريبي مرسل', 'Test Sentinel Owner',
   'ce485c67-5f7c-498d-b120-4b1130a86ae8', '97638001-87cd-4df0-abe9-63c829504072', 'active')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sentinel request definitions. Each entry produces one student_requests row
-- and its full workflow step set from the canonical request_type_workflow.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_profile_id uuid := '3a279561-f8e6-41d9-b8ca-ce60682c9eab';
  v_specialist_staff uuid := 'c8a94548-4782-4252-86f9-23559d3b95be';
  v_workflow_id uuid;
  v_request_id uuid;
  v_step record;
  v_step_count int;

  -- Order matches MATRIX positive_cases production partition.
  v_requests constant jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000001',
      'request_number', 'SR-20260727-42393846',
      'request_type', 'file_withdrawal',
      'title', 'سحب الملف - نموذج إنتاجي تجريبي'
    ),
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000002',
      'request_number', 'SR-20260727-50BEDCE2',
      'request_type', 'enrollment_suspension',
      'title', 'وقف القيد - نموذج إنتاجي تجريبي'
    ),
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000003',
      'request_number', 'SR-20260727-3C550070',
      'request_type', 'final_chance',
      'title', 'منح فرصة - نموذج إنتاجي تجريبي'
    ),
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000004',
      'request_number', 'SR-20260727-88D885F0',
      'request_type', 'department_transfer',
      'title', 'التحويل بين الأقسام - نموذج إنتاجي تجريبي'
    ),
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000005',
      'request_number', 'SR-20260727-695EC35B',
      'request_type', 'excused_absence',
      'title', 'الغياب بعذر - نموذج إنتاجي تجريبي'
    )
  );

  -- Pinned runtime step ids from MATRIX.json positive_cases.
  v_step_ids jsonb := jsonb_build_object(
    'SR-20260727-42393846', jsonb_build_array(
      '38fffaa0-6240-4d67-a47a-6cf1f450a46c',
      '1830c0f2-3503-4cf8-af49-246623b2be33',
      'c00ce6ba-9c3f-440d-9664-f18341bc52e5',
      '884ec9d9-4b55-49af-bc12-478b53ae5e2a',
      '80f23452-2505-4a0d-9a0c-53469645ed4d',
      '0111b914-4783-4418-b6ac-587cab06fed1',
      '39daa476-4014-4403-a925-41da710180ee'
    ),
    'SR-20260727-50BEDCE2', jsonb_build_array(
      '6e7855cb-ed60-4c24-8f82-7fe9c69b4216',
      '70614d9a-d916-4b33-a7e0-b3ceae082705',
      '53f1aeb6-0475-4753-8c44-3495962cbe3a'
    ),
    'SR-20260727-3C550070', jsonb_build_array(
      '39931cd9-c0ca-4a0c-bdba-16dde7ae1145',
      '12d31b1b-c84a-47ac-ac0b-ce4027d4fa4e',
      '4a9bfb3f-18f2-4cf8-bcf1-7051420c8dcc',
      '55c927de-6b10-4e48-ad56-df3b406a10dd',
      '6761a1c5-eb21-4e7a-9cc0-a9c1e011d5b4'
    ),
    'SR-20260727-88D885F0', jsonb_build_array(
      '6ae588d1-b8e4-4686-b4a4-78857ce04e22',
      '6b224eb7-7720-42e4-bb08-ad3c2bd1c0f3',
      'dd1360de-d3a1-49e8-9a67-876506b27150',
      'b75dff6d-f8ba-4654-b4ce-f8986d90dbcc',
      '4b55d00e-1827-4347-8a61-ed4658f63fa5',
      'ab2ee336-a6c0-4c86-a9b1-a8a31aa476c4'
    ),
    'SR-20260727-695EC35B', jsonb_build_array(
      '44b1d694-2015-412e-86e3-235116a710b2',
      '7db4eacc-d542-459b-a066-46a54c2e325b',
      'b7c0f4d2-1565-4af7-9196-45bf87a1baed'
    )
  );
BEGIN
  FOR i IN 0 .. jsonb_array_length(v_requests) - 1 LOOP
    DECLARE
      v_req jsonb := v_requests->i;
      v_req_type text := v_req->>'request_type';
      v_req_num text := v_req->>'request_number';
      v_req_title text := v_req->>'title';
    BEGIN
      SELECT w.id INTO v_workflow_id
        FROM public.request_type_workflows w
        JOIN public.request_types rt ON rt.id = w.request_type_id
       WHERE rt.code = v_req_type
         AND w.status = 'active'
         AND w.is_active = true
       ORDER BY w.version DESC
       LIMIT 1;

      IF v_workflow_id IS NULL THEN
        RAISE EXCEPTION 'SENTINEL_FIXTURE_FAIL: no active workflow for %', v_req_type;
      END IF;

      INSERT INTO public.student_requests (
        id, request_number, request_type, title, status, student_profile_id,
        current_step_index, current_role_key, current_assignee_id,
        form_data, created_at, updated_at
      ) VALUES (
        (v_req->>'id')::uuid, v_req_num, v_req_type, v_req_title, 'in_review',
        v_profile_id, 1, NULL, NULL, '{}'::jsonb, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        request_number = EXCLUDED.request_number,
        request_type = EXCLUDED.request_type,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        student_profile_id = EXCLUDED.student_profile_id,
        current_step_index = EXCLUDED.current_step_index,
        form_data = EXCLUDED.form_data,
        updated_at = now();

      v_request_id := (v_req->>'id')::uuid;
      v_step_count := 0;

      FOR v_step IN
        SELECT s.id AS workflow_step_id, s.step_key, s.step_order,
               s.step_name_ar, s.processing_unit_id, s.processing_role_id,
               u.code AS unit_code, r.code AS role_code
          FROM public.request_type_workflow_steps s
          LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
          LEFT JOIN public.request_processing_roles r ON r.id = s.processing_role_id
         WHERE s.workflow_id = v_workflow_id
         ORDER BY s.step_order
      LOOP
        v_step_count := v_step_count + 1;
        INSERT INTO public.student_request_workflow_steps (
          id, student_request_id, workflow_id, workflow_step_id,
          step_key, step_name_ar, step_order,
          processing_unit_id, processing_role_id,
          assigned_user_id, assigned_staff_profile_id,
          assigned_faculty_profile_id, assigned_position_assignment_id,
          status, created_at, updated_at
        ) VALUES (
          (v_step_ids->v_req_num->>(v_step_count - 1))::uuid,
          v_request_id,
          v_workflow_id,
          v_step.workflow_step_id,
          v_step.step_key,
          v_step.step_name_ar,
          v_step.step_order,
          v_step.processing_unit_id,
          v_step.processing_role_id,
          NULL,
          CASE WHEN v_step.step_order = 1 AND v_step.unit_code = 'student_affairs'
                    AND v_step.role_code = 'student_affairs_specialist'
               THEN v_specialist_staff ELSE NULL END,
          NULL,
          NULL,
          CASE WHEN v_step.step_order = 1 THEN 'active' ELSE 'pending' END,
          now(), now()
        )
        ON CONFLICT (id) DO UPDATE SET
          student_request_id = EXCLUDED.student_request_id,
          workflow_id = EXCLUDED.workflow_id,
          workflow_step_id = EXCLUDED.workflow_step_id,
          step_key = EXCLUDED.step_key,
          step_name_ar = EXCLUDED.step_name_ar,
          step_order = EXCLUDED.step_order,
          processing_unit_id = EXCLUDED.processing_unit_id,
          processing_role_id = EXCLUDED.processing_role_id,
          assigned_staff_profile_id = EXCLUDED.assigned_staff_profile_id,
          status = EXCLUDED.status,
          updated_at = now();

      END LOOP;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Service-specific sentinel detail rows required for state pins and scope
-- checks. No PII; only marker data.
-- ---------------------------------------------------------------------------
INSERT INTO public.transfer_request_details (
  request_id, current_program_id, requested_program_id,
  current_department_id, requested_department_id, transfer_reason, notes
) VALUES (
  'a0000000-0000-4000-8000-000000000004'::uuid,
  '97638001-87cd-4df0-abe9-63c829504072'::uuid,
  '8df96335-4197-4e33-85ca-a970608f6a63'::uuid,
  'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'TEST_ONLY sentinel transfer scope',
  'TEST_ONLY'
)
ON CONFLICT (request_id) DO UPDATE SET
  current_program_id = EXCLUDED.current_program_id,
  requested_program_id = EXCLUDED.requested_program_id,
  current_department_id = EXCLUDED.current_department_id,
  requested_department_id = EXCLUDED.requested_department_id;

INSERT INTO public.file_withdrawal_details (
  request_id, withdrawal_reason, impact_ack, notes
) VALUES (
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'TEST_ONLY sentinel file withdrawal',
  true,
  'TEST_ONLY'
)
ON CONFLICT (request_id) DO UPDATE SET
  withdrawal_reason = EXCLUDED.withdrawal_reason,
  impact_ack = EXCLUDED.impact_ack;

DO $$
BEGIN
  RAISE NOTICE 'SENTINEL_REQUESTS_PROVISION_PASS: 5 production sentinel requests inserted';
END $$;
