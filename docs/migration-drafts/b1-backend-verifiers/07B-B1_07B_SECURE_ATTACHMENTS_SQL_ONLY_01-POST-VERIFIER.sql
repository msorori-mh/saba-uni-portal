-- ============================================================================
-- B1-SEQ07-B / order 7B / POST_VERIFIER
-- Equivalence target: same object proof as 07-B1_07_SECURE_ATTACHMENTS_SOURCE_01-POST-VERIFIER
-- plus explicit bucket contract + history identity of 20260725110050 (not 20260725110000).
-- READ-ONLY. Ends with ROLLBACK.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'private bucket student-request-secure-attachments',
         (EXISTS (
            SELECT 1 FROM storage.buckets b
            WHERE b.id='student-request-secure-attachments'
              AND b.public IS FALSE
              AND b.file_size_limit=5242880
              AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]
              AND b.allowed_mime_types <@ ARRAY['application/pdf','image/jpeg','image/png']::text[]
         ))
  UNION ALL SELECT 'CHECK_02', 'uploads table present',
         (to_regclass('public.student_request_attachment_uploads') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'intent RPC present',
         (to_regprocedure('public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_04', 'authorize download RPC present',
         (to_regprocedure('public.authorize_student_request_attachment_download(uuid)') IS NOT NULL)
  UNION ALL SELECT 'CHECK_05', 'RLS enabled on uploads',
         (EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='student_request_attachment_uploads' AND c.relrowsecurity
         ))
  UNION ALL SELECT 'CHECK_06', 'identity trigger present',
         (EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='student_request_attachment_uploads'
              AND t.tgname='protect_student_request_attachment_identity' AND NOT t.tgisinternal
         ))
  UNION ALL SELECT 'CHECK_07', 'storage INSERT policy present',
         (EXISTS (
            SELECT 1 FROM pg_policies p
            WHERE p.schemaname='storage' AND p.tablename='objects'
              AND p.policyname='secure_attachment_insert'
         ))
  UNION ALL SELECT 'CHECK_08', 'anon cannot EXECUTE intent RPC',
         (NOT has_function_privilege(
            'anon',
            'public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)',
            'EXECUTE'))
  UNION ALL SELECT 'CHECK_09', 'authenticated cannot SELECT uploads table directly',
         (NOT has_table_privilege('authenticated','public.student_request_attachment_uploads','SELECT'))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(ok) AS (
        SELECT (EXISTS (
            SELECT 1 FROM storage.buckets b
            WHERE b.id='student-request-secure-attachments' AND b.public IS FALSE
              AND b.file_size_limit=5242880
              AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]
              AND b.allowed_mime_types <@ ARRAY['application/pdf','image/jpeg','image/png']::text[]
         ))
        UNION ALL SELECT (to_regclass('public.student_request_attachment_uploads') IS NOT NULL)
        UNION ALL SELECT (to_regprocedure('public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)') IS NOT NULL)
        UNION ALL SELECT (to_regprocedure('public.authorize_student_request_attachment_download(uuid)') IS NOT NULL)
        UNION ALL SELECT (EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='student_request_attachment_uploads' AND c.relrowsecurity))
        UNION ALL SELECT (EXISTS (
            SELECT 1 FROM pg_trigger t
            JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname='student_request_attachment_uploads'
              AND t.tgname='protect_student_request_attachment_identity' AND NOT t.tgisinternal))
        UNION ALL SELECT (EXISTS (
            SELECT 1 FROM pg_policies p
            WHERE p.schemaname='storage' AND p.tablename='objects'
              AND p.policyname='secure_attachment_insert'))
        UNION ALL SELECT (NOT has_function_privilege(
            'anon',
            'public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)',
            'EXECUTE'))
        UNION ALL SELECT (NOT has_table_privilege('authenticated','public.student_request_attachment_uploads','SELECT'))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_7B_POST_VERIFIER_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
