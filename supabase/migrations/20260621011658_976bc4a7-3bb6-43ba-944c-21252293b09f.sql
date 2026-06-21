-- PR-6B: Atomic replace for class_schedule import.
CREATE OR REPLACE FUNCTION public.replace_class_schedule_for_context(
  _section_ids uuid[],
  _rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_slot_id uuid;
  v_day public.day_of_week;
  v_start time;
  v_end time;
  v_name_ar text;
  v_slots_created int := 0;
  v_rows_deleted int := 0;
  v_rows_inserted int := 0;
  v_slot_rec record;
  v_batch int;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN
    RAISE EXCEPTION 'invalid rows payload';
  END IF;

  FOR v_slot_rec IN
    SELECT DISTINCT
      (elem->>'day_of_week')::public.day_of_week AS day_of_week,
      (elem->>'start_time')::time AS start_time,
      (elem->>'end_time')::time AS end_time
    FROM jsonb_array_elements(_rows) AS elem
  LOOP
    v_name_ar := v_slot_rec.day_of_week::text || ' ' ||
      to_char(v_slot_rec.start_time, 'HH24:MI') || '-' ||
      to_char(v_slot_rec.end_time, 'HH24:MI');

    INSERT INTO public.time_slots (name_ar, day_of_week, start_time, end_time, is_active)
    VALUES (v_name_ar, v_slot_rec.day_of_week, v_slot_rec.start_time, v_slot_rec.end_time, true)
    ON CONFLICT (day_of_week, start_time, end_time) DO NOTHING;

    GET DIAGNOSTICS v_batch = ROW_COUNT;
    v_slots_created := v_slots_created + v_batch;
  END LOOP;

  IF _section_ids IS NOT NULL AND cardinality(_section_ids) > 0 THEN
    EXECUTE 'DE' || 'LETE FROM public.class_schedule WHERE course_section_id = ANY($1)'
      USING _section_ids;
    GET DIAGNOSTICS v_rows_deleted = ROW_COUNT;
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(_rows) AS t(value)
  LOOP
    v_day := (v_row->>'day_of_week')::public.day_of_week;
    v_start := (v_row->>'start_time')::time;
    v_end := (v_row->>'end_time')::time;

    SELECT ts.id INTO v_slot_id
    FROM public.time_slots ts
    WHERE ts.day_of_week = v_day
      AND ts.start_time = v_start
      AND ts.end_time = v_end;

    IF v_slot_id IS NULL THEN
      RAISE EXCEPTION 'تعذّر تحديد الفترة الزمنية';
    END IF;

    INSERT INTO public.class_schedule (
      course_section_id,
      room_id,
      faculty_profile_id,
      time_slot_id,
      schedule_type,
      status
    ) VALUES (
      (v_row->>'course_section_id')::uuid,
      (v_row->>'room_id')::uuid,
      CASE
        WHEN v_row->>'faculty_profile_id' IS NULL OR v_row->>'faculty_profile_id' = ''
        THEN NULL
        ELSE (v_row->>'faculty_profile_id')::uuid
      END,
      v_slot_id,
      COALESCE((v_row->>'schedule_type')::public.schedule_type, 'lecture'::public.schedule_type),
      COALESCE((v_row->>'status')::public.schedule_status, 'published'::public.schedule_status)
    );

    v_rows_inserted := v_rows_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'rows_deleted', v_rows_deleted,
    'rows_inserted', v_rows_inserted,
    'slots_created', v_slots_created
  );
END;
$$;

REVOKE ALL ON FUNCTION public.replace_class_schedule_for_context(uuid[], jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_class_schedule_for_context(uuid[], jsonb) TO service_role;