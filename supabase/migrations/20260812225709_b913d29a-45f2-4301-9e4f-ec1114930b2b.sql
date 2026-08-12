-- =====================================================================
-- SYLLABUS-DRIVEN LECTURE PLAN — schema foundation
-- =====================================================================

-- 1) Course syllabi -----------------------------------------------------
CREATE TABLE public.course_syllabi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  is_current boolean NOT NULL DEFAULT false,
  planned_session_count integer NOT NULL DEFAULT 0 CHECK (planned_session_count >= 0),
  description_ar text,
  objectives_ar text,
  references_ar text,
  source_fingerprint text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, version)
);

GRANT SELECT ON public.course_syllabi TO authenticated;
GRANT ALL ON public.course_syllabi TO service_role;
ALTER TABLE public.course_syllabi ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX course_syllabi_one_current
  ON public.course_syllabi (course_id) WHERE is_current;
CREATE UNIQUE INDEX course_syllabi_fingerprint_unique
  ON public.course_syllabi (course_id, source_fingerprint)
  WHERE source_fingerprint IS NOT NULL;

CREATE TABLE public.course_syllabus_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id uuid NOT NULL REFERENCES public.course_syllabi(id) ON DELETE CASCADE,
  session_number integer NOT NULL CHECK (session_number >= 1),
  week_number integer CHECK (week_number IS NULL OR (week_number >= 1 AND week_number <= 30)),
  title_ar text NOT NULL,
  topics_ar text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (syllabus_id, session_number)
);

GRANT SELECT ON public.course_syllabus_sessions TO authenticated;
GRANT ALL ON public.course_syllabus_sessions TO service_role;
ALTER TABLE public.course_syllabus_sessions ENABLE ROW LEVEL SECURITY;

-- 2) Delivery plan provenance + single-current invariant ---------------
ALTER TABLE public.course_delivery_plans
  ADD COLUMN syllabus_id uuid REFERENCES public.course_syllabi(id),
  ADD COLUMN syllabus_version integer,
  ADD COLUMN source text NOT NULL DEFAULT 'legacy_faculty'
    CHECK (source IN ('syllabus','legacy_faculty')),
  ADD COLUMN is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN superseded_by uuid REFERENCES public.course_delivery_plans(id),
  ADD COLUMN superseded_at timestamptz;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname FROM pg_constraint c
    WHERE c.conrelid = 'public.course_delivery_plans'::regclass
      AND c.contype = 'u'
      AND (SELECT array_agg(a.attname ORDER BY a.attname)
           FROM unnest(c.conkey) k JOIN pg_attribute a
             ON a.attrelid = c.conrelid AND a.attnum = k) = ARRAY['course_section_id']::name[]
  LOOP
    EXECUTE format('ALTER TABLE public.course_delivery_plans DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX course_delivery_plans_one_current
  ON public.course_delivery_plans (course_section_id) WHERE is_current;

ALTER TABLE public.course_delivery_plan_sessions
  ADD COLUMN week_number integer,
  ADD COLUMN syllabus_session_id uuid REFERENCES public.course_syllabus_sessions(id);

-- 3) Execution: compensation + append-only audit -----------------------
ALTER TABLE public.course_session_executions
  ADD COLUMN compensation_recorded_at timestamptz,
  ADD COLUMN previous_status text,
  ADD COLUMN migration_review_flag boolean NOT NULL DEFAULT false;

CREATE TABLE public.course_session_execution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid NOT NULL REFERENCES public.course_delivery_plan_sessions(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  execution_date date,
  compensation_date date,
  reason text,
  notes text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.course_session_execution_events TO authenticated;
GRANT ALL ON public.course_session_execution_events TO service_role;
ALTER TABLE public.course_session_execution_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX course_session_execution_events_session_idx
  ON public.course_session_execution_events (plan_session_id, created_at DESC);

-- 4) Study system on the section + materials linkage -------------------
ALTER TABLE public.course_sections
  ADD COLUMN study_system text
    CHECK (study_system IS NULL OR study_system IN ('general','private','both'));

ALTER TABLE public.course_materials
  ADD COLUMN plan_session_id uuid REFERENCES public.course_delivery_plan_sessions(id),
  ADD COLUMN material_scope text NOT NULL DEFAULT 'general'
    CHECK (material_scope IN ('lecture','general'));

