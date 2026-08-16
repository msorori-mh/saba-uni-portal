-- Minimal production-shaped harness for rehearsing the P1 migration drafts on PG17.
-- Only the objects the drafts touch are recreated, with production column shapes.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('harness.uid', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.has_any_role(p_user uuid, p_roles text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE TABLE IF NOT EXISTS public.departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name_ar text NOT NULL DEFAULT 'قسم');
CREATE TABLE IF NOT EXISTS public.programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid, name_ar text NOT NULL DEFAULT 'برنامج');
CREATE TABLE IF NOT EXISTS public.academic_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT '2026');
CREATE TABLE IF NOT EXISTS public.semesters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL DEFAULT 'الفصل الأول');
CREATE TABLE IF NOT EXISTS public.academic_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, level_number integer NOT NULL,
  status text NOT NULL DEFAULT 'active');

CREATE TABLE IF NOT EXISTS public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, academic_number text NOT NULL,
  full_name_ar text NOT NULL, department_id uuid, program_id uuid,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, full_name_ar text NOT NULL DEFAULT 'موظف');
CREATE TABLE IF NOT EXISTS public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, full_name_ar text NOT NULL DEFAULT 'عضو هيئة تدريس');

CREATE TABLE IF NOT EXISTS public.student_academic_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_profile_id uuid NOT NULL,
  academic_year_id uuid NOT NULL, semester_id uuid NOT NULL, level_id uuid NOT NULL,
  enrollment_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, name_ar text NOT NULL,
  credit_hours integer NOT NULL DEFAULT 3, department_id uuid, status text NOT NULL DEFAULT 'active');

CREATE TABLE IF NOT EXISTS public.study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL, name text NOT NULL DEFAULT 'خطة',
  version text NOT NULL DEFAULT '1', status text NOT NULL DEFAULT 'active', is_active boolean NOT NULL DEFAULT true);

CREATE TABLE IF NOT EXISTS public.study_plan_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), study_plan_id uuid NOT NULL, course_id uuid NOT NULL,
  level_id uuid NOT NULL, semester_code text NOT NULL DEFAULT 'S1', is_required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS public.course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL, academic_year_id uuid NOT NULL,
  semester_id uuid NOT NULL, program_id uuid NOT NULL, level_id uuid NOT NULL, status text NOT NULL DEFAULT 'active');

CREATE TABLE IF NOT EXISTS public.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_offering_id uuid NOT NULL,
  section_code text NOT NULL DEFAULT 'G1', faculty_profile_id uuid, status text NOT NULL DEFAULT 'active');

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_profile_id uuid NOT NULL,
  course_section_id uuid NOT NULL, enrollment_status text NOT NULL DEFAULT 'enrolled');

CREATE TABLE IF NOT EXISTS public.grade_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_section_id uuid NOT NULL, name text NOT NULL,
  max_score numeric NOT NULL, sort_order integer NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS public.student_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_enrollment_id uuid NOT NULL,
  grade_component_id uuid NOT NULL, score numeric NOT NULL, status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz);

CREATE TABLE IF NOT EXISTS public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_profile_id uuid NOT NULL,
  request_type text NOT NULL, title text NOT NULL DEFAULT 'طلب', status text NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.grade_appeal_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL,
  student_profile_id uuid NOT NULL, academic_year_id uuid NOT NULL, semester_id uuid NOT NULL,
  course_section_id uuid NOT NULL, student_enrollment_id uuid, current_grade_total numeric,
  current_grade_status text, reason text NOT NULL, notes text,
  approved_total_score numeric, grades_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name_ar text NOT NULL,
  category text, is_active boolean NOT NULL DEFAULT true, student_visible boolean NOT NULL DEFAULT false,
  request_audience text NOT NULL DEFAULT 'active_student');

CREATE TABLE IF NOT EXISTS public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name_ar text NOT NULL,
  is_active boolean NOT NULL DEFAULT true);

CREATE TABLE IF NOT EXISTS public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL, code text NOT NULL,
  name_ar text NOT NULL, is_managerial boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0, UNIQUE (unit_id, code));

CREATE TABLE IF NOT EXISTS public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid NOT NULL, role_id uuid,
  assignment_type text NOT NULL DEFAULT 'user', user_id uuid, staff_profile_id uuid,
  faculty_profile_id uuid, is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz, ends_at timestamptz);

CREATE TABLE IF NOT EXISTS public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type_id uuid NOT NULL, code text NOT NULL,
  name_ar text NOT NULL, version integer NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false, published_at timestamptz, change_note text);

CREATE TABLE IF NOT EXISTS public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid NOT NULL, step_key text NOT NULL,
  step_name_ar text NOT NULL, step_order integer NOT NULL, processing_unit_id uuid, processing_role_id uuid,
  assignment_strategy text NOT NULL DEFAULT 'role_pool', action_type text NOT NULL DEFAULT 'review',
  requires_payment boolean NOT NULL DEFAULT false, visible_to_student boolean NOT NULL DEFAULT true);

CREATE TABLE IF NOT EXISTS public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_request_id uuid NOT NULL, step_key text NOT NULL,
  step_name_ar text NOT NULL DEFAULT 'خطوة', step_order integer NOT NULL,
  processing_unit_id uuid, processing_role_id uuid, assigned_user_id uuid,
  status text NOT NULL DEFAULT 'pending', decision text, completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), table_name text, record_id uuid, action text,
  user_id uuid, new_values jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- Production reference rows the seeds depend on.
INSERT INTO public.request_processing_units (code, name_ar) VALUES
  ('student_affairs','شؤون الطلاب'), ('finance','الإيرادات والمالية'),
  ('registrar','المسجل العام'), ('archive','الأرشيف'),
  ('department','الأقسام العلمية'), ('dean','عمادة الكلية')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.request_processing_roles (unit_id, code, name_ar)
SELECT u.id, v.role_code, v.name_ar
FROM (VALUES
  ('student_affairs','student_affairs_specialist','أخصائي شؤون طلاب'),
  ('student_affairs','student_affairs_manager','مدير شؤون الطلاب'),
  ('finance','revenue_finance_officer','موظف الإيرادات'),
  ('registrar','registrar_general','المسجل العام'),
  ('archive','archive_officer','موظف الأرشيف'),
  ('department','department_head','رئيس القسم'),
  ('dean','dean','العميد')
) AS v(unit_code, role_code, name_ar)
JOIN public.request_processing_units u ON u.code = v.unit_code
ON CONFLICT (unit_id, code) DO NOTHING;

-- NOTE: request_types intentionally starts EMPTY, mirroring production, which
-- carries no 'grade_appeal' row. P1-03 must create every type it seeds.

