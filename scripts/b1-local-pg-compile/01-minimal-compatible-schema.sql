-- Local PostgreSQL 17 compile harness only.  This is intentionally synthetic:
-- it contains no production connection string, data, or student-visible objects.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE ROLE service_role NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text NOT NULL,
  name text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name_ar text, is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), department_id uuid REFERENCES public.departments(id),
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active', department_id uuid REFERENCES public.departments(id),
  program_id uuid REFERENCES public.programs(id), full_name_ar text, academic_number text
);
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id), status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active', department_id uuid REFERENCES public.departments(id)
);
CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true, assigned_from date NOT NULL DEFAULT CURRENT_DATE, assigned_to date
);
CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name_ar text, name_en text,
  portal_scope text, is_academic_unit boolean NOT NULL DEFAULT false, is_active boolean NOT NULL DEFAULT true,
  sort_order integer
);
CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid REFERENCES public.request_processing_units(id),
  code text NOT NULL, name_ar text, is_managerial boolean NOT NULL DEFAULT false, sort_order integer,
  is_active boolean NOT NULL DEFAULT true, UNIQUE(unit_id, code)
);
CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unit_id uuid REFERENCES public.request_processing_units(id),
  role_id uuid REFERENCES public.request_processing_roles(id), assignment_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id), staff_profile_id uuid REFERENCES public.staff_profiles(id),
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id),
  position_assignment_id uuid REFERENCES public.position_assignments(id),
  department_id uuid REFERENCES public.departments(id), is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz, ends_at timestamptz
);
CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name_ar text,
  is_active boolean NOT NULL DEFAULT true, request_audience text
);
CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_type_id uuid REFERENCES public.request_types(id),
  code text NOT NULL, name_ar text, description_ar text, version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft', is_active boolean NOT NULL DEFAULT false
);
CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid REFERENCES public.request_type_workflows(id),
  step_key text, step_name_ar text, step_order integer, processing_unit_id uuid,
  processing_role_id uuid, assignment_strategy text, action_type text,
  status_on_enter text, status_on_complete text, is_required boolean, can_skip boolean,
  can_reject boolean DEFAULT true, can_return_to_student boolean DEFAULT true,
  requires_payment boolean, produces_document boolean, config jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT request_type_workflow_steps_action_type_chk CHECK (action_type IN (
    'review','approve','apply_decision','clear','archive','confirm_payment','sign','issue_document'
  ))
);
CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workflow_id uuid REFERENCES public.request_type_workflows(id),
  from_step_id uuid, to_step_id uuid, action_result text, is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_type_workflow_transitions_action_result_chk CHECK (action_result IN (
    'submit','reviewed','approved','applied','cleared','archived','payment_confirmed','signed','issued','reject','return'
  ))
);
CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL, status text NOT NULL DEFAULT 'draft', request_number text,
  submitted_at timestamptz, completed_at timestamptz, rejection_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_request_id uuid REFERENCES public.student_requests(id),
  workflow_id uuid, workflow_step_id uuid, step_key text, step_name_ar text, step_order integer,
  processing_unit_id uuid, processing_role_id uuid, status text, decision text, comment text,
  updated_at timestamptz, completed_by uuid, completed_at timestamptz, entered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), assigned_user_id uuid,
  assigned_staff_profile_id uuid, assigned_faculty_profile_id uuid, assigned_position_assignment_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT student_request_workflow_steps_decision_chk CHECK (decision IS NULL OR decision IN ('approved'))
);
CREATE TABLE public.student_request_workflow_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, student_request_id uuid,
  workflow_step_runtime_id uuid, event_type text, actor_user_id uuid, actor_unit_id uuid,
  actor_role_id uuid, message_ar text, payload jsonb, visible_to_student boolean,
  CONSTRAINT student_request_workflow_events_event_type_chk CHECK (event_type IN ('created'))
);

