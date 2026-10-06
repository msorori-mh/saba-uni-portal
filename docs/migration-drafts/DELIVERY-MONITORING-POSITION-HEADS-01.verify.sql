-- DELIVERY-MONITORING-POSITION-HEADS-01 — POST-APPLY VERIFY. READ-ONLY: one SELECT.
WITH f AS (
  SELECT pg_get_functiondef('public.cdp_delivery_monitoring(text)'::regprocedure) AS mon,
         pg_get_functiondef('public.cdp_can_view_section(uuid,uuid)'::regprocedure) AS vw,
         'public.delivery_monitoring_headed_departments(uuid)'::regprocedure AS h
),
c AS (
  SELECT
    (length(mon) - length(replace(mon, 'DMPH01:gate', ''))) / 11 = 1 AS gate_patched,
    (length(mon) - length(replace(mon, 'DMPH01:scope', ''))) / 12 = 2 AS scope_patched,
    (length(vw) - length(replace(vw, 'DMPH01:view', ''))) / 11 = 1 AS view_patched,
    mon NOT LIKE '%is_department_head_of%' AND mon NOT LIKE '%''department_head''%' AS legacy_check_removed,
    (SELECT count(*) FROM unnest(ARRAY['admin', 'system_admin', 'dean', 'registrar', 'student_affairs']) x
      WHERE position(format('public.has_role(v_uid,%L::public.app_role)', x) in mon) > 0) = 5
      AND mon LIKE '%raise exception ''CDP_NOT_AUTHORIZED''%' AS college_scope_and_denial_intact,
    (SELECT p.prosecdef AND p.provolatile = 's' AND p.proretset AND p.proconfig = ARRAY['search_path=""']
       FROM pg_proc p WHERE p.oid = f.h) AS helper_shape_ok,
    NOT has_function_privilege('public', f.h, 'EXECUTE') AND NOT has_function_privilege('anon', f.h, 'EXECUTE')
      AND NOT has_function_privilege('authenticated', f.h, 'EXECUTE') AS helper_not_client_executable,
    has_function_privilege('authenticated', 'public.cdp_delivery_monitoring(text)', 'EXECUTE') AS rpc_still_callable
  FROM f
)
SELECT gate_patched AND scope_patched AND view_patched AND legacy_check_removed AND college_scope_and_denial_intact
       AND helper_shape_ok AND helper_not_client_executable AND rpc_still_callable AS applied_correctly,
       c.*,
       ARRAY(SELECT DISTINCT d.name_ar FROM public.position_assignments pa
             JOIN public.organizational_positions op ON op.id = pa.position_id
             JOIN public.departments d ON d.id = op.department_id
             WHERE pa.is_active AND op.is_active AND op.is_department_head_position
               AND d.id IN (SELECT public.delivery_monitoring_headed_departments(pa.user_id))
             ORDER BY 1) AS departments_with_a_head_who_can_now_monitor
FROM c;
