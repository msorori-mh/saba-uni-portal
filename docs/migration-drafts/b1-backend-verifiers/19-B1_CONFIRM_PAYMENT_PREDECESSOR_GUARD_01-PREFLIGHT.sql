-- ============================================================================
-- B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01 / PREFLIGHT
-- Draft: B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-01.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'binary payment confirmation RPC exists',
         (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'legacy three-arg overload absent',
         (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text,text)') IS NULL)
  UNION ALL SELECT 'CHECK_03', 'authenticated has EXECUTE',
         (has_function_privilege(
            'authenticated',
            'public.record_external_university_payment_confirmation(uuid,text)',
            'EXECUTE'))
  UNION ALL SELECT 'CHECK_04', 'anon lacks EXECUTE',
         (NOT has_function_privilege(
            'anon',
            'public.record_external_university_payment_confirmation(uuid,text)',
            'EXECUTE'))
  UNION ALL SELECT 'CHECK_05', 'simplified signature has no p_status argument',
         (NOT EXISTS (
            SELECT 1
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public'
              AND p.proname = 'record_external_university_payment_confirmation'
              AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text'))
  UNION ALL SELECT 'CHECK_06', 'predecessor guard not installed yet (pre-apply baseline)',
         ((SELECT prosrc
             FROM pg_proc
            WHERE oid = 'public.record_external_university_payment_confirmation(uuid,text)'::regprocedure)
          NOT LIKE '%B1_PREDECESSOR_INCOMPLETE%')
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'binary payment confirmation RPC exists',
               (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'legacy three-arg overload absent',
               (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text,text)') IS NULL)
        UNION ALL SELECT 'CHECK_03', 'authenticated has EXECUTE',
               (has_function_privilege(
                  'authenticated',
                  'public.record_external_university_payment_confirmation(uuid,text)',
                  'EXECUTE'))
        UNION ALL SELECT 'CHECK_04', 'anon lacks EXECUTE',
               (NOT has_function_privilege(
                  'anon',
                  'public.record_external_university_payment_confirmation(uuid,text)',
                  'EXECUTE'))
        UNION ALL SELECT 'CHECK_05', 'simplified signature has no p_status argument',
               (NOT EXISTS (
                  SELECT 1
                  FROM pg_proc p
                  JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'
                    AND p.proname = 'record_external_university_payment_confirmation'
                    AND pg_get_function_identity_arguments(p.oid) = 'uuid, text, text'))
        UNION ALL SELECT 'CHECK_06', 'predecessor guard not installed yet (pre-apply baseline)',
               ((SELECT prosrc
                   FROM pg_proc
                  WHERE oid = 'public.record_external_university_payment_confirmation(uuid,text)'::regprocedure)
                NOT LIKE '%B1_PREDECESSOR_INCOMPLETE%')
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_CONFIRM_PAYMENT_PREDECESSOR_GUARD_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
