CREATE OR REPLACE FUNCTION public.cdp_admin_delivery_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      coalesce(p.status, 'none') as plan_status,
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
    left join public.course_delivery_plans p on p.course_section_id = cs.id
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
end $function$;