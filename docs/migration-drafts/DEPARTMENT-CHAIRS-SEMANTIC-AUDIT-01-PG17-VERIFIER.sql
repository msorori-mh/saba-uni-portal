-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-01-PG17-VERIFIER
-- Local PG 17.10 harness ONLY. Runs the SAME classification body as
-- DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql (the block between the
-- -- >>SHARED:CLASSIFICATION_BODY>> / -- <<SHARED:CLASSIFICATION_BODY>>
-- markers is byte-identical; a bun static test enforces this) against the
-- b_chairs fixture schema and asserts, fail-closed:
--   * all 8 fixture departments classify exactly as designed;
--   * the decoy 'department_member' role row is NOT counted (semantic, not naming);
--   * duplicate / wrong-unit / expired / inactive diagnostic counters fire;
--   * the out-of-scope active head assignment (D9) is detected;
--   * the audit leaves no persistent artifacts (temp tables only, ROLLBACK).
-- Expected final output column pass = true for all 8 rows; verdict line last.
-- ============================================================================

SET search_path TO b_chairs, public;

BEGIN;

CREATE TEMP TABLE audit_result ON COMMIT DROP AS
WITH expected_chairs(dept_id, dept_label, expected_employee_number) AS (
  VALUES
    ('d0000001-0000-4000-8000-000000000001'::uuid, 'D1', 'F0001'),
    ('d0000002-0000-4000-8000-000000000002'::uuid, 'D2', 'F0002'),
    ('d0000003-0000-4000-8000-000000000003'::uuid, 'D3', 'F0003'),
    ('d0000004-0000-4000-8000-000000000004'::uuid, 'D4', 'F0004'),
    ('d0000005-0000-4000-8000-000000000005'::uuid, 'D5', 'F0005'),
    ('d0000006-0000-4000-8000-000000000006'::uuid, 'D6', 'F0006'),
    ('d0000007-0000-4000-8000-000000000007'::uuid, 'D7', 'F0007'),
    ('d0000008-0000-4000-8000-000000000008'::uuid, 'D8', 'F0008')
),
-- >>SHARED:CLASSIFICATION_BODY>>
chair_scope AS (
  -- semantic anchor: exact unit code + exact role code, both active
  SELECT u.id AS unit_id, r.id AS role_id
  FROM request_processing_units u
  JOIN request_processing_roles r ON r.unit_id = u.id
  WHERE u.code = 'department'
    AND u.is_active
    AND r.code = 'department_head'
    AND r.is_active
),
chair_assignments AS (
  SELECT
    a.id,
    a.department_id,
    a.faculty_profile_id,
    a.is_active,
    (a.is_active
       AND (a.starts_at IS NULL OR a.starts_at <= now())
       AND (a.ends_at   IS NULL OR a.ends_at   >  now())) AS is_current,
    (a.is_active
       AND NOT ((a.starts_at IS NULL OR a.starts_at <= now())
            AND (a.ends_at   IS NULL OR a.ends_at   >  now()))) AS is_window_inactive
  FROM request_processing_assignments a
  JOIN chair_scope cs ON cs.unit_id = a.unit_id AND cs.role_id = a.role_id
  WHERE a.assignment_type = 'faculty_profile'
),
per_dept AS (
  SELECT
    p.dept_label,
    p.dept_id,
    p.expected_employee_number,
    (SELECT count(*) FROM faculty_profiles fp
      WHERE fp.employee_number = p.expected_employee_number) AS matched_profile_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id) AS total_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_current) AS active_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND NOT ca.is_active) AS inactive_assignment_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.department_id = p.dept_id AND ca.is_window_inactive) AS expired_window_count
  FROM expected_chairs p
),
single_active AS (
  -- populated only when exactly one active assignment exists (cardinality = 1)
  SELECT
    pd.dept_label,
    ca.faculty_profile_id AS holder_fp_id,
    fp.employee_number AS holder_employee_number,
    fp.department_id AS holder_dept_id
  FROM per_dept pd
  LEFT JOIN chair_assignments ca
    ON ca.department_id = pd.dept_id AND ca.is_current
  LEFT JOIN faculty_profiles fp
    ON fp.id = ca.faculty_profile_id
  WHERE pd.active_assignment_count = 1
),
resolved AS (
  SELECT
    pd.*,
    sa.holder_fp_id,
    sa.holder_employee_number,
    sa.holder_dept_id,
    (pd.active_assignment_count = 1
       AND (sa.holder_fp_id IS NULL OR sa.holder_employee_number IS NULL)) AS identity_unresolved,
    (SELECT count(*) FROM chair_assignments ca
      JOIN faculty_profiles fp ON fp.id = ca.faculty_profile_id
      WHERE ca.department_id = pd.dept_id
        AND ca.is_current
        AND fp.department_id IS DISTINCT FROM pd.dept_id) AS wrong_unit_count,
    GREATEST(pd.active_assignment_count - 1, 0) AS duplicate_count,
    (SELECT count(*) FROM chair_assignments ca
      WHERE ca.is_current
        AND ca.department_id NOT IN (SELECT dept_id FROM expected_chairs)) AS out_of_scope_active_head_count
  FROM per_dept pd
  LEFT JOIN single_active sa ON sa.dept_label = pd.dept_label
)
SELECT
  dept_label,
  expected_employee_number AS expected_academic_number,
  matched_profile_count,
  active_assignment_count,
  ('request_processing_assignments(unit=department,role=department_head,type=faculty_profile) -> ' ||
    CASE
      WHEN active_assignment_count = 1 AND NOT identity_unresolved
        THEN 'faculty_profile ' || holder_employee_number ||
             ' holder_dept=' || COALESCE(holder_dept_id::text, 'NULL')
      WHEN active_assignment_count = 1
        THEN 'UNRESOLVED_IDENTITY(null_or_missing_faculty_profile_link)'
      WHEN active_assignment_count > 1
        THEN active_assignment_count || '_concurrent_active_assignments'
      ELSE 'no_currently_effective_assignment'
    END) AS semantic_position,
  wrong_unit_count,
  duplicate_count,
  inactive_assignment_count,
  expired_window_count,
  out_of_scope_active_head_count,
  CASE
    WHEN matched_profile_count > 1 THEN 'AMBIGUOUS'
    WHEN active_assignment_count > 1 THEN 'DUPLICATE'
    WHEN active_assignment_count = 1 AND identity_unresolved THEN 'AMBIGUOUS'
    WHEN active_assignment_count = 1
         AND holder_dept_id IS DISTINCT FROM dept_id THEN 'WRONG_UNIT'
    WHEN active_assignment_count = 1
         AND holder_employee_number IS DISTINCT FROM expected_employee_number THEN 'WRONG_IDENTITY'
    WHEN active_assignment_count = 1 THEN 'MATCHED'
    WHEN inactive_assignment_count > 0 THEN 'INACTIVE'
    WHEN expired_window_count > 0 THEN 'EXPIRED'
    ELSE 'MISSING'
  END AS final_classification