-- =====================================================================
-- RLS policies
-- =====================================================================
CREATE OR REPLACE FUNCTION public.syllabus_is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    public.has_role(_user_id,'admin'::public.app_role)
    OR public.has_role(_user_id,'system_admin'::public.app_role)
    OR public.has_role(_user_id,'registrar'::public.app_role)
    OR public.has_role(_user_id,'dean'::public.app_role)
  , false)
$$;

CREATE OR REPLACE FUNCTION public.syllabus_can_view(_user_id uuid, _course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    public.syllabus_is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = _course_id AND c.department_id IS NOT NULL
        AND public.is_department_head_of(_user_id, c.department_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.course_sections cs
      JOIN public.course_offerings co ON co.id = cs.course_offering_id
      JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
      WHERE co.course_id = _course_id AND fp.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.student_enrollments se
      JOIN public.student_profiles sp ON sp.id = se.student_profile_id
      JOIN public.course_sections cs ON cs.id = se.course_section_id
      JOIN public.course_offerings co ON co.id = cs.course_offering_id
      WHERE co.course_id = _course_id AND sp.user_id = _user_id
        AND se.enrollment_status = 'enrolled'
    )
  , false)
$$;

CREATE POLICY "Admins read syllabus drafts"
  ON public.course_syllabi FOR SELECT TO authenticated
  USING (public.syllabus_is_admin(auth.uid()));

CREATE POLICY "Course participants read approved syllabi"
  ON public.course_syllabi FOR SELECT TO authenticated
  USING (status IN ('approved','superseded') AND public.syllabus_can_view(auth.uid(), course_id));

CREATE POLICY "Admins read syllabus draft sessions"
  ON public.course_syllabus_sessions FOR SELECT TO authenticated
  USING (public.syllabus_is_admin(auth.uid()));

CREATE POLICY "Course participants read approved syllabus sessions"
  ON public.course_syllabus_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_syllabi s
    WHERE s.id = syllabus_id
      AND s.status IN ('approved','superseded')
      AND public.syllabus_can_view(auth.uid(), s.course_id)
  ));

CREATE POLICY "Managers read execution audit events"
  ON public.course_session_execution_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.course_delivery_plan_sessions ps
    JOIN public.course_delivery_plans p ON p.id = ps.plan_id
    WHERE ps.id = plan_session_id
      AND public.cdp_can_manage_section(auth.uid(), p.course_section_id)
  ));

-- =====================================================================
-- Syllabus authoring RPCs (admin only)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.syllabus_import_version(
  p_course_code text,
  p_meta jsonb,
  p_sessions jsonb,
  p_fingerprint text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_course_id uuid;
  v_existing uuid;
  v_version integer;
  v_syllabus_id uuid;
  v_item jsonb;
  v_count integer := 0;
  v_expected integer := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SYL_UNAUTHENTICATED'; END IF;
  IF NOT public.syllabus_is_admin(v_uid) THEN RAISE EXCEPTION 'SYL_NOT_AUTHORIZED'; END IF;

  SELECT id INTO v_course_id FROM public.courses WHERE code = btrim(p_course_code);
  IF v_course_id IS NULL THEN RAISE EXCEPTION 'SYL_COURSE_NOT_FOUND: %', p_course_code; END IF;

  IF p_fingerprint IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.course_syllabi
    WHERE course_id = v_course_id AND source_fingerprint = p_fingerprint;
    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object('syllabus_id', v_existing, 'duplicate', true);
    END IF;
  END IF;

  IF jsonb_typeof(p_sessions) <> 'array' OR jsonb_array_length(p_sessions) = 0 THEN
    RAISE EXCEPTION 'SYL_EMPTY_SESSIONS';
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.course_syllabi WHERE course_id = v_course_id;

  INSERT INTO public.course_syllabi(
    course_id, version, status, planned_session_count,
    description_ar, objectives_ar, references_ar, source_fingerprint, created_by)
  VALUES (
    v_course_id, v_version, 'draft', jsonb_array_length(p_sessions),
    nullif(btrim(coalesce(p_meta->>'description_ar','')),''),
    nullif(btrim(coalesce(p_meta->>'objectives_ar','')),''),
    nullif(btrim(coalesce(p_meta->>'references_ar','')),''),
    p_fingerprint, v_uid)
  RETURNING id INTO v_syllabus_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sessions) LOOP
    v_count := v_count + 1;
    v_expected := v_expected + 1;
    IF (v_item->>'session_number')::int <> v_expected THEN
      RAISE EXCEPTION 'SYL_SESSION_SEQUENCE_INVALID at %', v_expected;
    END IF;
    IF coalesce(btrim(v_item->>'title_ar'),'') = '' THEN
      RAISE EXCEPTION 'SYL_SESSION_TITLE_REQUIRED at %', v_expected;
    END IF;
    INSERT INTO public.course_syllabus_sessions(
      syllabus_id, session_number, week_number, title_ar, topics_ar)
    VALUES (
      v_syllabus_id, v_expected,
      nullif(v_item->>'week_number','')::int,
      btrim(v_item->>'title_ar'),
      nullif(btrim(coalesce(v_item->>'topics_ar','')),''));
  END LOOP;

  RETURN jsonb_build_object('syllabus_id', v_syllabus_id, 'version', v_version,
                            'sessions', v_count, 'duplicate', false);
