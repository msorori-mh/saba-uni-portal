-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 12 / POST_VERIFIER
-- Draft: REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'pg_get_constraintdef((SELECT c.oid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=''student_request_attachment_uploads'' AND contype=''c'' AND pg_get_constraintdef(c.oid) LIKE ''%field_key%'' LIMIT 1)) LIKE ''%secondary_certificate%''', (pg_get_constraintdef((SELECT c.oid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='student_request_attachment_uploads' AND contype='c' AND pg_get_constraintdef(c.oid) LIKE '%field_key%' LIMIT 1)) LIKE '%secondary_certificate%')
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'pg_get_constraintdef((SELECT c.oid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname=''student_request_attachment_uploads'' AND contype=''c'' AND pg_get_constraintdef(c.oid) LIKE ''%field_key%'' LIMIT 1)) LIKE ''%secondary_certificate%''', (pg_get_constraintdef((SELECT c.oid FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='student_request_attachment_uploads' AND contype='c' AND pg_get_constraintdef(c.oid) LIKE '%field_key%' LIMIT 1)) LIKE '%secondary_certificate%')
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_12_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
