CREATE OR REPLACE FUNCTION public.validate_class_schedule_conflict()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_self uuid := COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  v_course uuid; v_year uuid; v_sem uuid;
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  SELECT co.course_id, co.academic_year_id, co.semester_id INTO v_course, v_year, v_sem
  FROM public.course_sections s JOIN public.course_offerings co ON co.id = s.course_offering_id
  WHERE s.id = NEW.course_section_id;

  -- Joint lecture: same slot + same room + same (non-null) lecturer + same course/year/semester,
  -- different section. Such rows are exempt from room and lecturer conflicts only.
  IF EXISTS (SELECT 1 FROM public.class_schedule cs
    WHERE cs.id <> v_self AND cs.room_id = NEW.room_id AND cs.time_slot_id = NEW.time_slot_id
      AND cs.status IN ('draft','published')
      AND NOT (
        NEW.faculty_profile_id IS NOT NULL AND cs.faculty_profile_id = NEW.faculty_profile_id
        AND cs.course_section_id <> NEW.course_section_id
        AND EXISTS (SELECT 1 FROM public.course_sections s2 JOIN public.course_offerings o2 ON o2.id = s2.course_offering_id
          WHERE s2.id = cs.course_section_id AND o2.course_id = v_course
            AND o2.academic_year_id = v_year AND o2.semester_id = v_sem))) THEN
    RAISE EXCEPTION 'تعارض القاعة: القاعة محجوزة في نفس الفترة الزمنية لجدول آخر';
  END IF;

  IF NEW.faculty_profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.class_schedule cs
    WHERE cs.id <> v_self AND cs.faculty_profile_id = NEW.faculty_profile_id AND cs.time_slot_id = NEW.time_slot_id
      AND cs.status IN ('draft','published')
      AND NOT (
        cs.room_id = NEW.room_id AND cs.course_section_id <> NEW.course_section_id
        AND EXISTS (SELECT 1 FROM public.course_sections s2 JOIN public.course_offerings o2 ON o2.id = s2.course_offering_id
          WHERE s2.id = cs.course_section_id AND o2.course_id = v_course
            AND o2.academic_year_id = v_year AND o2.semester_id = v_sem))) THEN
    RAISE EXCEPTION 'تعارض الأستاذ: عضو هيئة التدريس لديه جدول آخر في نفس الفترة الزمنية';
  END IF;

  IF EXISTS (SELECT 1 FROM public.class_schedule
    WHERE id <> v_self AND course_section_id = NEW.course_section_id AND time_slot_id = NEW.time_slot_id
      AND status IN ('draft','published')) THEN
    RAISE EXCEPTION 'تعارض الشعبة: الشعبة لديها جدول آخر في نفس الفترة الزمنية';
  END IF;
  RETURN NEW;
END; $function$;