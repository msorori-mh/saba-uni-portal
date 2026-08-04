-- B1 E2E 88 — disposable PG17 minimal schema (LOCAL ONLY)
\set ON_ERROR_STOP on
SET check_function_bodies = off;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('e_rpcmatrix.uid', true), '')::uuid
$$;

CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY,
  name_ar text
);

CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY,
  code text UNIQUE NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY,
  unit_id uuid REFERENCES public.request_processing_units(id),
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text DEFAULT 'active'
);

CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  department_id uuid REFERENCES public.departments(id),
  status text DEFAULT 'active'
);

CREATE TABLE public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date
);

CREATE TABLE public.request_processing_assignments (
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

CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_ar text,
  is_active boolean NOT NULL DEFAULT true,
  student_visible boolean NOT NULL DEFAULT false,
  request_audience text NOT NULL DEFAULT 'active_student'
);

CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  status text NOT NULL DEFAULT 'active',
  academic_number text,
  full_name_ar text,
  department_id uuid REFERENCES public.departments(id)
);

CREATE TABLE public.request_type_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_id uuid REFERENCES public.request_types(id),
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_type_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  step_key text NOT NULL,
  step_order integer NOT NULL,
  step_name_ar text,
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  action_type text,
  can_skip boolean NOT NULL DEFAULT false,
  can_reject boolean NOT NULL DEFAULT true,
  can_return_to_student boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true
);

CREATE TABLE public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.request_type_workflows(id),
  from_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  to_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  action_result text NOT NULL
);

CREATE TABLE public.student_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text,
  student_profile_id uuid REFERENCES public.student_profiles(id),
  request_type text NOT NULL,
  title text,
  description text,
  status text NOT NULL DEFAULT 'draft',
  form_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  student_notes text,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.student_request_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  workflow_id uuid REFERENCES public.request_type_workflows(id),
  workflow_step_id uuid REFERENCES public.request_type_workflow_steps(id),
  step_key text NOT NULL,
  step_name_ar text,
  step_order integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processing_unit_id uuid REFERENCES public.request_processing_units(id),
  processing_role_id uuid REFERENCES public.request_processing_roles(id),
  assigned_user_id uuid,
  assigned_staff_profile_id uuid,
  assigned_faculty_profile_id uuid,
  assigned_position_assignment_id uuid,
  entered_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.student_requests(id),
  current_department_id uuid REFERENCES public.departments(id),
  requested_department_id uuid REFERENCES public.departments(id)
);

