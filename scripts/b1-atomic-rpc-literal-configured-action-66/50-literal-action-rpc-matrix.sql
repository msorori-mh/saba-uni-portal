-- PORTAL-B1-...-66 — LITERAL ACTION RPC + AUTHORIZATION MATRIX HARNESS
-- Target: the ISOLATED PostgreSQL 17 environment `isodb` (port 54329) provisioned by
-- scripts/b1-isolated-authorization-env-65/. NEVER run against production.
--
-- Shape: one transaction, ROLLBACK at the end => zero mutation.
-- Actor impersonation uses request.jwt.claims, exactly like 42-negative-harness.sql.
--
-- Matrix dimensions
--   A. configured action_type: review | approve | clear | apply_decision | archive
--   B. submitted action      : the literal configured one, plus every other one
--   C. principal             : exact direct assignee | wrong assignee | admin |
--                              registrar | dean | department_head | student owner | anon
-- Expected after the 66 migration:
--   PASS  <=> principal = exact direct assignee AND submitted action = configured action
--   FAIL  otherwise, with:
--     B1_ACTION_TYPE_MISMATCH (42501)                    — wrong action, any principal
--     B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED (42501)  — right action, wrong principal
--     AUTHENTICATION_REQUIRED (28000)                    — anon
--   The pre-migration regression case (configured clear/apply_decision/archive +
--   submitted 'approve' + exact assignee) MUST now raise B1_ACTION_TYPE_MISMATCH.

BEGIN;

CREATE TEMP TABLE t_result(
  case_id text, configured_action text, submitted_action text, principal text,
  expected text, observed text, ok boolean
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.run_case(
  p_case_id text, p_step_id uuid, p_configured text, p_submitted text,
  p_principal text, p_claims jsonb, p_expected text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_observed text;
BEGIN
  BEGIN
    IF p_claims IS NULL THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
    ELSE
      PERFORM set_config('request.jwt.claims', p_claims::text, true);
    END IF;
    BEGIN
      PERFORM public.act_on_b1_student_request_step_atomic(p_step_id, p_submitted, 'TEST_ONLY_66', '{}'::jsonb);
      v_observed := 'PASS';
    EXCEPTION WHEN OTHERS THEN
      v_observed := SQLERRM;
    END;
    -- every case runs inside its own savepoint: no state leaks between cases
    RAISE EXCEPTION 'ROLLBACK_CASE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_CASE' THEN v_observed := coalesce(v_observed, SQLERRM); END IF;
  END;
  INSERT INTO t_result VALUES (
    p_case_id, p_configured, p_submitted, p_principal, p_expected, v_observed,
    (p_expected = 'PASS' AND v_observed = 'PASS')
      OR (p_expected <> 'PASS' AND v_observed IS NOT NULL AND position(p_expected in v_observed) > 0)
  );
END;
$$;

-- Driver: for every active TEST_ONLY runtime step in the isolated environment,
-- expand the (submitted action x principal) product.
DO $drive$
DECLARE
  r record; a text; p record; v_expected text; v_case int := 0;
BEGIN
  FOR r IN
    SELECT s.id AS step_id, cfg.action_type AS configured, s.assigned_user_id
    FROM public.student_request_workflow_steps s
    JOIN public.request_type_workflow_steps cfg ON cfg.id = s.workflow_step_id
    JOIN public.student_requests sr ON sr.id = s.student_request_id
    WHERE s.status = 'active'
      AND public.b1_is_five_service_type(sr.request_type)
      AND cfg.action_type IN ('review','approve','clear','apply_decision','archive')
  LOOP
    FOREACH a IN ARRAY ARRAY['review','approve','clear','apply_decision','archive'] LOOP
      FOR p IN
        SELECT 'exact_assignee' AS principal, r.assigned_user_id AS uid
        UNION ALL SELECT 'wrong_assignee', u.user_id FROM public.iso_test_principals u WHERE u.label='wrong_assignee'
        UNION ALL SELECT 'admin',           u.user_id FROM public.iso_test_principals u WHERE u.label='admin'
        UNION ALL SELECT 'registrar',       u.user_id FROM public.iso_test_principals u WHERE u.label='registrar'
        UNION ALL SELECT 'dean',            u.user_id FROM public.iso_test_principals u WHERE u.label='dean'
        UNION ALL SELECT 'department_head', u.user_id FROM public.iso_test_principals u WHERE u.label='department_head'
        UNION ALL SELECT 'student_owner',   u.user_id FROM public.iso_test_principals u WHERE u.label='student_owner'
        UNION ALL SELECT 'anon', NULL::uuid
      LOOP
        v_case := v_case + 1;
        v_expected := CASE
          WHEN p.principal = 'anon' THEN 'AUTHENTICATION_REQUIRED'
          WHEN a IS DISTINCT FROM r.configured THEN 'B1_ACTION_TYPE_MISMATCH'
          WHEN p.principal = 'exact_assignee' THEN 'PASS'
          ELSE 'B1_DIRECT_ASSIGNEE_AUTHORIZATION_REQUIRED'
        END;
        PERFORM pg_temp.run_case(
          format('C%04s', v_case), r.step_id, r.configured, a, p.principal,
          CASE WHEN p.uid IS NULL THEN NULL
               ELSE jsonb_build_object('sub', p.uid::text, 'role', 'authenticated') END,
          v_expected);
      END LOOP;
    END LOOP;
  END LOOP;
END
$drive$;

-- Regression focus: the exact vulnerability closed by migration 66.
SELECT 'REGRESSION_approve_instead_of_configured' AS focus,
       configured_action, principal, expected, observed, ok
FROM t_result
WHERE submitted_action = 'approve'
  AND configured_action IN ('clear','apply_decision','archive')
  AND principal = 'exact_assignee'
ORDER BY configured_action;

SELECT 'SUMMARY' AS id, count(*) AS total, count(*) FILTER (WHERE ok) AS passed,
       count(*) FILTER (WHERE NOT ok) AS failed FROM t_result;

SELECT * FROM t_result WHERE NOT ok ORDER BY case_id;

ROLLBACK;
