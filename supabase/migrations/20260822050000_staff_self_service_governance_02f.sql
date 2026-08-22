-- PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F
-- Forward-only source migration. Do not apply without a separate environment gate.
-- Depends on 02A, 02B, 02D and 02E.

begin;

do $$
begin
  if to_regclass('public.staff_service_read_audit_events') is null
     or to_regclass('public.staff_value_added_audit_events') is null
     or to_regprocedure('public.staff_service_owns_profile(uuid, uuid)') is null
     or to_regprocedure('public.staff_service_manages_profile(uuid, uuid)') is null then
    raise exception 'STAFF_SERVICE_02F_REQUIRES_02A_02B_02D_02E';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Server-side MFA boundary.
-- ---------------------------------------------------------------------------

create or replace function public.staff_service_current_aal()
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_direct text := nullif(current_setting('request.jwt.claim.aal', true), '');
  v_claims jsonb;
  v_aal text;
begin
  if v_direct in ('aal1', 'aal2') then
    return v_direct;
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_aal := v_claims ->> 'aal';
  exception when others then
    return 'aal1';
  end;

  return case when v_aal = 'aal2' then 'aal2' else 'aal1' end;
end;
$$;

create or replace function public.staff_service_require_aal2()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if public.staff_service_current_aal() <> 'aal2' then
    raise exception 'STAFF_SERVICE_MFA_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Append-only governance audit ledger. No free-form metadata is accepted.
-- ---------------------------------------------------------------------------

create table public.staff_governance_audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in (
    'hr_report_viewed',
    'hr_report_exported',
    'integration_health_viewed',
    'unified_audit_viewed'
  )),
  scope_kind text not null check (scope_kind in (
    'institution', 'department', 'self'
  )),
  department_id uuid references public.departments(id) on delete restrict,
  period_from date,
  period_to date,
  occurred_at timestamptz not null default clock_timestamp(),
  check ((period_from is null) = (period_to is null)),
  check (period_to is null or period_to >= period_from)
);

create index staff_governance_audit_actor_idx
  on public.staff_governance_audit_events (actor_user_id, occurred_at desc);

create trigger staff_governance_audit_immutable_update
  before update on public.staff_governance_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

create trigger staff_governance_audit_immutable_delete
  before delete on public.staff_governance_audit_events
  for each row execute function public.staff_service_reject_event_mutation();

alter table public.staff_governance_audit_events enable row level security;

