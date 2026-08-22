-- PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F
-- Transactional PostgreSQL 17 verifier. Runs after 02A + 02B + 02D + 02E + 02F.

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'employee1@test.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'employee2@test.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'manager@test.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'hr@test.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'finance@test.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'outsider@test.invalid'),
  ('77777777-7777-4777-8777-777777777777', 'admin@test.invalid');

insert into public.departments (id, name_ar) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'تقنية المعلومات'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'علوم الحاسوب');

insert into public.staff_profiles (
  id, user_id, employee_number, full_name_ar, department_id, job_title, status
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '11111111-1111-4111-8111-111111111111',
   'TEST-EMP-01', 'موظف أول',
   'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'مختص', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   '22222222-2222-4222-8222-222222222222',
   'TEST-EMP-02', 'موظف ثان',
   'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'مختص', 'active');

insert into public.test_admin_users (user_id)
values ('77777777-7777-4777-8777-777777777777');

insert into public.staff_service_role_assignments (
  role, user_id, department_id
) values
  ('direct_manager', '33333333-3333-4333-8333-333333333333',
   'dddddddd-dddd-4ddd-8ddd-dddddddddd01'),
  ('hr', '44444444-4444-4444-8444-444444444444', null),
  ('finance', '55555555-5555-4555-8555-555555555555', null);

insert into public.staff_service_requests (
  request_no, staff_profile_id, department_id, service_type, status,
  current_step, payload, decided_at, idempotency_key
) values
  ('REQ-02F-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   'dddddddd-dddd-4ddd-8ddd-dddddddddd01', 'leave', 'approved', 1,
   '{}'::jsonb, now(), gen_random_uuid()),
  ('REQ-02F-2', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   'dddddddd-dddd-4ddd-8ddd-dddddddddd02', 'permission', 'submitted', 1,
   '{}'::jsonb, null, gen_random_uuid());

insert into public.staff_attendance_days (
  staff_profile_id, attendance_date, worked_minutes, late_minutes,
  overtime_minutes, day_state, source_system
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', current_date - 1,
   480, 15, 0, 'late', 'TEST'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', current_date - 1,
   480, 0, 0, 'present', 'TEST');

-- ---------------------------------------------------------------------------
-- A) Ingestion is service_role-only and carries no connector secrets.
-- ---------------------------------------------------------------------------
set local role service_role;
select public.staff_service_ingest_hr_snapshot(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'HR-EMP-01', 'active',
  'الدرجة السادسة', 'مختص', 'بكالوريوس', now()
);
select public.staff_service_ingest_hr_snapshot(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'HR-EMP-02', 'active',
  'الدرجة السابعة', 'مختص', 'ماجستير', now()
);
select public.staff_service_ingest_finance_snapshot(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'FIN-EMP-01',
  current_date - 30, current_date, 'published', now()
);

do $$
begin
  begin
    perform public.staff_service_ingest_hr_snapshot(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      'https://example.invalid/token', 'active', null, null, null, now());
    raise exception 'A_SECRET_LIKE_REFERENCE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;
end;
$$;

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claim.aal = 'aal2';
do $$
begin
  begin
    perform public.staff_service_ingest_hr_snapshot(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'FORGED', 'active',
      null, null, null, now());
    raise exception 'A_AUTHENTICATED_INGEST_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform 1 from public.staff_hr_read_snapshots limit 1;
    raise exception 'A_DIRECT_HR_SNAPSHOT_READ_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform 1 from public.staff_finance_read_snapshots limit 1;
    raise exception 'A_DIRECT_FINANCE_SNAPSHOT_READ_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) Employee sees provenance only, never external identifiers or peer rows.
-- ---------------------------------------------------------------------------
do $$
declare
  v jsonb := public.staff_service_get_own_integration_provenance();
begin
  if jsonb_array_length(v) <> 2 then
    raise exception 'B_OWN_PROVENANCE_WRONG_SHAPE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v) item
    where item ? 'external_record_id'
       or item ? 'staff_profile_id'
       or item ? 'endpoint'
       or item ? 'secret'
  ) then
    raise exception 'B_OWN_PROVENANCE_LEAK';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v) item
    where item ->> 'source_system' = 'hr'
      and (item ->> 'has_snapshot')::boolean
  ) then
    raise exception 'B_OWN_HR_PROVENANCE_MISSING';
  end if;

  begin
    perform public.staff_service_list_governance_report(
      current_date - 30, current_date, null);
    raise exception 'B_EMPLOYEE_REPORT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) MFA is enforced server-side, not by UI convention.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set local request.jwt.claim.aal = 'aal1';
do $$
declare
  v jsonb := public.staff_service_get_governance_capabilities();
begin
  if not (v ->> 'can_view_reports')::boolean
     or (v ->> 'mfa_verified')::boolean then
    raise exception 'C_MANAGER_CAPABILITY_WRONG';
  end if;
  begin
    perform public.staff_service_list_governance_report(
      current_date - 30, current_date, null);
    raise exception 'C_AAL1_REPORT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$
begin
  begin
    perform public.staff_service_get_integration_health();
    raise exception 'C_AAL1_INTEGRATION_HEALTH_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
  begin
    perform public.staff_service_list_governance_audit(10);
    raise exception 'C_AAL1_AUDIT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- D) Direct Manager is constrained to assigned departments.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
