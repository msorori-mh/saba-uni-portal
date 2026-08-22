-- PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
-- Transactional runtime verifier: proves the read-side contract on PostgreSQL 17.
-- Runs after 00-minimal-schema.sql + 02A + 02B + 02D.

begin;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'employee1@test.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'employee2@test.invalid'),
  ('33333333-3333-4333-8333-333333333333', 'manager@test.invalid'),
  ('55555555-5555-4555-8555-555555555555', 'finance@test.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'outsider@test.invalid'),
  ('77777777-7777-4777-8777-777777777777', 'admin@test.invalid');

insert into public.departments (id, name_ar) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'الإدارة');

insert into public.staff_profiles (
  id, user_id, employee_number, full_name_ar, department_id, job_title, status
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
   '11111111-1111-4111-8111-111111111111',
   'TEST-EMP-01', 'موظف اختبار أول',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'مختص', 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
   '22222222-2222-4222-8222-222222222222',
   'TEST-EMP-02', 'موظف اختبار ثان',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'مختص', 'active');

insert into public.test_admin_users (user_id) values
  ('77777777-7777-4777-8777-777777777777');

insert into public.staff_service_role_assignments (role, user_id, department_id)
values
  ('direct_manager', '33333333-3333-4333-8333-333333333333',
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('finance', '55555555-5555-4555-8555-555555555555', null);

-- Published payroll statement owned by employee 1.
insert into public.staff_payroll_statements (
  id, staff_profile_id, period_start, period_end, currency_code,
  basic_salary, allowances_total, deductions_total,
  source_system, source_reference, published_at
) values (
  'ffffffff-ffff-4fff-8fff-fffffffffff1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  date '2026-08-01', date '2026-08-31', 'YER',
  200000, 50000, 20000,
  'TEST_ONLY', 'PAY-02D-001', now()
);

-- Unpublished statement owned by employee 2 (must never be downloadable).
insert into public.staff_payroll_statements (
  id, staff_profile_id, period_start, period_end, currency_code,
  basic_salary, allowances_total, deductions_total,
  source_system, source_reference, published_at
) values (
  'ffffffff-ffff-4fff-8fff-fffffffffff2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  date '2026-08-01', date '2026-08-31', 'YER',
  100000, 10000, 5000,
  'TEST_ONLY', 'PAY-02D-002', null
);

insert into public.staff_payroll_components (
  statement_id, component_type, component_code, label_ar, amount, display_order
) values
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'allowance', 'TRANSPORT', 'بدل مواصلات', 50000, 1),
  ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'deduction', 'INSURANCE', 'تأمينات', 20000, 1);

insert into public.staff_correspondence (
  id, reference_no, title, body, archive_category, importance, published_at
) values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', 'REF-02D-001', 'تعميم منشور',
   'نص التعميم المنشور', 'تعاميم', 'important', now()),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', 'REF-02D-002', 'تعميم غير منشور',
   'نص التعميم غير المنشور', 'تعاميم', 'normal', null);

insert into public.staff_correspondence_recipients (correspondence_id, recipient_user_id)
values
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc1', '11111111-1111-4111-8111-111111111111'),
  ('cccccccc-cccc-4ccc-8ccc-ccccccccccc2', '11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- A) No client role may UPDATE correspondence receipts directly any more.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'staff_correspondence_recipients'
      and privilege_type = 'UPDATE'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'A_CLIENT_RECEIPT_UPDATE_GRANT_STILL_PRESENT';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'staff_correspondence_recipients'
      and cmd = 'UPDATE'
  ) then
    raise exception 'A_CLIENT_RECEIPT_UPDATE_POLICY_STILL_PRESENT';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) Owner read + acknowledge is monotonic and idempotent.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';

do $$
declare
  v_first jsonb;
  v_second jsonb;
  v_ack jsonb;
