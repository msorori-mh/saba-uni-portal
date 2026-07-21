-- ============================================================================
-- DRAFT (NOT APPLIED) — ACADEMIC-DATA-QUALITY-01 / Gap G-10
-- No admission cohort (دفعة القبول) discriminator on student_profiles
-- (G9 readiness audit §3.1: no admission_year / cohort / intake_batch).
-- Cohort analytics, targeting and materials binding currently rely on
-- academic-number prefix heuristics and 'latest academic status' fallbacks
-- (STUDENT-TO-COHORT-BINDING-AUDIT-01 HIGH-1..3).
--
-- Pattern: forward-only, additive, nullable. Populating values needs the
-- cohort definition + data source (NEEDS_USER_INPUT).
-- ============================================================================

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS admission_year_id uuid;
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS admission_semester_id uuid;

ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_admission_year_id_fkey
    FOREIGN KEY (admission_year_id) REFERENCES public.academic_years(id) ON DELETE SET NULL NOT VALID;
ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_admission_semester_id_fkey
    FOREIGN KEY (admission_semester_id) REFERENCES public.semesters(id) ON DELETE SET NULL NOT VALID;
-- ALTER TABLE public.student_profiles VALIDATE CONSTRAINT student_profiles_admission_year_id_fkey;
-- ALTER TABLE public.student_profiles VALIDATE CONSTRAINT student_profiles_admission_semester_id_fkey;

COMMENT ON COLUMN public.student_profiles.admission_year_id IS
  'سنة القبول (دفعة الطالب) — G-10. المصدر والتعبئة بعد اعتماد التعريف.';
COMMENT ON COLUMN public.student_profiles.admission_semester_id IS
  'فصل القبول (دفعة الطالب) — G-10. المصدر والتعبئة بعد اعتماد التعريف.';

-- Follow-up source task (not DB): extend the students import template/validator
-- with optional admission_year/admission_semester columns resolved through the
-- year-scoped semester resolution (G-02 fix).

-- Rollback: ALTER TABLE public.student_profiles DROP CONSTRAINT IF EXISTS student_profiles_admission_semester_id_fkey;
--           ALTER TABLE public.student_profiles DROP CONSTRAINT IF EXISTS student_profiles_admission_year_id_fkey;
--           ALTER TABLE public.student_profiles DROP COLUMN IF EXISTS admission_semester_id;
--           ALTER TABLE public.student_profiles DROP COLUMN IF EXISTS admission_year_id;
