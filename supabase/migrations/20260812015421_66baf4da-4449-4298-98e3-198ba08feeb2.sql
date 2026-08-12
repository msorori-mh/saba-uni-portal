-- A) Unify student section entitlement with the materials contract
CREATE OR REPLACE FUNCTION public.cdp_can_view_section(_user_id uuid, _course_section_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select coalesce(
    public.cdp_can_manage_section(_user_id, _course_section_id)
    or public.has_role(_user_id, 'dean'::public.app_role)
    or public.has_role(_user_id, 'registrar'::public.app_role)
    or public.has_role(_user_id, 'student_affairs'::public.app_role)
    or exists (
      select 1
      from public.student_enrollments se
      join public.student_profiles sp on sp.id = se.student_profile_id
      join public.course_sections cs on cs.id = se.course_section_id
      join public.course_offerings co on co.id = cs.course_offering_id
      join public.academic_years ay on ay.id = co.academic_year_id and ay.is_current
      join public.semesters sm on sm.id = co.semester_id and sm.is_current
      where se.course_section_id = _course_section_id
        and sp.user_id = _user_id
        and se.enrollment_status = 'enrolled'
        and cs.status = 'active'
        and co.status = 'active'
    )
  , false)
$$;

-- B) Fix invalid faculty name column reference
CREATE OR REPLACE FUNCTION public.cdp_get_section_plan(p_course_section_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_manage boolean;
  v_plan public.course_delivery_plans%rowtype;
  v_course jsonb;
  v_sessions jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if not public.cdp_can_view_section(v_uid, p_course_section_id) then
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;
  v_manage := public.cdp_can_manage_section(v_uid, p_course_section_id);

  select jsonb_build_object(
    'course_section_id', cs.id,
    'section_code', cs.section_code,
    'course_code', c.code,
    'course_name_ar', c.name_ar,
    'faculty_name', coalesce(f.full_name_ar, '')
  ) into v_course
  from public.course_sections cs
  join public.course_offerings co on co.id = cs.course_offering_id
  join public.courses c on c.id = co.course_id
  left join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
  left join public.faculty f on f.id = fp.faculty_id
  where cs.id = p_course_section_id;

  select * into v_plan from public.course_delivery_plans where course_section_id = p_course_section_id;
  if v_plan.id is null then
    return jsonb_build_object('course', v_course, 'can_manage', v_manage, 'plan', null, 'sessions', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(x order by x_number), '[]'::jsonb) into v_sessions
  from (
    select s.session_number as x_number, jsonb_build_object(
      'plan_session_id', s.id,
      'session_number', s.session_number,
      'planned_title', s.planned_title,
      'planned_topics', s.planned_topics,
      'status', coalesce(e.status, 'not_recorded'),
      'execution_date', e.execution_date,
      'compensation_date', e.compensation_date,
      'reason', case when v_manage then e.reason else null end,
      'notes', case when v_manage then e.notes else null end,
      'recorded_at', e.recorded_at
    ) as x
    from public.course_delivery_plan_sessions s
    left join public.course_session_executions e on e.plan_session_id = s.id
    where s.plan_id = v_plan.id
  ) t;

  return jsonb_build_object(
    'course', v_course,
    'can_manage', v_manage,
    'plan', jsonb_build_object(
      'plan_id', v_plan.id,
      'planned_session_count', v_plan.planned_session_count,
      'status', v_plan.status,
      'published_at', v_plan.published_at
    ),
    'sessions', v_sessions
  );
end $function$;

CREATE OR REPLACE FUNCTION public.cdp_admin_delivery_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid(); v_result jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if not (public.has_role(v_uid,'admin'::public.app_role)
       or public.has_role(v_uid,'system_admin'::public.app_role)
       or public.has_role(v_uid,'dean'::public.app_role)
       or public.has_role(v_uid,'registrar'::public.app_role)
       or public.has_role(v_uid,'department_head'::public.app_role)) then
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
  ) t;
  return v_result;
end $function$;