begin
  v_first := public.staff_service_record_correspondence_read(
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
  if v_first->>'read_at' is null then
    raise exception 'B_READ_NOT_RECORDED';
  end if;

  perform pg_sleep(0.01);
  v_second := public.staff_service_record_correspondence_read(
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
  if (v_second->>'read_at') is distinct from (v_first->>'read_at') then
    raise exception 'B_READ_TIMESTAMP_NOT_MONOTONIC';
  end if;

  v_ack := public.staff_service_acknowledge_correspondence(
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
  if v_ack->>'acknowledged_at' is null then
    raise exception 'B_ACK_NOT_RECORDED';
  end if;
  if (v_ack->>'read_at') is distinct from (v_first->>'read_at') then
    raise exception 'B_ACK_OVERWROTE_READ_TIMESTAMP';
  end if;
end;
$$;

-- Unpublished correspondence must stay unreachable even for a real recipient.
do $$
begin
  begin
    perform public.staff_service_record_correspondence_read(
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc2');
    raise exception 'B_UNPUBLISHED_CORRESPONDENCE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) Cross-user correspondence action is denied.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"66666666-6666-4666-8666-666666666666"}';
do $$
begin
  begin
    perform public.staff_service_acknowledge_correspondence(
      'cccccccc-cccc-4ccc-8ccc-ccccccccccc1');
    raise exception 'C_OUTSIDER_ACK_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- D) Payroll authorization matrix: owner / finance / admin allow, others deny.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
do $$
declare v jsonb;
begin
  v := public.staff_service_authorize_payroll_statement_download(
    'ffffffff-ffff-4fff-8fff-fffffffffff1');
  if v->>'access_mode' <> 'owner' then
    raise exception 'D_OWNER_ACCESS_MODE_WRONG';
  end if;
  if jsonb_array_length(v->'components') <> 2 then
    raise exception 'D_OWNER_COMPONENTS_MISSING';
  end if;
  if (v->>'net_amount')::numeric <> 230000 then
    raise exception 'D_OWNER_NET_AMOUNT_WRONG';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555"}';
do $$
declare v jsonb;
begin
  v := public.staff_service_authorize_payroll_statement_download(
    'ffffffff-ffff-4fff-8fff-fffffffffff1');
  if v->>'access_mode' <> 'finance' then
    raise exception 'D_FINANCE_ACCESS_MODE_WRONG';
  end if;
end;
$$;

set local request.jwt.claims = '{"sub":"77777777-7777-4777-8777-777777777777"}';
do $$
declare v jsonb;
begin
  v := public.staff_service_authorize_payroll_statement_download(
    'ffffffff-ffff-4fff-8fff-fffffffffff1');
  if v->>'access_mode' <> 'administrator' then
    raise exception 'D_ADMIN_ACCESS_MODE_WRONG';
  end if;
end;
$$;

-- Manager is NOT a payroll role.
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333"}';
do $$
begin
  begin
    perform public.staff_service_authorize_payroll_statement_download(
      'ffffffff-ffff-4fff-8fff-fffffffffff1');
    raise exception 'D_MANAGER_PAYROLL_DISCLOSURE';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- Another employee cannot pull a colleague's statement.
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222"}';
do $$
begin
  begin
    perform public.staff_service_authorize_payroll_statement_download(
      'ffffffff-ffff-4fff-8fff-fffffffffff1');
    raise exception 'D_PEER_PAYROLL_DISCLOSURE';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- Unpublished statement is never downloadable, not even by its owner.
do $$
begin
  begin
    perform public.staff_service_authorize_payroll_statement_download(
      'ffffffff-ffff-4fff-8fff-fffffffffff2');
    raise exception 'D_UNPUBLISHED_PAYROLL_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- E) Read-audit ledger is append-only and owner/admin scoped.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111"}';
do $$
declare
  v_own int;
  v_foreign int;
begin
  select count(*) into v_own
  from public.staff_service_read_audit_events;
  if v_own < 4 then
    raise exception 'E_AUDIT_EVENTS_NOT_RECORDED';
  end if;

  select count(*) into v_foreign
  from public.staff_service_read_audit_events
  where actor_user_id <> '11111111-1111-4111-8111-111111111111';
  if v_foreign <> 0 then
    raise exception 'E_AUDIT_CROSS_ACTOR_DISCLOSURE';
  end if;

  begin
    update public.staff_service_read_audit_events set metadata = '{}'::jsonb;
    raise exception 'E_AUDIT_UPDATE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%E_AUDIT_UPDATE_UNEXPECTED_SUCCESS%' then raise; end if;
  end;

  begin
    delete from public.staff_service_read_audit_events;
    raise exception 'E_AUDIT_DELETE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%E_AUDIT_DELETE_UNEXPECTED_SUCCESS%' then raise; end if;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- F) No broad client write grants on read-side tables.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'staff_service_read_audit_events',
        'staff_payroll_statements',
        'staff_payroll_components',
        'staff_correspondence',
        'staff_correspondence_recipients',
        'staff_career_events',
        'staff_custody_items',
        'staff_leave_balances'
      )
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'F_BROAD_CLIENT_TABLE_GRANT';
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name in (
        'staff_service_record_correspondence_read',
        'staff_service_acknowledge_correspondence',
        'staff_service_authorize_payroll_statement_download'
      )
      and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'F_ANON_RPC_GRANT';
  end if;
end;
$$;

select 'PASS_STAFF_SELF_SERVICE_PG17_LIVE_READ_SIDE_02D' as verdict;

rollback;
