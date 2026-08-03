-- Minimal disposable schema for Fixture-15 reissue-44 (not production).
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

-- Match Supabase auth.uid() contract used by protect_student_request().
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Harness stub: no privileged role bypass. B1 path must use atomic_action + completed_by.
CREATE OR REPLACE FUNCTION public.has_any_role(p_uid uuid, p_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT false;
$$;

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  student_visible boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  code text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (unit_id, code)
);

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  full_name_ar text
);

CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id),
  code text NOT NULL,
  name_ar text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  step_name_ar text NOT NULL DEFAULT '',
  step_order integer NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  action_type text NOT NULL,
  UNIQUE (workflow_id, step_key),
  UNIQUE (workflow_id, step_order)
);

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY,
  user_id uuid,
  academic_number text,
  status text DEFAULT 'active'
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY,
  student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  title text,
  description text,
  status text NOT NULL,
  submitted_at timestamptz,
  request_number text NOT NULL UNIQUE,
  current_step_index integer,
  form_data jsonb DEFAULT '{}'::jsonb,
  internal_notes text,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No UNIQUE(student_request_id, step_key) so drift tests can simulate a duplicate row.
CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY,
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid,
  workflow_step_id uuid,
  step_key text NOT NULL,
  step_name_ar text,
  step_order integer NOT NULL,
  processing_unit_id uuid,
  processing_role_id uuid,
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  status text NOT NULL,
  decision text,
  comment text,
  entered_at timestamptz,
  completed_at timestamptz,
  completed_by uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_request_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_step_runtime_id uuid,
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_unit_id uuid,
  actor_role_id uuid,
  message_ar text,
  payload jsonb DEFAULT '{}'::jsonb,
  visible_to_student boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollment_certificate_document_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker text NOT NULL DEFAULT 'ec-protected',
  payload text NOT NULL DEFAULT 'unchanged'
);

CREATE TABLE public.official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marker text NOT NULL DEFAULT 'ec-doc',
  payload text NOT NULL DEFAULT 'unchanged'
);

CREATE OR REPLACE FUNCTION public.is_b1_stored_request_type(p_type text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_type IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal','absence_excuse','transfer','extra_chance'
  );
$$;

-- Exact production B1 authorization contract from migration
-- 20260727072629_e89f780b-0c1a-407b-8720-4f676df058be.sql (source of truth).
-- Do not weaken. Remediations must satisfy this path, not replace it.
CREATE OR REPLACE FUNCTION public.protect_student_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_via_rpc boolean := COALESCE(current_setting('student_request.submit_via_rpc', true), '') = '1';
  v_b1_atomic boolean := COALESCE(current_setting('b1.atomic_action', true), '') = '1';
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  -- Authorized B1 processing actor: the update must come from the approved
  -- atomic step-action service AND the caller must have actually completed a
  -- recorded runtime step on this very request. This is not a role bypass.
  IF v_b1_atomic AND v_uid IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = OLD.id
      AND s.completed_by = v_uid
      AND s.status IN ('completed','rejected','returned')
  ) THEN
    NEW.id                 := OLD.id;
    NEW.student_profile_id := OLD.student_profile_id;
    NEW.request_type       := OLD.request_type;
    NEW.submitted_at       := OLD.submitted_at;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status NOT IN ('approved','completed') THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      RETURN NEW;
    END IF;

    IF v_via_rpc
       AND OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      RETURN NEW;
    END IF;

    IF OLD.status IN ('draft', 'returned', 'returned_for_completion')
       AND NEW.status = 'submitted' THEN
      RAISE EXCEPTION 'يجب إرسال الطلب عبر submit_student_request() وليس التحديث المباشر'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$function$;

CREATE TRIGGER trg_sr_protect
BEFORE UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.protect_student_request();

CREATE OR REPLACE FUNCTION public.guard_b1_runtime_mutation_boundary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_request_id uuid:=COALESCE(NEW.student_request_id,OLD.student_request_id); v_type text;
BEGIN
  SELECT r.request_type INTO v_type FROM public.student_requests r WHERE r.id=v_request_id;
  IF public.is_b1_stored_request_type(v_type)
     AND current_setting('b1.atomic_init',true) IS DISTINCT FROM '1'
     AND current_setting('b1.atomic_action',true) IS DISTINCT FROM '1'
     AND current_setting('b1.specialized_action',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_RUNTIME_BOUNDARY_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE TRIGGER trg_guard_b1_runtime_mutation_boundary
BEFORE INSERT OR UPDATE OR DELETE ON public.student_request_workflow_steps
FOR EACH ROW EXECUTE FUNCTION public.guard_b1_runtime_mutation_boundary();

CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(
  p_step public.student_request_workflow_steps
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_step.status = 'active' AND p_step.step_key IS NULL THEN
    RAISE EXCEPTION 'stub assert failed';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(NEW);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_guard_b1_runtime_step_activation
BEFORE UPDATE OF status ON public.student_request_workflow_steps
FOR EACH ROW
WHEN (NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active')
EXECUTE FUNCTION public.guard_b1_runtime_step_activation();

CREATE OR REPLACE FUNCTION public.b1_lock_assignment_identity_stmt()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;

CREATE TRIGGER trg_b1_lock_runtime_step_identity_stmt
BEFORE INSERT OR UPDATE ON public.student_request_workflow_steps
FOR EACH STATEMENT EXECUTE FUNCTION public.b1_lock_assignment_identity_stmt();
