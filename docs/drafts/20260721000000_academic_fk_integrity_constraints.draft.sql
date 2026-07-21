-- ============================================================================
-- DRAFT (NOT APPLIED) — ACADEMIC-DATA-QUALITY-01 / Gap G-03
-- Academic referential integrity for core fact tables.
--
-- Evidence: src/integrations/supabase/types.ts shows Relationships: [] for
--   course_offerings, student_enrollments, student_grades, grade_components;
--   student_requests has an FK on request_type only (student_profile_id none).
-- Origin: migrations 20260531232114 (course_offerings) and 20260531232752
--   (student_enrollments) created uuid columns without REFERENCES.
--
-- Pattern: forward-only, additive only. Constraints added NOT VALID so existing
-- rows are not scanned/locked; run the orphan pre-checks, cleanse if needed,
-- then VALIDATE CONSTRAINT. No DROP, no data rewrite.
-- Owner: source draft — application requires production-apply approval.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1) Orphan pre-checks (read-only; run first, expect 0 rows each)
-- --------------------------------------------------------------------------
-- SELECT o.id FROM public.course_offerings o LEFT JOIN public.courses c ON c.id = o.course_id WHERE c.id IS NULL;
-- SELECT o.id FROM public.course_offerings o LEFT JOIN public.academic_years y ON y.id = o.academic_year_id WHERE y.id IS NULL;
-- SELECT o.id FROM public.course_offerings o LEFT JOIN public.semesters s ON s.id = o.semester_id WHERE s.id IS NULL;
-- SELECT o.id FROM public.course_offerings o LEFT JOIN public.programs p ON p.id = o.program_id WHERE p.id IS NULL;
-- SELECT o.id FROM public.course_offerings o LEFT JOIN public.academic_levels l ON l.id = o.level_id WHERE l.id IS NULL;
-- SELECT e.id FROM public.student_enrollments e LEFT JOIN public.student_profiles sp ON sp.id = e.student_profile_id WHERE sp.id IS NULL;
-- SELECT e.id FROM public.student_enrollments e LEFT JOIN public.course_sections cs ON cs.id = e.course_section_id WHERE cs.id IS NULL;
-- SELECT g.id FROM public.student_grades g LEFT JOIN public.student_enrollments e ON e.id = g.student_enrollment_id WHERE e.id IS NULL;
-- SELECT g.id FROM public.student_grades g LEFT JOIN public.grade_components gc ON gc.id = g.grade_component_id WHERE gc.id IS NULL;
-- SELECT gc.id FROM public.grade_components gc LEFT JOIN public.course_sections cs ON cs.id = gc.course_section_id WHERE cs.id IS NULL;
-- SELECT r.id FROM public.student_requests r LEFT JOIN public.student_profiles sp ON sp.id = r.student_profile_id WHERE sp.id IS NULL;

-- --------------------------------------------------------------------------
-- 2) course_offerings — five missing FKs
-- --------------------------------------------------------------------------
ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_academic_year_id_fkey
    FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_semester_id_fkey
    FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_program_id_fkey
    FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_level_id_fkey
    FOREIGN KEY (level_id) REFERENCES public.academic_levels(id) ON DELETE RESTRICT NOT VALID;

-- --------------------------------------------------------------------------
-- 3) student_enrollments
-- --------------------------------------------------------------------------
ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_student_profile_id_fkey
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_course_section_id_fkey
    FOREIGN KEY (course_section_id) REFERENCES public.course_sections(id) ON DELETE RESTRICT NOT VALID;

-- --------------------------------------------------------------------------
-- 4) student_grades + grade_components
-- --------------------------------------------------------------------------
ALTER TABLE public.student_grades
  ADD CONSTRAINT student_grades_student_enrollment_id_fkey
    FOREIGN KEY (student_enrollment_id) REFERENCES public.student_enrollments(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.student_grades
  ADD CONSTRAINT student_grades_grade_component_id_fkey
    FOREIGN KEY (grade_component_id) REFERENCES public.grade_components(id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.grade_components
  ADD CONSTRAINT grade_components_course_section_id_fkey
    FOREIGN KEY (course_section_id) REFERENCES public.course_sections(id) ON DELETE RESTRICT NOT VALID;

-- --------------------------------------------------------------------------
-- 5) student_requests.student_profile_id
-- --------------------------------------------------------------------------
ALTER TABLE public.student_requests
  ADD CONSTRAINT student_requests_student_profile_id_fkey
    FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE RESTRICT NOT VALID;

-- --------------------------------------------------------------------------
-- 6) After orphan pre-checks return 0 rows, validate (separate apply step):
-- --------------------------------------------------------------------------
-- ALTER TABLE public.course_offerings VALIDATE CONSTRAINT course_offerings_course_id_fkey;
-- ALTER TABLE public.course_offerings VALIDATE CONSTRAINT course_offerings_academic_year_id_fkey;
-- ALTER TABLE public.course_offerings VALIDATE CONSTRAINT course_offerings_semester_id_fkey;
-- ALTER TABLE public.course_offerings VALIDATE CONSTRAINT course_offerings_program_id_fkey;
-- ALTER TABLE public.course_offerings VALIDATE CONSTRAINT course_offerings_level_id_fkey;
-- ALTER TABLE public.student_enrollments VALIDATE CONSTRAINT student_enrollments_student_profile_id_fkey;
-- ALTER TABLE public.student_enrollments VALIDATE CONSTRAINT student_enrollments_course_section_id_fkey;
-- ALTER TABLE public.student_grades VALIDATE CONSTRAINT student_grades_student_enrollment_id_fkey;
-- ALTER TABLE public.student_grades VALIDATE CONSTRAINT student_grades_grade_component_id_fkey;
-- ALTER TABLE public.grade_components VALIDATE CONSTRAINT grade_components_course_section_id_fkey;
-- ALTER TABLE public.student_requests VALIDATE CONSTRAINT student_requests_student_profile_id_fkey;

-- Rollback (if ever needed pre-VALIDATE): DROP CONSTRAINT IF EXISTS <name> on each table.
