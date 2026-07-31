# PORTAL-B1-PACKAGE66-PRODUCTION-READONLY-PREFLIGHT-71

| field | value |
|---|---|
| mode | PRODUCTION READ-ONLY PREFLIGHT ONLY |
| production project ref | `wpmicqriltrowwonknox` |
| reviewed SHA | `1c8fd5566cbaded7d5cea5a194460e7eaa7983f5` |
| dual review | CURSOR_PASS + CODEX_PASS on reviewed SHA |
| preflight source | `docs/migration-drafts/B1-ATOMIC-RPC-LITERAL-CONFIGURED-ACTION-PRODUCTION-66-PREFLIGHT.sql` |
| executed | 2026-07-30 UTC, SELECT-only |

## Results

1. Production ref = `wpmicqriltrowwonknox` — PASS.
2. Migration 66 applied = 0 (no `%LITERAL-CONFIGURED-ACTION%` row) — PASS.
3. Migration head = `20260730000034`; migration_count = 198.
4. Target signature = `act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)` — PASS.
5. Owner = `postgres` — PASS.
6. `SECURITY DEFINER` = true — PASS.
7. `proconfig` = `{search_path=public}` — PASS.
8. ACL = `postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres, sandbox_exec=X/postgres` — PASS.
9. Alias branch present = true; approve-substitution branch present = true (line: `public.b1_map_ui_staff_action(v_config.action_type) = p_action`) — defect reproduced, PASS.
   Mapper source proof (read-only, EXECUTE denied to the read role, source inspected instead):
   `clear -> approve`, `apply_decision -> approve`, `archive -> approve`.
   No `'skip'` action in the executor vocabulary.
10. Readers `get_b1_step_allowed_actions`, `get_b1_assigned_request_details_for_actor`,
    `get_b1_assigned_inbox_for_actor` all publish the alias (pre-migration behavior),
    `SECURITY DEFINER`, `search_path=public, pg_temp` — PASS.
11. Five services `student_visible=false`: enrollment_suspension, excused_absence,
    department_transfer, final_chance, file_withdrawal — PASS.
12. `enrollment_certificate` unchanged (`student_visible=true`, `is_active=true`) — PASS.
13. Expected migration delta after future apply = 1.
14. Expected data delta after future apply = 0.
15. Workflow RPC calls = 0.
16. Production writes = 0 (SELECT only; no DDL/DML/GRANT).
17. Pre-image captured (below).

## Baselines for the post-verifier zero-data-delta assertion

| metric | value |
|---|---|
| supabase_migrations.schema_migrations | 198 |
| student_requests | 70 |
| student_request_workflow_steps | 186 |
| student_request_workflow_events | 203 |
| active runtime steps | 14 |

## Pre-image (forward-only recovery record)

`definition_md5` = `19b45767490b4a1312e4f56e8db352ee`, length = 6721 chars.

```sql
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
  v_action := p_action;
  IF v_config.action_type IS NOT NULL
     AND p_action IS DISTINCT FROM v_config.action_type
     AND public.b1_map_ui_staff_action(v_config.action_type) = p_action THEN
    v_action := v_config.action_type;
  END IF;
  IF NOT public.can_current_user_act_on_step(p_step_id,v_action) THEN
    RAISE EXCEPTION 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED' USING ERRCODE='42501'; END IF;
  IF v_config.action_type IS DISTINCT FROM v_action THEN RAISE EXCEPTION 'B1_ACTION_TYPE_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.student_request_workflow_steps prior
    WHERE prior.student_request_id=v_step.student_request_id AND prior.step_order<v_step.step_order
      AND prior.status NOT IN ('completed','skipped')) THEN RAISE EXCEPTION 'B1_PREDECESSOR_INCOMPLETE'; END IF;
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
$function$
```

## Deviation note

`P3_folded_actions` could not be executed as written: the read-only session role lacks
EXECUTE on `public.b1_map_ui_staff_action`. The same fact was proven read-only from
`pg_proc.prosrc` of the mapper (quoted above), which is strictly equivalent evidence and
required no privilege change. No GRANT was requested or performed.

## Stop conditions

None triggered.

## Decision

`PASS_B1_PACKAGE66_PRODUCTION_READONLY_PREFLIGHT_READY_FOR_SINGLE_MIGRATION_APPLY`
