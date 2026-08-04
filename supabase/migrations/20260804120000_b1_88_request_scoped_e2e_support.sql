-- PORTAL_B1_E2E_REQUEST_SCOPED_SUPPORT_IMPLEMENTATION_88
-- SOURCE-ONLY forward migration. NOT applied by this mission.
-- Temporary, fail-closed, request-scoped TEST_ONLY E2E support for the five B1 services.
-- Marker: TEST_ONLY_B1_E2E_88
-- Does NOT mutate student_visible, enrollment_certificate, or request_processing_assignments.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
DO $preflight$
BEGIN
  IF to_regprocedure('public.can_current_user_act_on_step(uuid,text)') IS NULL
     OR to_regprocedure('public.current_user_has_exact_processing_binding(uuid,uuid)') IS NULL
     OR to_regprocedure('public.current_user_matches_transfer_department_scope(uuid,text)') IS NULL
     OR to_regprocedure('public.user_matches_workflow_runtime_step(uuid)') IS NULL
     OR to_regprocedure('public.create_student_request(text,text,jsonb,text)') IS NULL
     OR to_regprocedure('public.is_b1_stored_request_type(text)') IS NULL
     OR to_regprocedure('public.guard_b1_runtime_mutation_boundary()') IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_PREREQUISITE_MISSING';
  END IF;
END;
$preflight$;

-- ---------------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.b1_e2e_88_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correlation_id uuid NOT NULL UNIQUE,
  marker text NOT NULL DEFAULT 'TEST_ONLY_B1_E2E_88'
    CHECK (marker = 'TEST_ONLY_B1_E2E_88'),
  student_user_id uuid NOT NULL,
  service_code text NOT NULL
    CHECK (service_code IN (
      'enrollment_suspension',
      'excused_absence',
      'department_transfer',
      'final_chance',
      'file_withdrawal'
    )),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'expired')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  created_by uuid,
  created_request_id uuid,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b1_e2e_88_exec_expires_after_start CHECK (expires_at > starts_at),
  CONSTRAINT b1_e2e_88_exec_closed_requires_ts CHECK (
    (status = 'closed' AND closed_at IS NOT NULL)
    OR (status <> 'closed')
  )
);

CREATE TABLE IF NOT EXISTS public.b1_e2e_88_actor_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.b1_e2e_88_executions(id),
  request_id uuid NOT NULL,
  workflow_step_id uuid NOT NULL,
  runtime_step_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  processing_unit_id uuid NOT NULL,
  processing_role_id uuid NOT NULL,
  department_id uuid,
  department_side text
    CHECK (department_side IS NULL OR department_side IN ('source', 'target')),
  action text NOT NULL,
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  correlation_id uuid NOT NULL,
  prior_assignee_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  e2e_position_assignment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  CONSTRAINT b1_e2e_88_binding_dept_side_consistency CHECK (
    (department_side IS NULL AND department_id IS NULL)
    OR (department_side IS NOT NULL AND department_id IS NOT NULL)
  )
);

-- One active binding per exact request+runtime step+actor+action
CREATE UNIQUE INDEX IF NOT EXISTS b1_e2e_88_actor_bindings_active_exact_uidx
  ON public.b1_e2e_88_actor_bindings (request_id, runtime_step_id, actor_user_id, action)
  WHERE active;