END $$;

REVOKE ALL ON FUNCTION public.syllabus_import_version(text,jsonb,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.syllabus_import_version(text,jsonb,jsonb,text) TO authenticated;

-- Instantiate a delivery-plan snapshot for one section from the current syllabus
CREATE OR REPLACE FUNCTION public.cdp_instantiate_from_syllabus(p_course_section_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_course_id uuid;
  v_syl public.course_syllabi%rowtype;
  v_plan_id uuid;
BEGIN
  SELECT co.course_id INTO v_course_id
  FROM public.course_sections cs
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  WHERE cs.id = p_course_section_id;
  IF v_course_id IS NULL THEN RAISE EXCEPTION 'CDP_SECTION_NOT_FOUND'; END IF;

  SELECT * INTO v_syl FROM public.course_syllabi
  WHERE course_id = v_course_id AND is_current AND status = 'approved';
  IF v_syl.id IS NULL THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM public.course_delivery_plans
    WHERE course_section_id = p_course_section_id AND is_current
      AND source = 'syllabus' AND syllabus_id = v_syl.id
  ) THEN
    RETURN (SELECT id FROM public.course_delivery_plans
            WHERE course_section_id = p_course_section_id AND is_current);
  END IF;

  UPDATE public.course_delivery_plans
    SET is_current = false, superseded_at = now()
    WHERE course_section_id = p_course_section_id AND is_current;

  INSERT INTO public.course_delivery_plans(
    course_section_id, planned_session_count, status, published_at,
    syllabus_id, syllabus_version, source, is_current)
  VALUES (p_course_section_id, v_syl.planned_session_count, 'published', now(),
          v_syl.id, v_syl.version, 'syllabus', true)
  RETURNING id INTO v_plan_id;

  INSERT INTO public.course_delivery_plan_sessions(
    plan_id, session_number, planned_title, planned_topics, week_number, syllabus_session_id)
  SELECT v_plan_id, ss.session_number, ss.title_ar, ss.topics_ar, ss.week_number, ss.id
  FROM public.course_syllabus_sessions ss
  WHERE ss.syllabus_id = v_syl.id
  ORDER BY ss.session_number;

  UPDATE public.course_delivery_plans p
    SET superseded_by = v_plan_id
    WHERE p.course_section_id = p_course_section_id
      AND NOT p.is_current AND p.superseded_by IS NULL;

  RETURN v_plan_id;
END $$;

REVOKE ALL ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cdp_instantiate_from_syllabus(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.syllabus_approve_version(p_syllabus_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_syl public.course_syllabi%rowtype;
  v_rows integer;
  v_created integer := 0;
  v_section uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'SYL_UNAUTHENTICATED'; END IF;
  IF NOT public.syllabus_is_admin(v_uid) THEN RAISE EXCEPTION 'SYL_NOT_AUTHORIZED'; END IF;

  SELECT * INTO v_syl FROM public.course_syllabi WHERE id = p_syllabus_id;
  IF v_syl.id IS NULL THEN RAISE EXCEPTION 'SYL_NOT_FOUND'; END IF;
  IF v_syl.status <> 'draft' THEN RAISE EXCEPTION 'SYL_NOT_DRAFT'; END IF;

  SELECT count(*) INTO v_rows FROM public.course_syllabus_sessions WHERE syllabus_id = p_syllabus_id;
  IF v_rows = 0 THEN RAISE EXCEPTION 'SYL_EMPTY_SESSIONS'; END IF;
  IF v_rows <> v_syl.planned_session_count THEN RAISE EXCEPTION 'SYL_SESSION_COUNT_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.course_syllabus_sessions
             WHERE syllabus_id = p_syllabus_id AND coalesce(btrim(title_ar),'') = '') THEN
    RAISE EXCEPTION 'SYL_INCOMPLETE_TITLES';
  END IF;

  UPDATE public.course_syllabi
    SET status = 'superseded', is_current = false, updated_at = now()
    WHERE course_id = v_syl.course_id AND is_current AND id <> p_syllabus_id;

  UPDATE public.course_syllabi
    SET status = 'approved', is_current = true, approved_by = v_uid,
        approved_at = now(), updated_at = now()
    WHERE id = p_syllabus_id;

  FOR v_section IN
    SELECT cs.id FROM public.course_sections cs
    JOIN public.course_offerings co ON co.id = cs.course_offering_id
    WHERE co.course_id = v_syl.course_id
      AND cs.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.course_delivery_plans p
        WHERE p.course_section_id = cs.id AND p.is_current
      )
  LOOP
    PERFORM public.cdp_instantiate_from_syllabus(v_section);
    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('syllabus_id', p_syllabus_id, 'plans_created', v_created);
END $$;

REVOKE ALL ON FUNCTION public.syllabus_approve_version(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.syllabus_approve_version(uuid) TO authenticated;

-- Regenerate: never overwrite a plan with execution/material history
CREATE OR REPLACE FUNCTION public.cdp_regenerate_section_plan(p_course_section_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old uuid;
  v_has_history boolean;
  v_new uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  IF NOT public.syllabus_is_admin(v_uid) THEN RAISE EXCEPTION 'CDP_NOT_AUTHORIZED'; END IF;

  SELECT id INTO v_old FROM public.course_delivery_plans
  WHERE course_section_id = p_course_section_id AND is_current;

  v_has_history := v_old IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.course_delivery_plan_sessions s
            JOIN public.course_session_executions e ON e.plan_session_id = s.id
            WHERE s.plan_id = v_old)
    OR EXISTS (SELECT 1 FROM public.course_delivery_plan_sessions s
               JOIN public.course_materials m ON m.plan_session_id = s.id
               WHERE s.plan_id = v_old));

  v_new := public.cdp_instantiate_from_syllabus(p_course_section_id);
  IF v_new IS NULL THEN RAISE EXCEPTION 'CDP_NO_APPROVED_SYLLABUS'; END IF;

  RETURN jsonb_build_object('plan_id', v_new, 'superseded_plan_id', v_old,
                            'preserved_history', coalesce(v_has_history,false));
END $$;

REVOKE ALL ON FUNCTION public.cdp_regenerate_section_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cdp_regenerate_section_plan(uuid) TO authenticated;

-- Auto-instantiate on new section
CREATE OR REPLACE FUNCTION public.cdp_section_autoplan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM public.cdp_instantiate_from_syllabus(NEW.id);
  RETURN NEW;
END $$;

CREATE TRIGGER course_sections_autoplan
  AFTER INSERT ON public.course_sections
  FOR EACH ROW EXECUTE FUNCTION public.cdp_section_autoplan();

-- =====================================================================
-- Faculty authoring disabled; execution recording hardened
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cdp_save_plan(
  p_course_section_id uuid, p_planned_session_count integer, p_sessions jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'CDP_PLAN_AUTHORING_DISABLED';
END $$;

CREATE OR REPLACE FUNCTION public.cdp_publish_plan(p_plan_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'CDP_PLAN_AUTHORING_DISABLED';
END $$;

CREATE OR REPLACE FUNCTION public.cdp_record_session_execution(
  p_plan_session_id uuid, p_status text, p_execution_date date,
  p_reason text, p_compensation_date date, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_section uuid;
  v_id uuid;
  v_prev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  IF p_status NOT IN ('executed','hindered','postponed','cancelled','compensated') THEN
    RAISE EXCEPTION 'CDP_INVALID_STATUS';
  END IF;

  SELECT p.course_section_id INTO v_section
  FROM public.course_delivery_plan_sessions s
  JOIN public.course_delivery_plans p ON p.id = s.plan_id
  WHERE s.id = p_plan_session_id AND p.is_current;
  IF v_section IS NULL THEN RAISE EXCEPTION 'CDP_SESSION_NOT_FOUND'; END IF;
  IF NOT public.cdp_is_section_faculty(v_uid, v_section) THEN
    RAISE EXCEPTION 'CDP_NOT_AUTHORIZED';
  END IF;

  SELECT status INTO v_prev FROM public.course_session_executions
  WHERE plan_session_id = p_plan_session_id;

  -- Compensation is only valid for a lecture already marked as not delivered.
  IF p_status = 'compensated'
     AND coalesce(v_prev,'') NOT IN ('postponed','hindered','cancelled') THEN
    RAISE EXCEPTION 'CDP_COMPENSATION_REQUIRES_MISSED_SESSION';
  END IF;
  IF p_status = 'compensated' AND p_compensation_date IS NULL THEN
    RAISE EXCEPTION 'CDP_COMPENSATION_DATE_REQUIRED';
  END IF;

  INSERT INTO public.course_session_executions(
    plan_session_id, status, execution_date, reason, compensation_date, notes,
    recorded_by, previous_status,
    compensation_recorded_at)
  VALUES (p_plan_session_id, p_status, p_execution_date,
          nullif(btrim(coalesce(p_reason,'')),''), p_compensation_date,
          nullif(btrim(coalesce(p_notes,'')),''), v_uid, v_prev,
          CASE WHEN p_status = 'compensated' THEN now() ELSE NULL END)
  ON CONFLICT (plan_session_id) DO UPDATE
    SET status = excluded.status,
        execution_date = excluded.execution_date,
        reason = excluded.reason,
        compensation_date = excluded.compensation_date,
        notes = excluded.notes,
        recorded_by = excluded.recorded_by,
        previous_status = v_prev,
        compensation_recorded_at = CASE WHEN excluded.status = 'compensated'
          THEN now() ELSE public.course_session_executions.compensation_recorded_at END,
        recorded_at = now()
  RETURNING id INTO v_id;

  INSERT INTO public.course_session_execution_events(
    plan_session_id, from_status, to_status, execution_date, compensation_date,
    reason, notes, actor_id)
  VALUES (p_plan_session_id, v_prev, p_status, p_execution_date, p_compensation_date,
          nullif(btrim(coalesce(p_reason,'')),''), nullif(btrim(coalesce(p_notes,'')),''), v_uid);

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cdp_clear_session_execution(p_plan_session_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_section uuid; v_uid uuid := auth.uid(); v_prev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  SELECT p.course_section_id INTO v_section
  FROM public.course_delivery_plan_sessions s
  JOIN public.course_delivery_plans p ON p.id = s.plan_id
  WHERE s.id = p_plan_session_id AND p.is_current;
  IF v_section IS NULL THEN RAISE EXCEPTION 'CDP_SESSION_NOT_FOUND'; END IF;
  IF NOT public.cdp_is_section_faculty(v_uid, v_section) THEN
    RAISE EXCEPTION 'CDP_NOT_AUTHORIZED';
  END IF;
  SELECT status INTO v_prev FROM public.course_session_executions
  WHERE plan_session_id = p_plan_session_id;
  DELETE FROM public.course_session_executions WHERE plan_session_id = p_plan_session_id;
  IF v_prev IS NOT NULL THEN
    INSERT INTO public.course_session_execution_events(
      plan_session_id, from_status, to_status, actor_id)
    VALUES (p_plan_session_id, v_prev, 'not_recorded', v_uid);
  END IF;
END $$;

-- =====================================================================
-- Reads: current plan only, syllabus metadata exposed
-- =====================================================================
CREATE OR REPLACE FUNCTION public.cdp_get_section_plan(p_course_section_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_plan public.course_delivery_plans%rowtype;
  v_course jsonb;
  v_sessions jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  IF NOT public.cdp_can_view_section(v_uid, p_course_section_id) THEN
    RAISE EXCEPTION 'CDP_NOT_AUTHORIZED';
  END IF;
  v_manage := public.cdp_can_manage_section(v_uid, p_course_section_id);

  SELECT jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'study_system', cs.study_system,
    'faculty_name', coalesce(f.full_name_ar, '')
  ) INTO v_course
  FROM public.course_sections cs
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  LEFT JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
  LEFT JOIN public.faculty f ON f.id = fp.faculty_id
  WHERE cs.id = p_course_section_id;

  SELECT * INTO v_plan FROM public.course_delivery_plans
  WHERE course_section_id = p_course_section_id AND is_current;

  IF v_plan.id IS NULL THEN
    RETURN jsonb_build_object('course', v_course, 'can_manage', v_manage,
                              'plan', null, 'awaiting_syllabus', true,
                              'sessions', '[]'::jsonb);
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x_number), '[]'::jsonb) INTO v_sessions
  FROM (
    SELECT s.session_number AS x_number, jsonb_build_object(
      'plan_session_id', s.id,
      'session_number', s.session_number,
      'week_number', s.week_number,
      'planned_title', s.planned_title,
      'planned_topics', s.planned_topics,
      'status', coalesce(e.status, 'not_recorded'),
      'execution_date', e.execution_date,
      'compensation_date', e.compensation_date,
      'reason', CASE WHEN v_manage THEN e.reason ELSE NULL END,
      'notes', CASE WHEN v_manage THEN e.notes ELSE NULL END,
      'recorded_at', e.recorded_at
    ) AS x
    FROM public.course_delivery_plan_sessions s
    LEFT JOIN public.course_session_executions e ON e.plan_session_id = s.id
    WHERE s.plan_id = v_plan.id
  ) t;

  RETURN jsonb_build_object(
    'course', v_course,
    'can_manage', v_manage,
    'awaiting_syllabus', false,
    'plan', jsonb_build_object(
      'plan_id', v_plan.id,
      'planned_session_count', v_plan.planned_session_count,
      'status', v_plan.status,
      'source', v_plan.source,
      'syllabus_version', v_plan.syllabus_version,
      'published_at', v_plan.published_at
    ),
    'sessions', v_sessions
  );
END $$;

CREATE OR REPLACE FUNCTION public.cdp_list_my_faculty_sections()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'study_system', cs.study_system,
    'plan_status', coalesce(p.status, 'awaiting_syllabus'),
    'plan_source', p.source,
    'planned_session_count', coalesce(p.planned_session_count, 0),
    'recorded_count', coalesce(r.recorded, 0),
    'executed_count', coalesce(r.executed, 0)
  ) ORDER BY c.code, cs.section_code), '[]'::jsonb) INTO v_result
  FROM public.course_sections cs
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  JOIN public.faculty_profiles fp ON fp.id = cs.faculty_profile_id
  LEFT JOIN public.course_delivery_plans p
    ON p.course_section_id = cs.id AND p.is_current
  LEFT JOIN LATERAL (
    SELECT count(*) AS recorded,
           count(*) FILTER (WHERE e.status IN ('executed','compensated')) AS executed
    FROM public.course_delivery_plan_sessions s
    JOIN public.course_session_executions e ON e.plan_session_id = s.id
    WHERE s.plan_id = p.id
  ) r ON true
  WHERE fp.user_id = v_uid AND cs.status = 'active';
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.cdp_list_student_sections()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'plan_status', coalesce(p.status, 'awaiting_syllabus'),
    'planned_session_count', coalesce(p.planned_session_count, 0),
    'executed_count', coalesce(r.executed, 0)
  ) ORDER BY c.code), '[]'::jsonb) INTO v_result
  FROM public.student_enrollments se
  JOIN public.student_profiles sp ON sp.id = se.student_profile_id
  JOIN public.course_sections cs ON cs.id = se.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  LEFT JOIN public.course_delivery_plans p
    ON p.course_section_id = cs.id AND p.is_current
  LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE e.status IN ('executed','compensated')) AS executed
    FROM public.course_delivery_plan_sessions s
    JOIN public.course_session_executions e ON e.plan_session_id = s.id
    WHERE s.plan_id = p.id
  ) r ON true
  WHERE sp.user_id = v_uid AND se.enrollment_status = 'enrolled';
  RETURN v_result;
