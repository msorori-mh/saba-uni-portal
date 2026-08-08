-- Disposable local schema mirroring the production objects the Fixture-13
-- package touches. Function bodies for the identity-contract chain are copied
-- VERBATIM from production (read-only pg_get_functiondef, 2026-07-31).
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
INSERT INTO supabase_migrations.schema_migrations VALUES ('20260731203030');

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE TABLE public.departments (id uuid PRIMARY KEY, code text, name_ar text);
CREATE TABLE public.programs (id uuid PRIMARY KEY, department_id uuid REFERENCES public.departments(id), name_ar text);

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), status text NOT NULL DEFAULT 'active');
CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), status text NOT NULL DEFAULT 'active',
  department_id uuid REFERENCES public.departments(id));
CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), is_active boolean NOT NULL DEFAULT true,
  department_id uuid REFERENCES public.departments(id),
  assigned_from date NOT NULL DEFAULT CURRENT_DATE, assigned_to date);

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY, user_id uuid REFERENCES auth.users(id), academic_number text UNIQUE,
  status text NOT NULL DEFAULT 'active',
  department_id uuid REFERENCES public.departments(id),
  program_id uuid REFERENCES public.programs(id));

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true, student_visible boolean NOT NULL DEFAULT false);

CREATE TABLE public.request_processing_units (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL);
CREATE TABLE public.request_processing_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL);

CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id),
  role_id uuid REFERENCES public.request_processing_roles(id),
  assignment_type text NOT NULL,
  user_id uuid, staff_profile_id uuid, faculty_profile_id uuid, position_assignment_id uuid,
  department_id uuid, is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid NOT NULL REFERENCES public.request_types(id),
  is_active boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'active');

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL, step_name_ar text NOT NULL, step_order int NOT NULL,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  action_type text NOT NULL,
  assignment_strategy text NOT NULL DEFAULT 'specific_user',
  config jsonb NOT NULL DEFAULT '{"authorization":"exactly_one_direct_assignee"}'::jsonb);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id),
  request_type text NOT NULL, title text, description text, status text NOT NULL,
  submitted_at timestamptz, request_number text UNIQUE NOT NULL,
  current_step_index int, form_data jsonb, internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid, workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_key text NOT NULL, step_name_ar text, step_order int NOT NULL,
  processing_unit_id uuid, processing_role_id uuid,
  assigned_user_id uuid, assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid, assigned_position_assignment_id uuid,
  status text NOT NULL, entered_at timestamptz, completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id),
  current_department_id uuid, current_program_id uuid NOT NULL,
  requested_department_id uuid, requested_program_id uuid NOT NULL,
  transfer_reason text NOT NULL, notes text,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.student_request_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_request_id uuid REFERENCES public.student_requests(id));
