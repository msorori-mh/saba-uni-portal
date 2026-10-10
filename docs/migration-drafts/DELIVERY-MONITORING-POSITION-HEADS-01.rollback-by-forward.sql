-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- DELIVERY-MONITORING-POSITION-HEADS-01 — ROLLBACK BY FORWARD (own authorization).
-- Restores the three patched fragments byte-for-byte (legacy role-only rule).
-- Keeps the helper (unused afterwards). Idempotent; writes no row.
BEGIN;
DO $rollback$
DECLARE r record; v_def text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.cdp_delivery_monitoring(text)',
     $a$elsif public.has_role(v_uid,'department_head'::public.app_role) then$a$,
     $b$elsif exists (select 1 from public.delivery_monitoring_headed_departments(v_uid)) then /* DMPH01:gate */$b$),
    ('public.cdp_delivery_monitoring(text)',
     $a$public.is_department_head_of(v_uid, c.department_id)$a$,
     $b$c.department_id in (select public.delivery_monitoring_headed_departments(v_uid) /* DMPH01:scope */)$b$),
    ('public.cdp_can_view_section(uuid,uuid)',
     $a$public.cdp_can_manage_section(_user_id, _course_section_id)$a$,
     $b$public.cdp_can_manage_section(_user_id, _course_section_id)
    or exists (select 1 /* DMPH01:view */
      from public.course_sections cs
      join public.course_offerings co on co.id = cs.course_offering_id
      join public.courses c on c.id = co.course_id
      where cs.id = _course_section_id
        and c.department_id in (select public.delivery_monitoring_headed_departments(_user_id)))$b$)
    ) AS p(fn, original, patched)
  LOOP
    v_def := pg_get_functiondef(to_regprocedure(r.fn));
    CONTINUE WHEN position(r.patched in v_def) = 0;
    EXECUTE replace(v_def, r.patched, r.original);
  END LOOP;
  IF pg_get_functiondef('public.cdp_delivery_monitoring(text)'::regprocedure) LIKE '%DMPH01%'
     OR pg_get_functiondef('public.cdp_can_view_section(uuid,uuid)'::regprocedure) LIKE '%DMPH01%' THEN
    RAISE EXCEPTION 'DMPH01_ROLLBACK_INCOMPLETE';
  END IF;
END $rollback$;
COMMIT;