CREATE TABLE IF NOT EXISTS public.b1_e2e_88_audit_events (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  correlation_id uuid,
  execution_id uuid,
  request_id uuid,
  runtime_step_id uuid,
  actor_user_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.b1_e2e_88_audit_events_deny_mutate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'B1_E2E_88_AUDIT_APPEND_ONLY' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_b1_e2e_88_audit_no_update ON public.b1_e2e_88_audit_events;
CREATE TRIGGER trg_b1_e2e_88_audit_no_update
  BEFORE UPDATE OR DELETE ON public.b1_e2e_88_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.b1_e2e_88_audit_events_deny_mutate();

ALTER TABLE public.b1_e2e_88_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b1_e2e_88_actor_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b1_e2e_88_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.b1_e2e_88_executions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.b1_e2e_88_actor_bindings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.b1_e2e_88_audit_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.b1_e2e_88_executions TO service_role;
GRANT SELECT ON TABLE public.b1_e2e_88_actor_bindings TO service_role;
GRANT SELECT ON TABLE public.b1_e2e_88_audit_events TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Pure helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_is_five_service(p_code text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_code IN (
    'enrollment_suspension',
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  );
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_marker()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT 'TEST_ONLY_B1_E2E_88'::text;
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_is_marked(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.student_requests sr
    WHERE sr.id = p_request_id
      AND COALESCE(sr.form_data->>'e2e_marker', '') = public.b1_e2e_88_marker()
      AND public.b1_e2e_88_is_five_service(
        CASE sr.request_type
          WHEN 'absence_excuse' THEN 'excused_absence'
          WHEN 'transfer' THEN 'department_transfer'
          WHEN 'extra_chance' THEN 'final_chance'
          ELSE sr.request_type
        END
      )
      AND sr.request_type IS DISTINCT FROM 'enrollment_certificate'
      AND COALESCE(sr.form_data->>'authoritative_fixture', 'false') IS DISTINCT FROM 'true'
      AND COALESCE(sr.request_number, '') NOT LIKE 'SR-20260801-13%'
  );
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_write_audit(
  p_event_type text,
  p_correlation_id uuid,
  p_execution_id uuid,
  p_request_id uuid,
  p_runtime_step_id uuid,
  p_actor_user_id uuid,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.b1_e2e_88_audit_events(
    event_type, correlation_id, execution_id, request_id,
    runtime_step_id, actor_user_id, detail
  ) VALUES (
    p_event_type, p_correlation_id, p_execution_id, p_request_id,
    p_runtime_step_id, p_actor_user_id, COALESCE(p_detail, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_execution_is_live(p_execution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.b1_e2e_88_executions e
    WHERE e.id = p_execution_id
      AND e.marker = public.b1_e2e_88_marker()
      AND e.status = 'active'
      AND e.closed_at IS NULL
      AND e.starts_at <= now()
      AND e.expires_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_actor_binding(
  p_request_id uuid,
  p_runtime_step_id uuid,
  p_action text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.b1_e2e_88_request_is_marked(p_request_id)
    AND EXISTS (
      SELECT 1
      FROM public.b1_e2e_88_actor_bindings b
      JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
      JOIN public.student_request_workflow_steps s ON s.id = b.runtime_step_id
      WHERE b.request_id = p_request_id
        AND b.runtime_step_id = p_runtime_step_id
        AND b.actor_user_id = auth.uid()
        AND b.action = p_action
        AND b.active
        AND b.expires_at > now()
        AND e.marker = public.b1_e2e_88_marker()
        AND e.status = 'active'
        AND e.closed_at IS NULL
        AND e.expires_at > now()
        AND e.starts_at <= now()
        AND e.correlation_id = b.correlation_id
        AND s.id = p_runtime_step_id
        AND s.student_request_id = p_request_id
        AND s.workflow_step_id = b.workflow_step_id
        AND s.processing_unit_id = b.processing_unit_id
        AND s.processing_role_id = b.processing_role_id
    );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_department_binding(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.student_request_workflow_steps s
    JOIN public.student_requests sr ON sr.id = s.student_request_id
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.b1_e2e_88_actor_bindings b
      ON b.runtime_step_id = s.id
     AND b.request_id = s.student_request_id
     AND b.actor_user_id = auth.uid()
     AND b.active
     AND b.expires_at > now()
    JOIN public.b1_e2e_88_executions e
      ON e.id = b.execution_id
     AND e.marker = public.b1_e2e_88_marker()
     AND e.status = 'active'
     AND e.closed_at IS NULL
     AND e.expires_at > now()
     AND e.correlation_id = b.correlation_id
    WHERE s.id = p_step_id
      AND s.step_key = p_step_key
      AND p_step_key IN ('source_department_head_approval', 'target_department_head_approval')
      AND public.b1_e2e_88_request_is_marked(s.student_request_id)
      AND s.assigned_user_id IS NULL
      AND s.assigned_staff_profile_id IS NULL
      AND s.assigned_faculty_profile_id IS NULL
      AND (
        (p_step_key = 'source_department_head_approval'
          AND b.department_side = 'source'
          AND b.department_id = d.current_department_id)
        OR (p_step_key = 'target_department_head_approval'
          AND b.department_side = 'target'
          AND b.department_id = d.requested_department_id)
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3) Create-path gate (hidden services under exact E2E execution only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_allows_hidden_create(
  p_request_type text,
  p_form_data jsonb
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_marker text := btrim(COALESCE(p_form_data->>'e2e_marker', ''));
  v_corr uuid;
  v_canonical text;
  v_exec public.b1_e2e_88_executions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF p_request_type = 'enrollment_certificate' THEN
    RETURN false;
  END IF;

  v_canonical := CASE p_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE p_request_type
  END;

  IF NOT public.b1_e2e_88_is_five_service(v_canonical) THEN
    RETURN false;
  END IF;

  IF v_marker IS DISTINCT FROM public.b1_e2e_88_marker() THEN
    RETURN false;
  END IF;

  BEGIN
    v_corr := NULLIF(btrim(COALESCE(p_form_data->>'e2e_correlation_id', '')), '')::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  IF v_corr IS NULL THEN
    RETURN false;
  END IF;

  -- Read-only gate (STABLE). Exclusive claim happens in create_student_request
  -- via UPDATE ... WHERE created_request_id IS NULL.
  SELECT e.* INTO v_exec
  FROM public.b1_e2e_88_executions e
  WHERE e.correlation_id = v_corr;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_exec.marker IS DISTINCT FROM public.b1_e2e_88_marker()
     OR v_exec.status IS DISTINCT FROM 'active'
     OR v_exec.closed_at IS NOT NULL
     OR v_exec.expires_at <= now()
     OR v_exec.starts_at > now()
     OR v_exec.student_user_id IS DISTINCT FROM v_uid
     OR v_exec.service_code IS DISTINCT FROM v_canonical
     OR v_exec.created_request_id IS NOT NULL THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Management RPCs (service_role only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_b1_e2e_88_execution(
  p_correlation_id uuid,
  p_student_user_id uuid,
  p_service_code text,
  p_expires_at timestamptz,
  p_audit_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_canonical text;
BEGIN
  IF p_correlation_id IS NULL OR p_student_user_id IS NULL OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_OPEN_ARGS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  v_canonical := CASE p_service_code
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE p_service_code
  END;

  IF NOT public.b1_e2e_88_is_five_service(v_canonical) THEN
    RAISE EXCEPTION 'B1_E2E_88_SERVICE_NOT_ALLOWED:%', p_service_code USING ERRCODE = '22023';
  END IF;

  IF v_canonical = 'enrollment_certificate' OR p_service_code = 'enrollment_certificate' THEN
    RAISE EXCEPTION 'B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_expires_at <= now() THEN
    RAISE EXCEPTION 'B1_E2E_88_EXPIRES_IN_PAST' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.b1_e2e_88_executions(
    correlation_id, marker, student_user_id, service_code,
    status, starts_at, expires_at, created_by, audit_metadata
  ) VALUES (
    p_correlation_id,
    public.b1_e2e_88_marker(),
    p_student_user_id,
    v_canonical,
    'active',
    now(),
    p_expires_at,
    auth.uid(),
    COALESCE(p_audit_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  PERFORM public.b1_e2e_88_write_audit(
    'execution_opened', p_correlation_id, v_id, NULL, NULL, p_student_user_id,
    jsonb_build_object('service_code', v_canonical, 'expires_at', p_expires_at)
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_b1_e2e_88_execution(
  p_correlation_id uuid,
  p_reason text DEFAULT 'closed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exec public.b1_e2e_88_executions%ROWTYPE;
BEGIN
  SELECT e.* INTO v_exec
  FROM public.b1_e2e_88_executions e
  WHERE e.correlation_id = p_correlation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_E2E_88_EXECUTION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.b1_e2e_88_actor_bindings b
  SET active = false,
      deactivated_at = COALESCE(b.deactivated_at, now())
  WHERE b.execution_id = v_exec.id
    AND b.active;

  UPDATE public.b1_e2e_88_executions e
  SET status = 'closed',
      closed_at = now()
  WHERE e.id = v_exec.id
    AND e.status IS DISTINCT FROM 'closed';

  PERFORM public.b1_e2e_88_write_audit(
    'execution_closed', p_correlation_id, v_exec.id, v_exec.created_request_id,
    NULL, auth.uid(),
    jsonb_build_object('reason', COALESCE(p_reason, 'closed'))
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(
  p_correlation_id uuid,
  p_request_id uuid,
  p_runtime_step_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_department_id uuid DEFAULT NULL,
  p_department_side text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exec public.b1_e2e_88_executions%ROWTYPE;
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_req public.student_requests%ROWTYPE;
  v_binding_id uuid;
  v_prior jsonb;
  v_is_dept boolean;
BEGIN
  IF p_correlation_id IS NULL OR p_request_id IS NULL
     OR p_runtime_step_id IS NULL OR p_actor_user_id IS NULL
     OR p_action IS NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_BIND_ARGS_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT e.* INTO v_exec
  FROM public.b1_e2e_88_executions e
  WHERE e.correlation_id = p_correlation_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.b1_e2e_88_execution_is_live(v_exec.id) THEN
    RAISE EXCEPTION 'B1_E2E_88_EXECUTION_NOT_LIVE' USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_req
  FROM public.student_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_E2E_88_REQUEST_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.request_type = 'enrollment_certificate' THEN
    RAISE EXCEPTION 'B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF NOT public.b1_e2e_88_request_is_marked(p_request_id) THEN
    RAISE EXCEPTION 'B1_E2E_88_REQUEST_NOT_MARKED' USING ERRCODE = '42501';
  END IF;

  IF v_exec.service_code IS DISTINCT FROM (
       CASE v_req.request_type
         WHEN 'absence_excuse' THEN 'excused_absence'
         WHEN 'transfer' THEN 'department_transfer'
         WHEN 'extra_chance' THEN 'final_chance'
         ELSE v_req.request_type
       END
     ) THEN
    RAISE EXCEPTION 'B1_E2E_88_SERVICE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_req.form_data->>'authoritative_fixture', 'false') = 'true'
     OR COALESCE(v_req.request_number, '') LIKE 'SR-20260801-13%' THEN
    RAISE EXCEPTION 'B1_E2E_88_AUTHORITATIVE_FIXTURE_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_exec.created_request_id IS NOT NULL
     AND v_exec.created_request_id IS DISTINCT FROM p_request_id THEN
    RAISE EXCEPTION 'B1_E2E_88_REQUEST_EXECUTION_MISMATCH' USING ERRCODE = '42501';
  END IF;

  IF v_req.status IN ('returned', 'returned_for_completion') THEN
    RAISE EXCEPTION 'B1_E2E_88_RESUBMIT_STATE_UNSAFE' USING ERRCODE = '42501';
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_runtime_step_id
    AND s.student_request_id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B1_E2E_88_STEP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_step.status = 'completed' THEN
    RAISE EXCEPTION 'B1_E2E_88_STEP_COMPLETED' USING ERRCODE = '42501';
  END IF;

  IF v_step.status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'B1_E2E_88_STEP_NOT_BINDABLE:%', v_step.status USING ERRCODE = '42501';
  END IF;

  v_is_dept := v_step.step_key IN (
    'source_department_head_approval',
    'target_department_head_approval'
  );

  IF v_is_dept THEN
    IF p_department_id IS NULL OR p_department_side IS NULL THEN
      RAISE EXCEPTION 'B1_E2E_88_DEPARTMENT_SCOPE_REQUIRED' USING ERRCODE = '22023';
    END IF;
    IF (v_step.step_key = 'source_department_head_approval' AND p_department_side <> 'source')
       OR (v_step.step_key = 'target_department_head_approval' AND p_department_side <> 'target') THEN
      RAISE EXCEPTION 'B1_E2E_88_DEPARTMENT_SIDE_MISMATCH' USING ERRCODE = '42501';
    END IF;
  ELSIF p_department_id IS NOT NULL OR p_department_side IS NOT NULL THEN
    RAISE EXCEPTION 'B1_E2E_88_DEPARTMENT_SCOPE_FORBIDDEN' USING ERRCODE = '22023';
  END IF;

  -- Idempotent identical bind
  SELECT b.id INTO v_binding_id
  FROM public.b1_e2e_88_actor_bindings b
  WHERE b.execution_id = v_exec.id
    AND b.request_id = p_request_id
    AND b.runtime_step_id = p_runtime_step_id
    AND b.actor_user_id = p_actor_user_id
    AND b.action = p_action
    AND b.active
    AND b.processing_unit_id IS NOT DISTINCT FROM v_step.processing_unit_id
    AND b.processing_role_id IS NOT DISTINCT FROM v_step.processing_role_id
    AND b.department_id IS NOT DISTINCT FROM p_department_id
    AND b.department_side IS NOT DISTINCT FROM p_department_side;

  IF FOUND THEN
    RETURN v_binding_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.b1_e2e_88_actor_bindings b
    WHERE b.request_id = p_request_id
      AND b.runtime_step_id = p_runtime_step_id
      AND b.active
      AND (
        b.actor_user_id IS DISTINCT FROM p_actor_user_id
        OR b.action IS DISTINCT FROM p_action
        OR b.department_id IS DISTINCT FROM p_department_id
        OR b.department_side IS DISTINCT FROM p_department_side
      )
  ) THEN
    RAISE EXCEPTION 'B1_E2E_88_BINDING_CONFLICT' USING ERRCODE = '23505';
  END IF;

  v_prior := jsonb_build_object(
    'assigned_user_id', v_step.assigned_user_id,
    'assigned_staff_profile_id', v_step.assigned_staff_profile_id,
    'assigned_faculty_profile_id', v_step.assigned_faculty_profile_id,
    'assigned_position_assignment_id', v_step.assigned_position_assignment_id
  );

  -- Department-head steps forbid assigned_user_id; identity is satisfied by the
  -- E2E department binding via user_matches_workflow_runtime_step + scope helper.
  -- Non-dept steps pin assigned_user_id under the B1 runtime mutation boundary.
  IF NOT v_is_dept THEN
    PERFORM set_config('b1.atomic_action', '1', true);
    UPDATE public.student_request_workflow_steps s
    SET assigned_user_id = p_actor_user_id,
        assigned_staff_profile_id = NULL,
        assigned_faculty_profile_id = NULL,
        assigned_position_assignment_id = NULL,
        updated_at = now()
    WHERE s.id = p_runtime_step_id;
  END IF;

  INSERT INTO public.b1_e2e_88_actor_bindings(
    execution_id, request_id, workflow_step_id, runtime_step_id,
    actor_user_id, processing_unit_id, processing_role_id,
    department_id, department_side, action, expires_at, active,
    correlation_id, prior_assignee_snapshot, e2e_position_assignment_id
  ) VALUES (
    v_exec.id, p_request_id, v_step.workflow_step_id, p_runtime_step_id,
    p_actor_user_id, v_step.processing_unit_id, v_step.processing_role_id,
    p_department_id, p_department_side, p_action, v_exec.expires_at, true,
    p_correlation_id, v_prior, NULL
  )
  RETURNING id INTO v_binding_id;

  IF v_exec.created_request_id IS NULL THEN
    UPDATE public.b1_e2e_88_executions
    SET created_request_id = p_request_id
    WHERE id = v_exec.id;
  END IF;

  PERFORM public.b1_e2e_88_write_audit(
    'actor_bound', p_correlation_id, v_exec.id, p_request_id, p_runtime_step_id,
    p_actor_user_id,
    jsonb_build_object(
      'binding_id', v_binding_id,
      'action', p_action,
      'step_key', v_step.step_key,
      'department_side', p_department_side,
      'prior', v_prior
    )
  );

  RETURN v_binding_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_b1_e2e_88_package(
  p_correlation_id uuid DEFAULT NULL,
  p_restore_assignees boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_exec record;
  v_binding record;
  v_closed int := 0;
  v_deactivated int := 0;
  v_restored int := 0;
BEGIN
  FOR v_exec IN
    SELECT e.*
    FROM public.b1_e2e_88_executions e
    WHERE p_correlation_id IS NULL OR e.correlation_id = p_correlation_id
    FOR UPDATE
  LOOP
    FOR v_binding IN
      SELECT b.*
      FROM public.b1_e2e_88_actor_bindings b
      WHERE b.execution_id = v_exec.id
      FOR UPDATE
    LOOP
      IF p_restore_assignees AND v_binding.active THEN
        PERFORM set_config('b1.atomic_action', '1', true);
        UPDATE public.student_request_workflow_steps s
        SET assigned_user_id =
              NULLIF(v_binding.prior_assignee_snapshot->>'assigned_user_id', '')::uuid,
            assigned_staff_profile_id =
              NULLIF(v_binding.prior_assignee_snapshot->>'assigned_staff_profile_id', '')::uuid,
            assigned_faculty_profile_id =
              NULLIF(v_binding.prior_assignee_snapshot->>'assigned_faculty_profile_id', '')::uuid,
            assigned_position_assignment_id =
              NULLIF(v_binding.prior_assignee_snapshot->>'assigned_position_assignment_id', '')::uuid,
            updated_at = now()
        WHERE s.id = v_binding.runtime_step_id;
        v_restored := v_restored + 1;
      END IF;

      IF v_binding.active THEN
        UPDATE public.b1_e2e_88_actor_bindings
        SET active = false, deactivated_at = now()
        WHERE id = v_binding.id;
        v_deactivated := v_deactivated + 1;
      END IF;

      IF v_binding.e2e_position_assignment_id IS NOT NULL THEN
        UPDATE public.position_assignments pa
        SET is_active = false,
            assigned_to = CURRENT_DATE
        WHERE pa.id = v_binding.e2e_position_assignment_id
          AND pa.is_active;
      END IF;
    END LOOP;

    IF v_exec.status IS DISTINCT FROM 'closed' THEN
      UPDATE public.b1_e2e_88_executions
      SET status = 'closed', closed_at = COALESCE(closed_at, now())
      WHERE id = v_exec.id;
      v_closed := v_closed + 1;
    END IF;

    PERFORM public.b1_e2e_88_write_audit(
      'cleanup_executed', v_exec.correlation_id, v_exec.id, v_exec.created_request_id,
      NULL, auth.uid(),
      jsonb_build_object(
        'restore_assignees', p_restore_assignees,
        'note', 'preserves request and audit evidence; never touches request_processing_assignments'
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'closed_executions', v_closed,
    'deactivated_bindings', v_deactivated,
    'restored_assignees', v_restored,
    'request_processing_assignments_touched', 0,
    'authoritative_fixtures_touched', 0,
    'student_visible_touched', 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) create_student_request — normal path unchanged; TEST_ONLY exception
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student_request(
  p_request_type text,
  p_title text,
  p_form_data jsonb DEFAULT '{}'::jsonb,
  p_student_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_profile_status text;
  v_type public.request_types%ROWTYPE;
  v_request_id uuid;
  v_request_number text;
  v_form jsonb := COALESCE(p_form_data, '{}'::jsonb);
  v_e2e_ok boolean := false;
  v_corr uuid;
  v_canonical text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول'
      USING ERRCODE = '28000';
  END IF;

  IF p_request_type IS NULL OR btrim(p_request_type) = '' THEN
    RAISE EXCEPTION 'نوع الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'عنوان الطلب مطلوب'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.profile_id, c.profile_status
  INTO v_profile_id, v_profile_status
  FROM public.current_student_profile_for_auth() c;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'لا يوجد ملف طالب مرتبط بحسابك'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_type
  FROM public.request_types rt
  WHERE rt.code = p_request_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'نوع الطلب غير موجود'
      USING ERRCODE = '22023';
  END IF;

  IF v_type.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'نوع الطلب غير مفعل'
      USING ERRCODE = '42501';
  END IF;

  IF v_type.student_visible IS DISTINCT FROM true THEN
    v_e2e_ok := public.b1_e2e_88_allows_hidden_create(p_request_type, v_form);
    IF NOT v_e2e_ok THEN
      RAISE EXCEPTION 'نوع الطلب غير متاح للطالب'
        USING ERRCODE = '42501';
    END IF;
    IF p_request_type = 'enrollment_certificate' THEN
      RAISE EXCEPTION 'B1_E2E_88_ENROLLMENT_CERTIFICATE_FORBIDDEN'
        USING ERRCODE = '42501';
    END IF;
    v_canonical := CASE p_request_type
      WHEN 'absence_excuse' THEN 'excused_absence'
      WHEN 'transfer' THEN 'department_transfer'
      WHEN 'extra_chance' THEN 'final_chance'
      ELSE p_request_type
    END;
    IF NOT public.b1_e2e_88_is_five_service(v_canonical) THEN
      RAISE EXCEPTION 'B1_E2E_88_SERVICE_NOT_ALLOWED:%', p_request_type
        USING ERRCODE = '42501';
    END IF;
    v_corr := (v_form->>'e2e_correlation_id')::uuid;
    v_form := v_form || jsonb_build_object(
      'e2e_marker', public.b1_e2e_88_marker(),
      'e2e_correlation_id', v_corr::text,
      'e2e_immutable', true
    );
  END IF;

  PERFORM public.assert_student_can_use_request_type(v_profile_status, v_type.request_audience);

  v_request_number := 'SR-' || to_char(now(), 'YYYYMMDD') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  INSERT INTO public.student_requests (
    request_number,
    student_profile_id,
    request_type,
    title,
    description,
    status,
    form_data,
    student_notes
  ) VALUES (
    v_request_number,
    v_profile_id,
    v_type.code,
    btrim(p_title),
    p_student_notes,
    'draft',
    v_form,
    p_student_notes
  )
  RETURNING id INTO v_request_id;

  IF v_e2e_ok THEN
    UPDATE public.b1_e2e_88_executions e
    SET created_request_id = v_request_id
    WHERE e.correlation_id = v_corr
      AND e.created_request_id IS NULL
      AND e.student_user_id = v_uid
      AND e.status = 'active';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'B1_E2E_88_CREATE_EXECUTION_CLAIM_FAILED'
        USING ERRCODE = '42501';
    END IF;

    PERFORM public.b1_e2e_88_write_audit(
      'request_created', v_corr,
      (SELECT id FROM public.b1_e2e_88_executions WHERE correlation_id = v_corr),
      v_request_id, NULL, v_uid,
      jsonb_build_object('request_type', p_request_type, 'request_number', v_request_number)
    );
  END IF;

  RETURN v_request_id;
END;
$$;

-- Immutable marker guard (E2E requests only)
CREATE OR REPLACE FUNCTION public.guard_b1_e2e_88_immutable_marker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.form_data->>'e2e_marker', '') = public.b1_e2e_88_marker()
     AND (
       COALESCE(NEW.form_data->>'e2e_marker', '') IS DISTINCT FROM public.b1_e2e_88_marker()
       OR COALESCE(NEW.form_data->>'e2e_correlation_id', '')
          IS DISTINCT FROM COALESCE(OLD.form_data->>'e2e_correlation_id', '')
       OR COALESCE(NEW.form_data->>'e2e_immutable', 'false') IS DISTINCT FROM 'true'
     ) THEN
    RAISE EXCEPTION 'B1_E2E_88_MARKER_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_b1_e2e_88_immutable_marker ON public.student_requests;
CREATE TRIGGER trg_guard_b1_e2e_88_immutable_marker
  BEFORE UPDATE ON public.student_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_b1_e2e_88_immutable_marker();

-- ---------------------------------------------------------------------------
-- 6) Assignee match: allow exact E2E binding for TEST_ONLY dept-head steps
--    (assigned_user_id remains forbidden; normal path unchanged otherwise)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.* INTO v_step
  FROM public.student_request_workflow_steps s
  WHERE s.id = p_step_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- TEST_ONLY_B1_E2E_88 exact request-scoped actor binding may satisfy identity
  -- for the bound step only (required for department-head steps that forbid
  -- assigned_user_id). Never grants cross-request or cross-step identity.
  IF public.b1_e2e_88_request_is_marked(v_step.student_request_id)
     AND EXISTS (
       SELECT 1
       FROM public.b1_e2e_88_actor_bindings b
       JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
       WHERE b.runtime_step_id = p_step_id
         AND b.request_id = v_step.student_request_id
         AND b.actor_user_id = v_uid
         AND b.active
         AND b.expires_at > now()
         AND e.marker = public.b1_e2e_88_marker()
         AND e.status = 'active'
         AND e.closed_at IS NULL
         AND e.expires_at > now()
         AND e.correlation_id = b.correlation_id
     ) THEN
    RETURN true;
  END IF;

  IF v_step.assigned_user_id IS NOT NULL THEN
    RETURN v_step.assigned_user_id = v_uid;
  END IF;

  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.staff_profiles sp
      WHERE sp.id = v_step.assigned_staff_profile_id
        AND sp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.faculty_profiles fp
      WHERE fp.id = v_step.assigned_faculty_profile_id
        AND fp.user_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (
      SELECT 1 FROM public.position_assignments pa
      WHERE pa.id = v_step.assigned_position_assignment_id
        AND pa.user_id = v_uid
        AND pa.is_active = true
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
    ) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_has_direct_assignee THEN
    RETURN false;
  END IF;

  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at   IS NULL OR rpa.ends_at   >  now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        (rpa.assignment_type = 'user'
          AND rpa.user_id IS NOT NULL
          AND rpa.user_id = v_uid)
        OR
        (rpa.assignment_type = 'staff_profile'
          AND rpa.staff_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.staff_profiles sp
            WHERE sp.id = rpa.staff_profile_id AND sp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'faculty_profile'
          AND rpa.faculty_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.faculty_profiles fp
            WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = v_uid
          ))
        OR
        (rpa.assignment_type = 'position_assignment'
          AND rpa.position_assignment_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.position_assignments pa
            WHERE pa.id = rpa.position_assignment_id
              AND pa.user_id = v_uid
              AND pa.is_active = true
              AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
          ))
      )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.user_matches_workflow_runtime_step(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_matches_workflow_runtime_step(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7) Department scope: normal path preserved; E2E OR-branch fail-closed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(
  p_step_id uuid,
  p_step_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (
      SELECT count(*) = 1
      FROM public.student_request_workflow_steps s
      JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
      JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
        AND pa.user_id = auth.uid()
        AND pa.is_active
        AND pa.assigned_from <= CURRENT_DATE
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
      JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
        AND rpa.assignment_type = 'position_assignment'
        AND rpa.is_active
        AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
        AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
        AND rpa.unit_id = s.processing_unit_id
        AND rpa.role_id = s.processing_role_id
      WHERE s.id = p_step_id
        AND s.step_key = p_step_key
        AND s.assigned_user_id IS NULL
        AND s.assigned_staff_profile_id IS NULL
        AND s.assigned_faculty_profile_id IS NULL
        AND (
          (p_step_key = 'source_department_head_approval'
            AND rpa.department_id = d.current_department_id)
          OR (p_step_key = 'target_department_head_approval'
            AND rpa.department_id = d.requested_department_id)
        )
    )
    OR public.current_user_has_b1_e2e_88_department_binding(p_step_id, p_step_key)
  );
$$;

-- ---------------------------------------------------------------------------
-- 8) Authorization gate: E2E binding may satisfy processing binding only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_current_user_act_on_step(p_step_id uuid, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_request_type text;
  v_canonical_request_type text;
  v_is_b1 boolean := false;
  v_unit_code text;
  v_role_code text;
  v_transition_count integer;
  v_has_binding boolean := false;
  v_has_e2e boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  IF NOT public.is_valid_actor_request_action(p_action) THEN RETURN false; END IF;

  SELECT * INTO v_step FROM public.student_request_workflow_steps WHERE id = p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT r.request_type INTO v_request_type
  FROM public.student_requests r
  WHERE r.id = v_step.student_request_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_is_b1 := public.is_b1_stored_request_type(v_request_type);
  v_canonical_request_type := CASE v_request_type
    WHEN 'absence_excuse' THEN 'excused_absence'
    WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance'
    ELSE v_request_type
  END;

  IF v_is_b1 AND (
    v_step.status IS DISTINCT FROM 'active'
    OR num_nonnulls(
      v_step.assigned_user_id,
      v_step.assigned_staff_profile_id,
      v_step.assigned_faculty_profile_id,
      v_step.assigned_position_assignment_id
    ) IS DISTINCT FROM 1
  ) THEN RETURN false; END IF;

  IF public.is_owner_of_request(v_uid, v_step.student_request_id) THEN RETURN false; END IF;

  IF v_step.status NOT IN ('active', 'pending') THEN
    IF p_action = 'comment' AND v_step.status = 'completed' THEN
      RETURN public.user_matches_workflow_runtime_step(p_step_id);
    END IF;
    RETURN false;
  END IF;

  -- 1) exact runtime-step assignee match
  IF NOT public.user_matches_workflow_runtime_step(p_step_id) THEN RETURN false; END IF;

  -- 2) exact request-scoped E2E binding OR 6) normal processing binding
  IF v_is_b1 THEN
    v_has_binding := public.current_user_has_exact_processing_binding(
      v_step.processing_unit_id, v_step.processing_role_id
    );
    v_has_e2e := public.current_user_has_b1_e2e_88_actor_binding(
      v_step.student_request_id, p_step_id, p_action
    );
    IF NOT v_has_binding AND NOT v_has_e2e THEN
      RETURN false;
    END IF;
  END IF;

  IF v_canonical_request_type = 'department_transfer'
     AND v_step.step_key IN ('source_department_head_approval', 'target_department_head_approval')
     AND NOT public.current_user_matches_transfer_department_scope(p_step_id, v_step.step_key) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_config FROM public.request_type_workflow_steps
    WHERE id = v_step.workflow_step_id;

  IF v_is_b1 THEN
    SELECT * INTO v_config FROM public.request_type_workflow_steps
      WHERE id = v_step.workflow_step_id AND workflow_id = v_step.workflow_id;
    IF NOT FOUND
      OR v_config.step_key IS DISTINCT FROM v_step.step_key
      OR v_config.step_order IS DISTINCT FROM v_step.step_order
      OR v_config.processing_unit_id IS DISTINCT FROM v_step.processing_unit_id
      OR v_config.processing_role_id IS DISTINCT FROM v_step.processing_role_id THEN
      RETURN false;
    END IF;

    IF NOT public.workflow_runtime_predecessors_satisfied(p_step_id) THEN RETURN false; END IF;

    SELECT u.code, pr.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles pr ON pr.id = v_step.processing_role_id
    WHERE u.id = v_step.processing_unit_id;
    IF NOT public.is_valid_b1_runtime_step_contract(
      v_canonical_request_type, v_step.step_key, v_unit_code, v_role_code, v_config.action_type
    ) THEN RETURN false; END IF;

    -- 3) exact action and current-step validation
    IF p_action = v_config.action_type THEN
      SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = v_step.workflow_id AND t.from_step_id = v_step.workflow_step_id
          AND public.workflow_action_result_matches(v_config.action_type, t.action_result);
      RETURN v_transition_count = 1;
    ELSIF p_action = 'skip' THEN
      SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
        WHERE t.workflow_id = v_step.workflow_id AND t.from_step_id = v_step.workflow_step_id
          AND t.action_result = 'skip';
      RETURN COALESCE(v_config.can_skip, false) AND v_transition_count = 1;
    END IF;
    RETURN false;
  END IF;

  IF p_action = 'skip' THEN
    IF v_config.id IS NULL OR NOT COALESCE(v_config.can_skip, false) THEN RETURN false; END IF;
    RETURN true;
  END IF;

  IF p_action = 'reject' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_reject, true) THEN
    RETURN false;
  END IF;

  IF p_action = 'return' AND v_config.id IS NOT NULL AND NOT COALESCE(v_config.can_return_to_student, true) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 9) Privileges — PUBLIC EXECUTE revoked; search_path pinned above
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.b1_e2e_88_is_five_service(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_marker() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_request_is_marked(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_write_audit(text,uuid,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_execution_is_live(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_allows_hidden_create(text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_has_b1_e2e_88_department_binding(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.close_b1_e2e_88_execution(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_b1_e2e_88_package(uuid,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.b1_e2e_88_audit_events_deny_mutate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_b1_e2e_88_immutable_marker() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_student_request(text,text,jsonb,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_current_user_act_on_step(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_has_b1_e2e_88_department_binding(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_student_request(text,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_current_user_act_on_step(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_matches_transfer_department_scope(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.close_b1_e2e_88_execution(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_b1_e2e_88_package(uuid,boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 10) Postchecks
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  v_src text;
  v_body text;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = 'public.can_current_user_act_on_step(uuid,text)'::regprocedure;

  IF position('current_user_has_b1_e2e_88_actor_binding' IN coalesce(v_src, '')) = 0
     OR position('current_user_has_exact_processing_binding' IN coalesce(v_src, '')) = 0
     OR position('user_matches_workflow_runtime_step' IN coalesce(v_src, '')) = 0
     OR position('is_owner_of_request' IN coalesce(v_src, '')) = 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_AUTHZ_POSTCHECK_FAILED';
  END IF;

  -- No broad role bypass
  IF position('has_role' IN coalesce(v_src, '')) > 0
     OR position('is_current_user_admin_actor' IN coalesce(v_src, '')) > 0
     OR position('service_role' IN coalesce(v_src, '')) > 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_BROAD_BYPASS_FORBIDDEN';
  END IF;

  SELECT pg_get_functiondef(
    'public.current_user_matches_transfer_department_scope(uuid,text)'::regprocedure
  ) INTO v_body;
  IF position('assigned_position_assignment_id' IN v_body) = 0
     OR position('current_user_has_b1_e2e_88_department_binding' IN v_body) = 0
     OR position('faculty_profiles' IN v_body) > 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_TRANSFER_SCOPE_POSTCHECK_FAILED';
  END IF;

  SELECT p.prosrc INTO v_src
  FROM pg_proc p
  WHERE p.oid = 'public.create_student_request(text,text,jsonb,text)'::regprocedure;
  IF position('b1_e2e_88_allows_hidden_create' IN coalesce(v_src, '')) = 0
     OR position('student_visible' IN coalesce(v_src, '')) = 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_CREATE_POSTCHECK_FAILED';
  END IF;
  IF position('student_visible' IN coalesce(v_src, '')) > 0
     AND position('UPDATE public.request_types' IN lower(coalesce(v_src, ''))) > 0 THEN
    RAISE EXCEPTION 'B1_E2E_88_STUDENT_VISIBLE_MUTATION_FORBIDDEN';
  END IF;

  IF has_function_privilege('anon', 'public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.open_b1_e2e_88_execution(uuid,uuid,text,timestamptz,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.bind_b1_e2e_88_actor_to_runtime_step(uuid,uuid,uuid,uuid,text,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.cleanup_b1_e2e_88_package(uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'B1_E2E_88_PUBLIC_EXECUTE_NOT_REVOKED';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.b1_e2e_88_executions'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.b1_e2e_88_actor_bindings'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.b1_e2e_88_audit_events'::regclass) THEN
    RAISE EXCEPTION 'B1_E2E_88_RLS_REQUIRED';
  END IF;
END;
$post$;

COMMIT;
