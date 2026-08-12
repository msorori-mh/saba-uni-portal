-- 1) Repair offerings whose academic_year_id contradicts their semester's year
UPDATE public.course_offerings o
SET academic_year_id = s.academic_year_id
FROM public.semesters s
WHERE s.id = o.semester_id
  AND o.academic_year_id IS DISTINCT FROM s.academic_year_id;

-- 2) Canonical current year must be the year owning the canonical current semester
UPDATE public.academic_years
SET is_current = (id = (SELECT academic_year_id FROM public.semesters WHERE is_current LIMIT 1))
WHERE is_current
   OR id = (SELECT academic_year_id FROM public.semesters WHERE is_current LIMIT 1);

-- 3) Guard: offering year must equal its semester's year
CREATE OR REPLACE FUNCTION public.assert_offering_term_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_year uuid;
BEGIN
  SELECT academic_year_id INTO v_year FROM public.semesters WHERE id = NEW.semester_id;
  IF v_year IS NULL THEN
    RAISE EXCEPTION 'OFFERING_SEMESTER_NOT_FOUND';
  END IF;
  IF NEW.academic_year_id IS DISTINCT FROM v_year THEN
    RAISE EXCEPTION 'OFFERING_TERM_INCONSISTENT: academic_year_id must match semester year';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offering_term_consistency ON public.course_offerings;
CREATE TRIGGER trg_offering_term_consistency
BEFORE INSERT OR UPDATE OF academic_year_id, semester_id ON public.course_offerings
FOR EACH ROW EXECUTE FUNCTION public.assert_offering_term_consistency();

-- 4) Guard: single canonical current year / semester, mutually consistent
CREATE OR REPLACE FUNCTION public.assert_canonical_current_term()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_years int; v_sems int; v_year uuid; v_sem_year uuid;
BEGIN
  SELECT count(*) INTO v_years FROM public.academic_years WHERE is_current;
  SELECT count(*) INTO v_sems FROM public.semesters WHERE is_current;
  IF v_years > 1 THEN RAISE EXCEPTION 'MULTIPLE_CURRENT_ACADEMIC_YEARS'; END IF;
  IF v_sems > 1 THEN RAISE EXCEPTION 'MULTIPLE_CURRENT_SEMESTERS'; END IF;
  IF v_years = 1 AND v_sems = 1 THEN
    SELECT id INTO v_year FROM public.academic_years WHERE is_current;
    SELECT academic_year_id INTO v_sem_year FROM public.semesters WHERE is_current;
    IF v_year IS DISTINCT FROM v_sem_year THEN
      RAISE EXCEPTION 'CURRENT_TERM_INCONSISTENT: current semester must belong to current academic year';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_current_term_years ON public.academic_years;
CREATE CONSTRAINT TRIGGER trg_current_term_years
AFTER INSERT OR UPDATE OF is_current ON public.academic_years
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_canonical_current_term();

DROP TRIGGER IF EXISTS trg_current_term_semesters ON public.semesters;
CREATE CONSTRAINT TRIGGER trg_current_term_semesters
AFTER INSERT OR UPDATE OF is_current, academic_year_id ON public.semesters
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.assert_canonical_current_term();