create policy staff_governance_audit_hr_admin_aal2_read
  on public.staff_governance_audit_events for select to authenticated
  using (
    public.staff_service_current_aal() = 'aal2'
    and (
      public.staff_service_has_role(auth.uid(), 'hr', null)
      or public.staff_service_is_admin(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 3) Read-only HR/Finance integration snapshots.
--    Deliberately no credentials, endpoints, URLs, tokens, object paths or
--    unstructured payload columns exist in this boundary.
-- ---------------------------------------------------------------------------

create table public.staff_hr_read_snapshots (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  external_record_id text not null check (
    char_length(external_record_id) between 1 and 160
    and external_record_id ~ '^[A-Za-z0-9._:/-]+$'
  ),
  employment_status text not null check (employment_status in (
    'active', 'on_leave', 'suspended', 'ended'
  )),
  grade text,
  job_title text,
  qualification text,
  source_updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  unique (external_record_id),
  unique (staff_profile_id),
  check (grade is null or char_length(grade) <= 120),
  check (job_title is null or char_length(job_title) <= 180),
  check (qualification is null or char_length(qualification) <= 240)
);

create table public.staff_finance_read_snapshots (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  external_record_id text not null check (
    char_length(external_record_id) between 1 and 160
    and external_record_id ~ '^[A-Za-z0-9._:/-]+$'
  ),
  period_start date not null,
  period_end date not null,
  statement_status text not null check (statement_status in (
    'pending', 'approved', 'published', 'withheld'
  )),
  source_updated_at timestamptz not null,
  synced_at timestamptz not null default clock_timestamp(),
  unique (external_record_id, period_start, period_end),
  check (period_end >= period_start)
);

create index staff_finance_read_snapshot_owner_idx
  on public.staff_finance_read_snapshots (staff_profile_id, period_end desc);

alter table public.staff_hr_read_snapshots enable row level security;
alter table public.staff_finance_read_snapshots enable row level security;

-- Tables have no authenticated grant. These owner policies are defence in
-- depth if a future migration introduces a projection intentionally.
create policy staff_hr_read_snapshot_owner
  on public.staff_hr_read_snapshots for select to authenticated
  using (public.staff_service_owns_profile(auth.uid(), staff_profile_id));

create policy staff_finance_read_snapshot_owner
  on public.staff_finance_read_snapshots for select to authenticated
  using (public.staff_service_owns_profile(auth.uid(), staff_profile_id));

create or replace function public.staff_service_ingest_hr_snapshot(
  p_staff_profile_id uuid,
  p_external_record_id text,
  p_employment_status text,
  p_grade text,
  p_job_title text,
  p_qualification text,
  p_source_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_external_record_id is null
     or char_length(p_external_record_id) not between 1 and 160
     or p_external_record_id !~ '^[A-Za-z0-9._:/-]+$'
     or p_external_record_id ~* '(secret|token|password|credential|https?://)' then
    raise exception 'STAFF_SERVICE_INTEGRATION_REFERENCE_INVALID' using errcode = '22023';
  end if;

  insert into public.staff_hr_read_snapshots (
    staff_profile_id, external_record_id, employment_status, grade,
    job_title, qualification, source_updated_at, synced_at
  ) values (
    p_staff_profile_id, p_external_record_id, p_employment_status, p_grade,
    p_job_title, p_qualification, p_source_updated_at, clock_timestamp()
  )
  on conflict (staff_profile_id) do update
  set external_record_id = excluded.external_record_id,
      employment_status = excluded.employment_status,
      grade = excluded.grade,
      job_title = excluded.job_title,
      qualification = excluded.qualification,
      source_updated_at = excluded.source_updated_at,
      synced_at = clock_timestamp()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.staff_service_ingest_finance_snapshot(
  p_staff_profile_id uuid,
  p_external_record_id text,
  p_period_start date,
  p_period_end date,
  p_statement_status text,
  p_source_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if p_external_record_id is null
     or char_length(p_external_record_id) not between 1 and 160
     or p_external_record_id !~ '^[A-Za-z0-9._:/-]+$'
     or p_external_record_id ~* '(secret|token|password|credential|https?://)' then
    raise exception 'STAFF_SERVICE_INTEGRATION_REFERENCE_INVALID' using errcode = '22023';
  end if;

  insert into public.staff_finance_read_snapshots (
    staff_profile_id, external_record_id, period_start, period_end,
    statement_status, source_updated_at, synced_at
  ) values (
    p_staff_profile_id, p_external_record_id, p_period_start, p_period_end,
    p_statement_status, p_source_updated_at, clock_timestamp()
  )
  on conflict (external_record_id, period_start, period_end) do update
  set staff_profile_id = excluded.staff_profile_id,
      statement_status = excluded.statement_status,
      source_updated_at = excluded.source_updated_at,
      synced_at = clock_timestamp()
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Capability and self-provenance DTOs.
-- ---------------------------------------------------------------------------

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
  v_hr boolean := false;
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
  v_hr := public.staff_service_has_role(v_user, 'hr', null);
  select exists (
    select 1 from public.staff_service_role_assignments a
    where a.user_id = v_user
      and a.role = 'direct_manager'
      and a.active
      and a.valid_from <= current_date
      and (a.valid_until is null or a.valid_until >= current_date)
  ) into v_manager;
  v_aal2 := public.staff_service_current_aal() = 'aal2';

  return jsonb_build_object(
    'mfa_verified', v_aal2,
    'can_view_reports', v_admin or v_hr or v_manager,
    'can_export_reports', v_admin or v_hr,
    'can_view_integrations', v_admin or v_hr,
    'can_view_unified_audit', v_admin or v_hr
  );
end;
$$;

create or replace function public.staff_service_get_own_integration_provenance()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_profile_id uuid;
begin
  if v_user is null then
    raise exception 'STAFF_SERVICE_AUTH_REQUIRED' using errcode = '42501';
  end if;

  select sp.id into v_profile_id
  from public.staff_profiles sp
  where sp.user_id = v_user and sp.status = 'active';

  if v_profile_id is null then
    return '[]'::jsonb;
  end if;

  return jsonb_build_array(
    jsonb_build_object(
      'source_system', 'hr',
      'has_snapshot', exists (
        select 1 from public.staff_hr_read_snapshots h
        where h.staff_profile_id = v_profile_id
      ),
      'last_synced_at', (
        select max(h.synced_at) from public.staff_hr_read_snapshots h
        where h.staff_profile_id = v_profile_id
      )
    ),
    jsonb_build_object(
      'source_system', 'finance',
      'has_snapshot', exists (
        select 1 from public.staff_finance_read_snapshots f
        where f.staff_profile_id = v_profile_id
      ),
      'last_synced_at', (
        select max(f.synced_at) from public.staff_finance_read_snapshots f
        where f.staff_profile_id = v_profile_id
      )
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Scoped HR/manager aggregate reports.
-- ---------------------------------------------------------------------------

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
    select 1 from public.staff_service_role_assignments a
    where a.user_id = v_user
      and a.role = 'direct_manager'
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
          select 1 from public.staff_service_role_assignments a
          where a.user_id = v_user
            and a.role = 'direct_manager'
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

create or replace function public.staff_service_record_governance_report_export(
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
begin
  if p_period_from is null or p_period_to is null
     or p_period_to < p_period_from
     or p_period_to - p_period_from > 366 then
    raise exception 'STAFF_SERVICE_REPORT_PERIOD_INVALID' using errcode = '22023';
  end if;

  v_scope := public.staff_service_governance_report_scope(p_department_id);
  if not (
    public.staff_service_is_admin(v_user)
    or public.staff_service_has_role(v_user, 'hr', null)
  ) then
    raise exception 'STAFF_SERVICE_REPORT_EXPORT_ACCESS_DENIED' using errcode = '42501';
  end if;

  insert into public.staff_governance_audit_events (
    actor_user_id, event_type, scope_kind, department_id,
    period_from, period_to
  ) values (
    v_user, 'hr_report_exported', v_scope, p_department_id,
    p_period_from, p_period_to
  );

  return jsonb_build_object('recorded', true, 'scope', v_scope);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) AAL2-only integration health and redacted unified audit.
-- ---------------------------------------------------------------------------

create or replace function public.staff_service_get_integration_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  perform public.staff_service_require_aal2();
  if not (
    public.staff_service_is_admin(v_user)
    or public.staff_service_has_role(v_user, 'hr', null)
  ) then
    raise exception 'STAFF_SERVICE_INTEGRATION_HEALTH_ACCESS_DENIED'
      using errcode = '42501';
  end if;

  v_result := jsonb_build_array(
    jsonb_build_object(
      'source_system', 'hr',
      'records', (select count(*) from public.staff_hr_read_snapshots),
      'last_synced_at', (select max(synced_at) from public.staff_hr_read_snapshots),
      'stale_records', (
        select count(*) from public.staff_hr_read_snapshots
        where synced_at < clock_timestamp() - interval '24 hours'
      )
    ),
    jsonb_build_object(
      'source_system', 'finance',
      'records', (select count(*) from public.staff_finance_read_snapshots),
      'last_synced_at', (select max(synced_at) from public.staff_finance_read_snapshots),
      'stale_records', (
        select count(*) from public.staff_finance_read_snapshots
        where synced_at < clock_timestamp() - interval '24 hours'
      )
    )
  );

  insert into public.staff_governance_audit_events (
    actor_user_id, event_type, scope_kind
  ) values (v_user, 'integration_health_viewed', 'institution');

  return v_result;
end;
$$;

create or replace function public.staff_service_list_governance_audit(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  perform public.staff_service_require_aal2();
  if not (
    public.staff_service_is_admin(v_user)
    or public.staff_service_has_role(v_user, 'hr', null)
  ) then
    raise exception 'STAFF_SERVICE_AUDIT_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_limit not between 1 and 500 then
    raise exception 'STAFF_SERVICE_AUDIT_LIMIT_INVALID' using errcode = '22023';
  end if;

  with unified as (
    select
      'workflow'::text as source,
      'request'::text as module,
      e.request_id as subject_id,
      e.event_type,
      e.actor_user_id,
      e.occurred_at
    from public.staff_service_events e
    union all
    select
      'read_side', r.subject_kind, r.subject_id, r.event_type,
      r.actor_user_id, r.occurred_at
    from public.staff_service_read_audit_events r
    union all
    select
      'value_added', v.module, v.subject_id, v.event_type,
      v.actor_user_id, v.occurred_at
    from public.staff_value_added_audit_events v
    union all
    select
      'governance', 'governance', null::uuid, g.event_type,
      g.actor_user_id, g.occurred_at
    from public.staff_governance_audit_events g
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source', source,
      'module', module,
      'subject_id', subject_id,
      'event_type', event_type,
      'actor_user_id', actor_user_id,
      'occurred_at', occurred_at
    ) order by occurred_at desc
  ), '[]'::jsonb) into v_result
  from (
    select source, module, subject_id, event_type, actor_user_id, occurred_at
    from unified
    order by occurred_at desc
    limit p_limit
  ) bounded;

  insert into public.staff_governance_audit_events (
    actor_user_id, event_type, scope_kind
  ) values (v_user, 'unified_audit_viewed', 'institution');

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Least privilege grants.
-- ---------------------------------------------------------------------------

revoke all on table public.staff_governance_audit_events
  from public, anon, authenticated;
revoke all on table public.staff_hr_read_snapshots
  from public, anon, authenticated;
revoke all on table public.staff_finance_read_snapshots
  from public, anon, authenticated;

grant all on table public.staff_governance_audit_events to service_role;
grant all on table public.staff_hr_read_snapshots to service_role;
grant all on table public.staff_finance_read_snapshots to service_role;

revoke all on function public.staff_service_current_aal() from public, anon;
revoke all on function public.staff_service_require_aal2() from public, anon, authenticated;
revoke all on function public.staff_service_ingest_hr_snapshot(
  uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.staff_service_ingest_finance_snapshot(
  uuid, text, date, date, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.staff_service_get_governance_capabilities()
  from public, anon;
revoke all on function public.staff_service_get_own_integration_provenance()
  from public, anon;
revoke all on function public.staff_service_governance_report_scope(uuid)
  from public, anon, authenticated;
revoke all on function public.staff_service_list_governance_report(
  date, date, uuid
) from public, anon;
revoke all on function public.staff_service_record_governance_report_export(
  date, date, uuid
) from public, anon;
revoke all on function public.staff_service_get_integration_health()
  from public, anon;
revoke all on function public.staff_service_list_governance_audit(integer)
  from public, anon;

grant execute on function public.staff_service_current_aal() to authenticated;
grant execute on function public.staff_service_get_governance_capabilities()
  to authenticated;
grant execute on function public.staff_service_get_own_integration_provenance()
  to authenticated;
grant execute on function public.staff_service_list_governance_report(
  date, date, uuid
) to authenticated;
grant execute on function public.staff_service_record_governance_report_export(
  date, date, uuid
) to authenticated;
grant execute on function public.staff_service_get_integration_health()
  to authenticated;
grant execute on function public.staff_service_list_governance_audit(integer)
  to authenticated;

grant execute on function public.staff_service_ingest_hr_snapshot(
  uuid, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.staff_service_ingest_finance_snapshot(
  uuid, text, date, date, text, timestamptz
) to service_role;

comment on table public.staff_hr_read_snapshots is
  'Read-only HR projection. Contains no connector credentials, endpoint or write-back contract.';
comment on table public.staff_finance_read_snapshots is
  'Read-only Finance provenance/status projection; payroll amounts remain in the existing finance boundary.';
comment on function public.staff_service_list_governance_audit(integer) is
  'AAL2 HR/Admin audit DTO. Metadata, reasons, paths, tokens and payroll values are deliberately omitted.';

commit;
