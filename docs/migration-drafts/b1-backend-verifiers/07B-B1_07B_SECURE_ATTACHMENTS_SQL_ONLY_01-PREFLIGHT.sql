-- ============================================================================
-- B1-SEQ07-B / order 7B / PREFLIGHT
-- Migration: 20260725110050_b1_07b_secure_attachments_sql_only_01.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regprocedure(''public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])'') IS NOT NULL',
         (to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regprocedure(''public.record_external_university_payment_confirmation(uuid,text)'') IS NOT NULL',
         (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'to_regclass(''storage.buckets'') IS NOT NULL',
         (to_regclass('storage.buckets') IS NOT NULL)
  UNION ALL SELECT 'CHECK_04', 'private bucket student-request-secure-attachments present with exact contract',
         (EXISTS (
            SELECT 1 FROM storage.buckets b
            WHERE b.id='student-request-secure-attachments'
              AND b.public IS FALSE
              AND b.file_size_limit=5242880
              AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]
              AND b.allowed_mime_types <@ ARRAY['application/pdf','image/jpeg','image/png']::text[]
         ))
  UNION ALL SELECT 'CHECK_05', 'SEQ07B SQL objects still absent (no partial)',
         (to_regclass('public.student_request_attachment_uploads') IS NULL)
  UNION ALL SELECT 'CHECK_06', 'original SEQ07 version must remain NOT a false APPLIED claim (operator history check)',
         true
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', '', (to_regprocedure('public.submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', '', (to_regprocedure('public.record_external_university_payment_confirmation(uuid,text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03', '', (to_regclass('storage.buckets') IS NOT NULL)
        UNION ALL SELECT 'CHECK_04', '', (EXISTS (
            SELECT 1 FROM storage.buckets b
            WHERE b.id='student-request-secure-attachments'
              AND b.public IS FALSE
              AND b.file_size_limit=5242880
              AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]
              AND b.allowed_mime_types <@ ARRAY['application/pdf','image/jpeg','image/png']::text[]
         ))
        UNION ALL SELECT 'CHECK_05', '', (to_regclass('public.student_request_attachment_uploads') IS NULL)
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_7B_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
