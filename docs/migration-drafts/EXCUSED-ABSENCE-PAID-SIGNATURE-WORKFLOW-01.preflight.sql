-- EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01 — production PRE-FLIGHT.
-- READ-ONLY: one SELECT, no writes, no locks beyond ordinary reads. Safe to
-- run from any SQL console. It mirrors every guard of
-- docs/migration-drafts/EXCUSED-ABSENCE-PAID-SIGNATURE-WORKFLOW-01.sql and
-- returns ONE row. Apply the draft only when `ready_to_apply` is true.
--
-- If a relation or function the draft needs does not exist at all, this query
-- fails with the missing object's name instead of returning a row — that is
-- also a NO-GO.
--
-- The anchor list below is generated from the draft; a test keeps both in sync.
WITH anchors(fn, marker, anchor) AS (
  VALUES
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:init-student-department-scope',
      'ELSIF v_is_p1 THEN'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-student-department-scope',
      'ELSE public.p1_runtime_step_department_scope(p_canonical_code,s.step_key,p_request_id) END'),
    ('public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)', 'EAWF01:activation-student-department-scope',
      'IF v_canonical = ''department_transfer'''),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:effect-before-archive',
      'v_action=''apply_decision'' AND v_canonical=''file_withdrawal'''),
    ('public.record_external_university_payment_confirmation(uuid,text)', 'EAWF01:external-payment-service',
      '''october_exam_entry_form'',''replacement_student_card'')'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:step-decision-gate',
      'IF v_config.action_type IS NULL OR p_action IS DISTINCT FROM v_config.action_type THEN'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:before-step-action-hook',
      'IF COALESCE(p_payload,''{}''::jsonb)<>''{}''::jsonb THEN RAISE EXCEPTION ''B1_CLIENT_ACTION_PAYLOAD_FORBIDDEN''; END IF;'),
    ('public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)', 'EAWF01:decision-reason-on-request',
      'UPDATE public.student_requests SET status=CASE v_action WHEN ''reject'' THEN ''rejected'''),
    ('public.evaluate_workflow_transition_condition(uuid,jsonb)', 'EAWF01:fee-not-required-condition',
      'IF v_code = ''FEE_IS_ZERO'' THEN'),
    ('public.initialize_b1_request_workflow_strict(uuid,text)', 'EAWF01:resubmit-restart-at-first-step',
      'RETURN jsonb_build_object(''initialized'',false,''resumed'',true,''active_step_id'',v_active_step_id);'),
    ('public.trg_notify_student_request()', 'EAWF01:notification-service-label',
      'WHEN ''absence_excuse'' THEN ''عذر غياب''')
),
anchor_state AS (
  SELECT a.marker,
         d.def IS NOT NULL AS fn_exists,
         COALESCE(position(a.marker in d.def) > 0, false) AS already_patched,
         CASE WHEN d.def IS NULL THEN 0
              ELSE (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) END AS hits
  FROM anchors a
  LEFT JOIN LATERAL (SELECT pg_get_functiondef(to_regprocedure(a.fn)) AS def) d ON true
),
rt AS (
  SELECT rt.* FROM public.request_types rt WHERE rt.code = ANY (ARRAY['excused_absence','absence_excuse'])
),
pairs(unit_code, role_code) AS (
  VALUES ('dean','dean'), ('registrar','registrar_general'), ('finance','revenue_finance_officer'),
         ('student_affairs','student_affairs_manager'), ('archive','archive_officer'), ('department','department_head')
),
pair_state AS (
  SELECT p.unit_code, p.role_code,
         (SELECT count(*) FROM public.request_processing_units u WHERE u.code = p.unit_code AND u.is_active) AS units,
         (SELECT count(*) FROM public.request_processing_roles r
            JOIN public.request_processing_units u ON u.id = r.unit_id AND u.code = p.unit_code AND u.is_active
           WHERE r.code = p.role_code AND r.is_active) AS roles,
         (SELECT count(*) FROM public.request_processing_assignments a
            JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = p.unit_code AND u.is_active
            JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = p.role_code AND r.is_active
           WHERE a.is_active
             AND (a.starts_at IS NULL OR a.starts_at <= now())
             AND (a.ends_at IS NULL OR a.ends_at > now())
             AND public.is_valid_b1_direct_assignment(a.id, NULL, false)) AS direct_assignees
  FROM pairs p
),
heads AS (
  SELECT a.department_id, count(*) AS n
  FROM public.request_processing_assignments a
  JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'department' AND u.is_active
  JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = 'department_head' AND r.is_active
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at > now())
    AND a.department_id IS NOT NULL
    AND a.assignment_type = 'position_assignment'
    AND a.position_assignment_id IS NOT NULL
    AND a.user_id IS NULL AND a.staff_profile_id IS NULL AND a.faculty_profile_id IS NULL
    AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false)
  GROUP BY a.department_id
),
wf AS (
  SELECT w.* FROM public.request_type_workflows w JOIN rt ON rt.id = w.request_type_id
),
checks AS (
  SELECT
    (SELECT bool_and(to_regclass(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.request_types','public.request_type_workflows','public.request_type_workflow_steps',
      'public.request_type_workflow_transitions','public.request_type_workflow_change_log',
      'public.request_workflow_publish_validations','public.request_workflow_action_catalog',
      'public.request_processing_units','public.request_processing_roles','public.request_processing_assignments',
      'public.b1_workflow_runtime_contract_snapshot','public.student_profiles','public.student_requests',
      'public.student_request_workflow_steps','public.student_request_workflow_events',
      'public.absence_excuse_details','public.request_workflow_transition_condition_catalog',
      'public.notifications']) x) AS relations_ok,
    (SELECT bool_and(to_regprocedure(x) IS NOT NULL) FROM unnest(ARRAY[
      'public.initialize_b1_request_workflow_strict(uuid,text)',
      'public.assert_b1_runtime_step_row_assignee_effective(public.student_request_workflow_steps)',
      'public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)',
      'public.record_external_university_payment_confirmation(uuid,text)',
      'public.apply_b1_excused_absence_effect(uuid)',
      'public.apply_b1_academic_effect_for_request(uuid)',
      'public.can_current_user_act_on_step(uuid,text)',
      'public.user_matches_workflow_runtime_step(uuid)',
      'public.is_valid_b1_direct_assignment(uuid,uuid,boolean)',
      'public.b1_runtime_step_contract_ok(text,uuid,text,text,text,text)',
      'public.validate_request_workflow_publish(uuid)',
      'public.resolve_b1_workflow_transition(uuid,uuid,text,uuid)',
      'public.evaluate_workflow_transition_condition(uuid,jsonb)',
      'public.create_notification(uuid,text,text,text,text,uuid)',
      'public.trg_notify_student_request()']) x) AS functions_ok,
    (SELECT count(*) = 16 FROM information_schema.columns ic
      WHERE ic.table_schema = 'public' AND (ic.table_name, ic.column_name) IN (
        ('request_type_workflows','published_at'), ('request_type_workflows','superseded_at'),
        ('request_type_workflows','change_note'), ('request_type_workflow_steps','action_code'),
        ('request_type_workflow_steps','config'), ('request_type_workflow_transitions','priority'),
        ('request_type_workflow_transitions','condition_schema'),
        ('request_processing_assignments','department_id'),
        ('request_processing_assignments','position_assignment_id'),
        ('student_profiles','department_id'), ('student_requests','student_profile_id'),
        ('student_requests','rejection_reason'), ('student_requests','request_number'),
        ('request_type_workflow_steps','can_reject'), ('request_type_workflow_steps','can_return_to_student'),
        ('student_request_workflow_steps','workflow_id'))) AS columns_ok,
    (SELECT count(*) = 1 AND bool_and(code = 'excused_absence') FROM rt) AS request_type_ok,
    (SELECT count(*) = 5 FROM public.request_workflow_action_catalog c
      WHERE c.is_active AND (c.code, c.action_type, c.kind) IN (
        ('REVIEW','review','neutral'), ('APPROVE','approve','neutral'),
        ('PAYMENT_CONFIRMATION','confirm_payment','neutral'), ('ARCHIVE','archive','neutral'),
        ('REGISTER_EXCUSED_ABSENCE','apply_decision','effect'))
        AND c.effect_function IS NOT DISTINCT FROM
            CASE c.code WHEN 'REGISTER_EXCUSED_ABSENCE' THEN 'apply_b1_excused_absence_effect' END
        AND c.restricted_request_type_code IS NOT DISTINCT FROM
            CASE c.code WHEN 'REGISTER_EXCUSED_ABSENCE' THEN 'excused_absence' END) AS catalog_actions_ok,
    (SELECT position('record_apply' in p.prosrc) > 0 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.apply_b1_excused_absence_effect(uuid)')) AS effect_step_key_binding_ok,
    (SELECT bool_and(units = 1 AND roles = 1) FROM pair_state) AS units_and_roles_ok,
    (SELECT bool_and(direct_assignees = 1) FROM pair_state WHERE role_code <> 'department_head') AS single_direct_assignee_per_role_ok,
    (SELECT count(*) >= 1 FROM heads) AS department_head_assignment_exists,
    NOT EXISTS (
      SELECT 1 FROM public.request_processing_assignments a
      JOIN public.request_processing_units u ON u.id = a.unit_id AND u.code = 'department' AND u.is_active
      JOIN public.request_processing_roles r ON r.id = a.role_id AND r.unit_id = u.id AND r.code = 'department_head' AND r.is_active
      WHERE a.is_active
        AND (a.starts_at IS NULL OR a.starts_at <= now())
        AND (a.ends_at IS NULL OR a.ends_at > now())
        AND a.department_id IS NOT NULL
        AND public.is_valid_b1_direct_assignment(a.id, a.department_id, false)
      GROUP BY a.department_id HAVING count(*) > 1) AS no_ambiguous_department_head,
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active) AS single_active_workflow,
    (SELECT count(*) = 1 FROM wf WHERE status = 'active' AND is_active
        AND code IN ('excused_absence_free_workflow','excused_absence_external_payment_workflow')) AS active_workflow_code_expected,
    (SELECT count(*) <= 1 FROM wf WHERE code = 'excused_absence_external_payment_workflow') AS no_duplicate_target_workflow,
    NOT EXISTS (SELECT 1 FROM public.request_workflow_transition_condition_catalog c
                WHERE c.code = 'EXCUSED_ABSENCE_FEE_NOT_REQUIRED' AND NOT c.is_active) AS fee_condition_code_free_or_active,
    (SELECT bool_and(fn_exists AND (already_patched OR hits = 1)) FROM anchor_state) AS all_eleven_patch_anchors_ok
)
SELECT
  c.*,
  (c.relations_ok AND c.functions_ok AND c.columns_ok AND c.request_type_ok AND c.catalog_actions_ok
   AND c.effect_step_key_binding_ok AND c.units_and_roles_ok AND c.single_direct_assignee_per_role_ok
   AND c.department_head_assignment_exists AND c.no_ambiguous_department_head AND c.single_active_workflow
   AND c.active_workflow_code_expected AND c.no_duplicate_target_workflow
   AND c.fee_condition_code_free_or_active AND c.all_eleven_patch_anchors_ok) IS TRUE AS ready_to_apply,
  -- ---- informational (do not block the apply) ------------------------------
  (SELECT count(*) = 11 AND bool_and(already_patched) FROM anchor_state) AS draft_already_applied,
  (SELECT array_agg(marker || ':' || hits ORDER BY marker) FROM anchor_state
    WHERE NOT (fn_exists AND (already_patched OR hits = 1))) AS failing_anchors,
  (SELECT array_agg(unit_code || '/' || role_code || ':' || direct_assignees ORDER BY unit_code)
     FROM pair_state WHERE role_code <> 'department_head' AND direct_assignees <> 1) AS roles_without_single_assignee,
  (SELECT code || ' v' || version FROM wf WHERE status = 'active' AND is_active) AS active_workflow,
  (SELECT student_visible FROM rt) AS request_type_student_visible,
  (SELECT count(DISTINCT sp.department_id) FROM public.student_profiles sp
    WHERE sp.department_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM heads h WHERE h.department_id = sp.department_id)) AS student_departments_without_head,
  (SELECT count(*) FROM public.student_profiles sp WHERE sp.department_id IS NULL) AS students_without_department,
  (SELECT count(*) FROM public.student_requests r
    WHERE r.request_type::text IN ('excused_absence','absence_excuse')
      AND r.status::text NOT IN ('completed','rejected','cancelled','draft')) AS open_requests_of_this_service,
  (SELECT count(*) FROM public.request_processing_assignments) AS processing_assignment_count
FROM checks c;
