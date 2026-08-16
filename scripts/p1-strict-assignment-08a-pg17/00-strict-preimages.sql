-- P1-08 rehearsal — strict-runtime production preimages (PG17, isolated cluster).
-- Every function body below is the READ-ONLY production preimage captured for
-- mission PORTAL_REFORM_P1_STRICT_RUNTIME_ASSIGNMENT_REUSE_SOURCE_CLOSURE_08A.
-- Nothing here is part of the migration; it only reproduces the deployed state
-- that P1-07 and P1-08 are applied on top of.

-- ---------------------------------------------------------------------------
-- Schema shape the strict runtime depends on.
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_profiles   ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.faculty_profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.faculty_profiles ADD COLUMN IF NOT EXISTS department_id uuid;

ALTER TABLE public.request_processing_assignments ADD COLUMN IF NOT EXISTS department_id uuid;
ALTER TABLE public.request_processing_assignments ADD COLUMN IF NOT EXISTS position_assignment_id uuid;

ALTER TABLE public.request_type_workflow_steps ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS assigned_staff_profile_id uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS assigned_faculty_profile_id uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS assigned_position_assignment_id uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS comment text;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS completed_by uuid;
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.student_request_workflow_steps ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS public.position_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  assigned_from date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to date);

CREATE TABLE IF NOT EXISTS public.request_type_workflow_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  from_step_id uuid,
  to_step_id uuid,
  action_result text NOT NULL,
  label_ar text,
  condition_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.b1_workflow_runtime_contract_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL,
  request_type_code text NOT NULL,
  workflow_version integer NOT NULL DEFAULT 1,
  step_key text NOT NULL,
  step_order integer NOT NULL,
  unit_code text NOT NULL,
  role_code text NOT NULL,
  action_type text NOT NULL,
  action_code text,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.service_platform_runtime_flags (
  service_code text PRIMARY KEY,
  legacy_fallback_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.transfer_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  current_department_id uuid,
  requested_department_id uuid);

CREATE TABLE IF NOT EXISTS public.b1_e2e_88_actor_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid, request_id uuid, runtime_step_id uuid, workflow_step_id uuid,
  processing_unit_id uuid, processing_role_id uuid, actor_user_id uuid, action text,
  department_id uuid, department_side text,
  active boolean NOT NULL DEFAULT true, correlation_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day');

