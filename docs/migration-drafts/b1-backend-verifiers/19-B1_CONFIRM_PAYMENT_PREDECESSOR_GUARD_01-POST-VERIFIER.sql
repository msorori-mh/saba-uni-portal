-- ============================================================================
-- B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01 / POST_VERIFIER
-- Draft: B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH src AS (
  SELECT p.prosrc AS body
  FROM pg_proc p
  WHERE p.oid = 'public.record_external_university_payment_confirmation(uuid,text)'::regprocedure
),
ordered AS (
  SELECT
    strpos(body, 'EXACT_FINANCE_PROCESSING_BINDING_REQUIRED') AS auth_pos,
    strpos(body, 'B1_PREDECESSOR_INCOMPLETE') AS pred_pos,
    strpos(body, 'UPDATE public.student_request_workflow_steps') AS first_update_pos,
    strpos(body, 'INSERT INTO public.student_request_workflow_events') AS first_insert_pos,
    body
  FROM src
),
checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'binary RPC still present',
         (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'three-arg overload still absent',
         (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text,text)') IS NULL)
  UNION ALL SELECT 'CHECK_03', 'source contains B1_PREDECESSOR_INCOMPLETE',
         ((SELECT body FROM src) LIKE '%B1_PREDECESSOR_INCOMPLETE%')
  UNION ALL SELECT 'CHECK_04', 'source contains prior.step_order predecessor scan',
         ((SELECT body FROM src) LIKE '%prior.step_order < v_step.step_order%'
          AND (SELECT body FROM src) LIKE '%prior.status NOT IN (''completed'',''skipped'')%')
  UNION ALL SELECT 'CHECK_05', 'predecessor check after finance binding and before mutation',
         (
           (SELECT auth_pos FROM ordered) > 0
           AND (SELECT pred_pos FROM ordered) > (SELECT auth_pos FROM ordered)
           AND (SELECT first_update_pos FROM ordered) > (SELECT pred_pos FROM ordered)
           AND (SELECT first_insert_pos FROM ordered) > (SELECT pred_pos FROM ordered)
         )
  UNION ALL SELECT 'CHECK_06', 'authenticated EXECUTE preserved',
         (has_function_privilege(
            'authenticated',
            'public.record_external_university_payment_confirmation(uuid,text)',
            'EXECUTE'))
  UNION ALL SELECT 'CHECK_07', 'anon EXECUTE still denied',
         (NOT has_function_privilege(
            'anon',
            'public.record_external_university_payment_confirmation(uuid,text)',
            'EXECUTE'))
  UNION ALL SELECT 'CHECK_08', 'no financial ledger payload vocabulary added',
         ((SELECT body FROM src) !~* 'fee_type_id|gateway_transaction|internal_balance|payment_reference'
          AND position('p_status' in (SELECT body FROM src)) = 0
          AND position('payment_not_confirmed' in (SELECT body FROM src)) = 0)
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH src AS (
        SELECT p.prosrc AS body
        FROM pg_proc p
        WHERE p.oid = 'public.record_external_university_payment_confirmation(uuid,text)'::regprocedure
      ),
      ordered AS (
        SELECT
          strpos(body, 'EXACT_FINANCE_PROCESSING_BINDING_REQUIRED') AS auth_pos,
          strpos(body, 'B1_PREDECESSOR_INCOMPLETE') AS pred_pos,
          strpos(body, 'UPDATE public.student_request_workflow_steps') AS first_update_pos,
          strpos(body, 'INSERT INTO public.student_request_workflow_events') AS first_insert_pos,
          body
        FROM src
      ),
      checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'binary RPC still present',
               (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'three-arg overload still absent',
               (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text,text)') IS NULL)
        UNION ALL SELECT 'CHECK_03', 'source contains B1_PREDECESSOR_INCOMPLETE',
               ((SELECT body FROM src) LIKE '%B1_PREDECESSOR_INCOMPLETE%')
        UNION ALL SELECT 'CHECK_04', 'source contains prior.step_order predecessor scan',
               ((SELECT body FROM src) LIKE '%prior.step_order < v_step.step_order%'
                AND (SELECT body FROM src) LIKE '%prior.status NOT IN (''completed'',''skipped'')%')
        UNION ALL SELECT 'CHECK_05', 'predecessor check after finance binding and before mutation',
               (
                 (SELECT auth_pos FROM ordered) > 0
                 AND (SELECT pred_pos FROM ordered) > (SELECT auth_pos FROM ordered)
                 AND (SELECT first_update_pos FROM ordered) > (SELECT pred_pos FROM ordered)
                 AND (SELECT first_insert_pos FROM ordered) > (SELECT pred_pos FROM ordered)
               )
        UNION ALL SELECT 'CHECK_06', 'authenticated EXECUTE preserved',
               (has_function_privilege(
                  'authenticated',
                  'public.record_external_university_payment_confirmation(uuid,text)',
                  'EXECUTE'))
        UNION ALL SELECT 'CHECK_07', 'anon EXECUTE still denied',
               (NOT has_function_privilege(
                  'anon',
                  'public.record_external_university_payment_confirmation(uuid,text)',
                  'EXECUTE'))
        UNION ALL SELECT 'CHECK_08', 'no financial ledger payload vocabulary added',
               ((SELECT body FROM src) !~* 'fee_type_id|gateway_transaction|internal_balance|payment_reference'
                AND position('p_status' in (SELECT body FROM src)) = 0
                AND position('payment_not_confirmed' in (SELECT body FROM src)) = 0)
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
