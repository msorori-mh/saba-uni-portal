-- DELIVERY-MONITORING-POSITION-HEADS-01 — PRE-FLIGHT. READ-ONLY: one SELECT, no writes.
-- Apply the draft only when `ready_to_apply` is true. A missing relation/function
-- makes the query fail with its name — also a NO-GO.
WITH anchors(fn, marker, hits, anchor) AS (VALUES
  ('public.cdp_delivery_monitoring(text)', 'DMPH01:gate', 1,
   $a$elsif public.has_role(v_uid,'department_head'::public.app_role) then$a$),
  ('public.cdp_delivery_monitoring(text)', 'DMPH01:scope', 2,
   $a$public.is_department_head_of(v_uid, c.department_id)$a$),
  ('public.cdp_can_view_section(uuid,uuid)', 'DMPH01:view', 1,
   $a$public.cdp_can_manage_section(_user_id, _course_section_id)$a$)
),
st AS (
  SELECT a.marker, a.hits AS expected, COALESCE(position(a.marker in d.def) > 0, false) AS patched,
         COALESCE(p.prosecdef, false) AS secdef,
         CASE WHEN d.def IS NULL THEN -1
              ELSE (length(d.def) - length(replace(d.def, a.anchor, ''))) / length(a.anchor) END AS found
  FROM anchors a
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(a.fn)
  LEFT JOIN LATERAL (SELECT pg_get_functiondef(p.oid) AS def) d ON true
),
heads AS (
  SELECT pa.user_id, op.code, op.department_id
  FROM public.position_assignments pa
  JOIN public.organizational_positions op ON op.id = pa.position_id
  WHERE op.is_department_head_position AND op.is_active AND pa.is_active
    AND pa.assigned_from <= current_date AND (pa.assigned_to IS NULL OR pa.assigned_to >= current_date)
)
SELECT
  (SELECT bool_and(secdef AND (patched OR found = expected)) FROM st)
    AND (SELECT count(*) FROM unnest(ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']) x
          WHERE position(format('public.has_role(v_uid,%L::public.app_role)', x)
                         in pg_get_functiondef('public.cdp_delivery_monitoring(text)'::regprocedure)) > 0) = 5
    AND to_regprocedure('public.is_department_head_of(uuid,uuid)') IS NOT NULL
    AND to_regprocedure('public.cdp_can_manage_section(uuid,uuid)') IS NOT NULL AS ready_to_apply,
  (SELECT bool_and(patched) FROM st)
    AND to_regprocedure('public.delivery_monitoring_headed_departments(uuid)') IS NOT NULL AS draft_already_applied,
  ARRAY(SELECT marker || ':' || found FROM st WHERE NOT (secdef AND (patched OR found = expected)) ORDER BY 1) AS failing_anchors,
  -- data observations (informational; the draft changes no data)
  (SELECT count(*) FROM heads WHERE department_id IS NOT NULL) AS active_head_assignments_with_department,
  ARRAY(SELECT code FROM heads WHERE department_id IS NULL ORDER BY 1) AS head_positions_without_department,
  (SELECT count(*) FROM heads h WHERE h.department_id IS NOT NULL
     AND NOT public.is_department_head_of(h.user_id, h.department_id)) AS heads_invisible_to_monitoring_today,
  (SELECT count(*) FROM public.departments d WHERE d.is_active
     AND NOT EXISTS (SELECT 1 FROM heads h WHERE h.department_id = d.id)) AS active_departments_without_head_position_holder,
  (SELECT count(*) FROM public.user_roles ur WHERE ur.role = 'department_head'::public.app_role
     AND NOT EXISTS (SELECT 1 FROM heads h WHERE h.user_id = ur.user_id)) AS legacy_role_holders_without_head_position;