END $$;

-- Lecture picker for learning materials (faculty of the section)
CREATE OR REPLACE FUNCTION public.cdp_list_plan_sessions_for_materials(p_course_section_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CDP_UNAUTHENTICATED'; END IF;
  IF NOT public.cdp_can_manage_section(v_uid, p_course_section_id) THEN
    RAISE EXCEPTION 'CDP_NOT_AUTHORIZED';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'plan_session_id', s.id,
    'session_number', s.session_number,
    'week_number', s.week_number,
    'planned_title', s.planned_title,
    'planned_topics', s.planned_topics
  ) ORDER BY s.session_number), '[]'::jsonb) INTO v_result
  FROM public.course_delivery_plan_sessions s
  JOIN public.course_delivery_plans p ON p.id = s.plan_id
  WHERE p.course_section_id = p_course_section_id AND p.is_current;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.cdp_list_plan_sessions_for_materials(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cdp_list_plan_sessions_for_materials(uuid) TO authenticated;

-- Monitoring/overview must read the current plan only
CREATE OR REPLACE FUNCTION public.cdp_admin_delivery_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
declare v_uid uuid := auth.uid(); v_result jsonb; v_scope text;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;

  if public.has_role(v_uid,'admin'::public.app_role)
     or public.has_role(v_uid,'system_admin'::public.app_role)
     or public.has_role(v_uid,'dean'::public.app_role)
     or public.has_role(v_uid,'registrar'::public.app_role) then
    v_scope := 'college';
  elsif public.has_role(v_uid,'department_head'::public.app_role) then
    v_scope := 'department';
  else
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.course_code, t.section_code), '[]'::jsonb)
  into v_result
  from (
    select
      cs.id as course_section_id,
      c.code as course_code,
      c.name_ar as course_name_ar,
      cs.section_code,
      d.name_ar as department_name_ar,
      coalesce(f.full_name_ar, '') as faculty_name,
      coalesce(p.status, 'awaiting_syllabus') as plan_status,
      coalesce(p.planned_session_count, 0) as planned_count,
      coalesce(agg.executed, 0) as executed_count,
      coalesce(agg.compensated, 0) as compensated_count,
      coalesce(agg.not_executed, 0) as not_executed_count,
      coalesce(agg.uncompensated, 0) as uncompensated_count,
      greatest(coalesce(p.planned_session_count,0) - coalesce(agg.recorded,0), 0) as pending_count,
      case when coalesce(p.planned_session_count,0) = 0 then 0
        else round((coalesce(agg.executed,0)::numeric / p.planned_session_count) * 100, 1) end as coverage_percent
    from public.course_sections cs
    join public.course_offerings co on co.id = cs.course_offering_id
    join public.courses c on c.id = co.course_id
    left join public.departments d on d.id = c.department_id
    left join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
    left join public.faculty f on f.id = fp.faculty_id
    left join public.course_delivery_plans p on p.course_section_id = cs.id and p.is_current
    left join lateral (
      select
        count(*) as recorded,
        count(*) filter (where e.status in ('executed','compensated')) as executed,
        count(*) filter (where e.status = 'compensated') as compensated,
        count(*) filter (where e.status in ('hindered','postponed','cancelled')) as not_executed,
        count(*) filter (where e.status in ('hindered','postponed')) as uncompensated
      from public.course_delivery_plan_sessions s
      join public.course_session_executions e on e.plan_session_id = s.id
      where s.plan_id = p.id
    ) agg on true
    where cs.status = 'active'
      and (v_scope = 'college'
           or (c.department_id is not null and public.is_department_head_of(v_uid, c.department_id)))
  ) t;
  return v_result;
