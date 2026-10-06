-- B1-PAID-SERVICES-REGISTRAR-FEE-DECISION-01 — production POST-APPLY verification.
-- READ-ONLY: one SELECT, no writes. Returns ONE row; the apply is good only when
-- `applied_correctly` is true.
WITH svc(code, dean_key) AS (VALUES ('department_transfer', 'dean_approval'), ('final_chance', 'dean_decision')),
wf AS (
  SELECT s.code AS service, s.dean_key, w.*
  FROM svc s
  JOIN public.request_types rt ON rt.code = s.code
  JOIN public.request_type_workflows w ON w.request_type_id = rt.id AND w.status = 'active' AND w.is_active
),
shape AS (
  SELECT wf.service, wf.code, wf.version, wf.published_at,
    (SELECT string_agg(s.step_key || ':' || u.code || '/' || r.code || ':' || s.action_code
                         || CASE WHEN s.can_skip THEN '*' ELSE '' END, '>' ORDER BY s.step_order)
       FROM public.request_type_workflow_steps s
       JOIN public.request_processing_units u ON u.id = s.processing_unit_id
       JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
      WHERE s.workflow_id = wf.id
        AND s.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                              WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || ':dean/dean:APPROVE>registrar_fee_decision:registrar/registrar_general:REVIEW'
        || '>payment_confirmation:finance/revenue_finance_officer:PAYMENT_CONFIRMATION*'
        || '>registrar_apply:registrar/registrar_general:'
        || CASE wf.service WHEN 'department_transfer' THEN 'APPLY_DEPARTMENT_TRANSFER' ELSE 'APPLY_FINAL_CHANCE' END
      AS tail_steps_exact,
    (SELECT string_agg(s.step_key, '>' ORDER BY s.step_order) FROM public.request_type_workflow_steps s
      WHERE s.workflow_id = wf.id)
      = (SELECT string_agg(k, '>' ORDER BY o) FROM (
           SELECT o.step_key AS k, o.step_order * 10 AS o
           FROM public.request_type_workflow_steps o
           JOIN public.request_type_workflows ow ON ow.id = o.workflow_id
             AND ow.request_type_id = wf.request_type_id AND ow.code = wf.code AND ow.version = wf.version - 1
           UNION ALL
           SELECT 'registrar_fee_decision', o.step_order * 10 - 5
           FROM public.request_type_workflow_steps o
           JOIN public.request_type_workflows ow ON ow.id = o.workflow_id
             AND ow.request_type_id = wf.request_type_id AND ow.code = wf.code AND ow.version = wf.version - 1
           WHERE o.step_key = 'payment_confirmation') x) AS previous_steps_kept_in_order,
    (SELECT string_agg(fs.step_key || '-' || t.action_result || '-' || COALESCE(ts.step_key, '')
                         || CASE WHEN t.is_default THEN '' ELSE '?' || (t.condition_schema ->> 'code') END, ' '
                       ORDER BY fs.step_order, t.is_default DESC)
       FROM public.request_type_workflow_transitions t
       JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
       LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
      WHERE t.workflow_id = wf.id
        AND fs.step_order >= (SELECT d.step_order FROM public.request_type_workflow_steps d
                               WHERE d.workflow_id = wf.id AND d.step_key = wf.dean_key))
      = wf.dean_key || '-approved-registrar_fee_decision registrar_fee_decision-reviewed-payment_confirmation'
        || ' registrar_fee_decision-reviewed-registrar_apply?B1_FEE_NOT_REQUIRED'
        || ' payment_confirmation-payment_confirmed-registrar_apply registrar_apply-applied-' AS tail_transitions_exact,
    (SELECT count(*) FILTER (WHERE COALESCE(t.condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1
        AND count(*) FILTER (WHERE t.action_result IN ('skip', 'reject', 'return')) = 0
       FROM public.request_type_workflow_transitions t WHERE t.workflow_id = wf.id) AS one_condition_no_skip_edge,
    (SELECT count(*) FROM public.b1_workflow_runtime_contract_snapshot c WHERE c.workflow_id = wf.id)
      = (SELECT count(*) FROM public.request_type_workflow_steps s WHERE s.workflow_id = wf.id) AS contract_pinned,
    EXISTS (SELECT 1 FROM public.request_workflow_publish_validations v WHERE v.workflow_id = wf.id AND v.is_valid)
      AND EXISTS (SELECT 1 FROM public.request_type_workflow_change_log l
                  WHERE l.workflow_id = wf.id AND l.change_kind = 'workflow_published') AS publish_recorded,
    (SELECT count(*) = 1 AND bool_and(o.status = 'retired' AND NOT o.is_active)
       FROM public.request_type_workflows o
      WHERE o.request_type_id = wf.request_type_id AND o.code = wf.code AND o.version = wf.version - 1)
      AS previous_version_retired,
    NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                JOIN public.student_requests r ON r.id = s.student_request_id
                WHERE s.workflow_id = wf.id AND r.submitted_at < wf.published_at) AS no_existing_request_moved
  FROM wf
),
fns(sig, exposed) AS (
  VALUES ('public.b1_fee_decision_step(uuid)', false),
         ('public.guard_b1_request_fee_decision_write()', false),
         ('public.record_b1_fee_decision(uuid,text,text,text,numeric)', true),
         ('public.get_b1_fee_decision(uuid)', true)
),
markers(fn, marker) AS (
  VALUES ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'B1PFD01:fee-decision-required'),
         ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'B1PFD01:fee-not-required-condition'),
         ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook'),
         ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition')
),
checks AS (
  SELECT
    (SELECT count(*) = 2 AND bool_and(code = service || '_external_payment_workflow') FROM shape)
      AS single_active_workflow_per_service,
    (SELECT bool_and(tail_steps_exact) FROM shape) AS fee_step_before_payment_exact,
    (SELECT bool_and(previous_steps_kept_in_order) FROM shape) AS previous_steps_kept_in_order,
    (SELECT bool_and(tail_transitions_exact AND one_condition_no_skip_edge) FROM shape) AS transitions_exact,
    (SELECT bool_and(contract_pinned) FROM shape) AS runtime_contract_pinned,
    (SELECT bool_and(publish_recorded) FROM shape) AS publish_recorded,
    (SELECT bool_and(previous_version_retired) FROM shape) AS previous_versions_retired,
    (SELECT bool_and(no_existing_request_moved) FROM shape) AS no_existing_request_moved_to_new_versions,
    (SELECT count(*) = 1 FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'B1_FEE_NOT_REQUIRED' AND c.is_active) AS fee_condition_in_catalog,
    (SELECT bool_and(to_regprocedure(sig) IS NOT NULL) FROM fns) AS four_new_functions_exist,
    (SELECT bool_and(has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') = exposed
                     AND NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE'))
       FROM fns WHERE to_regprocedure(sig) IS NOT NULL) AS function_exposure_exact,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.b1_request_fee_decisions'))
      AND NOT has_table_privilege('authenticated', to_regclass('public.b1_request_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('anon', to_regclass('public.b1_request_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
      AS fee_decision_table_rls_on_and_not_exposed,
    EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = to_regclass('public.b1_request_fee_decisions')
              AND t.tgname = 'trg_guard_b1_request_fee_decision_write' AND NOT t.tgisinternal)
      AS fee_decision_guard_trigger_exists,
    (SELECT count(*) = 1 AND bool_and(ic.column_name = 'amount_due' AND ic.data_type = 'numeric'
                                      AND ic.numeric_precision = 12 AND ic.numeric_scale = 2)
       FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND ic.table_name = 'b1_request_fee_decisions'
        AND ic.column_name ~* 'amount|currency|price|balance|invoice|receipt')
      AND EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = to_regclass('public.b1_request_fee_decisions')
                    AND k.conname = 'b1_request_fee_decisions_decision_chk' AND k.contype = 'c')
      AS display_only_amount_column_exact,
    (SELECT count(*) = 4 AND bool_and(position(m.marker in pg_get_functiondef(to_regprocedure(m.fn))) > 0)
       FROM markers m) AS patch_markers_present_and_excused_absence_markers_kept,
    (SELECT count(*) = 1 FROM public.request_type_workflows w
      WHERE w.code = 'excused_absence_external_payment_workflow' AND w.status = 'active' AND w.is_active)
      AS excused_absence_workflow_still_active
)
SELECT
  c.*,
  (c.single_active_workflow_per_service AND c.fee_step_before_payment_exact AND c.previous_steps_kept_in_order
   AND c.transitions_exact AND c.runtime_contract_pinned AND c.publish_recorded AND c.previous_versions_retired
   AND c.no_existing_request_moved_to_new_versions AND c.fee_condition_in_catalog AND c.four_new_functions_exist
   AND c.function_exposure_exact AND c.fee_decision_table_rls_on_and_not_exposed
   AND c.fee_decision_guard_trigger_exists AND c.display_only_amount_column_exact
   AND c.patch_markers_present_and_excused_absence_markers_kept AND c.excused_absence_workflow_still_active) IS TRUE
    AS applied_correctly,
  -- informational
  (SELECT array_agg(service || '=' || code || ' v' || version ORDER BY service) FROM shape) AS active_workflows,
  (SELECT count(*) FROM public.b1_request_fee_decisions) AS fee_decisions_recorded,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN wf ON wf.id = s.workflow_id) AS requests_on_the_new_versions,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('department_transfer', 'transfer', 'final_chance', 'extra_chance')
      AND r.status::text NOT IN ('completed', 'rejected', 'cancelled', 'draft')) AS open_requests_of_both_services,
  (SELECT array_agg(rt.code || '=' || rt.student_visible ORDER BY rt.code) FROM public.request_types rt
    WHERE rt.code IN ('department_transfer', 'final_chance')) AS request_types_student_visible,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
