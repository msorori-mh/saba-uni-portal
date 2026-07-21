-- ============================================================================
-- DRAFT (NOT APPLIED) — ACADEMIC-DATA-QUALITY-01 / Gaps G-04 + G-13
-- No student -> study plan binding exists: student_profiles has no
-- study_plan_id (see src/integrations/supabase/types.ts), so graduation
-- clearance / remaining-courses / project-eligibility cannot know which plan
-- version applies to a student. Also, multiple active plans per program are
-- currently possible (study_plans has UNIQUE (program_id, version) only).
--
-- Pattern: forward-only, additive, nullable first. Backfill policy
-- (which plan binds which admission cohort) is NEEDS_USER_INPUT — DO NOT
-- backfill before that decision.
-- ============================================================================

-- 1) Student -> plan binding (nullable; nullable FK keeps existing rows valid)
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS study_plan_id uuid;

ALTER TABLE public.student_profiles
  ADD CONSTRAINT student_profiles_study_plan_id_fkey
    FOREIGN KEY (study_plan_id) REFERENCES public.study_plans(id) ON DELETE SET NULL NOT VALID;
-- Nullable FK has nothing to validate for NULLs, but run for completeness:
-- ALTER TABLE public.student_profiles VALIDATE CONSTRAINT student_profiles_study_plan_id_fkey;

COMMENT ON COLUMN public.student_profiles.study_plan_id IS
  'نسخة الخطة الدراسية الواجبة على الطالب (G-04). التعبئة تتم بعد اعتماد سياسة الربط.';

-- 2) One active plan per program (G-13)
-- Pre-check (expect 0 rows before creating the index):
-- SELECT program_id, count(*) FROM public.study_plans WHERE is_active GROUP BY 1 HAVING count(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS study_plans_one_active_per_program
  ON public.study_plans (program_id) WHERE is_active;

-- 3) OPTIONAL future backfill — POLICY DECISION REQUIRED (NEEDS_USER_INPUT).
--    Example rule (latest active plan of the student's program) — COMMENTED OUT:
-- UPDATE public.student_profiles sp
--    SET study_plan_id = (
--      SELECT p.id FROM public.study_plans p
--       WHERE p.program_id = sp.program_id AND p.is_active
--       ORDER BY p.version DESC LIMIT 1
--    )
--  WHERE sp.study_plan_id IS NULL;

-- Rollback: DROP INDEX IF EXISTS study_plans_one_active_per_program;
--           ALTER TABLE public.student_profiles DROP CONSTRAINT IF EXISTS student_profiles_study_plan_id_fkey;
--           ALTER TABLE public.student_profiles DROP COLUMN IF EXISTS study_plan_id;
