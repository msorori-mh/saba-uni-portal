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
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'الإدارة');

insert into public.staff_profiles (
  id, user_id, employee_number, full_name_ar, department_id, job_title, status
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '11111111-1111-4111-8111-111111111111',
    'TEST-EMP-01',
    'موظف اختبار أول',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'مختص',
    'active'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '22222222-2222-4222-8222-222222222222',
    'TEST-EMP-02',
    'موظف اختبار ثان',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'مختص',
    'active'
  );

insert into public.test_admin_users (user_id) values
  ('77777777-7777-4777-8777-777777777777');

insert into public.staff_service_role_assignments (
  user_id, role, department_id, active
) values
  (
    '33333333-3333-4333-8333-333333333333',
    'direct_manager',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    true
  ),
  ('44444444-4444-4444-8444-444444444444', 'hr', null, true),
  ('55555555-5555-4555-8555-555555555555', 'finance', null, true);

create temporary table test_staff_service_state (
  request_id uuid,
  upload_request_id uuid,
  attachment_id uuid,
  object_path text
) on commit drop;

grant select, insert, update on test_staff_service_state to authenticated;

-- A. Employee submission creates the exact two-step workflow.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

insert into test_staff_service_state (request_id)
select id
from public.staff_service_submit_request(
  'leave',
  jsonb_build_object(
    'leaveType', 'annual',
    'startsOn', '2026-08-25',
    'endsOn', '2026-08-29',
    'durationDays', 5
  ),
  '10000000-0000-4000-8000-000000000001'
);

do $$
declare
  v_request_id uuid;
  v_replay_id uuid;
  v_steps text;
begin
  select request_id into v_request_id from test_staff_service_state;

  select id into v_replay_id
  from public.staff_service_submit_request(
    'leave',
    jsonb_build_object(
      'leaveType', 'annual',
      'startsOn', '2026-08-25',
      'endsOn', '2026-08-29',
      'durationDays', 5
    ),
    '10000000-0000-4000-8000-000000000001'
  );

  if v_replay_id <> v_request_id then
    raise exception 'A_IDEMPOTENT_REPLAY_CHANGED_REQUEST';
  end if;

  select string_agg(required_role, ',' order by step_order) into v_steps
  from public.staff_service_approval_steps
  where request_id = v_request_id;

  if v_steps <> 'direct_manager,hr' then
    raise exception 'A_WORKFLOW_MISMATCH:%', v_steps;
  end if;
end;
$$;
reset role;

-- B. Even when accidentally assigned as manager, an employee cannot approve own request.
insert into public.staff_service_role_assignments (
  user_id, role, department_id, active
) values (
  '11111111-1111-4111-8111-111111111111',
  'direct_manager',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  true
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
do $$
begin
  perform public.staff_service_decide_request(
    (select request_id from test_staff_service_state),
    'approved',
    'self',
    '10000000-0000-4000-8000-000000000002'
  );
  raise exception 'B_SELF_APPROVAL_UNEXPECTED_SUCCESS';
exception
  when insufficient_privilege then
    if sqlerrm not like '%STAFF_SERVICE_SELF_APPROVAL_DENIED%' then
      raise;
    end if;
end;
$$;
reset role;

-- C. Scoped manager approves, then HR rejection requires and stores a reason.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
select public.staff_service_decide_request(
  (select request_id from test_staff_service_state),
  'approved',
  'تغطية العمل متاحة',
  '10000000-0000-4000-8000-000000000003'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '44444444-4444-4444-8444-444444444444',
  true
);
do $$
begin
  perform public.staff_service_decide_request(
    (select request_id from test_staff_service_state),
    'rejected',
    null,
    '10000000-0000-4000-8000-000000000004'
  );
  raise exception 'C_REASONLESS_REJECTION_UNEXPECTED_SUCCESS';
exception
  when invalid_parameter_value then
    if sqlerrm not like '%STAFF_SERVICE_REJECTION_REASON_REQUIRED%' then
      raise;
    end if;
end;
$$;

select public.staff_service_decide_request(
  (select request_id from test_staff_service_state),
  'rejected',
  'الرصيد غير كافٍ',
  '10000000-0000-4000-8000-000000000005'
);
reset role;

do $$
declare
  v_status text;
  v_reason text;
begin
  select status, decision_reason into v_status, v_reason
  from public.staff_service_requests
  where id = (select request_id from test_staff_service_state);

  if v_status <> 'rejected' or v_reason <> 'الرصيد غير كافٍ' then
    raise exception 'C_REJECTION_STATE_MISMATCH:%:%', v_status, v_reason;
  end if;
end;
$$;

-- D. Audit timeline rejects UPDATE and DELETE, even from the table owner.
do $$
begin
  update public.staff_service_events
  set reason = 'tampered'
  where request_id = (select request_id from test_staff_service_state);
  raise exception 'D_AUDIT_UPDATE_UNEXPECTED_SUCCESS';
exception
  when insufficient_privilege then
    if sqlerrm not like '%STAFF_SERVICE_AUDIT_IMMUTABLE%' then
      raise;
    end if;
end;
$$;

do $$
begin
  delete from public.staff_service_events
  where request_id = (select request_id from test_staff_service_state);
  raise exception 'D_AUDIT_DELETE_UNEXPECTED_SUCCESS';
exception
  when insufficient_privilege then
    if sqlerrm not like '%STAFF_SERVICE_AUDIT_IMMUTABLE%' then
      raise;
    end if;
end;
$$;

-- E. Payroll RLS: own row, no manager access, Finance sees the batch.
insert into public.staff_payroll_statements (
  staff_profile_id,
  period_start,
  period_end,
  basic_salary,
  allowances_total,
  deductions_total,
  source_system,
  source_reference,
  published_at
) values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    '2026-07-01', '2026-07-31', 100000, 20000, 5000,
    'TEST_ONLY_HR_FINANCE', 'PAY-01', now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    '2026-07-01', '2026-07-31', 110000, 25000, 6000,
    'TEST_ONLY_HR_FINANCE', 'PAY-02', now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
do $$
begin
  if (select count(*) from public.staff_payroll_statements) <> 1 then
    raise exception 'E_EMPLOYEE_PAYROLL_SCOPE_MISMATCH';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '33333333-3333-4333-8333-333333333333',
  true
);
do $$
begin
  if (select count(*) from public.staff_payroll_statements) <> 0 then
    raise exception 'E_MANAGER_PAYROLL_DISCLOSURE';
  end if;
