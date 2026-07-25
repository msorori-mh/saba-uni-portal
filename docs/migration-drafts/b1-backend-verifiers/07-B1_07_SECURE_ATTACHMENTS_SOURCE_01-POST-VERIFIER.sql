-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 7 / POST_VERIFIER
-- Draft: STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM storage.buckets WHERE id=''student-request-secure-attachments'' AND public=false)', (EXISTS (SELECT 1 FROM storage.buckets WHERE id='student-request-secure-attachments' AND public=false))
  UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.student_request_attachment_uploads'') IS NOT NULL', (to_regclass('public.student_request_attachment_uploads') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'to_regprocedure(''public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)'') IS NOT NULL', (to_regprocedure('public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_04', 'to_regprocedure(''public.authorize_student_request_attachment_download(uuid)'') IS NOT NULL', (to_regprocedure('public.authorize_student_request_attachment_download(uuid)') IS NOT NULL)
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'EXISTS (SELECT 1 FROM storage.buckets WHERE id=''student-request-secure-attachments'' AND public=false)', (EXISTS (SELECT 1 FROM storage.buckets WHERE id='student-request-secure-attachments' AND public=false))
        UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.student_request_attachment_uploads'') IS NOT NULL', (to_regclass('public.student_request_attachment_uploads') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03', 'to_regprocedure(''public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)'') IS NOT NULL', (to_regprocedure('public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)') IS NOT NULL)
        UNION ALL SELECT 'CHECK_04', 'to_regprocedure(''public.authorize_student_request_attachment_download(uuid)'') IS NOT NULL', (to_regprocedure('public.authorize_student_request_attachment_download(uuid)') IS NOT NULL)
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_7_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
