-- ============================================================
-- Phase 11E.1 — Timetable & Scheduling Foundation
-- ============================================================

DROP TABLE IF EXISTS public.class_schedule CASCADE;

DO $$ BEGIN CREATE TYPE public.room_type AS ENUM ('lecture','lab','office','hall'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.day_of_week AS ENUM ('saturday','sunday','monday','tuesday','wednesday','thursday','friday'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.schedule_type AS ENUM ('lecture','lab','tutorial','exam'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.schedule_status AS ENUM ('draft','published','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- BUILDINGS
CREATE TABLE IF NOT EXISTS public.buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL, name_en text, code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.buildings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.buildings TO authenticated;
GRANT ALL ON public.buildings TO service_role;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "buildings_read_all" ON public.buildings;
CREATE POLICY "buildings_read_all" ON public.buildings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "buildings_write_admin" ON public.buildings;
CREATE POLICY "buildings_write_admin" ON public.buildings FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));
DROP TRIGGER IF EXISTS trg_buildings_updated_at ON public.buildings;
CREATE TRIGGER trg_buildings_updated_at BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ROOMS
CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id uuid NOT NULL REFERENCES public.buildings(id) ON DELETE RESTRICT,
  name_ar text NOT NULL, name_en text, code text NOT NULL UNIQUE,
  room_type public.room_type NOT NULL DEFAULT 'lecture',
  capacity int NOT NULL DEFAULT 30 CHECK (capacity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rooms_building ON public.rooms(building_id);
GRANT SELECT ON public.rooms TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rooms_read_all" ON public.rooms;
CREATE POLICY "rooms_read_all" ON public.rooms FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rooms_write_admin" ON public.rooms;
CREATE POLICY "rooms_write_admin" ON public.rooms FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));
DROP TRIGGER IF EXISTS trg_rooms_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TIME SLOTS
CREATE TABLE IF NOT EXISTS public.time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  day_of_week public.day_of_week NOT NULL,
  start_time time NOT NULL, end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT time_slots_time_order CHECK (start_time < end_time),
  CONSTRAINT time_slots_unique UNIQUE (day_of_week, start_time, end_time)
);
GRANT SELECT ON public.time_slots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.time_slots TO authenticated;
GRANT ALL ON public.time_slots TO service_role;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_slots_read_all" ON public.time_slots;
CREATE POLICY "time_slots_read_all" ON public.time_slots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "time_slots_write_admin" ON public.time_slots;
CREATE POLICY "time_slots_write_admin" ON public.time_slots FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));
DROP TRIGGER IF EXISTS trg_time_slots_updated_at ON public.time_slots;
CREATE TRIGGER trg_time_slots_updated_at BEFORE UPDATE ON public.time_slots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CLASS SCHEDULE
CREATE TABLE public.class_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_section_id uuid NOT NULL REFERENCES public.course_sections(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  faculty_profile_id uuid REFERENCES public.faculty_profiles(id) ON DELETE SET NULL,
  time_slot_id uuid NOT NULL REFERENCES public.time_slots(id) ON DELETE RESTRICT,
  schedule_type public.schedule_type NOT NULL DEFAULT 'lecture',
  status public.schedule_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_class_schedule_section ON public.class_schedule(course_section_id);
CREATE INDEX idx_class_schedule_room_slot ON public.class_schedule(room_id, time_slot_id);
CREATE INDEX idx_class_schedule_faculty_slot ON public.class_schedule(faculty_profile_id, time_slot_id);
CREATE INDEX idx_class_schedule_status ON public.class_schedule(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_schedule TO authenticated;
GRANT ALL ON public.class_schedule TO service_role;
ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_schedule_read_admin" ON public.class_schedule FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','dean','student_affairs']));
CREATE POLICY "class_schedule_read_assigned_faculty" ON public.class_schedule FOR SELECT TO authenticated
  USING (status IN ('draft','published') AND faculty_profile_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.faculty_profiles fp WHERE fp.id = class_schedule.faculty_profile_id AND fp.user_id = auth.uid()));
CREATE POLICY "class_schedule_read_section_faculty" ON public.class_schedule FOR SELECT TO authenticated
  USING (status IN ('draft','published') AND public.is_faculty_of_section(auth.uid(), course_section_id));
CREATE POLICY "class_schedule_read_dept_head" ON public.class_schedule FOR SELECT TO authenticated
  USING (status IN ('draft','published') AND public.is_dept_head_of_section(auth.uid(), course_section_id));
CREATE POLICY "class_schedule_read_student" ON public.class_schedule FOR SELECT TO authenticated
  USING (status = 'published' AND EXISTS (
    SELECT 1 FROM public.student_enrollments se
    JOIN public.student_profiles sp ON sp.id = se.student_profile_id
    WHERE se.course_section_id = class_schedule.course_section_id
      AND sp.user_id = auth.uid() AND se.enrollment_status = 'enrolled'
  ));
CREATE POLICY "class_schedule_write_admin" ON public.class_schedule FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar']));

CREATE TRIGGER trg_class_schedule_updated_at BEFORE UPDATE ON public.class_schedule
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CONFLICT DETECTION
CREATE OR REPLACE FUNCTION public.validate_class_schedule_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_self uuid := COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
BEGIN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.class_schedule
    WHERE id <> v_self AND room_id = NEW.room_id AND time_slot_id = NEW.time_slot_id
      AND status IN ('draft','published')) THEN
    RAISE EXCEPTION 'تعارض القاعة: القاعة محجوزة في نفس الفترة الزمنية لجدول آخر';
  END IF;
  IF NEW.faculty_profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.class_schedule
    WHERE id <> v_self AND faculty_profile_id = NEW.faculty_profile_id AND time_slot_id = NEW.time_slot_id
      AND status IN ('draft','published')) THEN
    RAISE EXCEPTION 'تعارض الأستاذ: عضو هيئة التدريس لديه جدول آخر في نفس الفترة الزمنية';
  END IF;
  IF EXISTS (SELECT 1 FROM public.class_schedule
    WHERE id <> v_self AND course_section_id = NEW.course_section_id AND time_slot_id = NEW.time_slot_id
      AND status IN ('draft','published')) THEN
    RAISE EXCEPTION 'تعارض الشعبة: الشعبة لديها جدول آخر في نفس الفترة الزمنية';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_class_schedule_conflict
  BEFORE INSERT OR UPDATE ON public.class_schedule
  FOR EACH ROW EXECUTE FUNCTION public.validate_class_schedule_conflict();