end $$;

-- Materials: derive study system from the section; enforce lecture linkage
CREATE OR REPLACE FUNCTION public.course_materials_derive_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_system text; v_plan_section uuid;
BEGIN
  SELECT cs.study_system INTO v_system
  FROM public.course_sections cs WHERE cs.id = NEW.course_section_id;
  NEW.study_system := coalesce(v_system, 'both');

  IF NEW.plan_session_id IS NOT NULL THEN
    SELECT p.course_section_id INTO v_plan_section
    FROM public.course_delivery_plan_sessions s
    JOIN public.course_delivery_plans p ON p.id = s.plan_id
    WHERE s.id = NEW.plan_session_id AND p.is_current;
    IF v_plan_section IS NULL OR v_plan_section <> NEW.course_section_id THEN
      RAISE EXCEPTION 'CM_INVALID_PLAN_SESSION';
    END IF;
    NEW.material_scope := 'lecture';
    SELECT s.session_number, s.week_number, s.planned_title
      INTO NEW.lecture_number, NEW.week_number, NEW.title
    FROM public.course_delivery_plan_sessions s WHERE s.id = NEW.plan_session_id;
  ELSE
    NEW.material_scope := 'general';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER course_materials_derive_scope_trg
  BEFORE INSERT OR UPDATE OF plan_session_id, course_section_id ON public.course_materials
  FOR EACH ROW EXECUTE FUNCTION public.course_materials_derive_scope();