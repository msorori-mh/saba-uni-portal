-- PORTAL-B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-MIGRATION-PACKAGE-66
-- FORWARD-ONLY PRODUCTION MIGRATION — PREPARED, **NOT APPLIED** IN THIS TASK.
-- Apply only after independent review and a separate explicit authorization.
--
-- PURPOSE
--   Close HOLD_B1_PRODUCTION_ATOMIC_RPC_LITERAL_CONFIGURED_ACTION_ENFORCEMENT_REQUIRED.
--   Production `public.act_on_b1_student_request_step_atomic` currently rewrites a
--   generic 'approve' into the configured action through
--   `public.b1_map_ui_staff_action(...)`, so the exact direct assignee of a step
--   configured as clear / apply_decision / archive can execute it by sending
--   'approve'. This migration removes that alias path: p_action MUST equal the
--   configured `request_type_workflow_steps.action_type` literally.
--
-- NO ALIAS EXCEPTION EXISTS
--   The B1 action vocabulary is closed: review, approve, clear, apply_decision,
--   archive, return, reject (+ specialized confirm_payment / issue_document / sign,
--   which are rejected here and executed by their dedicated RPCs). There is no
--   'skip' action in the source contract — 'skipped' is a runtime STEP STATUS only
--   (predecessor tolerance), never a caller-supplied action. Therefore this
--   migration introduces NO alias exception whatsoever.
--
-- READER CONSISTENCY (same migration, mandatory)
--   `get_b1_step_allowed_actions`, `get_b1_assigned_request_details_for_actor` and
--   `get_b1_assigned_inbox_for_actor` currently PUBLISH the aliased 'approve' for
--   clear / apply_decision / archive steps. Enforcing literal input without
--   correcting the published action would make legitimate assignees unable to act.
--   They are updated to publish the literal configured action_type.
--
-- PRESERVED, UNCHANGED
--   * signature  public.act_on_b1_student_request_step_atomic(uuid, text, text, jsonb) -> jsonb
--   * owner      postgres (CREATE OR REPLACE preserves owner)
--   * SECURITY DEFINER, LANGUAGE plpgsql, SET search_path
--       - act_on_b1_student_request_step_atomic : search_path = public
--       - the three reader functions             : search_path = public, pg_temp
--   * grants/ACL {postgres=X, authenticated=X, service_role=X, sandbox_exec=X}
--     (CREATE OR REPLACE does not reset ACL; asserted below)
--   * every existing correct contract: auth requirement, FOR UPDATE locking,
--     transition SHARE lock, direct-assignee authorization, predecessor guard,
--     specialized-action rejection, payload rejection, comment requirement,
--     unique transition resolution, active-step invariant, academic effects,
--     event emission, request status transitions.
--
-- EXPECTED DELTA
--   migration count delta = 1 (this file)     data delta = 0 rows
--   request_types.student_visible : UNCHANGED (five B1 services remain false)
--   enrollment_certificate        : UNTOUCHED (not a B1 canonical service)
--   no workflow RPC executed, no deploy, no DML.
--
-- STOP / ROLLBACK
--   Single transaction. Any assertion failure aborts the whole migration; a
--   partial apply is impossible. If the transaction aborts, nothing changed —
--   re-run after remediation. Recovery from a bad apply is forward-only
--   (re-CREATE OR REPLACE from the captured pre-image in the preflight output).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Pre-conditions (fail closed before any DDL)
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE v_acl text; v_owner text; v_cfg text[];
BEGIN
  IF to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'B1_66_TARGET_FUNCTION_MISSING';
  END IF;
  SELECT pg_get_userbyid(p.proowner), p.proacl::text, p.proconfig
    INTO v_owner, v_acl, v_cfg
  FROM pg_proc p WHERE p.oid='public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;
  IF v_owner <> 'postgres' THEN RAISE EXCEPTION 'B1_66_UNEXPECTED_OWNER:%', v_owner; END IF;
  IF NOT (v_cfg @> ARRAY['search_path=public']) THEN RAISE EXCEPTION 'B1_66_UNEXPECTED_SEARCH_PATH:%', v_cfg; END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' THEN RAISE EXCEPTION 'B1_66_UNEXPECTED_ACL:%', v_acl; END IF;
  FOR v_owner IN SELECT unnest(ARRAY[
      'public.get_b1_step_allowed_actions(uuid)',
      'public.get_b1_assigned_request_details_for_actor(uuid)',
      'public.get_b1_assigned_inbox_for_actor(integer,integer)'])
  LOOP
    IF to_regprocedure(v_owner) IS NULL THEN RAISE EXCEPTION 'B1_66_READER_MISSING:%', v_owner; END IF;
  END LOOP;
