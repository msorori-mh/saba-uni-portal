-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — production POST-APPLY verification.
-- READ-ONLY: one SELECT, no writes. Run it right after the migration, from any
-- SQL console (as the migration owner, so privilege checks are meaningful).
-- Returns ONE row; the apply is good only when `applied_correctly` is true.
WITH rt AS (
  SELECT rt.* FROM public.request_types rt WHERE rt.code = 'excused_absence'
),
wf AS (
  SELECT w.* FROM public.request_type_workflows w JOIN rt ON rt.id = w.request_type_id
),
new_wf AS (
  SELECT * FROM wf WHERE code = 'excused_absence_external_payment_workflow'
),
steps AS (
  SELECT s.*, u.code AS unit_code, r.code AS role_code
  FROM public.request_type_workflow_steps s
  JOIN new_wf ON new_wf.id = s.workflow_id
  JOIN public.request_processing_units u ON u.id = s.processing_unit_id
  JOIN public.request_processing_roles r ON r.id = s.processing_role_id AND r.unit_id = u.id
),
tr AS (
  SELECT t.*, fs.step_key AS from_key, ts.step_key AS to_key
  FROM public.request_type_workflow_transitions t
  JOIN new_wf ON new_wf.id = t.workflow_id
  LEFT JOIN public.request_type_workflow_steps fs ON fs.id = t.from_step_id
  LEFT JOIN public.request_type_workflow_steps ts ON ts.id = t.to_step_id
),
markers(fn, marker) AS (
  VALUES
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:init-student-department-scope'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-student-department-scope'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-restart-at-first-step'),
    ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', 'EAWF01:activation-student-department-scope'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:effect-before-archive'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:step-decision-gate'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:decision-reason-on-request'),
    ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service'),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition'),
    ('public.trg_notify_student_request()', 'EAWF01:notification-service-label')
),
new_functions(sig, exposed) AS (
  VALUES
    ('public.b1_excused_absence_student_department(uuid)', false),
    ('public.b1_excused_absence_paid_cycle_step(uuid)', false),
    ('public.b1_excused_absence_step_decision_allowed(uuid,text)', false),
    ('public.guard_excused_absence_fee_decision_write()', false),
    ('public.b1_excused_absence_before_step_action(uuid,text,text)', false),
    ('public.record_excused_absence_fee_decision(uuid,text,text,text)', true),
    ('public.get_excused_absence_fee_decision(uuid)', true)
),
checks AS (
  SELECT
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active) AS single_active_workflow,
    (SELECT count(*) = 1 AND bool_and(status = 'active' AND is_active AND published_at IS NOT NULL)
       FROM new_wf) AS new_workflow_active,
    (SELECT count(*) >= 1 AND bool_and(status = 'retired' AND NOT is_active)
       FROM wf WHERE code = 'excused_absence_free_workflow') AS free_workflow_retired,
    (SELECT (SELECT version FROM new_wf) = max(version) + 1 FROM wf WHERE code = 'excused_absence_free_workflow')
       AS new_version_follows_the_free_cycle,
    (SELECT array_agg(step_key || ':' || unit_code || '/' || role_code || ':' || action_type || ':' || action_code
                      ORDER BY step_order) FROM steps) = ARRAY[
       'dean_review:dean/dean:review:REVIEW',
       'registrar_fee_referral:registrar/registrar_general:review:REVIEW',
       'payment_confirmation:finance/revenue_finance_officer:confirm_payment:PAYMENT_CONFIRMATION',
       'department_head_signature:department/department_head:approve:APPROVE',
       'dean_signature:dean/dean:approve:APPROVE',
       'student_affairs_manager_signature:student_affairs/student_affairs_manager:approve:APPROVE',
       'record_apply:registrar/registrar_general:apply_decision:REGISTER_EXCUSED_ABSENCE',
       'archive:archive/archive_officer:archive:ARCHIVE'] AS eight_steps_exact,
    (SELECT bool_and(assignment_strategy = 'specific_user'
                     AND config ->> 'authorization' = 'exactly_one_direct_assignee') FROM steps)
       AS every_step_single_direct_assignee,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_skip) FROM steps)
       = ARRAY['payment_confirmation'] AS only_payment_step_skippable,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_reject) FROM steps)
       = ARRAY['dean_review','registrar_fee_referral','department_head_signature','dean_signature',
               'student_affairs_manager_signature'] AS reject_steps_exact,
    (SELECT array_agg(step_key ORDER BY step_order) FILTER (WHERE can_return_to_student) FROM steps)
       = ARRAY['dean_review','registrar_fee_referral'] AS return_steps_exact,
    (SELECT count(*) = 17
        AND count(*) FILTER (WHERE action_result = 'reject' AND to_key IS NULL) = 5
        AND count(*) FILTER (WHERE action_result = 'return' AND to_key IS NULL) = 2
        AND count(*) FILTER (WHERE action_result = 'skip') = 0
        AND count(*) FILTER (WHERE COALESCE(condition_schema, '{}'::jsonb) <> '{}'::jsonb) = 1
        AND count(*) FILTER (WHERE from_key = 'registrar_fee_referral' AND to_key = 'department_head_signature'
                               AND condition_schema ->> 'code' = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED'
                               AND NOT is_default) = 1
        AND count(*) FILTER (WHERE from_key = 'registrar_fee_referral' AND to_key = 'payment_confirmation'
                               AND is_default) = 1
       FROM tr) AS seventeen_transitions_exact,
    (SELECT count(*) = 8 FROM public.b1_workflow_runtime_contract_snapshot c JOIN new_wf ON new_wf.id = c.workflow_id)
       AS runtime_contract_pinned,
    (SELECT count(*) >= 1 FROM public.request_workflow_publish_validations v JOIN new_wf ON new_wf.id = v.workflow_id
      WHERE v.is_valid) AS publish_validation_recorded,
    (SELECT count(*) >= 1 FROM public.request_type_workflow_change_log l JOIN new_wf ON new_wf.id = l.workflow_id
      WHERE l.change_kind = 'workflow_published') AS change_log_recorded,
    (SELECT count(*) = 1 FROM public.request_workflow_transition_condition_catalog c
      WHERE c.code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND c.is_active) AS fee_condition_in_catalog,
    (SELECT bool_and(to_regprocedure(sig) IS NOT NULL) FROM new_functions) AS seven_new_functions_exist,
    (SELECT bool_and(has_function_privilege('authenticated', to_regprocedure(sig), 'EXECUTE') = exposed
                     AND NOT has_function_privilege('anon', to_regprocedure(sig), 'EXECUTE'))
       FROM new_functions WHERE to_regprocedure(sig) IS NOT NULL) AS function_exposure_exact,
    (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid = to_regclass('public.excused_absence_fee_decisions'))
       AS fee_decision_table_rls_enabled,
    (SELECT NOT has_table_privilege('authenticated', to_regclass('public.excused_absence_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE')
        AND NOT has_table_privilege('anon', to_regclass('public.excused_absence_fee_decisions'), 'SELECT,INSERT,UPDATE,DELETE'))
       AS fee_decision_table_not_exposed,
    EXISTS (SELECT 1 FROM pg_trigger t
            WHERE t.tgrelid = to_regclass('public.excused_absence_fee_decisions')
              AND t.tgname = 'trg_guard_excused_absence_fee_decision_write' AND NOT t.tgisinternal)
       AS fee_decision_guard_trigger_exists,
    (SELECT count(*) = 11 AND bool_and(position(m.marker in pg_get_functiondef(to_regprocedure(m.fn))) > 0)
       FROM markers m) AS eleven_patch_markers_present,
    NOT EXISTS (SELECT 1 FROM public.student_request_workflow_steps s
                JOIN new_wf ON new_wf.id = s.workflow_id
                JOIN public.student_requests r ON r.id = s.student_request_id
                WHERE r.submitted_at < new_wf.published_at
                  AND r.status::text NOT IN ('returned','returned_for_completion'))
       AS no_existing_request_moved_to_new_cycle
)
SELECT
  c.*,
  (c.single_active_workflow AND c.new_workflow_active AND c.free_workflow_retired
   AND c.new_version_follows_the_free_cycle AND c.eight_steps_exact AND c.every_step_single_direct_assignee
   AND c.only_payment_step_skippable AND c.reject_steps_exact AND c.return_steps_exact
   AND c.seventeen_transitions_exact AND c.runtime_contract_pinned AND c.publish_validation_recorded
   AND c.change_log_recorded AND c.fee_condition_in_catalog AND c.seven_new_functions_exist
   AND c.function_exposure_exact AND c.fee_decision_table_rls_enabled AND c.fee_decision_table_not_exposed
   AND c.fee_decision_guard_trigger_exists AND c.eleven_patch_markers_present
   AND c.no_existing_request_moved_to_new_cycle) IS TRUE AS applied_correctly,
  -- ---- informational --------------------------------------------------------
  (SELECT code || ' v' || version FROM wf WHERE status = 'active' AND is_active) AS active_workflow,
  (SELECT student_visible FROM rt) AS request_type_student_visible,
  (SELECT count(*) FROM public.excused_absence_fee_decisions) AS fee_decisions_recorded,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('excused_absence','absence_excuse')
      AND r.status::text NOT IN ('completed','rejected','cancelled','draft')) AS open_requests_of_this_service,
  (SELECT count(DISTINCT s.student_request_id) FROM public.student_request_workflow_steps s
     JOIN new_wf ON new_wf.id = s.workflow_id) AS requests_on_the_new_cycle,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
