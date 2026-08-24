-- PORTAL_STAFF_OPERATIONAL_E2E_02M
-- Align the attendance report RPC with its capability contract: department-
-- scoped HR may read only active staff in explicitly assigned departments.

do $guard$
begin
  if to_regprocedure('public.staff_service_list_attendance_month_report(integer,integer)') is null
     or to_regprocedure('public.staff_service_has_role(uuid,text,uuid)') is null
     or to_regprocedure('public.staff_service_manages_profile(uuid,uuid)') is null
     or to_regclass('public.staff_service_role_assignments') is null then
    raise exception 'STAFF_ATTENDANCE_SCOPED_HR_02M_REQUIRES_02E';
  end if;
end
$guard$;

create or replace function public.staff_service_list_attendance_month_report(
  p_year integer,
  p_month integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_from date;
  v_to date;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  if p_year is null or p_month is null
     or p_year not between 2000 and 2200 or p_month not between 1 and 12 then
    raise exception 'STAFF_SERVICE_ATTENDANCE_RANGE_INVALID' using errcode = '22023';
  end if;

  if not (
    public.staff_service_has_role(v_user, 'direct_manager', null)
    or public.staff_service_has_role(v_user, 'hr', null)
    or public.staff_service_is_admin(v_user)
    or exists (
      select 1
      from public.staff_service_role_assignments a
      where a.user_id = v_user
        and a.role in ('direct_manager', 'hr')
        and a.department_id is not null
        and a.active
        and a.valid_from <= current_date
        and (a.valid_until is null or a.valid_until >= current_date)
    )
  ) then
    raise exception 'STAFF_SERVICE_REPORT_SCOPE_DENIED' using errcode = '42501';
  end if;

  v_from := make_date(p_year, p_month, 1);
  v_to := (v_from + interval '1 month')::date;

  return coalesce((
    select jsonb_agg(item order by item ->> 'full_name_ar')
    from (
      select jsonb_build_object(
        'staff_profile_id', sp.id,
        'full_name_ar', sp.full_name_ar,
        'present_days', count(*) filter (where d.day_state = 'present'),
        'absent_days', count(*) filter (where d.day_state = 'absent'),
        'late_days', count(*) filter (where d.day_state = 'late'),
        'leave_days', count(*) filter (where d.day_state = 'leave'),
        'worked_hours', round(coalesce(sum(d.worked_minutes), 0) / 60.0, 2)
      ) as item
      from public.staff_attendance_days d
      join public.staff_profiles sp on sp.id = d.staff_profile_id
      where d.attendance_date >= v_from
        and d.attendance_date < v_to
        and (
          public.staff_service_has_role(v_user, 'hr', null)
          or public.staff_service_is_admin(v_user)
          or public.staff_service_manages_profile(v_user, sp.id)
          or exists (
            select 1
            from public.staff_service_role_assignments a
            where a.user_id = v_user
              and a.role = 'hr'
              and a.department_id = sp.department_id
              and a.department_id is not null
              and a.active
              and a.valid_from <= current_date
              and (a.valid_until is null or a.valid_until >= current_date)
          )
        )
      group by sp.id, sp.full_name_ar
    ) src
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.staff_service_list_attendance_month_report(integer, integer)
  from public, anon;
grant execute on function public.staff_service_list_attendance_month_report(integer, integer)
  to authenticated, service_role;

comment on function public.staff_service_list_attendance_month_report(integer, integer) is
  '02M: global HR/admin receive institution attendance; managers and department-scoped HR receive only assigned staff.';
