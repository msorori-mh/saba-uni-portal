-- B1 academic-effects disposable schema (LOCAL PG17 ONLY).
\set ON_ERROR_STOP on
SET check_function_bodies = off;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS b1_fx;
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('b1_fx.uid', true), '')::uuid
$$;

CREATE TABLE b1_fx.allowed_actor (
  step_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  PRIMARY KEY (step_id, user_id, action)
);

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM b1_fx.allowed_actor a
    WHERE a.step_id = p_step_id
      AND a.user_id = auth.uid()
      AND a.action = p_action
  );
$$;

CREATE TABLE public.departments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name_ar text);
CREATE TABLE public.programs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid REFERENCES public.departments(id), name_ar text);
CREATE TABLE public.academic_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.semesters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), academic_year_id uuid REFERENCES public.academic_years(id));
CREATE TABLE public.levels (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.course_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  department_id uuid REFERENCES public.departments(id),
  program_id uuid REFERENCES public.programs(id),
  status text DEFAULT 'active',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  status text NOT NULL,
  request_number text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  status text DEFAULT 'draft',
  is_active boolean DEFAULT false
);

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  action_type text,
  step_order integer DEFAULT 1
);

CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid,
  from_step_id uuid,
  to_step_id uuid,
  action_result text
);

CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid REFERENCES public.student_requests(id),
  workflow_id uuid,
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  decision text,
  comment text,
  processing_unit_id uuid,
  processing_role_id uuid,
  completed_by uuid,
  completed_at timestamptz,
  entered_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.student_request_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid,
  workflow_step_runtime_id uuid,
  event_type text,
  actor_user_id uuid,
  actor_unit_id uuid,
  actor_role_id uuid,
  message_ar text,
  payload jsonb,
  visible_to_student boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.enrollment_suspension_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.student_requests(id),
  requested_from_academic_year_id uuid,
  requested_from_semester_id uuid,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.absence_excuse_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.student_requests(id),
  course_section_id uuid,
  absence_date date,
  reason_type text,
  record_applied_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.student_requests(id),
  requested_department_id uuid,
  requested_program_id uuid,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.extra_chance_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.student_requests(id),
  academic_year_id uuid,
  semester_id uuid,
  chance_type text,
  reason text,
  chance_applied_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.file_withdrawal_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid UNIQUE REFERENCES public.student_requests(id),
  library_cleared_at timestamptz,
  labs_cleared_at timestamptz,
  activities_cleared_at timestamptz,
  finance_cleared_at timestamptz,
  records_transferred_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.student_academic_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  academic_year_id uuid,
  semester_id uuid,
  level_id uuid,
  enrollment_status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  course_section_id uuid,
  enrollment_status text
);

CREATE TABLE public.student_excused_absences (
  student_profile_id uuid,
  course_section_id uuid,
  absence_date date,
  reason_type text,
  absence_excuse_request_id uuid,
  PRIMARY KEY (student_profile_id, course_section_id, absence_date)
);

CREATE TABLE public.student_extra_chances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  request_id uuid,
  academic_year_id uuid,
  semester_id uuid,
  chance_type text,
  reason text,
  approved_by uuid,
  approved_at timestamptz,
  UNIQUE (student_profile_id, academic_year_id, semester_id, chance_type)
);

-- Protected regression probe surface (must remain untouched by effects).
CREATE TABLE public.enrollment_certificate_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE,
  student_visible boolean DEFAULT false
);

CREATE TABLE b1_fx.results (
  case_id text PRIMARY KEY,
  class text NOT NULL,
  ok boolean NOT NULL,
  detail text
);

CREATE OR REPLACE FUNCTION b1_fx.note(p_case text, p_class text, p_ok boolean, p_detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO b1_fx.results(case_id, class, ok, detail)
  VALUES (p_case, p_class, p_ok, COALESCE(p_detail,''))
  ON CONFLICT (case_id) DO UPDATE SET ok=EXCLUDED.ok, detail=EXCLUDED.detail, class=EXCLUDED.class;
END $$;

CREATE OR REPLACE FUNCTION b1_fx.set_uid(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('b1_fx.uid', COALESCE(p_uid::text, ''), true)
$$;

CREATE OR REPLACE FUNCTION b1_fx.snapshot_effect(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object(
    'suspension_marker', (SELECT effect_applied_at FROM public.enrollment_suspension_details WHERE request_id=p_request_id),
    'absence_marker', (SELECT record_applied_at FROM public.absence_excuse_details WHERE request_id=p_request_id),
    'transfer_marker', (SELECT effect_applied_at FROM public.transfer_request_details WHERE request_id=p_request_id),
    'chance_marker', (SELECT chance_applied_at FROM public.extra_chance_details WHERE request_id=p_request_id),
    'withdrawal_marker', (SELECT effect_applied_at FROM public.file_withdrawal_details WHERE request_id=p_request_id),
    'academic_status', (SELECT jsonb_agg(jsonb_build_object('id',id,'status',enrollment_status,'ay',academic_year_id,'sem',semester_id) ORDER BY id)
                        FROM public.student_academic_status),
    'excused_count', (SELECT count(*) FROM public.student_excused_absences),
    'chance_count', (SELECT count(*) FROM public.student_extra_chances),
    'profile', (SELECT jsonb_build_object('department_id',department_id,'program_id',program_id) FROM public.student_profiles LIMIT 1),
    'ec_grants', (SELECT count(*) FROM public.enrollment_certificate_grants),
    'student_visible_true', (SELECT count(*) FROM public.request_types WHERE student_visible IS TRUE)
  )
$$;