CREATE TABLE public.academic_years (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'active');
CREATE TABLE public.semesters (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), academic_year_id uuid REFERENCES public.academic_years(id), status text NOT NULL DEFAULT 'active');
CREATE TABLE public.course_offerings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'active');
CREATE TABLE public.course_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_offering_id uuid REFERENCES public.course_offerings(id), status text NOT NULL DEFAULT 'active');
CREATE TABLE public.student_enrollments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_profile_id uuid, course_section_id uuid, enrollment_status text);
CREATE TABLE public.absence_excuse_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id), course_section_id uuid,
  absence_date date, reason_type text, record_applied_at timestamptz, updated_at timestamptz,
  -- Exact historical catalog shape expected by REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.
  CONSTRAINT aed_reason_chk CHECK ((reason_type = ANY (ARRAY['medical'::text, 'family'::text, 'emergency'::text, 'other'::text])))
);
CREATE TABLE public.enrollment_suspension_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id), requested_from_academic_year_id uuid,
  requested_from_semester_id uuid, suspension_reason text, suspension_duration_type text,
  notes text, updated_at timestamptz
);
CREATE TABLE public.transfer_request_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id), current_program_id uuid,
  requested_program_id uuid, current_department_id uuid, requested_department_id uuid,
  transfer_reason text, updated_at timestamptz
);
CREATE TABLE public.extra_chance_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id), academic_year_id uuid,
  semester_id uuid, reason text, chance_type text, chance_applied_at timestamptz, updated_at timestamptz
);
CREATE TABLE public.student_extra_chances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), chance_type text);

CREATE OR REPLACE FUNCTION public.is_owner_of_request(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE(profile_id uuid, profile_status text) LANGUAGE sql STABLE AS $$ SELECT NULL::uuid,NULL::text $$;
CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(text,text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE OR REPLACE FUNCTION public.submit_student_request(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
-- Mirror production dual overloads so local compile can prove ambiguity and explicit 7-arg resolution.
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text, _entity_id uuid, _action_type text,
  _old jsonb DEFAULT NULL, _new jsonb DEFAULT NULL, _notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text, _entity_id uuid, _action_type text,
  _old jsonb DEFAULT NULL, _new jsonb DEFAULT NULL, _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;
CREATE TABLE IF NOT EXISTS public.official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text, status text NOT NULL DEFAULT 'issued', updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.has_any_role(uuid, text[]) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;

-- Order-1 tests the stamp itself, so its target caller must exist before draft 04.
CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])
RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;

INSERT INTO public.request_processing_units(code,name_ar,is_active) VALUES
  ('student_affairs','',true),('registrar','',true),('finance','',true),('archive','',true),('dean','',true),
  ('library','',true),('labs','',true)
ON CONFLICT (code) DO NOTHING;
INSERT INTO public.request_processing_roles(unit_id,code,name_ar,is_active)
SELECT u.id, x.code, '', true FROM public.request_processing_units u
JOIN (VALUES ('student_affairs','student_affairs_specialist'),('student_affairs','student_affairs_manager'),
  ('registrar','registrar_general'),('finance','revenue_finance_officer'),('archive','archive_officer'),
  ('dean','dean'),('library','library_officer'),('labs','labs_manager')) AS x(unit_code,code) ON x.unit_code=u.code
ON CONFLICT (unit_id,code) DO NOTHING;
INSERT INTO public.request_types(code,name_ar,is_active) VALUES
 ('enrollment_suspension','',true),('excused_absence','',true),('file_withdrawal','',true),
 ('transfer','',true),('extra_chance','',true)
ON CONFLICT (code) DO NOTHING;
-- These are deliberately local fixture identities matching the hard-coded draft IDs.
INSERT INTO auth.users(id) VALUES
 ('4a838311-0ab7-4033-8e0c-69327d522bc7'),('b59e6e45-260d-4af6-b312-85381d354104'),
 ('f463a79b-65be-4a94-8003-1c9a2727b88f'),('aa4f5c16-c993-4af6-a6d4-59d9542c1a7f'),
 ('d08a8509-4c04-472e-885f-053a80be12ec'),('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'),
 ('c1fe6084-e594-482e-a178-ac8eaffed376')
ON CONFLICT DO NOTHING;
INSERT INTO public.staff_profiles(id,user_id,status) SELECT id,id,'active' FROM auth.users
WHERE id IN ('4a838311-0ab7-4033-8e0c-69327d522bc7','b59e6e45-260d-4af6-b312-85381d354104',
 'f463a79b-65be-4a94-8003-1c9a2727b88f','aa4f5c16-c993-4af6-a6d4-59d9542c1a7f') ON CONFLICT DO NOTHING;
INSERT INTO public.faculty_profiles(id,user_id,status) SELECT id,id,'active' FROM auth.users
WHERE id IN ('d08a8509-4c04-472e-885f-053a80be12ec','6f9f004d-c5f6-4dfe-b212-7f79ce8658e3',
 'c1fe6084-e594-482e-a178-ac8eaffed376') ON CONFLICT DO NOTHING;
