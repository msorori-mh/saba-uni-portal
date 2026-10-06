-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- DELIVERY-MONITORING-POSITION-HEADS-01 — «متابعة سير العملية التعليمية» لرئيس القسم.
-- Review: docs/reviews/DELIVERY-MONITORING-POSITION-HEADS-01.md
-- Adds ONE helper (departments a user heads = active department-head position
-- OR legacy is_department_head_of) and anchor-patches the DEPLOYED bodies of
-- cdp_delivery_monitoring (gate + 2 scope filters) and cdp_can_view_section
-- (drill-down read). Writes no row. Does not touch is_department_head_of,
-- cdp_can_manage_section or any policy. Idempotent, fail closed.
-- Rollback: DELIVERY-MONITORING-POSITION-HEADS-01.rollback-by-forward.sql

BEGIN;

DO $guard$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(x, ', ') INTO v_missing FROM unnest(ARRAY[
    'public.is_department_head_of(uuid,uuid)', 'public.cdp_delivery_monitoring(text)',
    'public.cdp_can_view_section(uuid,uuid)', 'public.cdp_can_manage_section(uuid,uuid)']) x
  WHERE to_regprocedure(x) IS NULL
     OR NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = to_regprocedure(x));
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'DMPH01_SECURITY_DEFINER_FUNCTION_REQUIRED:%', v_missing; END IF;
  SELECT string_agg(t || '.' || c, ', ') INTO v_missing FROM (VALUES
    ('organizational_positions', 'department_id'), ('organizational_positions', 'is_department_head_position'),
    ('organizational_positions', 'is_active'), ('position_assignments', 'position_id'),
    ('position_assignments', 'user_id'), ('position_assignments', 'is_active'),
    ('position_assignments', 'assigned_from'), ('position_assignments', 'assigned_to'),
    ('courses', 'department_id'), ('departments', 'id')) AS n(t, c)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns k
                    WHERE k.table_schema = 'public' AND k.table_name = n.t AND k.column_name = n.c);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'DMPH01_COLUMN_MISSING:%', v_missing; END IF;
END $guard$;

-- Canonical rule: departments this user heads.
CREATE OR REPLACE FUNCTION public.delivery_monitoring_headed_departments(p_user uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $fn$
  SELECT op.department_id
  FROM public.position_assignments pa
  JOIN public.organizational_positions op ON op.id = pa.position_id
  WHERE pa.user_id = p_user AND op.is_department_head_position AND op.is_active
    AND pa.is_active AND pa.assigned_from <= current_date
    AND (pa.assigned_to IS NULL OR pa.assigned_to >= current_date)
    AND op.department_id IS NOT NULL
  UNION
  SELECT d.id FROM public.departments d WHERE public.is_department_head_of(p_user, d.id)
$fn$;
REVOKE ALL ON FUNCTION public.delivery_monitoring_headed_departments(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delivery_monitoring_headed_departments(uuid) TO service_role;

DO $patch$
DECLARE r record; v_def text; v_hits integer;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.cdp_delivery_monitoring(text)', 'DMPH01:gate', 1,
     $a$elsif public.has_role(v_uid,'department_head'::public.app_role) then$a$,
     $b$elsif exists (select 1 from public.delivery_monitoring_headed_departments(v_uid)) then /* DMPH01:gate */$b$),
    ('public.cdp_delivery_monitoring(text)', 'DMPH01:scope', 2,
     $a$public.is_department_head_of(v_uid, c.department_id)$a$,
     $b$c.department_id in (select public.delivery_monitoring_headed_departments(v_uid) /* DMPH01:scope */)$b$),
    ('public.cdp_can_view_section(uuid,uuid)', 'DMPH01:view', 1,
     $a$public.cdp_can_manage_section(_user_id, _course_section_id)$a$,
     $b$public.cdp_can_manage_section(_user_id, _course_section_id)
    or exists (select 1 /* DMPH01:view */
      from public.course_sections cs
      join public.course_offerings co on co.id = cs.course_offering_id
      join public.courses c on c.id = co.course_id
      where cs.id = _course_section_id
        and c.department_id in (select public.delivery_monitoring_headed_departments(_user_id)))$b$)
    ) AS p(fn, marker, hits, anchor, replacement)
  LOOP
    v_def := pg_get_functiondef(to_regprocedure(r.fn));
    CONTINUE WHEN position(r.marker in v_def) > 0;
    v_hits := (length(v_def) - length(replace(v_def, r.anchor, ''))) / length(r.anchor);
    IF v_hits <> r.hits THEN RAISE EXCEPTION 'DMPH01_PATCH_ANCHOR_HITS:%:% (expected %)', r.marker, v_hits, r.hits; END IF;
    EXECUTE replace(v_def, r.anchor, r.replacement);
    IF position(r.marker in pg_get_functiondef(to_regprocedure(r.fn))) = 0 THEN
      RAISE EXCEPTION 'DMPH01_PATCH_NOT_EFFECTIVE:%', r.marker;
    END IF;
  END LOOP;

  -- post-conditions: no legacy head check left; college roles untouched; helper private
  v_def := pg_get_functiondef('public.cdp_delivery_monitoring(text)'::regprocedure);
  IF v_def LIKE '%is_department_head_of%' OR v_def LIKE '%''department_head''%' THEN
    RAISE EXCEPTION 'DMPH01_LEGACY_HEAD_CHECK_STILL_PRESENT';
  END IF;
  SELECT count(*) INTO v_hits FROM unnest(ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']) x
  WHERE position(format('public.has_role(v_uid,%L::public.app_role)', x) in v_def) > 0;
  IF v_hits <> 5 OR v_def NOT LIKE '%raise exception ''CDP_NOT_AUTHORIZED''%' THEN
    RAISE EXCEPTION 'DMPH01_COLLEGE_SCOPE_OR_DENIAL_DRIFTED:%', v_hits;
  END IF;
  IF has_function_privilege('public', 'public.delivery_monitoring_headed_departments(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.delivery_monitoring_headed_departments(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.delivery_monitoring_headed_departments(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'DMPH01_HELPER_MUST_NOT_BE_CLIENT_EXECUTABLE';
  END IF;
END $patch$;

COMMIT;
