
ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_student_profile_id_fkey
  FOREIGN KEY (student_profile_id) REFERENCES public.student_profiles(id) ON DELETE CASCADE;

ALTER TABLE public.student_enrollments
  ADD CONSTRAINT student_enrollments_course_section_id_fkey
  FOREIGN KEY (course_section_id) REFERENCES public.course_sections(id) ON DELETE CASCADE;

ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_course_id_fkey
  FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_semester_id_fkey
  FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_program_id_fkey
  FOREIGN KEY (program_id) REFERENCES public.programs(id) ON DELETE CASCADE;

ALTER TABLE public.course_offerings
  ADD CONSTRAINT course_offerings_level_id_fkey
  FOREIGN KEY (level_id) REFERENCES public.academic_levels(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
