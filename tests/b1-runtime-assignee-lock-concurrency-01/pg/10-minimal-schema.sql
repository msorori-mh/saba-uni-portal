-- Minimal local schema for the B1 runtime-assignee LOCK concurrency harness.
-- Local throwaway database only. Never run against production.

CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid,
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid,
  faculty_profile_id uuid,
  position_assignment_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL,
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'submitted'
);

CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  step_order int NOT NULL,
  step_key text NOT NULL,
  status text NOT NULL,
  processing_unit_id uuid,
  processing_role_id uuid,
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.transfer_request_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  current_department_id uuid,
  requested_department_id uuid
);

-- Stubs matching the production signatures used by the draft.
CREATE FUNCTION public.is_b1_stored_request_type(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_type IN ('enrollment_suspension','absence_excuse','transfer',
                    'extra_chance','file_withdrawal');
$$;

CREATE FUNCTION public.is_valid_b1_direct_assignment(
  p_assignment_id uuid, p_department_id uuid, p_allow_inactive boolean)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.request_processing_assignments a
    WHERE a.id = p_assignment_id
      AND (p_allow_inactive OR a.is_active)
      AND num_nonnulls(a.user_id, a.staff_profile_id, a.faculty_profile_id,
                       a.position_assignment_id) = 1
      AND (a.position_assignment_id IS NULL OR EXISTS (
        SELECT 1 FROM public.position_assignments pa
        WHERE pa.id = a.position_assignment_id AND pa.is_active))
  );
$$;

-- Roles referenced by REVOKE statements in the draft.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;
