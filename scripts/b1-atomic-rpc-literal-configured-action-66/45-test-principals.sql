-- PORTAL-B1-PACKAGE66-POST-APPLY-ISOLATED-AUTH-MATRIX-73
-- 45 — Principal registry consumed by 50-literal-action-rpc-matrix.sql.
-- ISOLATED `isodb` ONLY. Never run against production.
--
-- Adds one dedicated TEST_ONLY "wrong_assignee" identity that holds NO
-- request_processing_assignment at all, so it can never coincide with the
-- exact direct assignee of any fixture step, and pins the label -> user_id
-- mapping used by the matrix.

DO $guard$
BEGIN
  IF current_database() <> 'isodb' THEN
    RAISE EXCEPTION 'ISO_ENV_GUARD: refusing to run against database %', current_database();
  END IF;
END $guard$;

INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
SELECT 'e5520000-0000-4000-8000-000000000014'::uuid,
       'wrong.assignee@test-only.invalid', now(), jsonb_build_object('test_only',true)
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users u WHERE u.id='e5520000-0000-4000-8000-000000000014'::uuid);

INSERT INTO public.staff_profiles(id,user_id,employee_number,full_name_ar,job_title,role_type,status,must_change_password,email)
SELECT 'e5530000-0000-4000-8000-000000000014'::uuid,'e5520000-0000-4000-8000-000000000014'::uuid,
       'TO-STF-0014','موظف اختباري بلا تعيين TEST_ONLY','موظف','general','active',false,
       'wrong.assignee@test-only.invalid'
WHERE NOT EXISTS (
  SELECT 1 FROM public.staff_profiles p WHERE p.id='e5530000-0000-4000-8000-000000000014'::uuid);

CREATE TABLE IF NOT EXISTS public.iso_test_principals(
  label   text PRIMARY KEY,
  user_id uuid NOT NULL
);

INSERT INTO public.iso_test_principals(label,user_id) VALUES
  ('wrong_assignee',  'e5520000-0000-4000-8000-000000000014'),
  ('admin',           'e5520000-0000-4000-8000-000000000012'),
  ('system_admin',    'e5520000-0000-4000-8000-000000000013'),
  ('registrar',       'e5520000-0000-4000-8000-000000000006'),
  ('dean',            'e5520000-0000-4000-8000-000000000008'),
  ('department_head', 'e5520000-0000-4000-8000-000000000011'),
  ('student_owner',   'e5510000-0000-4000-8000-000000000001')
ON CONFLICT (label) DO UPDATE SET user_id = EXCLUDED.user_id;

DO $verify$
DECLARE v_bad int;
BEGIN
  IF (SELECT count(*) FROM public.iso_test_principals) <> 7 THEN
    RAISE EXCEPTION 'ISO_PRINCIPALS_INCOMPLETE';
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.iso_test_principals p
  JOIN public.student_request_workflow_steps s ON s.assigned_user_id = p.user_id
  JOIN public.student_requests r ON r.id = s.student_request_id
  WHERE p.label = 'wrong_assignee'
    AND r.request_number LIKE 'ISO-TESTONLY-%'
    AND s.status = 'active';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ISO_WRONG_ASSIGNEE_IS_ACTUAL_ASSIGNEE_ON_% _STEPS', v_bad;
  END IF;
END $verify$;