set local request.jwt.claim.aal = 'aal2';
do $$
declare
  v jsonb := public.staff_service_list_governance_report(
    current_date - 30, current_date, null);
  v_depts jsonb;
begin
  v_depts := v -> 'departments';
  if v ->> 'scope' <> 'department'
     or jsonb_array_length(v_depts) <> 1
     or v_depts -> 0 ->> 'department_id'
        <> 'dddddddd-dddd-4ddd-8ddd-dddddddddd01' then
    raise exception 'D_MANAGER_DEPARTMENT_SCOPE_WRONG';
  end if;
  if (v_depts -> 0 ->> 'employees')::int <> 1
     or (v_depts -> 0 ->> 'late_days')::int <> 1 then
    raise exception 'D_MANAGER_REPORT_METRICS_WRONG';
  end if;

  begin
    perform public.staff_service_list_governance_report(
      current_date - 30, current_date,
      'dddddddd-dddd-4ddd-8ddd-dddddddddd02');
    raise exception 'D_MANAGER_CROSS_DEPARTMENT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.staff_service_record_governance_report_export(
      current_date - 30, current_date, null);
    raise exception 'D_MANAGER_EXPORT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- E) HR has institution scope and may export only at AAL2.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare
  v jsonb := public.staff_service_list_governance_report(
    current_date - 30, current_date, null);
  v_export jsonb;
begin
  if v ->> 'scope' <> 'institution'
     or jsonb_array_length(v -> 'departments') <> 2 then
    raise exception 'E_HR_INSTITUTION_SCOPE_WRONG';
  end if;
  v_export := public.staff_service_record_governance_report_export(
    current_date - 30, current_date, null);
  if not (v_export ->> 'recorded')::boolean then
    raise exception 'E_HR_EXPORT_NOT_AUDITED';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- F) Finance and outsider cannot cross into HR reports or governance.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  begin
    perform public.staff_service_list_governance_report(
      current_date - 30, current_date, null);
    raise exception 'F_FINANCE_REPORT_UNEXPECTED_SUCCESS';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.staff_service_get_integration_health();
    raise exception 'F_FINANCE_INTEGRATION_UNEXPECTED_SUCCESS';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.staff_service_list_governance_audit(10);
    raise exception 'F_FINANCE_AUDIT_UNEXPECTED_SUCCESS';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$
begin
  begin
    perform public.staff_service_list_governance_report(
      current_date - 30, current_date, null);
    raise exception 'F_OUTSIDER_REPORT_UNEXPECTED_SUCCESS';
  exception when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- G) Admin health/audit DTOs are AAL2-only and redact sensitive material.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$
declare
  v_health jsonb := public.staff_service_get_integration_health();
  v_audit jsonb := public.staff_service_list_governance_audit(100);
begin
  if jsonb_array_length(v_health) <> 2 then
    raise exception 'G_INTEGRATION_HEALTH_WRONG_SHAPE';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_health) item
    where item ? 'external_record_id'
       or item ? 'endpoint'
       or item ? 'secret'
       or item ? 'token'
  ) then
    raise exception 'G_INTEGRATION_HEALTH_LEAK';
  end if;

  if jsonb_array_length(v_audit) < 1 then
    raise exception 'G_UNIFIED_AUDIT_EMPTY';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_audit) item
    where item ? 'metadata'
       or item ? 'reason'
       or item ? 'payload'
       or item ? 'verification_token'
       or item ? 'object_path'
       or item ? 'basic_salary'
       or item ? 'net_amount'
  ) then
    raise exception 'G_UNIFIED_AUDIT_SENSITIVE_FIELD_LEAK';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- H) Governance audit is append-only and client writes are absent.
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.staff_governance_audit_events
    set period_from = current_date;
    raise exception 'H_GOVERNANCE_AUDIT_UPDATE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%H_GOVERNANCE_AUDIT_UPDATE_UNEXPECTED_SUCCESS%' then
        raise;
      end if;
  end;

  begin
    delete from public.staff_governance_audit_events;
    raise exception 'H_GOVERNANCE_AUDIT_DELETE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%H_GOVERNANCE_AUDIT_DELETE_UNEXPECTED_SUCCESS%' then
        raise;
      end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- I) Privilege matrix: no anon surface, no broad authenticated table grants.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'staff_governance_audit_events',
        'staff_hr_read_snapshots',
        'staff_finance_read_snapshots'
      )
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'I_CLIENT_TABLE_GRANT_PRESENT';
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name like 'staff_service_%'
      and grantee in ('anon', 'PUBLIC')
      and routine_name in (
        'staff_service_get_governance_capabilities',
        'staff_service_get_own_integration_provenance',
        'staff_service_list_governance_report',
        'staff_service_record_governance_report_export',
        'staff_service_get_integration_health',
        'staff_service_list_governance_audit',
        'staff_service_ingest_hr_snapshot',
        'staff_service_ingest_finance_snapshot'
      )
  ) then
    raise exception 'I_ANON_GOVERNANCE_RPC_GRANT';
  end if;

  if exists (
    select 1 from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name in (
        'staff_service_ingest_hr_snapshot',
        'staff_service_ingest_finance_snapshot'
      )
      and grantee = 'authenticated'
  ) then
    raise exception 'I_AUTHENTICATED_INGEST_GRANT';
  end if;
end;
$$;

select 'PASS_STAFF_SELF_SERVICE_PG17_GOVERNANCE_02F' as verdict;

rollback;