CREATE TABLE public.student_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_request_id uuid REFERENCES public.student_requests(id));
CREATE TABLE public.student_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_request_id uuid REFERENCES public.student_requests(id));
CREATE TABLE public.enrollment_certificate_document_details (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.official_documents (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

-- ---------------------------------------------------------------- functions
CREATE FUNCTION public.is_b1_stored_request_type(p_type text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_type IN ('enrollment_suspension','excused_absence','absence_excuse',
                    'department_transfer','transfer','final_chance','extra_chance',
                    'file_withdrawal')
$$;

CREATE FUNCTION public.b1_lock_assignment_identity_boundary() RETURNS void
LANGUAGE sql AS $$ SELECT pg_advisory_xact_lock(hashtext('b1_assignment_identity_boundary'))::void $$;

-- verbatim from production
CREATE OR REPLACE FUNCTION public.is_valid_b1_direct_assignment(p_assignment_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_require_faculty boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.request_processing_assignments a
    WHERE a.id=p_assignment_id AND a.is_active=true
      AND (a.starts_at IS NULL OR a.starts_at<=now()) AND (a.ends_at IS NULL OR a.ends_at>now())
      AND num_nonnulls(a.user_id,a.staff_profile_id,a.faculty_profile_id,a.position_assignment_id)=1
      AND (p_department_id IS NULL OR a.department_id=p_department_id)
      AND (
        (NOT p_require_faculty AND a.assignment_type='user' AND a.user_id IS NOT NULL
          AND EXISTS(SELECT 1 FROM auth.users u WHERE u.id=a.user_id))
        OR (NOT p_require_faculty AND a.assignment_type='staff_profile' AND EXISTS(
          SELECT 1 FROM public.staff_profiles sp WHERE sp.id=a.staff_profile_id
            AND sp.user_id IS NOT NULL AND sp.status='active'))
        OR (a.assignment_type='faculty_profile' AND EXISTS(
          SELECT 1 FROM public.faculty_profiles fp WHERE fp.id=a.faculty_profile_id
            AND fp.user_id IS NOT NULL AND fp.status='active'
            AND (p_department_id IS NULL OR fp.department_id=p_department_id)))
        OR (NOT p_require_faculty AND a.assignment_type='position_assignment' AND EXISTS(
          SELECT 1 FROM public.position_assignments pa WHERE pa.id=a.position_assignment_id
            AND pa.user_id IS NOT NULL AND pa.is_active=true AND pa.assigned_from<=CURRENT_DATE
            AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE)))
      )
  )
$function$;

-- verbatim from production
CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_row_assignee_effective(p_step student_request_workflow_steps)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_department_id uuid;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_count integer;
  v_assignment_id uuid;
BEGIN
  v_step := p_step;
  IF v_step.id IS NULL OR v_step.student_request_id IS NULL THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_b1_stored_request_type(v_request_type) THEN
    RETURN;
  END IF;

  PERFORM public.b1_lock_assignment_identity_boundary();

  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;

  IF v_canonical = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
    SELECT CASE v_step.step_key
             WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id END
      INTO v_department_id
    FROM public.transfer_request_details d WHERE d.request_id = v_step.student_request_id;
    IF v_department_id IS NULL THEN
      RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING:%', v_step.step_key USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, v_count USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.request_processing_assignments a
  WHERE a.unit_id = v_step.processing_unit_id
    AND a.role_id = v_step.processing_role_id
    AND a.is_active = true
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND (v_department_id IS NULL OR a.department_id = v_department_id)
    AND public.is_valid_b1_direct_assignment(a.id, v_department_id, false)
    AND (v_department_id IS NULL OR (
      a.assignment_type = 'position_assignment'
      AND a.position_assignment_id IS NOT NULL
      AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));

  IF num_nonnulls(v_assignment.user_id, v_assignment.staff_profile_id,
       v_assignment.faculty_profile_id, v_assignment.position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_NOT_SINGULAR:%', v_step.step_key USING ERRCODE = '42501';
  END IF;

  IF num_nonnulls(v_step.assigned_user_id, v_step.assigned_staff_profile_id,
       v_step.assigned_faculty_profile_id, v_step.assigned_position_assignment_id) <> 1 THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_MUST_RESOLVE_ONCE:%:%', v_step.step_key, 0 USING ERRCODE = '42501';
  END IF;

  IF v_step.assigned_user_id IS DISTINCT FROM v_assignment.user_id
     OR v_step.assigned_staff_profile_id IS DISTINCT FROM v_assignment.staff_profile_id
     OR v_step.assigned_faculty_profile_id IS DISTINCT FROM v_assignment.faculty_profile_id
     OR v_step.assigned_position_assignment_id IS DISTINCT FROM v_assignment.position_assignment_id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_IDENTITY_MISMATCH:%', v_step.step_key USING ERRCODE = '42501';
  END IF;

  v_assignment_id := (v_step.metadata ->> 'direct_assignment_id')::uuid;
  IF v_assignment_id IS NOT NULL AND v_assignment_id IS DISTINCT FROM v_assignment.id THEN
    RAISE EXCEPTION 'B1_RUNTIME_ASSIGNEE_PROVENANCE_MISMATCH:%', v_step.step_key USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assert_b1_runtime_step_assignee_effective(p_step_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id = p_step_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_RUNTIME_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_b1_runtime_step_row_assignee_effective(v_step);
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_b1_runtime_step_activation() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$ BEGIN PERFORM public.assert_b1_runtime_step_row_assignee_effective(NEW); RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.guard_b1_runtime_mutation_boundary() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE TRIGGER trg_guard_b1_runtime_mutation_boundary
  BEFORE INSERT OR UPDATE OR DELETE ON public.student_request_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.guard_b1_runtime_mutation_boundary();

CREATE TRIGGER trg_guard_b1_runtime_step_activation_insert
  BEFORE INSERT ON public.student_request_workflow_steps
  FOR EACH ROW WHEN (NEW.status = 'active')
  EXECUTE FUNCTION public.guard_b1_runtime_step_activation();