FROM resolved
ORDER BY dept_label
-- <<SHARED:CLASSIFICATION_BODY>>
;

CREATE TEMP TABLE expected_results (
  dept_label text PRIMARY KEY,
  expected_classification text NOT NULL
) ON COMMIT DROP;
INSERT INTO expected_results VALUES
  ('D1', 'MATCHED'),
  ('D2', 'MISSING'),
  ('D3', 'DUPLICATE'),
  ('D4', 'WRONG_UNIT'),
  ('D5', 'WRONG_IDENTITY'),
  ('D6', 'INACTIVE'),
  ('D7', 'EXPIRED'),
  ('D8', 'AMBIGUOUS');

DO $$
declare
  v_count integer;
begin
  -- fail-closed: the audit must emit exactly one row per fixture department
  select count(*) into v_count from audit_result;
  if v_count <> 8 then
    raise exception 'AUDIT_ROWCOUNT_DRIFT_%', v_count;
  end if;

  -- fail-closed: every fixture department must classify exactly as designed
  if exists (
    select 1 from expected_results e
    left join audit_result a on a.dept_label = e.dept_label
    where a.final_classification is distinct from e.expected_classification
  ) then
    raise exception 'AUDIT_CLASSIFICATION_MISMATCH';
  end if;

  -- fail-closed diagnostics: each detection layer must fire on its fixture
  if (select active_assignment_count from audit_result where dept_label = 'D2') <> 0 then
    raise exception 'DECOY_ROLE_COUNTED_SEMANTIC_FILTER_BROKEN';
  end if;
  if (select duplicate_count from audit_result where dept_label = 'D3') <> 1 then
    raise exception 'DUPLICATE_COUNTER_BROKEN';
  end if;
  if (select wrong_unit_count from audit_result where dept_label = 'D4') <> 1 then
    raise exception 'WRONG_UNIT_COUNTER_BROKEN';
  end if;
  if (select inactive_assignment_count from audit_result where dept_label = 'D6') <> 1 then
    raise exception 'INACTIVE_COUNTER_BROKEN';
  end if;
  if (select expired_window_count from audit_result where dept_label = 'D7') <> 1 then
    raise exception 'EXPIRED_WINDOW_COUNTER_BROKEN';
  end if;
  if (select out_of_scope_active_head_count from audit_result limit 1) <> 1 then
    raise exception 'OUT_OF_SCOPE_HEAD_DETECTION_BROKEN';
  end if;
  if (select matched_profile_count from audit_result where dept_label = 'D1') <> 1 then
    raise exception 'IDENTITY_LAYER_BROKEN';
  end if;
end $$;

SELECT
  a.dept_label,
  e.expected_classification,
  a.final_classification,
  (a.final_classification = e.expected_classification) AS pass,
  a.expected_academic_number,
  a.matched_profile_count,
  a.active_assignment_count,
  a.wrong_unit_count,
  a.duplicate_count,
  a.inactive_assignment_count,
  a.expired_window_count,
  a.out_of_scope_active_head_count,
  a.semantic_position
FROM audit_result a
JOIN expected_results e USING (dept_label)
ORDER BY a.dept_label;

SELECT CASE
         WHEN (SELECT bool_and(a.final_classification = e.expected_classification)
                 FROM audit_result a JOIN expected_results e USING (dept_label))
           THEN 'PASS_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17_ALL_8_CLASSIFICATIONS'
         ELSE 'FAIL_DEPARTMENT_CHAIRS_SEMANTIC_AUDIT_PG17'
       END AS verdict;

ROLLBACK;
