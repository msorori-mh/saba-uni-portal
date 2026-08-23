-- PORTAL_STAFF_GOVERNANCE_SCOPED_HR_REPORTS_02J
-- Lets department-scoped HR view/export only departmental governance reports.
-- Institution integrations and unified audit remain limited to admin/global HR.

do $guard$
begin
  if to_regprocedure('public.staff_service_get_governance_capabilities()') is null
     or to_regprocedure('public.staff_service_governance_report_scope(uuid)') is null
     or to_regprocedure('public.staff_service_list_governance_report(date,date,uuid)') is null
     or to_regclass('public.staff_service_role_assignments') is null then
    raise exception 'STAFF_GOVERNANCE_02J_REQUIRES_02F';
  end if;
end
$guard$;

create or replace function public.staff_service_get_governance_capabilities()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean := false;
  v_hr_any boolean := false;
  v_hr_global boolean := false;
  v_manager boolean := false;
  v_aal2 boolean := false;
begin
  if v_user is null then
    return jsonb_build_object(
      'mfa_verified', false,
      'can_view_reports', false,
      'can_export_reports', false,
      'can_view_integrations', false,
      'can_view_unified_audit', false
    );
  end if;

  v_admin := public.staff_service_is_admin(v_user);

  select
    bool_or(a.role='hr'),
    bool_or(a.role='hr' and a.department_id is null),
    bool_or(a.role='direct_manager')
  into v_hr_any, v_hr_global, v_manager
  from public.staff_service_role_assignments a
  where a.user_id=v_user
    and a.role in ('hr','direct_manager')
    and a.active
    and a.valid_from <= current_date
    and (a.valid_until is null or a.valid_until >= current_date);

  v_hr_any := coalesce(v_hr_any,false);
  v_hr_global := coalesce(v_hr_global,false);
  v_manager := coalesce(v_manager,false);
  v_aal2 := public.staff_service_current_aal() = 'aal2';

  return jsonb_build_object(
    'mfa_verified', v_aal2,
    'can_view_reports', v_admin or v_hr_any or v_manager,
    'can_export_reports', v_admin or v_hr_any,
    'can_view_integrations', v_admin or v_hr_global,
    'can_view_unified_audit', v_admin or v_hr_global
  );
end;
$$;

