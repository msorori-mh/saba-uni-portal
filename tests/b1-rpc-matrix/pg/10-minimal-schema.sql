-- =====================================================================
-- B1-RPC-AUTHORIZATION-MATRIX-01 - LOCAL PG17 HARNESS - 10-minimal-schema.sql
-- Track E / PORTAL-OVERNIGHT-AUTONOMOUS-SOURCE-ACCELERATION-01
--
-- Minimal-schema reproduction of the production B1 authorization substrate.
-- NEVER run against production. Local disposable cluster only.
--
-- Fidelity contract (evidence: recon EXTRACTION-NOTES.md + applied migrations
-- + the 19 B1 drafts fetched from main @ debf9d04):
--   * Table/column shapes: minimal superset of columns referenced by the 19
--     drafts (per recon section 5 table inventory).
--   * CHECK constraint names + PRE-SEQ-7 vocabularies: original names
--     (request_type_workflow_steps_action_type_chk,
--      request_type_workflow_transitions_action_result_chk,
--      student_request_workflow_steps_decision_chk,
--      student_request_workflow_events_event_type_chk) with the pre-widening
--      vocabularies documented in recon N2/N5. The exact pre-widening member
--      lists of action_result/decision/event_type are HARNESS ASSUMPTIONS
--      (recon confirms only the widened state); seq7 replaces them before any
--      B1 row is written, so risk is contained. absence_excuse_details
--      aed_reason_chk uses the verbatim production signature from recon N3
--      (seq10 preflight pins the exact deparse).
--   * Base helper functions: production-faithful semantics per recon section
--     5.3; public.is_valid_actor_request_action is the VERBATIM production
--     base definition (recon N1) - its applied vocabulary
--     ('approve','reject','return','comment','skip') is the CRITICAL BLOCKER
--     surface (finding 1).
--   * auth.uid() is realized through the GUC pattern used by the repo's
--     graduation-projects postgres harness: current_setting('e_rpcmatrix.uid')
--     stands in for request.jwt.claims->>'sub'.
--   * Fixture identities (users/profiles/units/roles/assignments) are
--     harness-defined. Unit/role CODES match the production contract; staff /
--     faculty UUIDs referenced by draft seq4 are the production UUIDs.
-- =====================================================================

\set ON_ERROR_STOP on

-- Stubs reference tables created later in this file; skip create-time body checks.
SET check_function_bodies = off;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS e_rpcmatrix;
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT USAGE ON SCHEMA storage TO PUBLIC;
GRANT USAGE ON SCHEMA e_rpcmatrix TO PUBLIC;

-- ---- auth --------------------------------------------------------------
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GUC-based auth.uid() (harness pattern: set_config('e_rpcmatrix.uid', ...)).
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('e_rpcmatrix.uid', true), '')::uuid
$$;

-- ---- storage -----------------------------------------------------------
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- ---- identity / org stubs ----------------------------------------------
CREATE TABLE public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name_ar text,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id),
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  department_id uuid REFERENCES public.departments(id),
  program_id uuid REFERENCES public.programs(id),
  full_name_ar text,
  academic_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  full_name_ar text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active',
  department_id uuid REFERENCES public.departments(id),
  full_name_ar text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  is_active boolean NOT NULL DEFAULT true,
  assigned_from date,
  assigned_to date
);

-- ---- academic reference stubs ------------------------------------------
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid REFERENCES public.academic_years(id),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_offering_id uuid REFERENCES public.course_offerings(id),
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid REFERENCES public.student_profiles(id),
  course_section_id uuid REFERENCES public.course_sections(id),
  enrollment_status text NOT NULL DEFAULT 'enrolled'
);

