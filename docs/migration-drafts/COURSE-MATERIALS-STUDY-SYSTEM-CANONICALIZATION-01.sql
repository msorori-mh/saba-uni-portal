-- COURSE-SYLLABUS-MATERIALS-AND-STUDY-SYSTEM-CLOSURE-01
-- Forward-only. No historical row rewrite. NOT APPLIED — awaiting production gate approval.
-- PRODUCTION ORDER: this migration MUST NOT be applied while any active course
-- section used for materials still has study_system NULL
-- (preflight requirement: ACTIVE_SECTIONS_WITH_NULL_STUDY_SYSTEM = 0).

-- 1) Widen course_materials.study_system to the canonical vocabulary while
--    keeping legacy literals valid for historical rows.
ALTER TABLE public.course_materials
  DROP CONSTRAINT IF EXISTS course_materials_study_system_check;

ALTER TABLE public.course_materials
  ADD CONSTRAINT course_materials_study_system_check
  CHECK (study_system = ANY (ARRAY[
    'general'::text, 'private'::text, 'both'::text,   -- canonical
    'regular'::text, 'parallel'::text                 -- legacy, read-only compatibility
  ]));

-- 2) Server-side invariant: a lecture-scoped material MUST reference a session
--    of the CURRENT delivery plan of its own section, and its title/week/lecture
--    are derived from that session. General materials must not carry a session.
CREATE OR REPLACE FUNCTION public.course_materials_derive_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_section_system text;
BEGIN
  SELECT cs.study_system INTO v_section_system
  FROM public.course_sections cs
  WHERE cs.id = NEW.course_section_id;

  -- المجموعة الدراسية هي مصدر الحقيقة لنظام الدراسة.
  -- FAIL CLOSED: مجموعة غير مصنفة => رفض الكتابة الجديدة، ولا يُفترض 'both'.
  IF v_section_system IS NULL OR btrim(v_section_system) = ''
     OR v_section_system NOT IN ('general','private','both','regular','parallel') THEN
    RAISE EXCEPTION 'UNKNOWN_SECTION_STUDY_SYSTEM'
      USING HINT = 'نظام الدراسة للمجموعة غير محدد';
  END IF;

  NEW.study_system := CASE v_section_system
    WHEN 'regular'  THEN 'general'   -- legacy compatibility mapping
    WHEN 'parallel' THEN 'private'
    ELSE v_section_system
  END;

  IF NEW.material_scope = 'lecture' THEN
    IF NEW.plan_session_id IS NULL THEN
      RAISE EXCEPTION 'MATERIAL_LECTURE_REQUIRES_PLAN_SESSION';
    END IF;

    SELECT s.session_number, s.week_number, s.planned_title
      INTO v_session
    FROM public.course_delivery_plan_sessions s
    JOIN public.course_delivery_plans p ON p.id = s.plan_id
    WHERE s.id = NEW.plan_session_id
      AND p.course_section_id = NEW.course_section_id
      AND p.is_current = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'MATERIAL_PLAN_SESSION_NOT_IN_CURRENT_PLAN';
    END IF;

    NEW.lecture_number := v_session.session_number;
    NEW.week_number    := v_session.week_number;
    NEW.title          := v_session.planned_title;
  ELSE
    NEW.plan_session_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_materials_derive_scope_trg ON public.course_materials;
CREATE TRIGGER course_materials_derive_scope_trg
  BEFORE INSERT OR UPDATE ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.course_materials_derive_scope();
