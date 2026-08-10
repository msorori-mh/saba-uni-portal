-- ============================================================================
-- D-02 chair sensor focused tests
-- ============================================================================

DO $tests$
DECLARE
  v_dept_cs uuid := '11111111-1111-4111-8111-111111111111'::uuid;
  v_dept_it uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8'::uuid;
  v_unit_dept uuid;
  v_role_head uuid;
  v_role_other uuid;
  v_fp_chair uuid := 'd08a8509-4c04-472e-885f-053a80be12ec'::uuid;
  v_fp_nonchair uuid := 'a0000000-0000-4000-8000-000000000001'::uuid;
  v_fp_chair2 uuid := 'b0000000-0000-4000-8000-000000000002'::uuid;
  v_count integer;
BEGIN
  -- --------------------------------------------------------------------------
  -- Setup
  -- --------------------------------------------------------------------------
  INSERT INTO public.departments (id, code) VALUES
    (v_dept_cs, 'CS'),
    (v_dept_it, 'IT');

  INSERT INTO public.request_processing_units (id, code) VALUES
    (gen_random_uuid(), 'student_affairs'),
    (gen_random_uuid(), 'department');

  -- Need deterministic unit id for department
  SELECT id INTO v_unit_dept FROM public.request_processing_units WHERE code = 'department';

  INSERT INTO public.request_processing_roles (id, unit_id, code) VALUES
    (gen_random_uuid(), v_unit_dept, 'department_head'),
    (gen_random_uuid(), v_unit_dept, 'department_secretary');

  SELECT id INTO v_role_head FROM public.request_processing_roles WHERE unit_id = v_unit_dept AND code = 'department_head';
  SELECT id INTO v_role_other FROM public.request_processing_roles WHERE unit_id = v_unit_dept AND code = 'department_secretary';

  INSERT INTO public.faculty_profiles (id, user_id, employee_number, department_id, status) VALUES
    (v_fp_chair, gen_random_uuid(), 'F2025006', v_dept_cs, 'active'),
    (v_fp_nonchair, gen_random_uuid(), 'F2025999', v_dept_cs, 'active'),
    (v_fp_chair2, gen_random_uuid(), 'F2025007', v_dept_it, 'active');

  -- --------------------------------------------------------------------------
  -- Test 1: non-chair active assignment must NOT inflate chair count
  -- --------------------------------------------------------------------------
  INSERT INTO public.request_processing_assignments
    (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active)
  VALUES
    (gen_random_uuid(), v_unit_dept, v_role_other, 'faculty_profile', v_fp_nonchair, v_dept_cs, true);

  SELECT count(a.id)
    INTO v_count
    FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id = a.role_id
    JOIN public.request_processing_units u ON u.id = a.unit_id
   WHERE a.department_id = v_dept_cs
     AND a.is_active
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now())
     AND a.assignment_type = 'faculty_profile'
     AND u.code = 'department'
     AND r.code = 'department_head';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'D02_FALSE_POSITIVE_NONCHAIR_INFLATED: expected 0, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: D02_NONCHAIR_ASSIGNMENT_NOT_COUNTED';

  DELETE FROM public.request_processing_assignments;

  -- --------------------------------------------------------------------------
  -- Test 2: chair active assignment must be counted
  -- --------------------------------------------------------------------------
  INSERT INTO public.request_processing_assignments
    (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active)
  VALUES
    (gen_random_uuid(), v_unit_dept, v_role_head, 'faculty_profile', v_fp_chair, v_dept_cs, true);

  SELECT count(a.id)
    INTO v_count
    FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id = a.role_id
    JOIN public.request_processing_units u ON u.id = a.unit_id
   WHERE a.department_id = v_dept_cs
     AND a.is_active
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now())
     AND a.assignment_type = 'faculty_profile'
     AND u.code = 'department'
     AND r.code = 'department_head';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D02_CHAIR_NOT_COUNTED: expected 1, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: D02_CHAIR_ASSIGNMENT_COUNTED';

  DELETE FROM public.request_processing_assignments;

  -- --------------------------------------------------------------------------
  -- Test 3: duplicate active chairs must be detected
  -- --------------------------------------------------------------------------
  INSERT INTO public.request_processing_assignments
    (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active)
  VALUES
    (gen_random_uuid(), v_unit_dept, v_role_head, 'faculty_profile', v_fp_chair, v_dept_cs, true),
    (gen_random_uuid(), v_unit_dept, v_role_head, 'faculty_profile', v_fp_chair, v_dept_cs, true);

  SELECT count(a.id)
    INTO v_count
    FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id = a.role_id
    JOIN public.request_processing_units u ON u.id = a.unit_id
   WHERE a.department_id = v_dept_cs
     AND a.is_active
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now())
     AND a.assignment_type = 'faculty_profile'
     AND u.code = 'department'
     AND r.code = 'department_head';

  IF v_count <= 1 THEN
    RAISE EXCEPTION 'D02_DUPLICATE_NOT_DETECTED: expected >1, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: D02_DUPLICATE_ACTIVE_CHAIR_DETECTED';

  DELETE FROM public.request_processing_assignments;

  -- --------------------------------------------------------------------------
  -- Test 4: missing chair must be detected
  -- --------------------------------------------------------------------------
  SELECT count(a.id)
    INTO v_count
    FROM public.request_processing_assignments a
    JOIN public.request_processing_roles r ON r.id = a.role_id
    JOIN public.request_processing_units u ON u.id = a.unit_id
   WHERE a.department_id = v_dept_it
     AND a.is_active
     AND (a.starts_at IS NULL OR a.starts_at <= now())
     AND (a.ends_at IS NULL OR a.ends_at > now())
     AND a.assignment_type = 'faculty_profile'
     AND u.code = 'department'
     AND r.code = 'department_head';

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'D02_MISSING_NOT_DETECTED: expected 0, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: D02_MISSING_CHAIR_DETECTED';

  -- --------------------------------------------------------------------------
  -- Test 5: legacy broken pattern would have counted non-chair (regression guard)
  -- --------------------------------------------------------------------------
  INSERT INTO public.request_processing_assignments
    (id, unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active)
  VALUES
    (gen_random_uuid(), v_unit_dept, v_role_other, 'faculty_profile', v_fp_nonchair, v_dept_cs, true);

  -- Legacy pattern: LEFT JOIN roles with ilike '%chair%' then count(a.id).
  -- Because the count is on a.id (not r.id), any active non-chair assignment
  -- is incorrectly counted as a chair. This is the exact false-positive.
  SELECT count(a.id)
    INTO v_count
    FROM public.departments d
    LEFT JOIN public.request_processing_assignments a ON a.department_id = d.id AND a.is_active = true
    LEFT JOIN public.request_processing_roles r ON r.id = a.role_id AND r.code ILIKE '%chair%'
   WHERE d.id = v_dept_cs;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D02_LEGACY_PATTERN_UNEXPECTED: expected false-positive 1, got %', v_count;
  END IF;
  RAISE NOTICE 'PASS: D02_LEGACY_ILIKE_CHAIR_PATTERN_FALSE_POSITIVE_DOCUMENTED';

  RAISE NOTICE 'ALL D02 CHAIR SENSOR TESTS PASSED';
END
$tests$;