end;
$$;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '55555555-5555-4555-8555-555555555555',
  true
);
do $$
begin
  if (select count(*) from public.staff_payroll_statements) <> 2 then
    raise exception 'E_FINANCE_PAYROLL_SCOPE_MISMATCH';
  end if;
end;
$$;
reset role;

-- F. Private upload contract, narrow storage policy, scan gate, signed-download contract.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

update test_staff_service_state
set upload_request_id = (
  select id
  from public.staff_service_submit_request(
    'permission',
    jsonb_build_object(
      'permissionDate', '2026-08-24',
      'startsAt', '10:00',
      'endsAt', '11:00',
      'reason', 'TEST_ONLY'
    ),
    '20000000-0000-4000-8000-000000000001'
  )
);

with intent as (
  select public.staff_service_create_attachment_upload_intent(
    (select upload_request_id from test_staff_service_state),
    'إثبات.pdf',
    'application/pdf',
    1024,
    repeat('a', 64),
    '20000000-0000-4000-8000-000000000002'
  ) as value
)
update test_staff_service_state
set attachment_id = (select (value->>'attachment_id')::uuid from intent),
    object_path = (select value->>'object_path' from intent);

insert into storage.objects (bucket_id, name, owner, metadata)
values (
  'staff-service-private',
  (select object_path from test_staff_service_state),
  auth.uid(),
  jsonb_build_object('mimetype', 'application/pdf', 'size', 1024)
);

select public.staff_service_finalize_attachment_upload(
  (select attachment_id from test_staff_service_state),
  '20000000-0000-4000-8000-000000000003'
);

do $$
begin
  perform public.staff_service_authorize_attachment_download(
    (select attachment_id from test_staff_service_state)
  );
  raise exception 'F_UNSCANNED_DOWNLOAD_UNEXPECTED_SUCCESS';
exception
  when insufficient_privilege then
    if sqlerrm not like '%STAFF_SERVICE_ATTACHMENT_ACCESS_DENIED%' then
      raise;
    end if;
end;
$$;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '66666666-6666-4666-8666-666666666666',
  true
);
do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values (
    'staff-service-private',
    (select object_path from test_staff_service_state) || '.copy',
    auth.uid()
  );
  raise exception 'F_OUTSIDER_UPLOAD_UNEXPECTED_SUCCESS';
exception
  when insufficient_privilege then null;
end;
$$;
reset role;

set local role service_role;
select public.staff_service_mark_attachment_scan_state(
  (select attachment_id from test_staff_service_state),
  'clean',
  'TEST_ONLY_SCANNER_PASS'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);
do $$
declare
  v_contract jsonb;
begin
  select public.staff_service_authorize_attachment_download(
    (select attachment_id from test_staff_service_state)
  ) into v_contract;

  if v_contract->>'storage_bucket' <> 'staff-service-private'
     or (v_contract->>'expires_in_seconds')::integer <> 300
     or v_contract->>'object_path' like '%..%' then
    raise exception 'F_DOWNLOAD_CONTRACT_INVALID:%', v_contract;
  end if;

  if (select count(*) from storage.objects) <> 1 then
    raise exception 'F_STORAGE_SELECT_SCOPE_MISMATCH';
  end if;
end;
$$;
reset role;

-- G. No client write grants to business tables; service-role scanner only.
do $$
begin
  if has_table_privilege('authenticated', 'public.staff_service_requests', 'INSERT')
     or has_table_privilege('authenticated', 'public.staff_service_requests', 'UPDATE')
     or has_table_privilege('authenticated', 'public.staff_service_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.staff_payroll_statements', 'UPDATE') then
    raise exception 'G_BROAD_CLIENT_TABLE_GRANT';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.staff_service_mark_attachment_scan_state(uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'G_SCANNER_EXPOSED_TO_AUTHENTICATED';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.staff_service_mark_attachment_scan_state(uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'G_SCANNER_NOT_GRANTED_TO_SERVICE_ROLE';
  end if;
end;
$$;

select 'PASS_STAFF_SELF_SERVICE_PG17_STORAGE_BINDING_02B';

rollback;