-- ---------------------------------------------------------------------------
-- TEST_ONLY_B1_E2E_88 surface: inert in this rehearsal (no bindings exist).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.b1_e2e_88_parse_correlation(p_value text) RETURNS uuid
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN RETURN p_value::uuid; EXCEPTION WHEN OTHERS THEN RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_correlation(p_request_id uuid) RETURNS uuid
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT public.b1_e2e_88_parse_correlation(sr.form_data->>'e2e_correlation_id')
  FROM public.student_requests sr WHERE sr.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_correlations_aligned(
  p_request_id uuid, p_execution_correlation uuid, p_binding_correlation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_execution_correlation IS NOT NULL
    AND p_binding_correlation IS NOT NULL
    AND p_execution_correlation = p_binding_correlation
    AND public.b1_e2e_88_request_correlation(p_request_id) = p_execution_correlation;
$$;

CREATE OR REPLACE FUNCTION public.b1_e2e_88_request_is_marked(p_request_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_requests sr
    WHERE sr.id = p_request_id
      AND COALESCE(sr.form_data->>'e2e_marker','') = public.b1_e2e_88_marker()
      AND public.b1_e2e_88_parse_correlation(sr.form_data->>'e2e_correlation_id') IS NOT NULL
      AND COALESCE(sr.form_data->>'e2e_immutable','false') = 'true'
      AND public.b1_e2e_88_is_five_service(
        CASE sr.request_type
          WHEN 'absence_excuse' THEN 'excused_absence'
          WHEN 'transfer' THEN 'department_transfer'
          WHEN 'extra_chance' THEN 'final_chance'
          ELSE sr.request_type END)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_actor_binding(
  p_request_id uuid, p_runtime_step_id uuid, p_action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.b1_e2e_88_request_is_marked(p_request_id)
    AND EXISTS (
      SELECT 1 FROM public.b1_e2e_88_actor_bindings b
      JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
      WHERE b.request_id = p_request_id AND b.runtime_step_id = p_runtime_step_id
        AND b.actor_user_id = auth.uid() AND b.action = p_action AND b.active
        AND b.expires_at > now() AND e.marker = public.b1_e2e_88_marker()
        AND e.status = 'active' AND e.closed_at IS NULL AND e.expires_at > now()
        AND public.b1_e2e_88_correlations_aligned(p_request_id, e.correlation_id, b.correlation_id));
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_b1_e2e_88_department_binding(
  p_step_id uuid, p_step_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
    JOIN public.b1_e2e_88_actor_bindings b
      ON b.runtime_step_id = s.id AND b.request_id = s.student_request_id
     AND b.actor_user_id = auth.uid() AND b.active AND b.expires_at > now()
    JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
     AND e.marker = public.b1_e2e_88_marker() AND e.status = 'active'
     AND e.closed_at IS NULL AND e.expires_at > now()
     AND public.b1_e2e_88_correlations_aligned(s.student_request_id, e.correlation_id, b.correlation_id)
    WHERE s.id = p_step_id AND s.step_key = p_step_key
      AND public.b1_e2e_88_request_is_marked(s.student_request_id));
$$;

-- ---------------------------------------------------------------------------
-- Runtime-contract catalogue + configured snapshot resolution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_b1_runtime_step_contract(
  p_request_type text, p_step_key text, p_unit_code text, p_role_code text, p_action_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (p_request_type, p_step_key, p_unit_code, p_role_code, p_action_type) IN (
    ('enrollment_suspension','initial_review','student_affairs','student_affairs_specialist','review'),
    ('enrollment_suspension','manager_approval','student_affairs','student_affairs_manager','approve'),
    ('enrollment_suspension','registrar_apply','registrar','registrar_general','apply_decision'),
    ('excused_absence','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('excused_absence','manager_review','student_affairs','student_affairs_manager','approve'),
    ('excused_absence','record_apply','student_affairs','student_affairs_specialist','apply_decision'),
    ('file_withdrawal','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('file_withdrawal','registrar_apply','registrar','registrar_general','apply_decision'),
    ('file_withdrawal','archive','archive','archive_officer','archive'),
    ('department_transfer','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('department_transfer','source_department_head_approval','department','department_head','approve'),
    ('department_transfer','target_department_head_approval','department','department_head','approve'),
    ('department_transfer','dean_approval','dean','dean','approve'),
    ('department_transfer','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('department_transfer','registrar_apply','registrar','registrar_general','apply_decision'),
    ('final_chance','student_affairs_intake','student_affairs','student_affairs_specialist','review'),
    ('final_chance','manager_review','student_affairs','student_affairs_manager','approve'),
    ('final_chance','dean_decision','dean','dean','approve'),
    ('final_chance','payment_confirmation','finance','revenue_finance_officer','confirm_payment'),
    ('final_chance','registrar_apply','registrar','registrar_general','apply_decision')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_b1_runtime_step_contract_configured(
  p_workflow_id uuid, p_step_key text, p_unit_code text, p_role_code text, p_action_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.b1_workflow_runtime_contract_snapshot c
    WHERE c.workflow_id = p_workflow_id AND c.step_key = p_step_key
      AND c.unit_code = p_unit_code AND c.role_code = p_role_code
      AND c.action_type = p_action_type);
$$;

CREATE OR REPLACE FUNCTION public.b1_legacy_fallback_enabled(p_service_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT f.legacy_fallback_enabled
                   FROM public.service_platform_runtime_flags f
                   WHERE f.service_code = p_service_code), true);
$$;

CREATE OR REPLACE FUNCTION public.b1_runtime_step_contract_ok(
  p_service_code text, p_workflow_id uuid, p_step_key text,
  p_unit_code text, p_role_code text, p_action_type text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_b1_runtime_step_contract_configured(
       p_workflow_id, p_step_key, p_unit_code, p_role_code, p_action_type) THEN
    RETURN true;
  END IF;
  IF public.b1_legacy_fallback_enabled(p_service_code) THEN
    RETURN public.is_valid_b1_runtime_step_contract(
      p_service_code, p_step_key, p_unit_code, p_role_code, p_action_type);
  END IF;
  RETURN false;
END $$;

-- ---------------------------------------------------------------------------
-- Identity / assignment predicates.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_b1_direct_assignment(
  p_assignment_id uuid, p_department_id uuid DEFAULT NULL::uuid, p_require_faculty boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.current_user_has_exact_processing_binding(p_unit_id uuid, p_role_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = p_unit_id AND rpa.role_id = p_role_id
      AND (
        (rpa.assignment_type = 'user' AND rpa.user_id = auth.uid())
        OR (rpa.assignment_type = 'staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = rpa.staff_profile_id AND sp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'faculty_profile' AND EXISTS (
          SELECT 1 FROM public.faculty_profiles fp
          WHERE fp.id = rpa.faculty_profile_id AND fp.user_id = auth.uid()))
        OR (rpa.assignment_type = 'position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa
          WHERE pa.id = rpa.position_assignment_id AND pa.user_id = auth.uid()
            AND pa.is_active = true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_matches_workflow_runtime_step(p_step_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_step public.student_request_workflow_steps%ROWTYPE;
  v_has_direct_assignee boolean := false;
BEGIN
  IF v_uid IS NULL OR p_step_id IS NULL THEN RETURN false; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id = p_step_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF public.b1_e2e_88_request_is_marked(v_step.student_request_id)
     AND EXISTS (
       SELECT 1 FROM public.b1_e2e_88_actor_bindings b
       JOIN public.b1_e2e_88_executions e ON e.id = b.execution_id
       WHERE b.runtime_step_id = p_step_id AND b.request_id = v_step.student_request_id
         AND b.actor_user_id = v_uid AND b.active AND b.expires_at > now()
         AND e.marker = public.b1_e2e_88_marker() AND e.status = 'active'
         AND e.closed_at IS NULL AND e.expires_at > now()
         AND public.b1_e2e_88_correlations_aligned(
           v_step.student_request_id, e.correlation_id, b.correlation_id)
     ) THEN RETURN true; END IF;

  IF v_step.assigned_user_id IS NOT NULL THEN RETURN v_step.assigned_user_id = v_uid; END IF;

  IF v_step.assigned_staff_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.staff_profiles sp
               WHERE sp.id = v_step.assigned_staff_profile_id AND sp.user_id = v_uid) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_faculty_profile_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.faculty_profiles fp
               WHERE fp.id = v_step.assigned_faculty_profile_id AND fp.user_id = v_uid) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_step.assigned_position_assignment_id IS NOT NULL THEN
    v_has_direct_assignee := true;
    IF EXISTS (SELECT 1 FROM public.position_assignments pa
               WHERE pa.id = v_step.assigned_position_assignment_id AND pa.user_id = v_uid
                 AND pa.is_active = true
                 AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)) THEN
      RETURN true;
    END IF;
  END IF;

  IF v_has_direct_assignee THEN RETURN false; END IF;
  IF v_step.processing_unit_id IS NULL OR v_step.processing_role_id IS NULL THEN RETURN false; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.request_processing_assignments rpa
    WHERE rpa.is_active = true
      AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
      AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
      AND rpa.unit_id = v_step.processing_unit_id
      AND rpa.role_id = v_step.processing_role_id
      AND (
        (rpa.assignment_type='user' AND rpa.user_id = v_uid)
        OR (rpa.assignment_type='staff_profile' AND EXISTS (
          SELECT 1 FROM public.staff_profiles sp WHERE sp.id=rpa.staff_profile_id AND sp.user_id=v_uid))
        OR (rpa.assignment_type='faculty_profile' AND EXISTS (
          SELECT 1 FROM public.faculty_profiles fp WHERE fp.id=rpa.faculty_profile_id AND fp.user_id=v_uid))
        OR (rpa.assignment_type='position_assignment' AND EXISTS (
          SELECT 1 FROM public.position_assignments pa WHERE pa.id=rpa.position_assignment_id
            AND pa.user_id=v_uid AND pa.is_active=true
            AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)))
      )
  );
END $$;

CREATE OR REPLACE FUNCTION public.current_user_matches_transfer_department_scope(p_step_id uuid, p_step_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    (
      SELECT count(*) = 1
      FROM public.student_request_workflow_steps s
      JOIN public.transfer_request_details d ON d.request_id = s.student_request_id
      JOIN public.position_assignments pa ON pa.id = s.assigned_position_assignment_id
        AND pa.user_id = auth.uid() AND pa.is_active
        AND pa.assigned_from <= CURRENT_DATE
        AND (pa.assigned_to IS NULL OR pa.assigned_to >= CURRENT_DATE)
      JOIN public.request_processing_assignments rpa ON rpa.position_assignment_id = pa.id
        AND rpa.assignment_type = 'position_assignment' AND rpa.is_active
        AND (rpa.starts_at IS NULL OR rpa.starts_at <= now())
        AND (rpa.ends_at IS NULL OR rpa.ends_at > now())
        AND rpa.unit_id = s.processing_unit_id AND rpa.role_id = s.processing_role_id
      WHERE s.id = p_step_id AND s.step_key = p_step_key
        AND s.assigned_user_id IS NULL
        AND s.assigned_staff_profile_id IS NULL
        AND s.assigned_faculty_profile_id IS NULL
        AND (
          (p_step_key = 'source_department_head_approval' AND rpa.department_id = d.current_department_id)
          OR (p_step_key = 'target_department_head_approval' AND rpa.department_id = d.requested_department_id)
        )
    )
    OR public.current_user_has_b1_e2e_88_department_binding(p_step_id, p_step_key)
  );
$$;

-- ---------------------------------------------------------------------------
-- Transition resolution + predecessor closure.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.workflow_action_result_matches(p_action_type text, p_result text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  select case p_action_type
    when 'review' then p_result='reviewed'
    when 'approve' then p_result='approved'
    when 'apply_decision' then p_result='applied'
    when 'clear' then p_result='cleared'
    when 'archive' then p_result='archived'
    when 'confirm_payment' then p_result='payment_confirmed'
    when 'sign' then p_result='signed'
    when 'issue_document' then p_result='issued'
    else false end
$$;

CREATE OR REPLACE FUNCTION public.evaluate_workflow_transition_condition(p_request_id uuid, p_schema jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.resolve_b1_workflow_transition(
  p_workflow_id uuid, p_from_step_id uuid, p_action_result text, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rec record; v_best_priority integer; v_matches integer := 0; v_chosen uuid;
BEGIN
  FOR v_rec IN
    SELECT t.id, t.priority FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id = p_workflow_id
      AND t.from_step_id IS NOT DISTINCT FROM p_from_step_id
      AND t.action_result = p_action_result
      AND NOT t.is_default
      AND COALESCE(t.condition_schema,'{}'::jsonb) <> '{}'::jsonb
      AND public.evaluate_workflow_transition_condition(p_request_id, t.condition_schema)
    ORDER BY t.priority DESC, t.id
  LOOP
    IF v_best_priority IS NULL THEN
      v_best_priority := v_rec.priority; v_chosen := v_rec.id; v_matches := 1;
    ELSIF v_rec.priority = v_best_priority THEN
      v_matches := v_matches + 1;
    END IF;
  END LOOP;
  IF v_matches > 1 THEN RAISE EXCEPTION 'B1_TRANSITION_CONFIGURATION_ERROR_AMBIGUOUS_PRIORITY'; END IF;
  IF v_matches = 1 THEN RETURN v_chosen; END IF;

  SELECT count(*), (array_agg(t.id ORDER BY t.id))[1] INTO v_matches, v_chosen
  FROM public.request_type_workflow_transitions t
  WHERE t.workflow_id = p_workflow_id
    AND t.from_step_id IS NOT DISTINCT FROM p_from_step_id
    AND t.action_result = p_action_result
    AND (t.is_default OR COALESCE(t.condition_schema,'{}'::jsonb) = '{}'::jsonb);
  IF v_matches <> 1 THEN RAISE EXCEPTION 'B1_TRANSITION_MUST_RESOLVE_ONCE:%', v_matches; END IF;
  RETURN v_chosen;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_b1_workflow_transition_safe(
  p_workflow_id uuid, p_from_step_id uuid, p_action_result text, p_request_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  BEGIN
    v_id := public.resolve_b1_workflow_transition(p_workflow_id, p_from_step_id, p_action_result, p_request_id);
  EXCEPTION WHEN OTHERS THEN RETURN NULL; END;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.workflow_runtime_predecessors_satisfied(p_step_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
declare
  v_step public.student_request_workflow_steps%rowtype;
  v_config public.request_type_workflow_steps%rowtype;
  v_incoming integer;
  v_pred record;
begin
  if p_step_id is null then return false; end if;
  select * into v_step from public.student_request_workflow_steps where id=p_step_id;
  if not found or v_step.status<>'active' or v_step.workflow_id is null or v_step.workflow_step_id is null then return false; end if;

  select * into v_config from public.request_type_workflow_steps
    where id=v_step.workflow_step_id and workflow_id=v_step.workflow_id;
  if not found or v_config.step_key is distinct from v_step.step_key
    or v_config.step_order is distinct from v_step.step_order then return false; end if;

  if (select count(*) from public.student_request_workflow_steps r
      where r.student_request_id=v_step.student_request_id and r.workflow_id=v_step.workflow_id
        and r.workflow_step_id=v_step.workflow_step_id)<>1 then return false; end if;

  select count(*) into v_incoming from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id;
  if v_config.step_order=1 then
    if v_incoming<>1 or not exists(select 1 from public.request_type_workflow_transitions t
      where t.workflow_id=v_step.workflow_id and t.from_step_id is null
        and t.to_step_id=v_step.workflow_step_id and t.action_result='submit') then return false; end if;
  elsif v_incoming=0 then return false;
  end if;
  if v_config.step_order<>1 and exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is null) then return false; end if;
  if exists(select 1 from public.request_type_workflow_transitions t
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
    group by t.from_step_id,t.to_step_id having count(*)<>1) then return false; end if;
  if exists(
    select 1 from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps source_config on source_config.id=t.from_step_id
    left join public.request_type_workflow_steps target_config on target_config.id=t.to_step_id
    where t.workflow_id=v_step.workflow_id and
      ((t.from_step_id is not null and source_config.workflow_id is distinct from t.workflow_id) or
       (t.to_step_id is not null and target_config.workflow_id is distinct from t.workflow_id))
  ) then return false; end if;

  for v_pred in
    select t.from_step_id,t.action_result,pc.can_skip,pc.action_type from public.request_type_workflow_transitions t
    left join public.request_type_workflow_steps pc on pc.id=t.from_step_id and pc.workflow_id=t.workflow_id
    where t.workflow_id=v_step.workflow_id and t.to_step_id=v_step.workflow_step_id
      and t.from_step_id is not null
  loop
    if v_pred.can_skip is null then return false; end if;
    if not public.workflow_action_result_matches(v_pred.action_type,v_pred.action_result)
      and not (v_pred.action_result='skip' and v_pred.can_skip) then return false; end if;
    if (select count(*) from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id)<>1 then return false; end if;
    if not exists(select 1 from public.student_request_workflow_steps pr
        where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
          and pr.workflow_step_id=v_pred.from_step_id
          and (pr.status='completed' or (pr.status='skipped' and v_pred.can_skip))) then return false; end if;
  end loop;

  if exists (
    select 1 from public.request_type_workflow_steps pc
    where pc.workflow_id=v_step.workflow_id and pc.step_order<v_config.step_order and pc.is_required
      and ((select count(*) from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id)<>1
        or not exists(select 1 from public.student_request_workflow_steps pr
            where pr.student_request_id=v_step.student_request_id and pr.workflow_id=v_step.workflow_id
              and pr.workflow_step_id=pc.id
              and (pr.status='completed' or (pr.status='skipped' and pc.can_skip)))
        or not exists(
          with recursive reachable(step_id) as (
            select pc.id
            union
            select t.to_step_id from reachable r
            join public.request_type_workflow_transitions t
              on t.workflow_id=v_step.workflow_id and t.from_step_id=r.step_id
            join public.request_type_workflow_steps source_config
              on source_config.id=t.from_step_id and source_config.workflow_id=t.workflow_id
                and source_config.workflow_id=v_step.workflow_id
            join public.request_type_workflow_steps target_config
              on target_config.id=t.to_step_id and target_config.workflow_id=t.workflow_id
                and target_config.workflow_id=v_step.workflow_id
            where t.to_step_id is not null and
              (public.workflow_action_result_matches(source_config.action_type,t.action_result) or
               (t.action_result='skip' and source_config.can_skip))
          ) select 1 from reachable where step_id=v_step.workflow_step_id
        ))
  ) then return false; end if;

  return true;
end $$;

-- ---------------------------------------------------------------------------
-- STRICT INITIALIZER — exact production preimage (pre-P1-08).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.initialize_b1_request_workflow_strict(p_request_id uuid, p_canonical_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_request public.student_requests%ROWTYPE;
  v_request_type_id uuid;
  v_workflow public.request_type_workflows%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE;
  v_assignment public.request_processing_assignments%ROWTYPE;
  v_assignment_count integer;
  v_actor_count integer;
  v_runtime_count integer;
  v_returned_count integer;
  v_first_order integer;
  v_department_id uuid;
  v_unit_code text;
  v_role_code text;
  v_active_step_id uuid;
  v_inserted_step_id uuid;
BEGIN
  PERFORM set_config('b1.atomic_init','1',true);
  LOCK TABLE public.request_processing_assignments IN SHARE MODE;
  LOCK TABLE public.request_type_workflows, public.request_type_workflow_steps IN SHARE MODE;
  SELECT r.* INTO v_request FROM public.student_requests r WHERE r.id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  IF p_canonical_code NOT IN (
    'enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal'
  ) THEN RAISE EXCEPTION 'B1_CANONICAL_CODE_REQUIRED' USING ERRCODE='22023'; END IF;

  IF (CASE v_request.request_type
       WHEN 'absence_excuse' THEN 'excused_absence'
       WHEN 'transfer' THEN 'department_transfer'
       WHEN 'extra_chance' THEN 'final_chance'
       ELSE v_request.request_type END) IS DISTINCT FROM p_canonical_code THEN
    RAISE EXCEPTION 'B1_REQUEST_TYPE_MISMATCH' USING ERRCODE='42501';
  END IF;

  SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1] INTO v_assignment_count, v_request_type_id
  FROM public.request_types rt WHERE rt.code = v_request.request_type AND rt.is_active = true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;

  SELECT count(*) INTO v_assignment_count FROM public.request_type_workflows w
  WHERE w.request_type_id = v_request_type_id AND w.status='active' AND w.is_active=true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;
  SELECT w.* INTO v_workflow FROM public.request_type_workflows w
  WHERE w.request_type_id=v_request_type_id AND w.status='active' AND w.is_active=true FOR SHARE;

  SELECT count(*), count(*) FILTER (WHERE status='returned') INTO v_runtime_count, v_returned_count
  FROM public.student_request_workflow_steps s WHERE s.student_request_id=p_request_id;

  IF v_runtime_count > 0 THEN
    RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_STATE_INVALID';
  END IF;

  SELECT min(s.step_order) INTO v_first_order
  FROM public.request_type_workflow_steps s WHERE s.workflow_id=v_workflow.id;
  IF v_first_order IS NULL THEN RAISE EXCEPTION 'B1_WORKFLOW_HAS_NO_STEPS'; END IF;

  FOR v_config IN
    SELECT s.* FROM public.request_type_workflow_steps s
    WHERE s.workflow_id=v_workflow.id ORDER BY s.step_order FOR SHARE
  LOOP
    SELECT u.code, r.code INTO v_unit_code, v_role_code
    FROM public.request_processing_units u
    JOIN public.request_processing_roles r ON r.id=v_config.processing_role_id AND r.unit_id=u.id
    WHERE u.id=v_config.processing_unit_id AND u.is_active=true AND r.is_active=true;
    IF NOT FOUND OR NOT public.b1_runtime_step_contract_ok(
      p_canonical_code,v_workflow.id,v_config.step_key,v_unit_code,v_role_code,v_config.action_type
    ) THEN RAISE EXCEPTION 'B1_WORKFLOW_STEP_CONTRACT_INVALID:%',v_config.step_key; END IF;

    v_department_id := NULL;
    IF p_canonical_code='department_transfer'
       AND v_config.step_key IN ('source_department_head_approval','target_department_head_approval') THEN
      SELECT CASE v_config.step_key WHEN 'source_department_head_approval' THEN d.current_department_id
             ELSE d.requested_department_id END INTO v_department_id
      FROM public.transfer_request_details d WHERE d.request_id=p_request_id FOR SHARE;
      IF v_department_id IS NULL THEN RAISE EXCEPTION 'B1_TRANSFER_DEPARTMENT_SCOPE_MISSING'; END IF;
    END IF;

    SELECT count(*) INTO v_assignment_count
    FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL));
    IF v_assignment_count <> 1 THEN
      RAISE EXCEPTION 'B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:%:%',v_config.step_key,v_assignment_count;
    END IF;
    SELECT a.* INTO v_assignment FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,false)
      AND (v_department_id IS NULL OR (
        a.assignment_type='position_assignment' AND a.position_assignment_id IS NOT NULL
        AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL))
    FOR SHARE;
    v_actor_count := num_nonnulls(v_assignment.user_id,v_assignment.staff_profile_id,
      v_assignment.faculty_profile_id,v_assignment.position_assignment_id);
    IF v_actor_count <> 1 THEN RAISE EXCEPTION 'B1_EXACTLY_ONE_DIRECT_ASSIGNEE_REQUIRED'; END IF;

    INSERT INTO public.student_request_workflow_steps(
      student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,step_order,
      processing_unit_id,processing_role_id,assigned_user_id,assigned_staff_profile_id,
      assigned_faculty_profile_id,assigned_position_assignment_id,status,entered_at,metadata
    ) VALUES (
      p_request_id,v_workflow.id,v_config.id,v_config.step_key,v_config.step_name_ar,v_config.step_order,
      v_config.processing_unit_id,v_config.processing_role_id,v_assignment.user_id,v_assignment.staff_profile_id,
      v_assignment.faculty_profile_id,v_assignment.position_assignment_id,
      CASE WHEN v_config.step_order=v_first_order THEN 'active' ELSE 'pending' END,
      CASE WHEN v_config.step_order=v_first_order THEN now() ELSE NULL END,
      jsonb_build_object('action_type',v_config.action_type,'direct_assignment_id',v_assignment.id)
    ) RETURNING id INTO v_inserted_step_id;
    IF v_config.step_order=v_first_order THEN v_active_step_id:=v_inserted_step_id; END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.student_request_workflow_steps s
      WHERE s.student_request_id=p_request_id AND s.status='active') <> 1 THEN
    RAISE EXCEPTION 'B1_EXACTLY_ONE_ACTIVE_STEP_REQUIRED';
  END IF;
  RETURN jsonb_build_object('initialized',true,'resumed',false,'workflow_id',v_workflow.id,
    'active_step_id',v_active_step_id);
END $$;

-- can_current_user_act_on_step: pre-P1-07 shape is irrelevant here because the
-- rehearsal applies the P1-07 draft immediately after this file.
