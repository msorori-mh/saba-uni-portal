-- Cohort year is admission year, never inferred from current level or academic number.
-- Existing profiles and mappings remain unassigned until reviewed explicitly.
BEGIN;

ALTER TABLE public.student_profiles ADD COLUMN admission_year integer;
ALTER TABLE public.student_profiles ADD CONSTRAINT student_admission_year_range
  CHECK (admission_year IS NULL OR admission_year BETWEEN 1950 AND 2100);

CREATE TABLE public.study_plan_cohorts (
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  admission_year integer NOT NULL CHECK (admission_year BETWEEN 1950 AND 2100),
  study_plan_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, admission_year),
  CONSTRAINT study_plan_cohort_same_program_fkey
    FOREIGN KEY (study_plan_id, program_id)
    REFERENCES public.study_plans(id, program_id) ON DELETE RESTRICT
);
CREATE INDEX study_plan_cohorts_plan_idx ON public.study_plan_cohorts(study_plan_id);
ALTER TABLE public.study_plan_cohorts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_plan_cohorts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_plan_cohorts TO service_role;

-- Enforce the mapping for every writer, including imports and direct service-role
-- writes. Unassigned legacy students remain unassigned until reviewed.
CREATE FUNCTION public.guard_study_plan_cohort_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  -- Serialize profile and mapping writes for the same admission cohort.
  IF NEW.admission_year IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(NEW.program_id::text || ':' || NEW.admission_year::text, 0)
    );
  END IF;
  IF TG_TABLE_NAME = 'student_profiles' THEN
    IF NEW.admission_year IS NOT NULL AND NEW.study_plan_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.study_plan_cohorts c
         WHERE c.program_id = NEW.program_id
           AND c.admission_year = NEW.admission_year
           AND c.study_plan_id <> NEW.study_plan_id
       ) THEN
      RAISE EXCEPTION 'STUDY_PLAN_COHORT_MISMATCH' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM public.student_profiles s
    WHERE s.program_id = NEW.program_id
      AND s.admission_year = NEW.admission_year
      AND s.study_plan_id IS NOT NULL
      AND s.study_plan_id <> NEW.study_plan_id
  ) THEN
    RAISE EXCEPTION 'STUDY_PLAN_COHORT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_study_plan_cohort_consistency() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_student_cohort_consistency
  BEFORE INSERT OR UPDATE OF program_id, admission_year, study_plan_id
  ON public.student_profiles FOR EACH ROW
  EXECUTE FUNCTION public.guard_study_plan_cohort_consistency();
CREATE TRIGGER guard_mapping_cohort_consistency
  BEFORE INSERT OR UPDATE OF program_id, admission_year, study_plan_id
  ON public.study_plan_cohorts FOR EACH ROW
  EXECUTE FUNCTION public.guard_study_plan_cohort_consistency();

-- student_profiles has a self-update policy; protect the new academic field.
CREATE OR REPLACE FUNCTION public.guard_student_study_plan_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.study_plan_id IS DISTINCT FROM OLD.study_plan_id
          OR NEW.admission_year IS DISTINCT FROM OLD.admission_year)
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'STUDY_PLAN_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_student_study_plan_assignment() FROM PUBLIC, anon, authenticated;

COMMIT;