CREATE OR REPLACE FUNCTION public.is_b1_stored_request_type(p_request_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT p_request_type IN (
    'enrollment_suspension','excused_absence','absence_excuse',
    'department_transfer','transfer','final_chance','extra_chance','file_withdrawal'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_valid_actor_request_action(p_action text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
  SELECT p_action IN (
    'approve','reject','return','comment','request_attachment',
    'request_payment','sign','archive','issue_document','complete','skip',
    'review','clear','apply_decision','confirm_payment'
  );
$$;

CREATE OR REPLACE FUNCTION public.workflow_action_result_matches(p_action_type text, p_result text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_action_type
    WHEN 'review' THEN p_result='reviewed'
    WHEN 'approve' THEN p_result='approved'
    WHEN 'apply_decision' THEN p_result='applied'
    WHEN 'clear' THEN p_result='cleared'
    WHEN 'archive' THEN p_result='archived'
    WHEN 'confirm_payment' THEN p_result='payment_confirmed'
    ELSE false END
$$;

CREATE OR REPLACE FUNCTION public.is_valid_b1_runtime_step_contract(
  p_request_type text, p_step_key text, p_unit_code text, p_role_code text, p_action_type text
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
    ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','source_department_head_approval','department','department_head','approve'),
    ('department_transfer','target_department_head_approval','department','department_head','approve')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_of_request(_user_id uuid, _request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    JOIN public.student_profiles sp ON sp.id = sr.student_profile_id
    WHERE sr.id = _request_id AND sp.user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(p_unit_id uuid, p_role_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id = p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;
  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid AND pa.is_active
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    );
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid, p_step_key text
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    SELECT count(*) = 1
    FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
      AND pa.user_id = auth.uid() AND pa.is_active
      AND pa.assigned_from <= CURRENT_DATE
      AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
      AND rpa.assignment_type = 'position_assignment' AND rpa.is_active
      AND rpa.unit_id = s.processing_unit_id AND rpa.role_id = s.processing_role_id
    WHERE s.id = p_step_id AND s.step_key = p_step_key
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval' AND rpa.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval' AND rpa.department_id = d.requested_department_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT true
$$;

CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical text;
  v_is_b1 boolean;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_valid_actor_request_action(p_action) THEN RETURN false; END IF;
  SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id=p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT r.request_type INTO v_request_type FROM public.student_requests r WHERE r.id=v_step.student_request_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
  v_canonical := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type END;
  IF v_is_b1 AND (
    v_step.status IS DISTINCT FROM 'active'
    OR num_nonnulls(v_step.assigned_user_id,v_step.assigned_staff_profile_id,
         v_step.assigned_faculty_profile_id,v_step.assigned_position_assignment_id) IS DISTINCT FROM 1
  ) THEN RETURN false; END IF;
  IF public.is_owner_of_request(v_uid,v_step.student_request_id) THEN RETURN false; END IF;
  IF v_step.status NOT IN ('active','pending') THEN RETURN false; END IF;
  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN RETURN false; END IF;
  IF v_is_b1 AND NOT public.current_user_has_exact_processing_binding(
    v_step.processing_unit_id,v_step.processing_role_id
  ) THEN RETURN false; END IF;
  IF v_canonical='department_transfer'
     AND v_step.step_key IN ('source_department_head_approval','target_department_head_approval')
     AND NOT public.current_user_matches_transfer_department_scope(p_step_id,v_step.step_key) THEN
    RETURN false;
  END IF;
  SELECT * INTO v_config FROM public.request_type_workflow_steps
    WHERE id=v_step.workflow_step_id AND workflow_id=v_step.workflow_id;
  IF v_is_b1 THEN
    IF NOT FOUND THEN RETURN false; END IF;
    IF NOT public.workflow_runtime_predecessors_satisfied(p_step_id) THEN RETURN false; END IF;
    SELECT u.code, pr.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles pr ON pr.id=v_step.processing_role_id
    WHERE u.id=v_step.processing_unit_id;
    IF NOT public.is_valid_b1_runtime_step_contract(
      v_canonical,v_step.step_key,v_unit_code,v_role_code,v_config.action_type
    ) THEN RETURN false; END IF;
    IF p_action=v_config.action_type THEN
      SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id=v_step.workflow_id AND t.from_step_id=v_step.workflow_step_id
          AND public.workflow_action_result_matches(v_config.action_type,t.action_result);
      RETURN v_transition_count=1;
    END IF;
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_student_profile_for_auth()
RETURNS TABLE (profile_id uuid, profile_status text, academic_number text, full_name_ar text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT sp.id, sp.status, sp.academic_number, sp.full_name_ar
  FROM public.student_profiles sp WHERE sp.user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.assert_student_can_use_request_type(
  _profile_status text, _request_audience text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF _profile_status IS DISTINCT FROM 'active' AND _profile_status IS DISTINCT FROM 'graduated' THEN
    RAISE EXCEPTION 'ineligible' USING ERRCODE='42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text, p_title text, p_form_data jsonb DEFAULT '{}'::jsonb, p_student_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'login' USING ERRCODE='28000'; END IF;
  SELECT c.profile_id, c.profile_status INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'no profile' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_type FROM public.request_types rt WHERE rt.code = p_request_type;
  IF NOT FOUND THEN RAISE EXCEPTION 'missing type' USING ERRCODE='22023'; END IF;
  IF v_type.is_active IS DISTINCT FROM true THEN RAISE EXCEPTION 'inactive' USING ERRCODE='42501'; END IF;
  IF v_type.student_visible IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير متاح للطالب' USING ERRCODE='42501';
  END IF;
  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);
  INSERT INTO public.student_requests(request_number,student_profile_id,request_type,title,status,form_data,student_notes)
  VALUES ('SR-HARNESS-'||substr(gen_random_uuid()::text,1,8), v_profile_id, v_type.code, btrim(p_title), 'draft',
          COALESCE(p_form_data,'{}'::jsonb), p_student_notes)
  RETURNING id INTO v_request_id;
  RETURN v_request_id;
END;
$$;

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
