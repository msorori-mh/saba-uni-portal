-- FACULTY-GRADE-INTEGRITY-01
-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- Source: faculty-portal code review 2026-10-01 (findings H1, H3).
-- Forward-only. The applied migration
-- 20260531233850_47d5bb58-12ea-4f36-bb62-79008b97ecf4.sql is intentionally not edited.
--
-- H1  Faculty could UPDATE/DELETE a grade_component after grades against it
--     were submitted/approved (policies gc_update / gc_delete only check
--     section ownership; student_grades.grade_component_id had no FK).
--     Effect: approved marks silently stop counting or are re-scaled, and the
--     student_grades audit trail records nothing.
-- H3  A grade row could reference a component of ANOTHER section
--     (validate_student_grade only checked max_score).
--
-- Not covered here (policy decision, see review report): restricting grade
-- writes to current-term / enrolled rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- Preflight: report (do not silently fix) existing inconsistent rows.
-- ---------------------------------------------------------------------------
DO $preflight$
DECLARE
  v_orphans integer;
  v_cross_section integer;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.student_grades sg
  WHERE NOT EXISTS (SELECT 1 FROM public.grade_components gc WHERE gc.id = sg.grade_component_id);

  SELECT count(*) INTO v_cross_section
  FROM public.student_grades sg
  JOIN public.grade_components gc ON gc.id = sg.grade_component_id
  JOIN public.student_enrollments se ON se.id = sg.student_enrollment_id
  WHERE gc.course_section_id IS DISTINCT FROM se.course_section_id;

  RAISE NOTICE 'FACULTY-GRADE-INTEGRITY-01 preflight: orphan_grades=%, cross_section_grades=%',
    v_orphans, v_cross_section;
  -- Orphans/cross-section rows are left for a reviewed data decision; the FK
  -- below is NOT VALID so existing rows do not block the apply.
END
$preflight$;

-- ---------------------------------------------------------------------------
-- H1a: lock components once any grade on them left 'draft'.
--      Renames / sort_order changes stay allowed. Registrar/admin keep the
--      ability to correct (audited elsewhere). Service-role maintenance
--      (auth.uid() IS NULL) is not blocked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_grade_component_after_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar']) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.max_score IS NOT DISTINCT FROM OLD.max_score
     AND NEW.weight IS NOT DISTINCT FROM OLD.weight
     AND NEW.course_section_id IS NOT DISTINCT FROM OLD.course_section_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_grades sg
    WHERE sg.grade_component_id = OLD.id
      AND sg.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'GRADE_COMPONENT_LOCKED: component has submitted or approved grades'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_grade_component_after_submission() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS gc_guard_after_submission ON public.grade_components;
CREATE TRIGGER gc_guard_after_submission
BEFORE UPDATE OR DELETE ON public.grade_components
FOR EACH ROW EXECUTE FUNCTION public.guard_grade_component_after_submission();

-- ---------------------------------------------------------------------------
-- H1b: referential integrity. CASCADE only ever removes DRAFT grades, because
--      the trigger above refuses to delete a component that has non-draft
--      grades. NOT VALID: enforced for new/updated rows; validate after the
--      preflight orphans are resolved:
--        ALTER TABLE public.student_grades VALIDATE CONSTRAINT student_grades_component_fk;
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_grades
  ADD CONSTRAINT student_grades_component_fk
  FOREIGN KEY (grade_component_id)
  REFERENCES public.grade_components(id)
  ON DELETE CASCADE
  NOT VALID;

-- ---------------------------------------------------------------------------
-- H3: a grade's component must belong to the enrollment's section.
--     Same function name/trigger (sg_validate); behaviour is a strict superset.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_student_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max numeric;
  v_component_section uuid;
  v_enrollment_section uuid;
BEGIN
  SELECT max_score, course_section_id
    INTO v_max, v_component_section
  FROM public.grade_components
  WHERE id = NEW.grade_component_id;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'Invalid grade component';
  END IF;

  SELECT course_section_id INTO v_enrollment_section
  FROM public.student_enrollments
  WHERE id = NEW.student_enrollment_id;
  IF v_enrollment_section IS NULL
     OR v_enrollment_section IS DISTINCT FROM v_component_section THEN
    RAISE EXCEPTION 'Grade component does not belong to the enrollment section'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.score > v_max THEN
    RAISE EXCEPTION 'Score % exceeds component max_score %', NEW.score, v_max;
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;

-- Verification (run after apply, read-only):
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.grade_components'::regclass AND NOT tgisinternal;
--   SELECT conname, convalidated FROM pg_constraint WHERE conname = 'student_grades_component_fk';
-- Negative tests to add (PG17 harness): faculty UPDATE max_score / DELETE on a
-- component with a submitted grade → 42501; INSERT grade with a component of
-- another section → 23514; registrar correction still succeeds.