-- AUDIT
CREATE OR REPLACE FUNCTION public.trg_audit_class_schedule()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('schedule', NEW.id, 'schedule_created', NULL,
      jsonb_build_object('course_section_id', NEW.course_section_id, 'room_id', NEW.room_id,
        'faculty_profile_id', NEW.faculty_profile_id, 'time_slot_id', NEW.time_slot_id,
        'schedule_type', NEW.schedule_type, 'status', NEW.status));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published' THEN
      PERFORM public.log_audit('schedule', NEW.id, 'schedule_published',
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    ELSIF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'cancelled' THEN
      PERFORM public.log_audit('schedule', NEW.id, 'schedule_cancelled',
        jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    ELSE
      PERFORM public.log_audit('schedule', NEW.id, 'schedule_updated',
        jsonb_build_object('room_id', OLD.room_id, 'faculty_profile_id', OLD.faculty_profile_id,
          'time_slot_id', OLD.time_slot_id, 'schedule_type', OLD.schedule_type, 'status', OLD.status),
        jsonb_build_object('room_id', NEW.room_id, 'faculty_profile_id', NEW.faculty_profile_id,
          'time_slot_id', NEW.time_slot_id, 'schedule_type', NEW.schedule_type, 'status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_class_schedule_audit
  AFTER INSERT OR UPDATE ON public.class_schedule
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_class_schedule();

-- SEED
INSERT INTO public.buildings (name_ar, name_en, code)
VALUES ('المبنى الرئيسي', 'Main Building', 'MAIN')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.rooms (building_id, name_ar, name_en, code, room_type, capacity)
SELECT b.id, v.name_ar, v.name_en, v.code, v.room_type::public.room_type, v.capacity
FROM public.buildings b,
  (VALUES
    ('مختبر 1','Lab 1','LAB-1','lab',25),
    ('مختبر 2','Lab 2','LAB-2','lab',25),
    ('قاعة 101','Room 101','ROOM-101','lecture',40),
    ('قاعة 102','Room 102','ROOM-102','lecture',40)
  ) AS v(name_ar,name_en,code,room_type,capacity)
WHERE b.code = 'MAIN'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.time_slots (name_ar, day_of_week, start_time, end_time) VALUES
  ('السبت 08:00 - 10:00','saturday','08:00','10:00'),
  ('السبت 10:00 - 12:00','saturday','10:00','12:00'),
  ('الأحد 08:00 - 10:00','sunday','08:00','10:00'),
  ('الأحد 10:00 - 12:00','sunday','10:00','12:00')
ON CONFLICT (day_of_week, start_time, end_time) DO NOTHING;

-- Sample published schedule for CS101 section A if it exists
DO $$
DECLARE v_section uuid; v_room uuid; v_slot uuid; v_faculty uuid;
BEGIN
  SELECT cs.id, cs.faculty_profile_id INTO v_section, v_faculty
  FROM public.course_sections cs
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  WHERE c.code = 'CS101' AND upper(cs.section_code) IN ('A','1','A1')
  LIMIT 1;
  IF v_section IS NULL THEN RETURN; END IF;
  SELECT id INTO v_room FROM public.rooms WHERE code = 'ROOM-101' LIMIT 1;
  SELECT id INTO v_slot FROM public.time_slots WHERE day_of_week = 'saturday' AND start_time = '08:00' LIMIT 1;
  IF v_room IS NOT NULL AND v_slot IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.class_schedule WHERE course_section_id = v_section AND time_slot_id = v_slot
  ) THEN
    INSERT INTO public.class_schedule (course_section_id, room_id, faculty_profile_id, time_slot_id, schedule_type, status)
    VALUES (v_section, v_room, v_faculty, v_slot, 'lecture', 'published');
  END IF;
END $$;
