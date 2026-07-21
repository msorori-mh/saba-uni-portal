-- ============================================================================
-- DRAFT (NOT APPLIED) — ACADEMIC-DATA-QUALITY-01 / Gap G-07
-- study_plan_courses.semester_code is free text (migration 20260531231424:
--   `semester_code text NOT NULL` with no CHECK).
-- Validator-side whitelist (first/second/summer + Arabic aliases) was fixed in
-- the same PR; this draft enforces the canonical set at the database level.
--
-- Pattern: forward-only. Inspect existing values, optionally normalize
-- non-canonical values, add CHECK as NOT VALID, then VALIDATE.
-- ============================================================================

-- 1) Pre-check: inventory existing values (expect only 'first'/'second'/'summer')
-- SELECT semester_code, count(*) FROM public.study_plan_courses GROUP BY 1 ORDER BY 2 DESC;

-- 2) Optional normalization (run only if pre-check shows non-canonical values;
--    review row counts before applying):
-- UPDATE public.study_plan_courses SET semester_code = 'first'
--  WHERE semester_code IN ('الأول', 'الاول', 'فصل أول', '1');
-- UPDATE public.study_plan_courses SET semester_code = 'second'
--  WHERE semester_code IN ('الثاني', 'فصل ثاني', '2');
-- UPDATE public.study_plan_courses SET semester_code = 'summer'
--  WHERE semester_code IN ('الصيفي', 'صيفي', '3');

-- 3) Add constraint (NOT VALID first so existing rows are not scanned):
ALTER TABLE public.study_plan_courses
  ADD CONSTRAINT study_plan_courses_semester_code_check
    CHECK (semester_code IN ('first', 'second', 'summer')) NOT VALID;

-- 4) After step (1) shows only canonical values:
-- ALTER TABLE public.study_plan_courses VALIDATE CONSTRAINT study_plan_courses_semester_code_check;

-- Rollback (pre-VALIDATE): ALTER TABLE public.study_plan_courses DROP CONSTRAINT IF EXISTS study_plan_courses_semester_code_check;
