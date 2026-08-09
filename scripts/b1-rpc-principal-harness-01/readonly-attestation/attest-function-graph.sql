WITH wanted(sig) AS (
  VALUES
    ('act_on_b1_student_request_step_atomic(uuid,text,text,jsonb)'),
    ('apply_b1_academic_effect_for_request(uuid)'),
    ('apply_b1_department_transfer_effect(uuid)'),
    ('apply_b1_enrollment_suspension_effect(uuid)'),
    ('apply_b1_excused_absence_effect(uuid)'),
    ('apply_b1_file_withdrawal_effect(uuid)'),
    ('apply_b1_final_chance_effect(uuid)'),
    ('assert_b1_runtime_step_assignee_effective(uuid)'),
    ('assert_b1_runtime_step_row_assignee_effective(student_request_workflow_steps)'),
    ('b1_assignment_identity_lock_key()'),
    ('b1_lock_assignment_identity_boundary()'),
    ('b1_lock_assignment_identity_stmt()'),
    ('b1_map_ui_staff_action(text)'),
    ('can_current_user_act_on_step(uuid,text)'),
    ('current_user_has_exact_processing_binding(uuid,uuid)'),
    ('current_user_matches_transfer_department_scope(uuid,text)'),
    ('guard_b1_runtime_step_activation()'),
    ('has_any_role(uuid,text[])'),
    ('is_b1_stored_request_type(text)'),
    ('is_owner_of_request(uuid,uuid)'),
    ('is_valid_actor_request_action(text)'),
    ('is_valid_b1_runtime_step_contract(text,text,text,text,text)'),
    ('protect_student_sensitive_fields()'),
    ('record_external_university_payment_confirmation(uuid,text)'),
    ('update_updated_at_column()'),
    ('user_matches_workflow_runtime_step(uuid)'),
    ('workflow_action_result_matches(text,text)'),
    ('workflow_runtime_predecessors_satisfied(uuid)'),
    ('current_user_has_b1_e2e_88_actor_binding(uuid,uuid,text)')
)
SELECT
  'public.' || w.sig AS signature,
  CASE WHEN p.oid IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS presence,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  pg_get_userbyid(p.proowner) AS owner,
  coalesce(pg_catalog.array_to_string(p.proconfig, ','), '') AS search_path,
  CASE WHEN p.oid IS NULL THEN NULL
       ELSE encode(digest(regexp_replace(trim(both from pg_get_functiondef(p.oid)), E'\\s+', ' ', 'g'), 'sha256'), 'hex')
  END AS definition_sha256
FROM wanted w
LEFT JOIN pg_proc p ON p.oid = to_regprocedure('public.' || w.sig)
ORDER BY 1;
