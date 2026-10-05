-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — production PRE-FLIGHT.
-- READ-ONLY: one SELECT, no writes. Mirrors every guard and both patch anchors of
-- docs/migration-drafts/B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01.sql and returns
-- ONE row. Apply the draft only when `ready_to_apply` is true. A missing core
-- relation or function makes the query fail with its name — also a NO-GO.
WITH anchors(fn, marker, anchor) AS (
  VALUES
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'B1PFD01:fee-decision-required',
      'PERFORM public.b1_excused_absence_before_step_action(v_step.id, v_action, p_comment);'),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'B1PFD01:fee-not-required-condition',
      'ELSIF v_code = ''FEE_GREATER_THAN_ZERO'' THEN')
),
anchor_state AS (
  SELECT a.marker, d.def IS NOT NULL AS fn_exists,
         COALESCE(position(a.marker in d.def) > 0, false) AS already_patched,
         CASE WHEN d.def IS NULL THEN 0
              ELSE (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) END AS hits
  FROM anchors a
  LEFT JOIN LATERAL (SELECT pg_get_functiondef(to_regprocedure(a.fn)) AS def) d ON true
),
svc(code, dean_key) AS (VALUES ('department_transfer', 'dean_approval'), ('final_chance', 'dean_decision')),
wf AS (
  SELECT s.code AS service, s.dean_key, w.*
  FROM svc s
  JOIN public.request_types rt ON rt.code = s.code
  JOIN public.request_type_workflows w ON w.request_type_id = rt.id AND w.status = 'active' AND w.is_active
),
shape AS (
  SELECT wf.service, wf.code, wf.version,
    EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
            WHERE s.workflow_id = wf.id AND s.step_key = 'registrar_fee_decision') AS already_published,
    (SELECT string_agg(s.step_key || ':' || s.action_type, '>' ORDER BY s.step_order)
       FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = wf.id
        AND s.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                              WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || ':approve>payment_confirmation:confirm_payment>registrar_apply:apply_decision' AS tail_steps_ok,
    NOT EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                WHERE s.workflow_id = wf.id AND (s.can_skip OR s.action_type = 'assess_fee')) AS no_skip_no_assess_fee,
    (SELECT string_agg(ts.step_key || CASE WHEN t.is_default THEN '' ELSE '?' || (t.condition_schema ->> 'code') END,
                       ' ' ORDER BY t.is_default)
       FROM public.request_type_workflow_transitions t
       JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id AND fs.step_key = wf.dean_key
       JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = wf.id AND t.action_result = 'approved')
      = 'payment_confirmation?FEE_GREATER_THAN_ZERO registrar_apply' AS dean_exits_ok,
    (SELECT count(*) FROM public.request_type_workflow_transitions t
      WHERE t.workflow_id = wf.id AND COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1 AS single_condition,
    EXISTS (SELECT 1 FROM public.request_type_workflows o
            WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code AND o.version = wf.version + 1
              AND o.status = 'retired'
              AND EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                          WHERE s.workflow_id = o.id AND s.step_key = 'registrar_fee_decision')) AS rolled_back_version_waiting,
    wf.version = (SELECT max(o.version) FROM public.request_type_workflows o
                   WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code) AS active_is_latest
  FROM wf
),
checks AS (
  SELECT
    (SELECT bool_and(to_regclass(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.request_types', 'public.request_type_workflows', 'public.request_type_workflow_steps',
      'public.request_type_workflow_transitions', 'public.request_type_workflow_change_log',
      'public.request_workflow_publish_validations', 'public.request_workflow_action_catalog',
      'public.request_workflow_transition_condition_catalog', 'public.request_processing_assignments',
      'public.b1_workflow_runtime_contract_snapshot', 'public.student_requests', 'public.student_profiles',
      'public.student_request_workflow_steps', 'public.student_request_workflow_events',
      'public.notifications', 'public.excused_absence_fee_decisions']) x) AS relations_ok,
    (SELECT bool_and(to_regprocedure(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
      'public.evaluate_workflow_transition_condition(uuid,jsonb)',
      'public.can_current_user_act_on_step(uuid,text)', 'public.user_matches_workflow_runtime_step(uuid)',
      'public.is_valid_b1_direct_assignment(uuid,uuid,boolean)',
      'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
      'public.validate_request_workflow_publish(uuid)',
      'public.create_notification(uuid,text,text,text,text,uuid)',
      'public.b1_excused_absence_before_step_action(uuid,text,text)']) x) AS functions_ok,
    position('EAWF01:before-step-action-hook' in pg_get_functiondef(
      to_regprocedure('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'))) > 0
      AS excused_absence_package_applied,
    (SELECT bool_and(fn_exists AND (already_patched OR hits = 1)) FROM anchor_state) AS both_patch_anchors_ok,
    (SELECT count(*) = 1 FROM public.request_workflow_action_catalog c
      WHERE c.code = 'REVIEW' AND c.is_active AND c.action_type = 'review' AND c.kind = 'neutral') AS catalog_review_ok,
    (SELECT count(*) = 1 FROM public.request_processing_assignments a
       JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'registrar' AND u.is_active
       JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id
        AND r.code = 'registrar_general' AND r.is_active
      WHERE a.is_active AND (a.starts_at IS NULL OR a.starts_at <= now()) AND (a.ends_at IS NULL OR a.ends_at > now())
        AND public.is_valid_b1_direct_assignment(a.id, NULL, false)) AS single_registrar_direct_assignee,
    NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                WHERE c.code = 'B1_FEE_NOT_REQUIRED' AND NOT c.is_active) AS fee_condition_code_free_or_active,
    (SELECT count(*) = 2 FROM public.request_types rt WHERE rt.code IN ('department_transfer', 'final_chance'))
      AS both_request_types_exist,
    (SELECT count(*) = 2 AND bool_and(code = service || '_external_payment_workflow') FROM wf)
      AS single_active_workflow_per_service,
    (SELECT count(*) = 2 AND bool_and(already_published OR rolled_back_version_waiting OR (tail_steps_ok AND no_skip_no_assess_fee AND dean_exits_ok
                                                             AND single_condition AND active_is_latest)) FROM shape)
      AS workflow_shapes_ok
)
SELECT
  c.*,
  (c.relations_ok AND c.functions_ok AND c.excused_absence_package_applied AND c.both_patch_anchors_ok
   AND c.catalog_review_ok AND c.single_registrar_direct_assignee AND c.fee_condition_code_free_or_active
   AND c.both_request_types_exist AND c.single_active_workflow_per_service AND c.workflow_shapes_ok) IS TRUE
    AS ready_to_apply,
  -- informational (do not block the apply)
  (SELECT count(*) = 2 AND bool_and(already_patched) FROM anchor_state)
    AND (SELECT count(*) = 2 AND bool_and(already_published) FROM shape) AS draft_already_applied,
  (SELECT array_agg(marker || ':' || hits ORDER BY marker) FROM anchor_state
    WHERE NOT (fn_exists AND (already_patched OR hits = 1))) AS failing_anchors,
  (SELECT array_agg(service || '=' || code || ' v' || version ORDER BY service) FROM shape) AS active_workflows,
  (SELECT array_agg(service ORDER BY service) FROM shape
    WHERE NOT (already_published OR rolled_back_version_waiting OR (tail_steps_ok AND no_skip_no_assess_fee AND dean_exits_ok
                                      AND single_condition AND active_is_latest))) AS services_with_unexpected_shape,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN wf ON wf.id = s.workflow_id) AS requests_on_the_active_versions,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('department_transfer', 'transfer', 'final_chance', 'extra_chance')
      AND r.status::text NOT IN ('completed', 'rejected', 'cancelled', 'draft')) AS open_requests_of_both_services,
  (SELECT array_agg(rt.code || '=' || rt.student_visible ORDER BY rt.code) FROM public.request_types rt
    WHERE rt.code IN ('department_transfer', 'final_chance')) AS request_types_student_visible,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
