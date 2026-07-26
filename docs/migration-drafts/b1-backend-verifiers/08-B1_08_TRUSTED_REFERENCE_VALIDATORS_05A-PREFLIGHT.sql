-- ============================================================================
-- B1-BACKEND-IMPLEMENTATION-01 / order 8 / PREFLIGHT
-- Draft: REQUEST-B1-TRUSTED-REFERENCE-VALIDATORS-05A.sql
-- READ-ONLY. Ends with ROLLBACK. Zero writes. SOURCE-ONLY companion.
-- Do NOT run as a supabase migration. Operator runs before/after approved apply.
-- ============================================================================

BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY;
SET LOCAL search_path TO public;

-- Predecessor: SEQ07 original OR SEQ07-B (object proof). Do not require version 20260725110000.
WITH checks(check_name, detail, ok) AS (
  SELECT 'CHECK_01', 'to_regclass(''public.semesters'') IS NOT NULL', (to_regclass('public.semesters') IS NOT NULL)
  UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.academic_years'') IS NOT NULL', (to_regclass('public.academic_years') IS NOT NULL)
  UNION ALL SELECT 'CHECK_03', 'to_regclass(''public.student_enrollments'') IS NOT NULL', (to_regclass('public.student_enrollments') IS NOT NULL)
  UNION ALL SELECT 'CHECK_04', 'to_regclass(''public.programs'') IS NOT NULL', (to_regclass('public.programs') IS NOT NULL)
  UNION ALL SELECT 'CHECK_05', 'secure attachments predecessor objects present (SEQ07 or SEQ07-B)',
         (to_regclass('public.student_request_attachment_uploads') IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM storage.buckets b
            WHERE b.id='student-request-secure-attachments' AND b.public IS FALSE
          ))
)
SELECT check_name, detail, ok FROM checks ORDER BY check_name;

DO $guard$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      WITH checks(check_name, detail, ok) AS (
        SELECT 'CHECK_01', 'to_regclass(''public.semesters'') IS NOT NULL', (to_regclass('public.semesters') IS NOT NULL)
        UNION ALL SELECT 'CHECK_02', 'to_regclass(''public.academic_years'') IS NOT NULL', (to_regclass('public.academic_years') IS NOT NULL)
        UNION ALL SELECT 'CHECK_03', 'to_regclass(''public.student_enrollments'') IS NOT NULL', (to_regclass('public.student_enrollments') IS NOT NULL)
        UNION ALL SELECT 'CHECK_04', 'to_regclass(''public.programs'') IS NOT NULL', (to_regclass('public.programs') IS NOT NULL)
        UNION ALL SELECT 'CHECK_05', 'secure attachments predecessor',
               (to_regclass('public.student_request_attachment_uploads') IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM storage.buckets b
                  WHERE b.id='student-request-secure-attachments' AND b.public IS FALSE
                ))
      )
      SELECT 1 FROM checks WHERE NOT ok
    ) failed
  ) THEN
    RAISE EXCEPTION 'B1_ORDER_8_PREFLIGHT_FAILED';
  END IF;
END
$guard$;

ROLLBACK;
