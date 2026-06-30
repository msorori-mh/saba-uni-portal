-- ADMIN-STUDENTS-STUDY-SYSTEM-SUPPORT-01
-- Store the study system on the actual student table used by the app.
-- Existing rows are intentionally left NULL to avoid guessing historical data.

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS study_system text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'student_profiles_study_system_check'
      AND conrelid = 'public.student_profiles'::regclass
  ) THEN
    ALTER TABLE public.student_profiles
      ADD CONSTRAINT student_profiles_study_system_check
      CHECK (study_system IS NULL OR study_system IN ('regular', 'private'));
  END IF;
END $$;