create or replace function public.staff_service_governance_report_scope(
  p_department_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  perform public.staff_service_require_aal2();

  if public.staff_service_is_admin(v_user)
     or public.staff_service_has_role(v_user, 'hr', null) then
    return 'institution';
  end if;

  if exists (
    select 1
    from public.staff_service_role_assignments a
    where a.user_id = v_user
      and a.role in ('direct_manager','hr')
      and a.department_id is not null
      and a.active
      and a.valid_from <= current_date
      and (a.valid_until is null or a.valid_until >= current_date)
      and (p_department_id is null or a.department_id = p_department_id)
  ) then
    return 'department';
  end if;

  raise exception 'STAFF_SERVICE_REPORT_ACCESS_DENIED' using errcode = '42501';
end;
$$;

create or replace function public.staff_service_list_governance_report(
  p_period_from date,
  p_period_to date,
  p_department_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_scope text;
  v_rows jsonb;
begin
  if p_period_from is null or p_period_to is null
     or p_period_to < p_period_from
     or p_period_to - p_period_from > 366 then
    raise exception 'STAFF_SERVICE_REPORT_PERIOD_INVALID' using errcode = '22023';
  end if;

  v_scope := public.staff_service_governance_report_scope(p_department_id);

  with scoped_profiles as (
    select sp.id, sp.department_id
    from public.staff_profiles sp
    where sp.status = 'active'
      and (p_department_id is null or sp.department_id = p_department_id)
      and (
        v_scope = 'institution'
        or exists (
          select 1
          from public.staff_service_role_assignments a
          where a.user_id = v_user
            and a.role in ('direct_manager','hr')
            and a.department_id = sp.department_id
            and a.active
            and a.valid_from <= current_date
            and (a.valid_until is null or a.valid_until >= current_date)
        )
      )
  ), department_metrics as (
    select
      d.id as department_id,
      d.name_ar as department_name_ar,
      count(sp.id)::bigint as employees,
      (
        select count(*) from public.staff_service_requests r
        join scoped_profiles p on p.id = r.staff_profile_id
        where p.department_id = d.id
          and r.service_type in ('leave', 'permission')
          and r.submitted_at::date between p_period_from and p_period_to
      )::bigint as leave_requests,
      (
        select count(*) from public.staff_service_requests r
        join scoped_profiles p on p.id = r.staff_profile_id
        where p.department_id = d.id
          and r.service_type in ('leave', 'permission')
          and r.status = 'approved'
          and r.submitted_at::date between p_period_from and p_period_to
      )::bigint as approved_leave_requests,
      (
        select count(*) from public.staff_attendance_days a
        join scoped_profiles p on p.id = a.staff_profile_id
        where p.department_id = d.id
          and a.attendance_date between p_period_from and p_period_to
      )::bigint as attendance_days,
      (
        select count(*) from public.staff_attendance_days a
        join scoped_profiles p on p.id = a.staff_profile_id
        where p.department_id = d.id
          and a.late_minutes > 0
          and a.attendance_date between p_period_from and p_period_to
      )::bigint as late_days,
      coalesce((
        select sum(o.total_hours) from public.staff_overtime_claims o
        join scoped_profiles p on p.id = o.staff_profile_id
        where p.department_id = d.id
          and o.status = 'hr_approved'
          and o.starts_on <= p_period_to and o.ends_on >= p_period_from
      ), 0)::numeric as approved_overtime_hours,
      (
        select count(*) from public.staff_training_enrollments t
        join scoped_profiles p on p.id = t.staff_profile_id
        where p.department_id = d.id
          and t.status = 'completed'
          and t.completed_at::date between p_period_from and p_period_to
      )::bigint as completed_training,
      (
        select count(*) from public.staff_performance_evaluations e
        join scoped_profiles p on p.id = e.staff_profile_id
        where p.department_id = d.id
          and e.status = 'finalized'
          and e.finalized_at::date between p_period_from and p_period_to
      )::bigint as finalized_evaluations,
      (
        select count(*) from public.staff_promotion_cases pc
        join scoped_profiles p on p.id = pc.staff_profile_id
        where p.department_id = d.id
          and pc.status in ('approved', 'implemented')
          and coalesce(pc.effective_on, pc.created_at::date)
              between p_period_from and p_period_to
      )::bigint as promotions,
      (
        select count(*) from public.staff_custody_assignments c
        join scoped_profiles p on p.id = c.staff_profile_id
        where p.department_id = d.id and c.returned_on is null
      )::bigint as active_custody,
      (
        select count(*) from public.staff_clearance_cases cc
        join scoped_profiles p on p.id = cc.staff_profile_id
        where p.department_id = d.id and cc.status <> 'completed'
      )::bigint as open_clearance
    from public.departments d
    join scoped_profiles sp on sp.department_id = d.id
    group by d.id, d.name_ar
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'department_id', department_id,
      'department_name_ar', department_name_ar,
      'employees', employees,
      'leave_requests', leave_requests,
      'approved_leave_requests', approved_leave_requests,
      'attendance_days', attendance_days,
      'late_days', late_days,
      'approved_overtime_hours', approved_overtime_hours,
      'completed_training', completed_training,
      'finalized_evaluations', finalized_evaluations,
      'promotions', promotions,
      'active_custody', active_custody,
      'open_clearance', open_clearance
    ) order by department_name_ar
  ), '[]'::jsonb) into v_rows
  from department_metrics;

  insert into public.staff_governance_audit_events (
    actor_user_id, event_type, scope_kind, department_id,
    period_from, period_to
  ) values (
    v_user, 'hr_report_viewed', v_scope, p_department_id,
    p_period_from, p_period_to
  );

  return jsonb_build_object(
    'scope', v_scope,
    'period_from', p_period_from,
    'period_to', p_period_to,
    'departments', v_rows
  );
end;
$$;

comment on function public.staff_service_get_governance_capabilities() is
  '02J: department HR can view/export scoped reports; integrations and unified audit still require admin/global HR.';

comment on function public.staff_service_governance_report_scope(uuid) is
  '02J: AAL2 admin/global HR use institution scope; department manager/HR use only assigned departments.';

comment on function public.staff_service_list_governance_report(date,date,uuid) is
  '02J: report metrics are constrained to active department assignments for both managers and scoped HR.';
