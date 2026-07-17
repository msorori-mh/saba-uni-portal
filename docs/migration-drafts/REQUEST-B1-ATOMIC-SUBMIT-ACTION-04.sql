-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Shared atomic B1 submit/action boundary. Service-specific validators and detail
-- persistence replace the fail-closed dispatcher in later ordered migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid,
  p_canonical_code text,
  p_form_data jsonb,
  p_attachment_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'B1_SERVICE_PERSISTENCE_NOT_INSTALLED:%', p_canonical_code
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_b1_stored_request_type(p_request_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT p_request_type IN ('enrollment_suspension','excused_absence','absence_excuse',
    'department_transfer','transfer','final_chance','extra_chance','file_withdrawal')
$$;

CREATE OR REPLACE FUNCTION public.guard_b1_request_submit_boundary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF public.is_b1_stored_request_type(NEW.request_type)
     AND NEW.status='submitted' AND OLD.status IN ('draft','returned','returned_for_completion')
     AND current_setting('b1.atomic_submit',true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'B1_ATOMIC_SUBMIT_BOUNDARY_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;

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

REVOKE ALL ON FUNCTION public.is_b1_stored_request_type(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_b1_request_submit_boundary() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.guard_b1_runtime_mutation_boundary() FROM PUBLIC,anon,authenticated;

DO $guards$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_requests'::regclass
    AND tgname='trg_guard_b1_request_submit_boundary' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_guard_b1_request_submit_boundary BEFORE UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.guard_b1_request_submit_boundary();
  ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_requests'::regclass
    AND tgname='trg_guard_b1_request_submit_boundary'
    AND tgfoid='public.guard_b1_request_submit_boundary()'::regprocedure
    AND tgtype=19 AND tgenabled='O' AND tgconstraint=0 AND tgnargs=0
    AND cardinality(tgattr::smallint[])=0) THEN
    RAISE EXCEPTION 'B1_SUBMIT_GUARD_TRIGGER_CONTRACT_MISMATCH';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_request_workflow_steps'::regclass
    AND tgname='trg_guard_b1_runtime_mutation_boundary' AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_guard_b1_runtime_mutation_boundary BEFORE INSERT OR UPDATE OR DELETE
      ON public.student_request_workflow_steps FOR EACH ROW
      EXECUTE FUNCTION public.guard_b1_runtime_mutation_boundary();
  ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_request_workflow_steps'::regclass
    AND tgname='trg_guard_b1_runtime_mutation_boundary'
    AND tgfoid='public.guard_b1_runtime_mutation_boundary()'::regprocedure
    AND tgtype=31 AND tgenabled='O' AND tgconstraint=0 AND tgnargs=0
    AND cardinality(tgattr::smallint[])=0) THEN
    RAISE EXCEPTION 'B1_RUNTIME_GUARD_TRIGGER_CONTRACT_MISMATCH';
  END IF;
END;
$guards$;

CREATE OR REPLACE FUNCTION public.is_valid_b1_direct_assignment(
  p_assignment_id uuid,p_department_id uuid DEFAULT NULL,p_require_faculty boolean DEFAULT false
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
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

REVOKE ALL ON FUNCTION public.is_valid_b1_direct_assignment(uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.initialize_b1_request_workflow_strict(
  p_request_id uuid,
  p_canonical_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT r.* INTO v_request
  FROM public.student_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_REQUEST_NOT_FOUND' USING ERRCODE='P0002'; END IF;

  IF p_canonical_code NOT IN (
    'enrollment_suspension','excused_absence','department_transfer',
    'final_chance','file_withdrawal'
  ) THEN RAISE EXCEPTION 'B1_CANONICAL_CODE_REQUIRED' USING ERRCODE='22023'; END IF;

  IF CASE v_request.request_type
       WHEN 'absence_excuse' THEN 'excused_absence'
       WHEN 'transfer' THEN 'department_transfer'
       WHEN 'extra_chance' THEN 'final_chance'
       ELSE v_request.request_type
     END IS DISTINCT FROM p_canonical_code THEN
    RAISE EXCEPTION 'B1_REQUEST_TYPE_MISMATCH' USING ERRCODE='42501';
  END IF;

  SELECT count(*), (array_agg(rt.id ORDER BY rt.id))[1]
    INTO v_assignment_count, v_request_type_id
  FROM public.request_types rt
  WHERE rt.code = v_request.request_type AND rt.is_active = true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;

  SELECT count(*) INTO v_assignment_count
  FROM public.request_type_workflows w
  WHERE w.request_type_id = v_request_type_id AND w.status='active' AND w.is_active=true;
  IF v_assignment_count <> 1 THEN
    RAISE EXCEPTION 'B1_ACTIVE_WORKFLOW_MUST_RESOLVE_ONCE:%', v_assignment_count;
  END IF;
  SELECT w.* INTO v_workflow FROM public.request_type_workflows w
  WHERE w.request_type_id=v_request_type_id AND w.status='active' AND w.is_active=true
  FOR SHARE;

  SELECT count(*), count(*) FILTER (WHERE status='returned')
    INTO v_runtime_count, v_returned_count
  FROM public.student_request_workflow_steps s
  WHERE s.student_request_id=p_request_id;

  IF v_runtime_count > 0 THEN
    IF v_request.status NOT IN ('returned','returned_for_completion') OR v_returned_count <> 1
       OR EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                  WHERE s.student_request_id=p_request_id AND s.status='active') THEN
      RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_STATE_INVALID';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps s
      LEFT JOIN public.request_type_workflow_steps c ON c.id=s.workflow_step_id
      LEFT JOIN public.request_processing_units u ON u.id=s.processing_unit_id
      LEFT JOIN public.request_processing_roles r ON r.id=s.processing_role_id AND r.unit_id=u.id
      LEFT JOIN public.request_processing_assignments a
        ON a.id=(s.metadata->>'direct_assignment_id')::uuid
      WHERE s.student_request_id=p_request_id AND (
        c.id IS NULL OR u.id IS NULL OR r.id IS NULL
        OR s.workflow_id IS DISTINCT FROM v_workflow.id
        OR c.workflow_id IS DISTINCT FROM v_workflow.id
        OR s.step_key IS DISTINCT FROM c.step_key
        OR s.step_order IS DISTINCT FROM c.step_order
        OR NOT public.is_valid_b1_runtime_step_contract(p_canonical_code,s.step_key,u.code,r.code,c.action_type)
        OR num_nonnulls(s.assigned_user_id,s.assigned_staff_profile_id,s.assigned_faculty_profile_id,
             s.assigned_position_assignment_id)<>1
        OR s.assigned_user_id IS DISTINCT FROM a.user_id
        OR s.assigned_staff_profile_id IS DISTINCT FROM a.staff_profile_id
        OR s.assigned_faculty_profile_id IS DISTINCT FROM a.faculty_profile_id
        OR s.assigned_position_assignment_id IS DISTINCT FROM a.position_assignment_id
        OR NOT public.is_valid_b1_direct_assignment((s.metadata->>'direct_assignment_id')::uuid,
             CASE WHEN s.step_key='source_department_head_approval' THEN
               (SELECT d.current_department_id FROM public.transfer_request_details d WHERE d.request_id=p_request_id)
             WHEN s.step_key='target_department_head_approval' THEN
               (SELECT d.requested_department_id FROM public.transfer_request_details d WHERE d.request_id=p_request_id)
             ELSE NULL END,
             s.step_key IN ('source_department_head_approval','target_department_head_approval'))
      )) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_CONTRACT_INVALID'; END IF;
    IF v_runtime_count IS DISTINCT FROM (
      SELECT count(*) FROM public.request_type_workflow_steps c WHERE c.workflow_id=v_workflow.id
    ) OR EXISTS (
      SELECT 1 FROM public.request_type_workflow_steps c
      WHERE c.workflow_id=v_workflow.id AND NOT EXISTS (
        SELECT 1 FROM public.student_request_workflow_steps s
        WHERE s.student_request_id=p_request_id AND s.workflow_step_id=c.id
          AND s.step_key=c.step_key AND s.step_order=c.step_order
      )
    ) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_COVERAGE_INVALID'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.student_request_workflow_steps returned_step
      JOIN public.student_request_workflow_steps other
        ON other.student_request_id=returned_step.student_request_id AND other.id<>returned_step.id
      WHERE returned_step.student_request_id=p_request_id AND returned_step.status='returned'
        AND ((other.step_order<returned_step.step_order AND other.status NOT IN ('completed','skipped'))
          OR (other.step_order>returned_step.step_order AND other.status IS DISTINCT FROM 'pending')
          OR other.status IN ('rejected','cancelled'))
    ) THEN RAISE EXCEPTION 'B1_RUNTIME_RESUBMIT_SEQUENCE_INVALID'; END IF;
    UPDATE public.student_request_workflow_steps
    SET status='active', entered_at=now(),completed_at=NULL,completed_by=NULL,
      decision=NULL,comment=NULL,updated_at=now()
    WHERE student_request_id=p_request_id AND status='returned'
    RETURNING id INTO v_active_step_id;
    RETURN jsonb_build_object('initialized',false,'resumed',true,'active_step_id',v_active_step_id);
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
    IF NOT FOUND OR NOT public.is_valid_b1_runtime_step_contract(
      p_canonical_code,v_config.step_key,v_unit_code,v_role_code,v_config.action_type
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
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,v_department_id IS NOT NULL);
    IF v_assignment_count <> 1 THEN
      RAISE EXCEPTION 'B1_DIRECT_ASSIGNMENT_MUST_RESOLVE_ONCE:%:%',v_config.step_key,v_assignment_count;
    END IF;
    SELECT a.* INTO v_assignment FROM public.request_processing_assignments a
    WHERE a.unit_id=v_config.processing_unit_id AND a.role_id=v_config.processing_role_id
      AND a.is_active=true AND (a.starts_at IS NULL OR a.starts_at<=now())
      AND (a.ends_at IS NULL OR a.ends_at>now())
      AND (v_department_id IS NULL OR a.department_id=v_department_id)
      AND public.is_valid_b1_direct_assignment(a.id,v_department_id,v_department_id IS NOT NULL)
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
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_b1_request_workflow_strict(uuid,text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_b1_student_request_atomic(
  p_request_id uuid,
  p_canonical_code text,
  p_form_data jsonb,
  p_expected_updated_at timestamptz,
  p_attachment_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_request public.student_requests%ROWTYPE;
  v_profile_id uuid;
  v_profile_status text;
  v_init jsonb;
  v_request_type public.request_types%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT c.profile_id,c.profile_status INTO v_profile_id,v_profile_status
  FROM public.current_student_profile_for_auth() c;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'ACTIVE_STUDENT_PROFILE_REQUIRED' USING ERRCODE='42501'; END IF;

  SELECT r.* INTO v_request FROM public.student_requests r
  WHERE r.id=p_request_id AND r.student_profile_id=v_profile_id
    AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_OWNED_SUBMITTABLE_REQUEST_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_expected_updated_at IS NULL OR v_request.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'B1_STALE_REQUEST_VERSION' USING ERRCODE='40001';
  END IF;
  SELECT rt.* INTO v_request_type FROM public.request_types rt
  WHERE rt.code=v_request.request_type AND rt.is_active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'B1_ACTIVE_REQUEST_TYPE_REQUIRED'; END IF;
  PERFORM public.assert_student_can_use_request_type(v_profile_status,v_request_type.request_audience);

  -- This dispatcher validates trusted references, service rules, attachments,
  -- and writes details. Its default implementation above always fails closed.
  PERFORM public.persist_validated_b1_request_details(
    p_request_id,p_canonical_code,COALESCE(p_form_data,'{}'::jsonb),COALESCE(p_attachment_ids,ARRAY[]::uuid[])
  );
  v_init := public.initialize_b1_request_workflow_strict(p_request_id,p_canonical_code);

  PERFORM set_config('b1.atomic_submit','1',true);
  PERFORM set_config('student_request.submit_via_rpc','1',true);
  UPDATE public.student_requests SET status='submitted',submitted_at=COALESCE(submitted_at,now()),
    rejection_reason=NULL,updated_at=now() WHERE id=p_request_id;
  INSERT INTO public.student_request_workflow_events(student_request_id,event_type,actor_user_id,payload,visible_to_student)
  VALUES(p_request_id,'submitted',v_uid,jsonb_build_object('canonical_code',p_canonical_code),true);
  RETURN jsonb_build_object('success',true,'request_id',p_request_id,'workflow',v_init);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])
  TO authenticated;

CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(
  p_step_id uuid,p_action text,p_comment text DEFAULT NULL,p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE; v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_result text; v_next_id uuid; v_transition_count integer; v_request_type text; v_canonical text;
BEGIN
  PERFORM set_config('b1.atomic_action','1',true);
  LOCK TABLE public.request_type_workflow_transitions IN SHARE MODE;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE='28000'; END IF;
  SELECT s.* INTO v_step FROM public.student_request_workflow_steps s WHERE s.id=p_step_id FOR UPDATE;
  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_REQUIRED'; END IF;
  SELECT r.request_type INTO v_request_type FROM public.student_requests r WHERE r.id=v_step.student_request_id FOR UPDATE;
  v_canonical:=CASE v_request_type WHEN 'absence_excuse' THEN 'excused_absence' WHEN 'transfer' THEN 'department_transfer'
    WHEN 'extra_chance' THEN 'final_chance' ELSE v_request_type END;
  IF v_canonical NOT IN ('enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal')
    THEN RAISE EXCEPTION 'B1_REQUEST_REQUIRED'; END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id,p_action) THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id=v_step.workflow_step_id FOR SHARE;
  IF v_config.action_type IS DISTINCT FROM p_action THEN RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id=v_step.student_request_id AND prior.step_order<v_step.step_order
      AND prior.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  IF p_action IN ('confirm_payment','issue_document','sign') THEN RAISE EXCEPTION 'B1_SPECIALIZED_ACTION_RPC_REQUIRED'; END IF;
  IF COALESCE(p_payload,'{}'::jsonb)<>'{}'::jsonb THEN RAISE EXCEPTION 'B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN'; END IF;
  v_result:=CASE p_action WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
    WHEN 'clear' THEN 'cleared' WHEN 'apply_decision' THEN 'applied' WHEN 'archive' THEN 'archived'
    WHEN 'reject' THEN 'reject' WHEN 'return' THEN 'return' ELSE NULL END;
  IF v_result IS NULL THEN RAISE EXCEPTION 'B1_ACTION_NOT_SUPPORTED'; END IF;
  IF p_action IN ('reject','return') AND COALESCE(btrim(p_comment),'')='' THEN RAISE EXCEPTION 'B1_COMMENT_REQUIRED'; END IF;
  SELECT count(*) INTO v_transition_count FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id=v_step.workflow_id AND t.from_step_id=v_step.workflow_step_id AND t.action_result=v_result;
  IF v_transition_count<>1 THEN RAISE EXCEPTION 'B1_TRANSITION_MUST_RESOLVE_ONCE:%',v_transition_count; END IF;
  SELECT t.* INTO v_transition FROM public.request_type_workflow_transitions t
    WHERE t.workflow_id=v_step.workflow_id AND t.from_step_id=v_step.workflow_step_id AND t.action_result=v_result FOR SHARE;
  IF v_transition.to_step_id IS NOT NULL THEN
    SELECT count(*),(array_agg(s.id ORDER BY s.id))[1] INTO v_transition_count,v_next_id
    FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id
      AND s.workflow_step_id=v_transition.to_step_id AND s.status='pending';
    IF v_transition_count<>1 THEN RAISE EXCEPTION 'B1_NEXT_RUNTIME_STEP_MUST_RESOLVE_ONCE:%',v_transition_count; END IF;
  END IF;
  UPDATE public.student_request_workflow_steps SET status=CASE p_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE 'completed' END,decision=CASE p_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE v_result END,comment=p_comment,completed_by=v_uid,completed_at=now(),updated_at=now()
    WHERE id=v_step.id;
  IF v_next_id IS NOT NULL THEN UPDATE public.student_request_workflow_steps SET status='active',entered_at=now(),updated_at=now()
    WHERE id=v_next_id AND status='pending'; END IF;
  IF (SELECT count(*) FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id AND s.status='active')
     <> CASE WHEN v_next_id IS NULL THEN 0 ELSE 1 END THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_INVARIANT_FAILED'; END IF;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,
    actor_unit_id,actor_role_id,message_ar,payload,visible_to_student)
  VALUES(v_step.student_request_id,v_step.id,CASE p_action WHEN 'reject' THEN 'rejected' WHEN 'return' THEN 'returned'
    ELSE v_result END,v_uid,v_step.processing_unit_id,v_step.processing_role_id,p_comment,
    jsonb_build_object('action',p_action,'action_result',v_result,'transition_id',v_transition.id),true);
  IF v_next_id IS NULL THEN UPDATE public.student_requests SET status=CASE p_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned_for_completion' ELSE 'completed' END,updated_at=now(),completed_at=CASE
      WHEN p_action='return' THEN completed_at ELSE now() END WHERE id=v_step.student_request_id;
  ELSE UPDATE public.student_requests SET status='in_review',updated_at=now() WHERE id=v_step.student_request_id; END IF;
  RETURN jsonb_build_object('success',true,'step_id',v_step.id,'action_result',v_result,
    'next_step_id',v_next_id,'transition_applied',true);
END;
$$;

REVOKE ALL ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)
  TO authenticated;

-- B1 callers must use the strict wrappers. Non-B1 compatibility remains on the
-- legacy RPCs until a separately reviewed global cutover exists.
COMMENT ON FUNCTION public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[]) IS
  'Atomic B1 submit: details validation/write, strict direct-assignment runtime creation, then request submit.';
COMMENT ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) IS
  'Atomic B1 action: lock, authorize direct assignee, resolve exactly one transition, then mutate.';

COMMIT;