CREATE OR REPLACE FUNCTION public.cdp_delivery_monitoring(p_period text DEFAULT 'term'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_period text := lower(coalesce(p_period, 'term'));
  v_from date;
  v_scope text;
  v_rows jsonb;
  v_totals jsonb;
  v_reasons jsonb;
  v_departments jsonb;
begin
  if v_uid is null then raise exception 'CDP_UNAUTHENTICATED'; end if;
  if v_period not in ('week','month','term') then raise exception 'CDP_INVALID_PERIOD'; end if;

  if public.has_role(v_uid,'admin'::public.app_role)
     or public.has_role(v_uid,'system_admin'::public.app_role)
     or public.has_role(v_uid,'dean'::public.app_role)
     or public.has_role(v_uid,'registrar'::public.app_role)
     or public.has_role(v_uid,'student_affairs'::public.app_role) then
    v_scope := 'college';
  elsif public.has_role(v_uid,'department_head'::public.app_role) then
    v_scope := 'department';
  else
    raise exception 'CDP_NOT_AUTHORIZED';
  end if;

  v_from := case v_period
    when 'week' then (current_date - 7)
    when 'month' then (current_date - 30)
    else null end;

  with scoped as (
    select cs.id as course_section_id,
           c.code as course_code,
           c.name_ar as course_name_ar,
           cs.section_code,
           c.department_id,
           d.name_ar as department_name_ar,
           coalesce(f.full_name_ar,'') as faculty_name,
           coalesce(p.status,'none') as plan_status,
           coalesce(p.planned_session_count,0) as planned_count,
           p.id as plan_id
    from public.course_sections cs
    join public.course_offerings co on co.id = cs.course_offering_id
    join public.courses c on c.id = co.course_id
    left join public.departments d on d.id = c.department_id
    left join public.faculty_profiles fp on fp.id = cs.faculty_profile_id
    left join public.faculty f on f.id = fp.faculty_id
    left join public.course_delivery_plans p on p.course_section_id = cs.id
    where cs.status = 'active'
      and (v_scope = 'college'
           or (c.department_id is not null and public.is_department_head_of(v_uid, c.department_id)))
  ), agg as (
    select s.*,
           coalesce(a.recorded,0) as recorded_count,
           coalesce(a.executed,0) as executed_count,
           coalesce(a.compensated,0) as compensated_count,
           coalesce(a.postponed,0) as postponed_count,
           coalesce(a.cancelled,0) as cancelled_count,
           coalesce(a.hindered,0) as hindered_count,
           coalesce(a.not_executed,0) as not_executed_count,
           coalesce(a.uncompensated,0) as uncompensated_count
    from scoped s
    left join lateral (
      select count(*) as recorded,
             count(*) filter (where e.status in ('executed','compensated')) as executed,
             count(*) filter (where e.status = 'compensated') as compensated,
             count(*) filter (where e.status = 'postponed') as postponed,
             count(*) filter (where e.status = 'cancelled') as cancelled,
             count(*) filter (where e.status = 'hindered') as hindered,
             count(*) filter (where e.status in ('hindered','postponed','cancelled')) as not_executed,
             count(*) filter (where e.status in ('hindered','postponed')) as uncompensated
      from public.course_delivery_plan_sessions ps
      join public.course_session_executions e on e.plan_session_id = ps.id
      where ps.plan_id = s.plan_id
        and (v_from is null
             or coalesce(e.execution_date, e.recorded_at::date) >= v_from)
    ) a on true
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'course_section_id', course_section_id,
      'course_code', course_code,
      'course_name_ar', course_name_ar,
      'section_code', section_code,
      'department_name_ar', department_name_ar,
      'faculty_name', faculty_name,
      'plan_status', plan_status,
      'planned_count', planned_count,
      'executed_count', executed_count,
      'compensated_count', compensated_count,
      'postponed_count', postponed_count,
      'cancelled_count', cancelled_count,
      'hindered_count', hindered_count,
      'not_executed_count', not_executed_count,
      'uncompensated_count', uncompensated_count,
      'remaining_count', greatest(planned_count - recorded_count, 0),
      'execution_percent', case when planned_count = 0 then null
        else round((executed_count::numeric / planned_count) * 100, 1) end,
      'behind_plan', (plan_status = 'published' and planned_count > 0
                      and (executed_count::numeric / planned_count) < 0.6),
      'risk_level', case
        when plan_status <> 'published' then 'no_plan'
        when planned_count = 0 then 'no_plan'
        when (executed_count::numeric / planned_count) < 0.4 then 'high'
        when (executed_count::numeric / planned_count) < 0.6 or uncompensated_count >= 2 then 'medium'
        else 'low' end
    ) order by course_code, section_code), '[]'::jsonb),
    jsonb_build_object(
      'sections', count(*),
      'planned', coalesce(sum(planned_count),0),
      'executed', coalesce(sum(executed_count),0),
      'compensated', coalesce(sum(compensated_count),0),
      'postponed', coalesce(sum(postponed_count),0),
      'cancelled', coalesce(sum(cancelled_count),0),
      'hindered', coalesce(sum(hindered_count),0),
      'not_executed', coalesce(sum(not_executed_count),0),
      'uncompensated', coalesce(sum(uncompensated_count),0),
      'remaining', coalesce(sum(greatest(planned_count - recorded_count,0)),0),
      'execution_percent', case when coalesce(sum(planned_count),0) = 0 then null
        else round((coalesce(sum(executed_count),0)::numeric / sum(planned_count)) * 100, 1) end,
      'behind_plan_courses', count(*) filter (
        where plan_status = 'published' and planned_count > 0
          and (executed_count::numeric / planned_count) < 0.6)
    ),
    coalesce(jsonb_agg(distinct jsonb_build_object('department_name_ar', department_name_ar))
             filter (where department_name_ar is not null), '[]'::jsonb)
  into v_rows, v_totals, v_departments
  from agg;

  select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.cnt) order by r.cnt desc), '[]'::jsonb)
  into v_reasons
  from (
    select coalesce(nullif(btrim(e.reason),''), 'غير محدد') as reason, count(*) as cnt
    from public.course_session_executions e
    join public.course_delivery_plan_sessions ps on ps.id = e.plan_session_id
    join public.course_delivery_plans p on p.id = ps.plan_id
    join public.course_sections cs on cs.id = p.course_section_id
    join public.course_offerings co on co.id = cs.course_offering_id
    join public.courses c on c.id = co.course_id
    where e.status in ('hindered','postponed','cancelled')
      and cs.status = 'active'
      and (v_from is null or coalesce(e.execution_date, e.recorded_at::date) >= v_from)
      and (v_scope = 'college'
           or (c.department_id is not null and public.is_department_head_of(v_uid, c.department_id)))
    group by 1
  ) r;

  return jsonb_build_object(
    'scope', v_scope,
    'period', jsonb_build_object('kind', v_period, 'from', v_from, 'to', current_date),
    'departments', v_departments,
    'totals', v_totals,
    'reasons', v_reasons,
    'rows', v_rows
  );
end $function$;