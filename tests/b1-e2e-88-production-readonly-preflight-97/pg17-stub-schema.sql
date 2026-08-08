-- Disposable pre-Migration-88 stub schema for Package 97 PG17 full preflight.
-- LOCAL ONLY. Not applied to production.
\set ON_ERROR_STOP on

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS supabase_functions;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS pgmq;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  inserted_at timestamptz DEFAULT now()
);
INSERT INTO supabase_migrations.schema_migrations(version)
VALUES ('20260731203030')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text
);

CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY,
  name_ar text
);

CREATE TABLE IF NOT EXISTS public.request_processing_units (
  id uuid PRIMARY KEY,
  code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.request_processing_roles (
  id uuid PRIMARY KEY,
  unit_id uuid REFERENCES public.request_processing_units(id),
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text,
  employee_number text,
  full_name_ar text,
  full_name_en text,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  faculty_id uuid,
  employee_number text,
  department_id uuid REFERENCES public.departments(id),
  full_name_ar text,
  full_name_en text,
  status text DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text NOT NULL DEFAULT 'active',
  academic_number text,
  email text,
  full_name_ar text,
  full_name_en text,
  department_id uuid REFERENCES public.departments(id)
);

CREATE TABLE IF NOT EXISTS public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date
);

CREATE TABLE IF NOT EXISTS public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  role_id uuid NOT NULL REFERENCES public.request_processing_roles(id),
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid REFERENCES public.staff_profiles(id),
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id),
  position_assignment_id uuid REFERENCES public.position_assignments(id),
  department_id uuid REFERENCES public.departments(id),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text,
  is_active boolean NOT NULL DEFAULT true,
  student_visible boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid REFERENCES public.request_types(id),
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  step_order integer NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  action_type text
);

CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text,
  student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid REFERENCES public.request_type_workflows(id),
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_key text NOT NULL,
  step_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id),
  current_department_id uuid REFERENCES public.departments(id),
  requested_department_id uuid REFERENCES public.departments(id)
);

CREATE TABLE IF NOT EXISTS public.official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text,
  status text
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL
);

-- Four replaced-function stubs (pre-Migration-88 bodies; no b1_e2e_88 markers).
CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text, p_title text, p_form_data jsonb DEFAULT '{}'::jsonb, p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN gen_random_uuid();
END;
$$;

CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid, p_side text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT false;
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT false;
$$;

GRANT EXECUTE ON FUNCTION public.create_student_request(text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid, text) TO authenticated;
