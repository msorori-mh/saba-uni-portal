-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 9 / POST_VERIFIER
-- Draft: REQUEST-B1-EXCUSED-ABSENCE-VOCABULARY-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=''absence_excuse_details'' AND pg_get_constraintdef(c.oid) LIKE ''%medical%'')', (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='absence_excuse_details' AND pg_get_constraintdef(c.oid) LIKE '%medical%'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=''absence_excuse_details'' AND pg_get_constraintdef(c.oid) LIKE ''%medical%'')', (EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='absence_excuse_details' AND pg_get_constraintdef(c.oid) LIKE '%medical%'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_9_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