-- ---- audit substrate (both overloads; seq1 preflight pins them) ---------
CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type text,
  entity_id uuid,
  action_type text,
  old_data jsonb,
  new_data jsonb,
  notes text,
  actor_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.log_audit(
  p_entity_type text, p_entity_id uuid, p_action_type text,
  p_old jsonb, p_new jsonb, p_notes text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.audit_logs(entity_type,entity_id,action_type,old_data,new_data,notes,actor_user_id)
  VALUES (p_entity_type,p_entity_id,p_action_type,p_old,p_new,p_notes,auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.log_audit(
  p_entity_type text, p_entity_id uuid, p_action_type text,
  p_old jsonb, p_new jsonb, p_notes text, p_actor_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.audit_logs(entity_type,entity_id,action_type,old_data,new_data,notes,actor_user_id)
  VALUES (p_entity_type,p_entity_id,p_action_type,p_old,p_new,p_notes,p_actor_user_id);
END $$;

CREATE TABLE public.official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'issued',
  document_number text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- base helper functions (production-faithful stubs) ------------------

-- VERBATIM production base (recon N1). Applied vocabulary is NOT widened by
-- any draft: review/clear/apply_decision/confirm_payment are absent.
-- => CRITICAL BLOCKER (finding 1) surface.
CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
  SELECT p_action IN ('approve','reject','return','comment','skip');
$function$;

CREATE OR REPLACE FUNCTION public.is_owner_of_request(p_user_id uuid, p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests r
    JOIN public.student_profiles sp ON sp.id = r.student_profile_id
    WHERE r.id = p_request_id AND sp.user_id = p_user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE(profile_id uuid, profile_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT sp.id, sp.status FROM public.student_profiles sp
  WHERE sp.user_id = auth.uid()
  ORDER BY (sp.status = 'active') DESC, sp.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(
  p_profile_status text, p_request_audience text
) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_profile_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'STUDENT_PROFILE_NOT_ACTIVE' USING ERRCODE='42501';
  END IF;
  IF p_request_audience IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'REQUEST_AUDIENCE_NOT_ALLOWED' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_any_role(p_user_id uuid, p_roles text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role = ANY(p_roles)
  )
$$;

-- ---- request foundation tables ------------------------------------------
CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text,
  request_audience text NOT NULL DEFAULT 'student',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text,
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  rejection_reason text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---- processing units / roles / assignments (shape per 20260710160000) ---
CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  portal_scope text NOT NULL DEFAULT 'staff',
  is_academic_unit boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_processing_units_code_key UNIQUE (code),
  CONSTRAINT request_processing_units_portal_scope_chk
    CHECK (portal_scope IN ('admin','staff','faculty','mixed'))
);

CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name_ar text NOT NULL,
  is_managerial boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_processing_roles_unit_id_code_key UNIQUE (unit_id, code)
);

CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  role_id uuid REFERENCES public.request_processing_roles(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  staff_profile_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id) ON DELETE SET NULL,
  position_assignment_id uuid REFERENCES public.position_assignments(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_processing_assignments_type_chk
    CHECK (assignment_type IN ('user','staff_profile','faculty_profile','position_assignment','department_position','college_position'))
);

-- ---- workflow configuration tables (PRE-SEQ-7 CHECK vocabularies) --------
CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id),
  code text NOT NULL,
  name_ar text,
  description_ar text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  step_name_ar text,
  step_order integer NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  assignment_strategy text NOT NULL DEFAULT 'specific_user',
  action_type text NOT NULL,
  status_on_enter text,
  status_on_complete text,
  is_required boolean NOT NULL DEFAULT true,
  can_skip boolean NOT NULL DEFAULT false,
  can_reject boolean NOT NULL DEFAULT true,
  can_return_to_student boolean NOT NULL DEFAULT true,
  requires_payment boolean NOT NULL DEFAULT false,
  produces_document boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_type_workflow_steps_action_type_chk CHECK (action_type IN (
    'review','approve','reject','comment','return_to_student','request_attachment',
    'request_payment','archive','issue_document','complete','sign'
  ))
);

CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  from_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  to_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  action_result text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_type_workflow_transitions_action_result_chk CHECK (action_result IN (
    'submit','approve','approved','reject','return','request_attachment',
    'request_payment','fee_not_required','payment_required',
    'signed','issued','archived','skip','complete','cancel'
  ))
);

-- ---- workflow runtime tables (PRE-SEQ-7 CHECK vocabularies) --------------
CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid REFERENCES public.request_type_workflows(id),
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_key text,
  step_name_ar text,
  step_order integer,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  status text NOT NULL DEFAULT 'pending',
  decision text,
  comment text,
  entered_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_request_workflow_steps_decision_chk CHECK (decision IS NULL OR decision IN (
    'approved','rejected','returned','skipped','completed','signed','issued','archived'
  ))
);

