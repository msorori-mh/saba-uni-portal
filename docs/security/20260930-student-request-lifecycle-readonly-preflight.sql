-- Student request lifecycle preflight. Source-only release evidence; never a migration.
-- Execute with a privileged read-only connection after the target migrations are
-- present. Save the result sets before deciding whether any service may be enabled.
-- No student names, academic numbers, emails, or request IDs are returned.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT current_database() AS database_name, now() AS observed_at;

-- 1. Catalog and workflow readiness. Stored aliases are reported separately;
--    a canonical form definition alone does not activate a database service.
WITH expected(canonical_code, stored_code) AS (
  VALUES
    ('enrollment_suspension', 'enrollment_suspension'),
    ('excused_absence', 'excused_absence'),
    ('excused_absence', 'absence_excuse'),
    ('file_withdrawal', 'file_withdrawal'),
    ('department_transfer', 'department_transfer'),
    ('department_transfer', 'transfer'),
    ('final_chance', 'final_chance'),
    ('final_chance', 'extra_chance'),
    ('enrollment_certificate', 'enrollment_certificate'),
    ('grade_statement_non_graduate', 'grade_statement_non_graduate'),
    ('october_exam_entry_form', 'october_exam_entry_form'),
    ('replacement_student_card', 'replacement_student_card'),
    ('grade_appeal', 'grade_appeal'),
    ('enrollment_reinstatement', 'enrollment_reinstatement'),
    ('enrollment_reinstatement', 'reenrollment'),
    ('equivalency', 'equivalency'),
    ('official_transcript', 'official_transcript')
), workflow_counts AS (
  SELECT w.request_type_id,
         count(*) FILTER (WHERE w.is_active AND w.status = 'active') AS active_workflows,
         count(*) FILTER (WHERE w.is_active AND w.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM public.request_type_workflow_steps s
                           WHERE s.workflow_id = w.id)) AS empty_active_workflows
  FROM public.request_type_workflows w
  GROUP BY w.request_type_id
)
SELECT e.canonical_code, e.stored_code, rt.name_ar,
       rt.is_active, rt.student_visible,
       COALESCE(w.active_workflows, 0) AS active_workflows,
       COALESCE(w.empty_active_workflows, 0) AS empty_active_workflows,
       CASE
         WHEN rt.id IS NULL THEN 'TYPE_MISSING'
         WHEN rt.is_active IS NOT TRUE THEN 'TYPE_INACTIVE'
         WHEN rt.student_visible IS NOT TRUE THEN 'HIDDEN_FROM_STUDENT'
         WHEN COALESCE(w.active_workflows, 0) <> 1 THEN 'WORKFLOW_COUNT_INVALID'
         WHEN COALESCE(w.empty_active_workflows, 0) > 0 THEN 'WORKFLOW_EMPTY'
         ELSE 'CONFIGURED_CHECK_ACTORS_AND_TRANSITIONS'
       END AS preflight_state
FROM expected e
LEFT JOIN public.request_types rt ON rt.code = e.stored_code
LEFT JOIN workflow_counts w ON w.request_type_id = rt.id
ORDER BY e.canonical_code, e.stored_code;

-- 2. Actual active step order, including role/unit, external-payment and
--    document flags. NULL unit/role on a staff step needs investigation.
SELECT rt.code AS stored_code, w.code AS workflow_code, w.version,
       s.step_order, s.step_key, s.action_type,
       u.code AS processing_unit, r.code AS processing_role,
       s.requires_payment, s.produces_document,
       s.assignment_strategy,
       (s.processing_unit_id IS NULL OR s.processing_role_id IS NULL)
         AS missing_actor_scope
FROM public.request_type_workflows w
JOIN public.request_types rt ON rt.id = w.request_type_id
JOIN public.request_type_workflow_steps s ON s.workflow_id = w.id
LEFT JOIN public.request_processing_units u ON u.id = s.processing_unit_id
LEFT JOIN public.request_processing_roles r ON r.id = s.processing_role_id
WHERE w.is_active AND w.status = 'active'
ORDER BY rt.code, w.version, s.step_order;

-- 3. Requests invisible to a step-based staff inbox. Aggregate only; inspect
--    exact records separately under authorized access before any repair.
SELECT sr.request_type, sr.status,
       count(*) AS requests_without_steps,
       min(sr.submitted_at) AS earliest_submission,
       max(sr.submitted_at) AS latest_submission
FROM public.student_requests sr
WHERE sr.status IN ('submitted', 'under_review', 'in_review')
  AND NOT EXISTS (
    SELECT 1 FROM public.student_request_workflow_steps s
    WHERE s.student_request_id = sr.id
  )
GROUP BY sr.request_type, sr.status
ORDER BY requests_without_steps DESC, sr.request_type, sr.status;

-- 4. Multiple simultaneous open transfer requests per student, without
--    disclosing student IDs. A draft alongside a submitted request is counted
--    for policy review; this query does not decide whether it is forbidden.
WITH concurrent AS (
  SELECT sr.student_profile_id,
         count(*) AS open_requests,
         count(*) FILTER (WHERE sr.status = 'draft') AS drafts,
         count(*) FILTER (WHERE sr.status <> 'draft') AS non_drafts
  FROM public.student_requests sr
  WHERE sr.request_type IN ('transfer', 'department_transfer')
    AND sr.status IN ('draft', 'submitted', 'under_review', 'in_review',
                      'returned', 'returned_for_completion')
  GROUP BY sr.student_profile_id
  HAVING count(*) > 1
)
SELECT count(*) AS students_with_multiple_open_transfers,
       COALESCE(sum(open_requests), 0) AS open_transfer_requests,
       count(*) FILTER (WHERE drafts > 0 AND non_drafts > 0)
         AS students_with_draft_and_active
FROM concurrent;

-- 5. Verify the fail-closed submit implementation was deployed. A source
--    branch or a green CI run cannot establish the live function definition.
SELECT to_regprocedure('public.submit_student_request(uuid)') AS submit_function,
       CASE WHEN p.oid IS NULL THEN NULL
            ELSE position('STUDENT_REQUEST_WORKFLOW_INITIALIZATION_FAILED'
                          IN pg_get_functiondef(p.oid)) > 0 END AS fail_closed_present
FROM (SELECT to_regprocedure('public.submit_student_request(uuid)') AS oid) f
LEFT JOIN pg_proc p ON p.oid = f.oid;

ROLLBACK;
