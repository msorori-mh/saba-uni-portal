
-- 1) Preventive trigger: enforce credit_hours = theory + ceil(practical/2)
CREATE OR REPLACE FUNCTION public.enforce_course_credit_hours()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.theory_hours := COALESCE(NEW.theory_hours, 0);
  NEW.practical_hours := COALESCE(NEW.practical_hours, 0);
  IF NEW.theory_hours < 0 OR NEW.practical_hours < 0 THEN
    RAISE EXCEPTION 'theory_hours/practical_hours must be >= 0';
  END IF;
  NEW.credit_hours := NEW.theory_hours + CEIL(NEW.practical_hours / 2.0)::int;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_course_credit_hours ON public.courses;
CREATE TRIGGER trg_enforce_course_credit_hours
BEFORE INSERT OR UPDATE OF theory_hours, practical_hours, credit_hours
ON public.courses
FOR EACH ROW EXECUTE FUNCTION public.enforce_course_credit_hours();

-- 2) Fix existing courses (trigger will recompute)
UPDATE public.courses
SET theory_hours = COALESCE(theory_hours, 0),
    practical_hours = COALESCE(practical_hours, 0);

-- 3) Recompute study_plans.total_credit_hours from study_plan_courses
UPDATE public.study_plans sp
SET total_credit_hours = COALESCE(t.total, 0),
    updated_at = now()
FROM (
  SELECT spc.study_plan_id, SUM(c.credit_hours)::int AS total
  FROM public.study_plan_courses spc
  JOIN public.courses c ON c.id = spc.course_id
  GROUP BY spc.study_plan_id
) t
WHERE sp.id = t.study_plan_id;