CREATE TABLE public.student_request_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_step_runtime_id uuid REFERENCES public.student_request_workflow_steps(id),
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_unit_id uuid,
  actor_role_id uuid,
  message_ar text,
  payload jsonb,
  visible_to_student boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_request_workflow_events_event_type_chk CHECK (event_type IN (
    'created','submitted','step_entered','assigned','commented','approved','rejected',
    'returned','attachment_requested','payment_requested','signed','archived',
    'document_issued','completed','cancelled'
  ))
);

-- ---- B1 service detail tables --------------------------------------------
-- absence_excuse_details: aed_reason_chk carries the VERBATIM pre-seq10
-- production signature (recon N3; seq10 preflight pins the exact deparse).
CREATE TABLE public.absence_excuse_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  course_section_id uuid,
  absence_date date,
  reason_type text,
  record_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aed_reason_chk CHECK (reason_type = ANY (ARRAY['medical'::text, 'family'::text, 'emergency'::text, 'other'::text]))
);

CREATE TABLE public.enrollment_suspension_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  requested_from_academic_year_id uuid,
  requested_from_semester_id uuid,
  suspension_reason text,
  suspension_duration_type text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transfer_request_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  current_program_id uuid,
  requested_program_id uuid,
  current_department_id uuid,
  requested_department_id uuid,
  transfer_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.extra_chance_details (
  request_id uuid PRIMARY KEY REFERENCES public.student_requests(id),
  academic_year_id uuid,
  semester_id uuid,
  reason text,
  chance_type text,
  chance_applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_extra_chances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid,
  chance_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---- legacy RPC stubs (production-faithful gates per recon N7/N8) ---------
-- Legacy student submit. seq8 revokes authenticated EXECUTE at cutover; the
-- seq5 submit-boundary trigger independently blocks direct use on B1 types.
CREATE OR REPLACE FUNCTION public.submit_student_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_req record;
BEGIN
  SELECT r.* INTO v_req FROM public.student_requests r
  JOIN public.student_profiles sp ON sp.id = r.student_profile_id
  WHERE r.id = p_request_id AND sp.user_id = auth.uid()
    AND r.status IN ('draft','returned','returned_for_completion')
  FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'REQUEST_NOT_SUBMITTABLE' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('student_request.submit_via_rpc','1',true);
  UPDATE public.student_requests
     SET status='submitted', submitted_at=COALESCE(submitted_at,now()), updated_at=now()
   WHERE id=p_request_id;
END $$;

-- Legacy staff act. Gates on can_current_user_act_on_step (recon N7); direct
-- runtime mutation is independently blocked by the seq5 runtime trigger on B1.
CREATE OR REPLACE FUNCTION public.act_on_student_request_step(
  p_step_id uuid, p_action text, p_comment text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000';
  END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id, p_action) THEN
    RAISE EXCEPTION 'ACT_ON_STEP_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  UPDATE public.student_request_workflow_steps
     SET status='completed', decision='approved', comment=p_comment,
         completed_by=auth.uid(), completed_at=now(), updated_at=now()
   WHERE id=p_step_id AND status='active';
END $$;

-- ---- fixture seed: identities ---------------------------------------------
INSERT INTO auth.users(id,email) VALUES
  ('11111111-1111-4111-8111-111111111101','student1@harness.local'),
  ('11111111-1111-4111-8111-111111111102','student2@harness.local'),
  ('22222222-2222-4222-8222-222222222201','sa.specialist@harness.local'),
  ('22222222-2222-4222-8222-222222222202','sa.manager@harness.local'),
  ('22222222-2222-4222-8222-222222222203','registrar@harness.local'),
  ('22222222-2222-4222-8222-222222222204','finance.officer@harness.local'),
  ('22222222-2222-4222-8222-222222222205','dean@harness.local'),
  ('22222222-2222-4222-8222-222222222206','archive.officer@harness.local'),
  ('22222222-2222-4222-8222-222222222207','library.officer@harness.local'),
  ('22222222-2222-4222-8222-222222222208','labs.manager@harness.local'),
  ('22222222-2222-4222-8222-222222222209','ga.manager@harness.local'),
  ('22222222-2222-4222-8222-22222222220a','ga.specialist@harness.local'),
  ('22222222-2222-4222-8222-22222222220b','chair.cs@harness.local'),
  ('22222222-2222-4222-8222-22222222220c','chair.it@harness.local'),
  ('22222222-2222-4222-8222-22222222220d','chair.mis@harness.local'),
  ('22222222-2222-4222-8222-22222222220e','admin@harness.local'),
  ('22222222-2222-4222-8222-22222222220f','dean.role.only@harness.local');

INSERT INTO public.user_roles(user_id,role) VALUES
  ('22222222-2222-4222-8222-22222222220e','admin'),
  ('22222222-2222-4222-8222-22222222220f','dean'),
  ('22222222-2222-4222-8222-222222222203','registrar');

INSERT INTO public.departments(id,code,name_ar,is_active) VALUES
  ('55555555-5555-4555-8555-555555555501','CS','Computer Science',true),
  ('55555555-5555-4555-8555-555555555502','IT','Information Technology',true),
  ('55555555-5555-4555-8555-555555555503','MIS','Management Information Systems',true);

INSERT INTO public.programs(id,department_id,is_active) VALUES
  ('66666666-6666-4666-8666-666666666601','55555555-5555-4555-8555-555555555501',true),
  ('66666666-6666-4666-8666-666666666602','55555555-5555-4555-8555-555555555502',true);

INSERT INTO public.student_profiles(id,user_id,status,department_id,program_id,full_name_ar,academic_number) VALUES
  ('33333333-3333-4333-8333-333333333301','11111111-1111-4111-8111-111111111101','active',
   '55555555-5555-4555-8555-555555555501','66666666-6666-4666-8666-666666666601','Student One','STU-0001'),
  ('33333333-3333-4333-8333-333333333302','11111111-1111-4111-8111-111111111102','active',
   '55555555-5555-4555-8555-555555555501','66666666-6666-4666-8666-666666666601','Student Two','STU-0002');

INSERT INTO public.staff_profiles(id,user_id,status,full_name_ar) VALUES
  ('44444444-4444-4444-8444-444444444401','22222222-2222-4222-8222-222222222201','active','SA Specialist'),
  ('44444444-4444-4444-8444-444444444402','22222222-2222-4222-8222-222222222202','active','SA Manager'),
  ('44444444-4444-4444-8444-444444444403','22222222-2222-4222-8222-222222222203','active','Registrar General'),
  ('44444444-4444-4444-8444-444444444404','22222222-2222-4222-8222-222222222205','active','Dean'),
  ('44444444-4444-4444-8444-444444444405','22222222-2222-4222-8222-222222222206','active','Archive Officer'),
  -- production UUIDs referenced by draft seq4 (library/labs/graduate_affairs)
  ('4a838311-0ab7-4033-8e0c-69327d522bc7','22222222-2222-4222-8222-222222222207','active','Library Officer'),
  ('b59e6e45-260d-4af6-b312-85381d354104','22222222-2222-4222-8222-222222222208','active','Labs Manager'),
  ('f463a79b-65be-4a94-8003-1c9a2727b88f','22222222-2222-4222-8222-222222222209','active','GA Manager'),
  ('aa4f5c16-c993-4af6-a6d4-59d9542c1a7f','22222222-2222-4222-8222-22222222220a','active','GA Specialist');

INSERT INTO public.faculty_profiles(id,user_id,status,department_id,full_name_ar) VALUES
  -- production UUIDs referenced by draft seq4 (department chairs)
  ('d08a8509-4c04-472e-885f-053a80be12ec','22222222-2222-4222-8222-22222222220b','active','55555555-5555-4555-8555-555555555501','Chair CS'),
  ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','22222222-2222-4222-8222-22222222220c','active','55555555-5555-4555-8555-555555555502','Chair IT'),
  ('c1fe6084-e594-482e-a178-ac8eaffed376','22222222-2222-4222-8222-22222222220d','active','55555555-5555-4555-8555-555555555503','Chair MIS');

-- ---- fixture seed: request types (stored codes; recon finding: aliases) ----
-- excused_absence is stored as 'absence_excuse', department_transfer as
-- 'transfer', final_chance as 'extra_chance' (seq14 preflight pins this).
INSERT INTO public.request_types(id,code,name_ar,request_audience,is_active) VALUES
  ('99999999-0000-4000-8000-000000000001','enrollment_suspension','Enrollment Suspension','student',true),
  ('99999999-0000-4000-8000-000000000002','absence_excuse','Excused Absence','student',true),
  ('99999999-0000-4000-8000-000000000003','transfer','Department Transfer','student',true),
  ('99999999-0000-4000-8000-000000000004','extra_chance','Final Chance','student',true),
  ('99999999-0000-4000-8000-000000000005','file_withdrawal','File Withdrawal','student',true),
  ('99999999-0000-4000-8000-000000000009','enrollment_certificate','Enrollment Certificate (non-B1)','student',true);

-- ---- fixture seed: base processing units/roles (production contract codes) -
INSERT INTO public.request_processing_units(id,code,name_ar,name_en,portal_scope,is_academic_unit,is_active,sort_order) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','student_affairs','Student Affairs','Student Affairs','staff',false,true,10),
  ('aaaaaaaa-0000-4000-8000-000000000002','registrar','Registrar','Registrar','staff',false,true,20),
  ('aaaaaaaa-0000-4000-8000-000000000003','finance','Finance','Finance','staff',false,true,30),
  ('aaaaaaaa-0000-4000-8000-000000000004','dean','Dean','Dean','staff',true,true,40),
  ('aaaaaaaa-0000-4000-8000-000000000005','archive','Archive','Archive','staff',false,true,50);

INSERT INTO public.request_processing_roles(id,unit_id,code,name_ar,is_managerial,sort_order,is_active) VALUES
  ('bbbbbbbb-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','student_affairs_specialist','SA Specialist',false,10,true),
  ('bbbbbbbb-0000-4000-8000-000000000002','aaaaaaaa-0000-4000-8000-000000000001','student_affairs_manager','SA Manager',true,20,true),
  ('bbbbbbbb-0000-4000-8000-000000000003','aaaaaaaa-0000-4000-8000-000000000002','registrar_general','Registrar General',false,10,true),
  ('bbbbbbbb-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000003','revenue_finance_officer','Revenue Finance Officer',false,10,true),
  ('bbbbbbbb-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000004','dean','Dean',true,10,true),
  ('bbbbbbbb-0000-4000-8000-000000000006','aaaaaaaa-0000-4000-8000-000000000005','archive_officer','Archive Officer',false,10,true);

-- Exactly one active direct assignment per (unit,role) - the B1 contract.
-- finance is intentionally 'user'-typed (covers the user_id identity path,
-- matrix case X-14); dean/registrar/archive/Sa are staff_profile-typed.
INSERT INTO public.request_processing_assignments(unit_id,role_id,assignment_type,user_id,staff_profile_id,is_active) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','staff_profile',NULL,'44444444-4444-4444-8444-444444444401',true),
  ('aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000002','staff_profile',NULL,'44444444-4444-4444-8444-444444444402',true),
  ('aaaaaaaa-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000003','staff_profile',NULL,'44444444-4444-4444-8444-444444444403',true),
  ('aaaaaaaa-0000-4000-8000-000000000003','bbbbbbbb-0000-4000-8000-000000000004','user','22222222-2222-4222-8222-222222222204',NULL,true),
  ('aaaaaaaa-0000-4000-8000-000000000004','bbbbbbbb-0000-4000-8000-000000000005','staff_profile',NULL,'44444444-4444-4444-8444-444444444404',true),
  ('aaaaaaaa-0000-4000-8000-000000000005','bbbbbbbb-0000-4000-8000-000000000006','staff_profile',NULL,'44444444-4444-4444-8444-444444444405',true);

-- ---- fixture seed: academic period + course enrollment (absence submit) ---
INSERT INTO public.academic_years(id,status) VALUES
  ('77777777-7777-4777-8777-777777777701','active');
INSERT INTO public.semesters(id,academic_year_id,status) VALUES
  ('77777777-7777-4777-8777-777777777702','77777777-7777-4777-8777-777777777701','active');
INSERT INTO public.course_offerings(id,status) VALUES
  ('88888888-8888-4888-8888-888888888801','active');
INSERT INTO public.course_sections(id,course_offering_id,status) VALUES
  ('88888888-8888-4888-8888-888888888802','88888888-8888-4888-8888-888888888801','active');
INSERT INTO public.student_enrollments(student_profile_id,course_section_id,enrollment_status) VALUES
  ('33333333-3333-4333-8333-333333333301','88888888-8888-4888-8888-888888888802','enrolled');

-- ---- harness helpers --------------------------------------------------------
CREATE TABLE IF NOT EXISTS e_rpcmatrix.results (
  case_id text NOT NULL,
  sub_id text NOT NULL DEFAULT '',
  status text NOT NULL,
  expected text,
  actual text,
  detail text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- exec_case: run p_sql as p_uid (GUC pattern), capture outcome.
-- p_expect: 'OK' for expected success, otherwise expected SQLSTATE.
-- expected_error (optional): exact message prefix match requirement.
CREATE OR REPLACE FUNCTION e_rpcmatrix.exec_case(
  p_case text, p_sub text, p_expect text, p_uid uuid, p_sql text,
  p_expected_error text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_state text := 'OK';
  v_msg text := '';
  v_status text;
BEGIN
  PERFORM set_config('e_rpcmatrix.uid', COALESCE(p_uid::text, ''), true);
  -- Reset boundary GUCs: this file may run as one implicit transaction, and a
  -- legitimate RPC earlier in the batch would otherwise leak its tx-local GUC
  -- into direct-mutation cases (X-11/X-12), masking the boundary triggers.
  PERFORM set_config('b1.atomic_init', '', true);
  PERFORM set_config('b1.atomic_action', '', true);
  PERFORM set_config('b1.specialized_action', '', true);
  PERFORM set_config('b1.atomic_submit', '', true);
  PERFORM set_config('student_request.submit_via_rpc', '', true);
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
  END;
  v_status := CASE
    WHEN v_state = p_expect
         AND (p_expected_error IS NULL OR v_msg LIKE p_expected_error || '%') THEN 'PASS'
    ELSE 'FAIL' END;
  INSERT INTO e_rpcmatrix.results(case_id,sub_id,status,expected,actual,detail)
  VALUES (p_case,p_sub,v_status,
          p_expect || COALESCE('/' || p_expected_error,''),
          v_state || CASE WHEN v_msg='' THEN '' ELSE '/' || v_msg END,
          NULL);
END $$;

-- log_result: direct result insert (used by ACL/SET ROLE case files).
CREATE OR REPLACE FUNCTION e_rpcmatrix.log_result(
  p_case text, p_sub text, p_status text, p_expected text, p_actual text, p_detail text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  INSERT INTO e_rpcmatrix.results(case_id,sub_id,status,expected,actual,detail)
  VALUES (p_case,p_sub,p_status,p_expected,p_actual,p_detail);
END $$;
REVOKE ALL ON FUNCTION e_rpcmatrix.log_result(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION e_rpcmatrix.log_result(text,text,text,text,text,text) TO PUBLIC;

-- advance_to: harness state construction (NOT an RPC bypass claim). Marks
-- every runtime step before p_step_key completed in order and activates the
-- target step, under the seq5 boundary GUC. Used to reach steps that finding
-- 1 (vocabulary BLOCKER) makes unreachable through the act RPC.
CREATE OR REPLACE FUNCTION e_rpcmatrix.advance_to(p_request_id uuid, p_step_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_catalog AS $$
DECLARE
  v_target public.student_request_workflow_steps%ROWTYPE;
  v_active integer;
BEGIN
  PERFORM set_config('b1.atomic_init','1',true);
  SELECT s.* INTO v_target FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=p_request_id AND s.step_key=p_step_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HARNESS_STEP_NOT_FOUND:%', p_step_key;
  END IF;
  UPDATE public.student_request_workflow_steps s
     SET status='completed',
         decision=CASE s.metadata->>'action_type'
           WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
           WHEN 'clear' THEN 'cleared' WHEN 'apply_decision' THEN 'applied'
           WHEN 'confirm_payment' THEN 'payment_confirmed' WHEN 'archive' THEN 'archived'
           ELSE 'completed' END,
         completed_at=now(), updated_at=now()
   WHERE s.student_request_id=p_request_id
     AND s.step_order < v_target.step_order
     AND s.status IN ('active','pending');
  UPDATE public.student_request_workflow_steps s
     SET status='active', entered_at=now(), updated_at=now()
   WHERE s.id=v_target.id AND s.status='pending';
  SELECT count(*) INTO v_active FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=p_request_id AND s.status='active';
  IF v_active <> 1 THEN
    RAISE EXCEPTION 'HARNESS_ADVANCE_INVARIANT:%', v_active;
  END IF;
END $$;
