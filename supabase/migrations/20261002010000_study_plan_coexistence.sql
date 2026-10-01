-- Keep the timetable platform's plan code and version as separate identities.
-- Existing plans retain their IDs and versions; no student is assigned implicitly.
BEGIN;

ALTER TABLE public.study_plans ADD COLUMN plan_code text;
ALTER TABLE public.study_plans DROP CONSTRAINT IF EXISTS study_plans_program_id_version_key;
ALTER TABLE public.study_plans
  ADD CONSTRAINT study_plans_program_name_version_key UNIQUE (program_id, name, version);
CREATE UNIQUE INDEX study_plans_program_code_key
  ON public.study_plans (program_id, lower(plan_code)) WHERE plan_code IS NOT NULL;
ALTER TABLE public.study_plans
  ADD CONSTRAINT study_plans_id_program_key UNIQUE (id, program_id);

ALTER TABLE public.student_profiles ADD COLUMN study_plan_id uuid;
ALTER TABLE public.student_profiles ADD CONSTRAINT student_plan_requires_program
  CHECK (study_plan_id IS NULL OR program_id IS NOT NULL);
ALTER TABLE public.student_profiles ADD CONSTRAINT student_plan_same_program_fkey
  FOREIGN KEY (study_plan_id, program_id)
  REFERENCES public.study_plans (id, program_id) ON DELETE RESTRICT;
CREATE INDEX student_profiles_study_plan_idx
  ON public.student_profiles (study_plan_id) WHERE study_plan_id IS NOT NULL;

-- The pre-existing self UPDATE policy grants students full-row updates. Keep
-- curriculum assignment available only through the audited server service role.
CREATE FUNCTION public.guard_student_study_plan_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.study_plan_id IS DISTINCT FROM OLD.study_plan_id
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'STUDY_PLAN_ASSIGNMENT_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_student_study_plan_assignment
  BEFORE UPDATE ON public.student_profiles FOR EACH ROW
  EXECUTE FUNCTION public.guard_student_study_plan_assignment();
REVOKE ALL ON FUNCTION public.guard_student_study_plan_assignment() FROM PUBLIC, anon, authenticated;

COMMIT;