END
$pre$;

-- ---------------------------------------------------------------------------
-- 1. Atomic executor — literal configured action enforcement
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.act_on_b1_student_request_step_atomic(p_step_id uuid, p_action text, p_comment text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_step public.student_request_workflow_steps%ROWTYPE;
  v_config public.request_type_workflow_steps%ROWTYPE; v_transition public.request_type_workflow_transitions%ROWTYPE;
  v_result text; v_next_id uuid; v_transition_count integer; v_request_type text; v_canonical text;
  v_action text;
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
  SELECT c.* INTO v_config FROM public.request_type_workflow_steps c WHERE c.id=v_step.workflow_step_id FOR SHARE;
  -- B1 LITERAL ACTION CONTRACT (66): the caller MUST send the configured
  -- action_type verbatim. The former UI-compatibility translation
  -- (the legacy UI-action mapper folded action_type onto p_action) allowed 'approve'
  -- to stand in for clear / apply_decision / archive and is removed. No alias,
  -- no fallback, no exception.
  --
  -- AUTHORIZATION BEFORE ACTION ORACLE (68): the literal-action comparison is
  -- evaluated ONLY after the caller has fully passed authorization for this
  -- runtime step. Authorization is probed with the CONFIGURED action_type — never
  -- with the caller-supplied p_action — so an unauthorized principal can neither
  -- learn the configured action from the error text nor reach the mismatch branch.
  v_action := p_action;
  IF NOT public.can_current_user_act_on_step(p_step_id, COALESCE(v_config.action_type,'')) THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id=v_step.student_request_id AND prior.step_order<v_step.step_order
      AND prior.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
  -- authorized assignee only from here on: literal configured-action enforcement
  IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN
    RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH' USING ERRCODE='42501';
  END IF;
  IF v_action IN ('confirm_payment','issue_document','sign') THEN RAISE EXCEPTION 'B1_SPECIALIZED_ACTION_RPC_REQUIRED'; END IF;

  IF COALESCE(p_payload,'{}'::jsonb)<>'{}'::jsonb THEN RAISE EXCEPTION 'B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN'; END IF;
  v_result:=CASE v_action WHEN 'review' THEN 'reviewed' WHEN 'approve' THEN 'approved'
    WHEN 'clear' THEN 'cleared' WHEN 'apply_decision' THEN 'applied' WHEN 'archive' THEN 'archived'
    WHEN 'reject' THEN 'reject' WHEN 'return' THEN 'return' ELSE NULL END;
  IF v_result IS NULL THEN RAISE EXCEPTION 'B1_ACTION_NOT_SUPPORTED'; END IF;
  IF v_action IN ('reject','return') AND COALESCE(btrim(p_comment),'')='' THEN RAISE EXCEPTION 'B1_COMMENT_REQUIRED'; END IF;
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
  UPDATE public.student_request_workflow_steps SET status=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE 'completed' END,decision=CASE v_action WHEN 'reject' THEN 'rejected'
    WHEN 'return' THEN 'returned' ELSE v_result END,comment=p_comment,completed_by=v_uid,completed_at=now(),updated_at=now()
    WHERE id=v_step.id;
  -- File withdrawal becomes effective at registrar apply, before archive is activated.
  IF v_next_id IS NOT NULL AND v_action='apply_decision' AND v_canonical='file_withdrawal'
     AND EXISTS (SELECT 1 FROM public.student_request_workflow_steps next_step
       JOIN public.request_type_workflow_steps next_config ON next_config.id=next_step.workflow_step_id
       WHERE next_step.id=v_next_id AND next_config.step_key='archive') THEN
    PERFORM public.apply_b1_academic_effect_for_request(v_step.student_request_id);
  END IF;
  IF v_next_id IS NOT NULL THEN UPDATE public.student_request_workflow_steps SET status='active',entered_at=now(),updated_at=now()
    WHERE id=v_next_id AND status='pending'; END IF;
  IF (SELECT count(*) FROM public.student_request_workflow_steps s WHERE s.student_request_id=v_step.student_request_id AND s.status='active')
     <> (CASE WHEN v_next_id IS NULL THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'B1_ACTIVE_STEP_INVARIANT_FAILED'; END IF;
  INSERT INTO public.student_request_workflow_events(student_request_id,workflow_step_runtime_id,event_type,actor_user_id,
    actor_unit_id,actor_role_id,message_ar,payload,visible_to_student)
  VALUES(v_step.student_request_id,v_step.id,CASE v_action WHEN 'reject' THEN 'rejected' WHEN 'return' THEN 'returned'
    ELSE v_result END,v_uid,v_step.processing_unit_id,v_step.processing_role_id,p_comment,
    jsonb_build_object('action',v_action,'action_result',v_result,'transition_id',v_transition.id),true);
  IF v_next_id IS NULL THEN
    UPDATE public.student_requests SET status=CASE v_action WHEN 'reject' THEN 'rejected'
      WHEN 'return' THEN 'returned_for_completion' ELSE 'completed' END,updated_at=now(),completed_at=CASE
        WHEN v_action='return' THEN completed_at ELSE now() END WHERE id=v_step.student_request_id;
    IF v_action='apply_decision' THEN
      PERFORM public.apply_b1_academic_effect_for_request(v_step.student_request_id);
    END IF;
  ELSE
    UPDATE public.student_requests SET status='in_review',updated_at=now() WHERE id=v_step.student_request_id;
  END IF;
  RETURN jsonb_build_object('success',true,'step_id',v_step.id,'action_result',v_result,
    'next_step_id',v_next_id,'transition_applied',true);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Reader: single-step allowed actions — publish the LITERAL configured action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_b1_step_allowed_actions(p_step_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_step public.student_request_workflow_steps%rowtype;
  v_cfg public.request_type_workflow_steps%rowtype;
  v_req public.student_requests%rowtype;
  v_primary text;
  v_actions jsonb := '[]'::jsonb;
  v_raw text;
begin
  v_uid := public.b1_require_auth_uid();
  select * into v_step from public.student_request_workflow_steps where id = p_step_id;
  if v_step.id is null then
    perform public.b1_deny_read();
  end if;
  select * into v_req from public.student_requests where id = v_step.student_request_id;
  if not public.b1_is_five_service_type(v_req.request_type) then
    perform public.b1_deny_read();
  end if;
  if v_step.status is distinct from 'active' or not public.user_matches_workflow_runtime_step(p_step_id) then
    perform public.b1_deny_read();
  end if;
  select * into v_cfg from public.request_type_workflow_steps where id = v_step.workflow_step_id;
  v_raw := coalesce(v_cfg.action_type, 'review');
  -- LITERAL CONTRACT (66): publish exactly what the executor will accept.
  v_primary := v_raw;

  if public.can_current_user_act_on_step(p_step_id, v_raw) then
    v_actions := v_actions || jsonb_build_array(v_primary);
  end if;

  if coalesce(v_cfg.can_return_to_student, false) then
    if public.can_current_user_act_on_step(p_step_id, 'return') then
      v_actions := v_actions || jsonb_build_array('return');
    end if;
  end if;
  if coalesce(v_cfg.can_reject, false) then
    if public.can_current_user_act_on_step(p_step_id, 'reject') then
      v_actions := v_actions || jsonb_build_array('reject');
    end if;
  end if;

  return jsonb_build_object(
    'stepId', p_step_id,
    'requestId', v_step.student_request_id,
    'allowedAction', case
      when v_actions ? coalesce(v_primary, '') then v_primary
      else null
    end,
    'allowedActions', v_actions
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Reader: assigned request details — publish the LITERAL configured action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_b1_assigned_request_details_for_actor(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_step public.student_request_workflow_steps%rowtype;
  v_r public.student_requests%rowtype;
  v_sp public.student_profiles%rowtype;
  v_canon text;
  v_title text;
  v_action text;
  v_cfg public.request_type_workflow_steps%rowtype;
  v_summary jsonb;
  v_steps jsonb;
  v_allowed jsonb;
begin
  v_uid := public.b1_require_auth_uid();

  select s.* into v_step
  from public.student_request_workflow_steps s
  join public.student_requests sr on sr.id = s.student_request_id
  where sr.id = p_request_id
    and s.status = 'active'
    and public.b1_is_five_service_type(sr.request_type)
    and public.user_matches_workflow_runtime_step(s.id)
  order by s.step_order
  limit 1;
  if v_step.id is null then
    perform public.b1_deny_read();
  end if;

  select * into v_r from public.student_requests where id = p_request_id;
  select * into v_sp from public.student_profiles where id = v_r.student_profile_id;
  v_canon := public.b1_stored_to_canonical(v_r.request_type);
  select rt.name_ar into v_title from public.request_types rt where rt.code = v_r.request_type;
  select * into v_cfg from public.request_type_workflow_steps where id = v_step.workflow_step_id;
  if public.can_current_user_act_on_step(
    v_step.id,
    coalesce(v_cfg.action_type, 'review')
  ) then
    -- LITERAL CONTRACT (66): no UI alias mapping.
    v_action := coalesce(v_cfg.action_type, 'review');
  else
    v_action := null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('labelAr', e.key, 'valueAr', e.value) order by e.key), '[]'::jsonb)
    into v_summary
  from jsonb_each_text(coalesce(v_r.form_data, '{}'::jsonb)) as e(key, value);

  select coalesce(jsonb_agg(jsonb_build_object(
      'key', s.step_key,
      'labelAr', s.step_name_ar,
      'status', case s.status
        when 'completed' then 'completed'
        when 'active' then 'active'
        when 'pending' then 'pending'
        when 'returned' then 'returned'
        when 'rejected' then 'rejected'
        else 'pending'
      end,
      'actedAt', s.completed_at
    ) order by s.step_order), '[]'::jsonb)
    into v_steps
  from public.student_request_workflow_steps s
  where s.student_request_id = v_r.id;

  select coalesce(jsonb_agg(x.act), '[]'::jsonb) into v_allowed
  from (
    select v_action as act where v_action is not null
    union all
    select 'return'
    where coalesce(v_cfg.can_return_to_student, false)
      and public.can_current_user_act_on_step(v_step.id, 'return')
    union all
    select 'reject'
    where coalesce(v_cfg.can_reject, false)
      and public.can_current_user_act_on_step(v_step.id, 'reject')
  ) x;

  return jsonb_build_object(
    'requestId', v_r.id,
    'stepId', v_step.id,
    'requestNumber', coalesce(v_r.request_number,''),
    'serviceCode', v_canon,
    'serviceTitleAr', coalesce(v_title, v_canon),
    'studentNameAr', v_sp.full_name_ar,
    'studentNumber', v_sp.academic_number,
    'stepKey', v_step.step_key,
    'stepLabelAr', v_step.step_name_ar,
    'allowedAction', v_action,
    'allowedActions', v_allowed,
    'submittedAt', v_r.submitted_at,
    'formDataSummary', v_summary,
    'attachments', public.b1_list_attachment_metas_for_request(v_r.id),
    'steps', v_steps,
    'updatedAt', v_r.updated_at
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Reader: assigned inbox — publish the LITERAL configured action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_b1_assigned_inbox_for_actor(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_lim int;
  v_off int;
  v_rows jsonb;
begin
  v_uid := public.b1_require_auth_uid();
  v_lim := greatest(least(coalesce(p_limit,50),200),1);
  v_off := greatest(coalesce(p_offset,0),0);

  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
    into v_rows
  from (
    select
      sr.id as "requestId",
      s.id as "stepId",
      coalesce(sr.request_number,'') as "requestNumber",
      public.b1_stored_to_canonical(sr.request_type) as "serviceCode",
      coalesce(rt.name_ar, sr.request_type) as "serviceTitleAr",
      sp.full_name_ar as "studentNameAr",
      sp.academic_number as "studentNumber",
      s.step_key as "stepKey",
      s.step_name_ar as "stepLabelAr",
      case
        when public.can_current_user_act_on_step(
          s.id,
          coalesce(cfg.action_type, 'review')
        )
        -- LITERAL CONTRACT (66): no UI alias mapping.
        then coalesce(cfg.action_type, 'review')
        else null
      end as "allowedAction",
      sr.submitted_at as "submittedAt",
      (
        select coalesce(jsonb_agg(act), '[]'::jsonb)
        from (
          select coalesce(cfg.action_type, 'review') as act
          where public.can_current_user_act_on_step(s.id, coalesce(cfg.action_type, 'review'))
          union all
          select 'return'
          where coalesce(cfg.can_return_to_student, false)
            and public.can_current_user_act_on_step(s.id, 'return')
          union all
          select 'reject'
          where coalesce(cfg.can_reject, false)
            and public.can_current_user_act_on_step(s.id, 'reject')
        ) aa
        where aa.act is not null
      ) as "allowedActions"
    from public.student_request_workflow_steps s
    join public.student_requests sr on sr.id = s.student_request_id
    join public.student_profiles sp on sp.id = sr.student_profile_id
    left join public.request_types rt on rt.code = sr.request_type
    left join public.request_type_workflow_steps cfg
      on cfg.id = s.workflow_step_id
    where s.status = 'active'
      and public.b1_is_five_service_type(sr.request_type)
      and public.user_matches_workflow_runtime_step(s.id)
    order by coalesce(sr.submitted_at, s.created_at) desc
    limit v_lim offset v_off
  ) x;

  return coalesce(v_rows, '[]'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Post-conditions inside the same transaction (abort => zero change)
-- ---------------------------------------------------------------------------
DO $post$
DECLARE v_src text; v_owner text; v_acl text; v_cfg text[]; v_secdef boolean; v_name text;
BEGIN
  SELECT p.prosrc, pg_get_userbyid(p.proowner), p.proacl::text, p.proconfig, p.prosecdef
    INTO v_src, v_owner, v_acl, v_cfg, v_secdef
  FROM pg_proc p WHERE p.oid='public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'::regprocedure;
  IF position('b1_map_ui_staff_action' in v_src) > 0 THEN RAISE EXCEPTION 'B1_66_ALIAS_STILL_PRESENT'; END IF;
  IF position('p_action IS DISTINCT FROM v_config.action_type' in v_src) = 0 THEN
    RAISE EXCEPTION 'B1_66_LITERAL_GUARD_MISSING'; END IF;
  IF NOT v_secdef THEN RAISE EXCEPTION 'B1_66_SECURITY_DEFINER_LOST'; END IF;
  IF v_owner <> 'postgres' THEN RAISE EXCEPTION 'B1_66_OWNER_CHANGED:%', v_owner; END IF;
  IF NOT (v_cfg @> ARRAY['search_path=public']) THEN RAISE EXCEPTION 'B1_66_SEARCH_PATH_CHANGED:%', v_cfg; END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'B1_66_ACL_CHANGED:%', v_acl; END IF;

  FOR v_name IN SELECT unnest(ARRAY[
      'public.get_b1_step_allowed_actions(uuid)',
      'public.get_b1_assigned_request_details_for_actor(uuid)',
      'public.get_b1_assigned_inbox_for_actor(integer,integer)'])
  LOOP
    SELECT p.prosrc, p.prosecdef, p.proconfig INTO v_src, v_secdef, v_cfg
    FROM pg_proc p WHERE p.oid=v_name::regprocedure;
    IF position('b1_map_ui_staff_action' in v_src) > 0 THEN RAISE EXCEPTION 'B1_66_READER_ALIAS_STILL_PRESENT:%', v_name; END IF;
    IF NOT v_secdef THEN RAISE EXCEPTION 'B1_66_READER_SECURITY_DEFINER_LOST:%', v_name; END IF;
    IF NOT (v_cfg @> ARRAY['search_path=public, pg_temp']) THEN
      RAISE EXCEPTION 'B1_66_READER_SEARCH_PATH_CHANGED:%:%', v_name, v_cfg; END IF;
  END LOOP;

  -- protected surfaces untouched
  IF EXISTS (SELECT 1 FROM public.request_types
    WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer',
                   'transfer','final_chance','extra_chance','file_withdrawal')
      AND student_visible IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'B1_66_STUDENT_VISIBLE_MUST_REMAIN_FALSE';
  END IF;
END
$post$;

COMMIT;
