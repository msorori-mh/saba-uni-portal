-- PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
-- Transactional runtime verifier for the value-added modules.
-- Runs after 00-minimal-schema.sql + 02A + 02B + 02D + 02E.

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
  ('hr', '44444444-4444-4444-8444-444444444444', null),
  ('finance', '55555555-5555-4555-8555-555555555555', null);

-- Approved employment-certificate request owned by employee 1.
insert into public.staff_service_requests (
  id, request_no, staff_profile_id, department_id, service_type, status,
  current_step, payload, decided_at, idempotency_key
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 'REQ-02E-1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'employment_certificate', 'approved', 1,
  jsonb_build_object('document_type', 'employment_statement',
                     'language_code', 'ar', 'purpose', 'بنك'),
  now(), gen_random_uuid()
);

-- A second request that is NOT approved (issuance must fail closed).
insert into public.staff_service_requests (
  id, request_no, staff_profile_id, department_id, service_type, status,
  current_step, payload, idempotency_key
) values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 'REQ-02E-2',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'experience_certificate', 'submitted', 1, '{}'::jsonb, gen_random_uuid()
);

insert into public.staff_performance_cycles (id, cycle_year, title_ar, opens_on, closes_on)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 2026, 'دورة 2026',
        current_date - 10, current_date + 10);

insert into public.staff_performance_evaluations (
  id, cycle_id, staff_profile_id, evaluator_user_id,
  overall_rating, rating_band, status
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  '33333333-3333-4333-8333-333333333333',
  88.5, 'very_good', 'draft'
);

insert into public.staff_attendance_days (
  staff_profile_id, attendance_date, worked_minutes, late_minutes,
  overtime_minutes, day_state, source_system
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', current_date - 1, 480, 0, 60,
   'present', 'TEST'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', current_date - 1, 300, 30, 0,
   'late', 'TEST');

insert into public.staff_training_courses (
  id, code, title_ar, provider, starts_on, ends_on, total_hours
) values (
  'ffffffff-ffff-4fff-8fff-fffffffffff1', 'TR-1', 'أمن المعلومات',
  'مركز التدريب', current_date + 5, current_date + 10, 20
);

insert into public.staff_clearance_cases (
  id, case_no, staff_profile_id, department_id, reason
) values (
  '99999999-9999-4999-8999-999999999991', 'CLR-02E-1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'انتهاء تعاقد'
);

insert into public.staff_clearance_checkpoints (
  id, case_id, checkpoint_kind, required_role
) values
  ('99999999-9999-4999-8999-999999999992',
   '99999999-9999-4999-8999-999999999991', 'direct_manager', 'direct_manager'),
  ('99999999-9999-4999-8999-999999999993',
   '99999999-9999-4999-8999-999999999991', 'finance', 'finance');

-- Active (unreturned) custody blocks clearance completion unless overridden.
insert into public.staff_custody_assignments (
  staff_profile_id, asset_name, asset_tag, delivered_on
) values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'حاسوب محمول', 'TAG-02E-1',
  current_date - 100
);

-- ---------------------------------------------------------------------------
-- A) Document issuance is HR-only and requires an approved request.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

do $$
begin
  begin
    perform public.staff_service_issue_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 180);
    raise exception 'A_EMPLOYEE_SELF_ISSUE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
  begin
    perform public.staff_service_issue_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', 180);
    raise exception 'A_UNAPPROVED_REQUEST_ISSUE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- B) Issue → verify (valid) → revoke → verify (revoked); digest at rest only.
-- ---------------------------------------------------------------------------
do $$
declare
  v_issued jsonb;
  v_token text;
  v_doc_id uuid;
  v_check jsonb;
begin
  v_issued := public.staff_service_issue_document(
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 30);
  v_token := v_issued ->> 'verification_token';
  v_doc_id := (v_issued ->> 'document_id')::uuid;

  if v_token is null or v_token !~ '^[a-f0-9]{64}$' then
    raise exception 'B_TOKEN_NOT_OPAQUE';
  end if;

  -- A successful verification proves the stored digest matches SHA-256(token).
  -- The authenticated role intentionally cannot SELECT the digest column at
  -- all; that independent column-privilege assertion is pinned in section O.
  v_check := public.staff_service_verify_issued_document(v_token);
  if v_check ->> 'result' <> 'valid' then
    raise exception 'B_VALID_DOCUMENT_NOT_VERIFIED';
  end if;
  if v_check ? 'verification_token' or v_check ? 'staff_profile_id' then
    raise exception 'B_VERIFICATION_LEAKS_SENSITIVE_FIELDS';
  end if;

  if public.staff_service_verify_issued_document(
       repeat('a', 64)) ->> 'result' <> 'invalid' then
    raise exception 'B_UNKNOWN_TOKEN_UNEXPECTED_SUCCESS';
  end if;

  -- Replay of issuance for the same request must fail.
  begin
    perform public.staff_service_issue_document(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 30);
    raise exception 'B_DOCUMENT_REISSUE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '23505' then null;
  end;

  perform public.staff_service_revoke_issued_document(v_doc_id, 'خطأ إداري');
  if public.staff_service_verify_issued_document(v_token) ->> 'result'
     <> 'revoked' then
    raise exception 'B_REVOKED_DOCUMENT_STILL_VALID';
  end if;
end;
$$;

-- Anonymous verification works and reveals nothing private.
set local role anon;
set local request.jwt.claim.sub = '';
do $$
begin
  if public.staff_service_verify_issued_document('zz') ->> 'result'
     <> 'invalid' then
    raise exception 'B_ANON_MALFORMED_TOKEN_NOT_REJECTED';
  end if;
end;
$$;

do $$
begin
  begin
    perform 1 from public.staff_issued_documents limit 1;
    raise exception 'B_ANON_DOCUMENT_TABLE_READ_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) Performance: no self-finalize, employee sees only finalized rows.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  begin
    perform public.staff_service_finalize_evaluation(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');
    raise exception 'C_SELF_FINALIZE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  if exists (
    select 1 from public.staff_performance_evaluations
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
  ) then
    raise exception 'C_DRAFT_EVALUATION_DISCLOSED_TO_EMPLOYEE';
  end if;

  begin
    perform public.staff_service_acknowledge_evaluation(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'تم');
    raise exception 'C_ACK_BEFORE_FINALIZE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$
begin
  begin
    perform public.staff_service_finalize_evaluation(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');
    raise exception 'C_OUTSIDER_FINALIZE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
begin
  perform public.staff_service_finalize_evaluation(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2');
end;
$$;

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  v_ack jsonb;
begin
  if not exists (
    select 1 from public.staff_performance_evaluations
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
  ) then
    raise exception 'C_FINALIZED_EVALUATION_NOT_VISIBLE_TO_OWNER';
  end if;

  v_ack := public.staff_service_acknowledge_evaluation(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'أوافق');
  if v_ack ->> 'acknowledged_at' is null then
    raise exception 'C_ACK_NOT_RECORDED';
  end if;

  begin
    perform public.staff_service_acknowledge_evaluation(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'مرة أخرى');
    raise exception 'C_DOUBLE_ACK_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- D) Attendance: own rows only for a peer; summary scope is enforced.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from public.staff_attendance_days
    where staff_profile_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
  ) then
    raise exception 'D_PEER_ATTENDANCE_DISCLOSURE';
  end if;

  if (public.staff_service_get_attendance_summary(
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        extract(year from current_date)::int,
        extract(month from current_date)::int) ->> 'present_days')::int < 1 then
    raise exception 'D_OWN_ATTENDANCE_SUMMARY_EMPTY';
  end if;

  begin
    perform public.staff_service_get_attendance_summary(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      extract(year from current_date)::int,
      extract(month from current_date)::int);
    raise exception 'D_PEER_ATTENDANCE_SUMMARY_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- E) Overtime: staged approval, no self-approval, finance-only money table.
-- ---------------------------------------------------------------------------
do $$
declare
  v_claim public.staff_overtime_claims;
  v_key uuid := gen_random_uuid();
  v_replay public.staff_overtime_claims;
begin
  v_claim := public.staff_service_submit_overtime_claim(
    'overtime', current_date - 3, current_date - 1, 12, 'تشغيل المعمل', v_key);
  v_replay := public.staff_service_submit_overtime_claim(
    'overtime', current_date - 3, current_date - 1, 12, 'تشغيل المعمل', v_key);
  if v_replay.id <> v_claim.id then
    raise exception 'E_OVERTIME_IDEMPOTENCY_BROKEN';
  end if;

  begin
    perform public.staff_service_decide_overtime_claim(
      v_claim.id, 'approved', null);
    raise exception 'E_SELF_APPROVAL_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub',
                     '44444444-4444-4444-8444-444444444444', true);
  begin
    -- HR cannot skip the direct-manager stage.
    perform public.staff_service_decide_overtime_claim(
      v_claim.id, 'approved', null);
    raise exception 'E_STAGE_SKIP_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub',
                     '33333333-3333-4333-8333-333333333333', true);
  perform public.staff_service_decide_overtime_claim(
    v_claim.id, 'approved', null);

  perform set_config('request.jwt.claim.sub',
                     '44444444-4444-4444-8444-444444444444', true);
  perform public.staff_service_decide_overtime_claim(
    v_claim.id, 'approved', null);

  if (select status from public.staff_overtime_claims where id = v_claim.id)
     <> 'hr_approved' then
    raise exception 'E_OVERTIME_FINAL_STATE_WRONG';
  end if;

  -- Rejection without a reason must be refused.
  perform set_config('request.jwt.claim.sub',
                     '33333333-3333-4333-8333-333333333333', true);
  begin
    perform public.staff_service_decide_overtime_claim(
      v_claim.id, 'rejected', '   ');
    raise exception 'E_REJECTION_WITHOUT_REASON_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;

  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-4111-8111-111111111111', true);
  begin
    insert into public.staff_value_added_audit_events (
      actor_user_id, module, subject_id, event_type
    ) values (null, 'overtime', v_claim.id, 'forged');
    raise exception 'E_CLIENT_AUDIT_INSERT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

reset role;
insert into public.staff_overtime_financial_impact (
  claim_id, hourly_rate, gross_amount
)
select id, 1000, 12000 from public.staff_overtime_claims limit 1;

insert into public.staff_promotion_cases (
  id, case_no, staff_profile_id, case_kind
) values (
  '88888888-8888-4888-8888-888888888881', 'PRM-02E-1',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'promotion'
);

insert into public.staff_promotion_financial_impact (
  case_id, current_basic, proposed_basic, retroactive_amount
) values ('88888888-8888-4888-8888-888888888881', 100000, 130000, 60000);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if exists (select 1 from public.staff_overtime_financial_impact) then
    raise exception 'E_EMPLOYEE_FINANCIAL_IMPACT_DISCLOSURE';
  end if;
  if exists (select 1 from public.staff_promotion_financial_impact) then
    raise exception 'E_EMPLOYEE_PROMOTION_MONEY_DISCLOSURE';
  end if;
end;
$$;

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
begin
  if exists (select 1 from public.staff_overtime_financial_impact) then
    raise exception 'E_MANAGER_FINANCIAL_IMPACT_DISCLOSURE';
  end if;
end;
$$;

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  if not exists (select 1 from public.staff_overtime_financial_impact) then
    raise exception 'E_FINANCE_FINANCIAL_IMPACT_MISSING';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- F) Clearance: checkpoint owner only, custody blocker, admin-only override.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
  -- HR is not the owner of the direct-manager checkpoint, and being an
  -- approver elsewhere does not grant cross-checkpoint authority.
  begin
    perform public.staff_service_decide_clearance_checkpoint(
      '99999999-9999-4999-8999-999999999992', 'cleared', null);
    raise exception 'F_CROSS_CHECKPOINT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  begin
    perform public.staff_service_decide_clearance_checkpoint(
      '99999999-9999-4999-8999-999999999992', 'cleared', null);
    raise exception 'F_SELF_CLEARANCE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
begin
  perform public.staff_service_decide_clearance_checkpoint(
    '99999999-9999-4999-8999-999999999992', 'cleared', null);
end;
$$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
  -- One checkpoint is still pending.
  begin
    perform public.staff_service_complete_clearance_case(
      '99999999-9999-4999-8999-999999999991', false, null);
    raise exception 'F_COMPLETION_WITH_PENDING_CHECKPOINT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  perform public.staff_service_decide_clearance_checkpoint(
    '99999999-9999-4999-8999-999999999993', 'cleared', null);
end;
$$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
begin
  -- Active custody blocks completion for HR, and HR may not override it.
  begin
    perform public.staff_service_complete_clearance_case(
      '99999999-9999-4999-8999-999999999991', false, null);
    raise exception 'F_ACTIVE_CUSTODY_NOT_BLOCKING';
  exception
    when sqlstate '42501' then null;
  end;

  begin
    perform public.staff_service_complete_clearance_case(
      '99999999-9999-4999-8999-999999999991', true, 'تم التسليم لاحقاً');
    raise exception 'F_HR_CUSTODY_OVERRIDE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$
begin
  -- Administrator override still requires an explicit reason.
  begin
    perform public.staff_service_complete_clearance_case(
      '99999999-9999-4999-8999-999999999991', true, '  ');
    raise exception 'F_OVERRIDE_WITHOUT_REASON_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;

  perform public.staff_service_complete_clearance_case(
    '99999999-9999-4999-8999-999999999991', true, 'تسوية إدارية موثقة');

  if not exists (
    select 1 from public.staff_value_added_audit_events
    where module = 'clearance'
      and event_type = 'clearance_custody_override'
      and reason is not null
  ) then
    raise exception 'F_CUSTODY_OVERRIDE_NOT_AUDITED';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- J) Identity binding + evaluation draft authoring/finalization.
-- ---------------------------------------------------------------------------
reset role;
insert into public.staff_performance_cycles (
  id, cycle_year, title_ar, opens_on, closes_on
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3', 2027, 'دورة 2027',
  current_date - 1, current_date + 30
);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
begin
  if public.staff_service_owns_profile(
       '22222222-2222-4222-8222-222222222222',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') then
    raise exception 'J_IDENTITY_ORACLE_OWNS_PROFILE';
  end if;
  if public.staff_service_manages_profile(
       '33333333-3333-4333-8333-333333333333',
       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2') then
    raise exception 'J_IDENTITY_ORACLE_MANAGES_PROFILE';
  end if;
end;
$$;

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.staff_service_upsert_evaluation_draft(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      90, 'excellent', 'أهداف', 'نقاط قوة', 'تحسين');
    raise exception 'J_SELF_EVALUATION_DRAFT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare
  v_eval public.staff_performance_evaluations;
  v_saved public.staff_performance_evaluations;
begin
  v_eval := public.staff_service_upsert_evaluation_draft(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    90, 'excellent', 'هدف أول', 'قوة أولى', 'تحسين أول');

  if v_eval.status <> 'draft' then
    raise exception 'J_EVALUATION_DRAFT_NOT_CREATED';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '22222222-2222-4222-8222-222222222222', true);
  if exists (
    select 1 from public.staff_performance_evaluations where id = v_eval.id
  ) then
    raise exception 'J_DRAFT_DISCLOSED_TO_EMPLOYEE';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '33333333-3333-4333-8333-333333333333', true);
  v_saved := public.staff_service_upsert_evaluation_draft(
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    93, 'excellent', 'هدف محدّث', 'قوة محدّثة', 'تحسين محدّث');
  if v_saved.id <> v_eval.id or v_saved.overall_rating <> 93 then
    raise exception 'J_EVALUATION_DRAFT_UPDATE_BROKEN';
  end if;

  perform public.staff_service_finalize_evaluation(v_eval.id);
  begin
    perform public.staff_service_upsert_evaluation_draft(
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      94, 'excellent', null, null, null);
    raise exception 'J_POST_FINALIZE_EDIT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '40001' then null;
  end;

  if (
    select count(*) from public.staff_value_added_audit_events
    where module = 'performance'
      and subject_id = v_eval.id
      and event_type = 'evaluation_draft_saved'
  ) <> 2 then
    raise exception 'J_EVALUATION_DRAFT_AUDIT_COUNT_WRONG';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '22222222-2222-4222-8222-222222222222', true);
  if not exists (
    select 1 from public.staff_performance_evaluations
    where id = v_eval.id and status = 'finalized'
  ) then
    raise exception 'J_FINALIZED_EVALUATION_NOT_VISIBLE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- K) Training completion: private metadata is server-enforced and immutable.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  v_enrollment public.staff_training_enrollments;
begin
  v_enrollment := public.staff_service_request_training_enrollment(
    'ffffffff-ffff-4fff-8fff-fffffffffff1');

  perform set_config('request.jwt.claim.sub',
                     '44444444-4444-4444-8444-444444444444', true);
  perform public.staff_service_decide_training_enrollment(
    v_enrollment.id, 'approved', null);

  begin
    perform public.staff_service_complete_training_enrollment(
      v_enrollment.id, 'https://public.invalid/cert.pdf', repeat('a', 64));
    raise exception 'K_PUBLIC_CERTIFICATE_URL_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.staff_service_complete_training_enrollment(
      v_enrollment.id, 'staff/training/cert.pdf', null);
    raise exception 'K_PARTIAL_CERTIFICATE_METADATA_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.staff_service_complete_training_enrollment(
      v_enrollment.id, '../cert.pdf', repeat('a', 64));
    raise exception 'K_TRAVERSAL_CERTIFICATE_PATH_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '22023' then null;
  end;

  perform public.staff_service_complete_training_enrollment(
    v_enrollment.id,
    'staff/training/employee-01/cert.pdf',
    repeat('a', 64));

  begin
    perform public.staff_service_complete_training_enrollment(
      v_enrollment.id,
      'staff/training/employee-01/cert.pdf',
      repeat('a', 64));
    raise exception 'K_TRAINING_COMPLETION_REPLAY_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '40001' then null;
  end;

  if not exists (
    select 1 from public.staff_value_added_audit_events
    where module = 'training' and subject_id = v_enrollment.id
      and event_type = 'training_completed'
  ) then
    raise exception 'K_TRAINING_COMPLETION_NOT_AUDITED';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-4111-8111-111111111111', true);
  begin
    perform certificate_object_path
    from public.staff_training_enrollments where id = v_enrollment.id;
    raise exception 'K_PRIVATE_CERTIFICATE_PATH_DISCLOSED';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- L) Promotion/settlement authoring: idempotency and legal transitions.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  begin
    perform public.staff_service_open_promotion_case(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'promotion',
      'الدرجة 4', 'الدرجة 5', null, gen_random_uuid());
    raise exception 'L_SELF_PROMOTION_OPEN_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare
  v_key uuid := gen_random_uuid();
  v_case public.staff_promotion_cases;
  v_replay public.staff_promotion_cases;
begin
  v_case := public.staff_service_open_promotion_case(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'promotion',
    'الدرجة 4', 'الدرجة 5', 'استحقاق سنوي', v_key);
  v_replay := public.staff_service_open_promotion_case(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'promotion',
    'الدرجة 4', 'الدرجة 5', 'استحقاق سنوي', v_key);
  if v_replay.id <> v_case.id then
    raise exception 'L_PROMOTION_IDEMPOTENCY_BROKEN';
  end if;

  perform public.staff_service_update_promotion_case(
    v_case.id, 'hr_review', null, null, null);
  perform public.staff_service_update_promotion_case(
    v_case.id, 'approved', null, null, null);
  perform public.staff_service_update_promotion_case(
    v_case.id, 'implemented', null, current_date, null);

  begin
    perform public.staff_service_update_promotion_case(
      v_case.id, 'implemented', null, current_date, null);
    raise exception 'L_ILLEGAL_PROMOTION_REPLAY_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '40001' then null;
  end;

  if (
    select count(*) from public.staff_value_added_audit_events
    where module = 'promotion' and subject_id = v_case.id
  ) <> 4 then
    raise exception 'L_PROMOTION_AUDIT_COUNT_WRONG';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '11111111-1111-4111-8111-111111111111', true);
  if exists (
    select 1 from public.staff_promotion_cases where id = v_case.id
  ) then
    raise exception 'L_CROSS_EMPLOYEE_PROMOTION_DISCLOSURE';
  end if;

  perform set_config('request.jwt.claim.sub',
                     '22222222-2222-4222-8222-222222222222', true);
  if not exists (
    select 1 from public.staff_promotion_cases
    where id = v_case.id and status = 'implemented'
  ) then
    raise exception 'L_OWN_PROMOTION_CASE_NOT_VISIBLE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- M) Clearance opening is atomic, five-checkpoint and replay-safe.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '44444444-4444-4444-8444-444444444444';
do $$
declare
  v_key uuid := gen_random_uuid();
  v_case public.staff_clearance_cases;
  v_replay public.staff_clearance_cases;
begin
  v_case := public.staff_service_open_clearance_case(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'نقل وظيفي', v_key);
  v_replay := public.staff_service_open_clearance_case(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', 'نقل وظيفي', v_key);
  if v_replay.id <> v_case.id then
    raise exception 'M_CLEARANCE_IDEMPOTENCY_BROKEN';
  end if;
  if (
    select count(*) from public.staff_clearance_checkpoints
    where case_id = v_case.id
  ) <> 5 then
    raise exception 'M_CLEARANCE_FIVE_CHECKPOINTS_NOT_ATOMIC';
  end if;
  begin
    perform public.staff_service_open_clearance_case(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      'معاملة مكررة', gen_random_uuid());
    raise exception 'M_SECOND_OPEN_CLEARANCE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '40001' then null;
  end;
  if not exists (
    select 1 from public.staff_value_added_audit_events
    where module = 'clearance' and subject_id = v_case.id
      and event_type = 'clearance_case_opened'
  ) then
    raise exception 'M_CLEARANCE_OPEN_NOT_AUDITED';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- N) Attendance report is manager/HR scoped and denied to Finance/outsider.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '33333333-3333-4333-8333-333333333333';
do $$
declare
  v_report jsonb;
begin
  v_report := public.staff_service_list_attendance_month_report(
    extract(year from current_date)::int,
    extract(month from current_date)::int);
  if jsonb_array_length(v_report) <> 2 then
    raise exception 'N_MANAGER_ATTENDANCE_SCOPE_WRONG';
  end if;
end;
$$;

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
begin
  begin
    perform public.staff_service_list_attendance_month_report(
      extract(year from current_date)::int,
      extract(month from current_date)::int);
    raise exception 'N_FINANCE_ATTENDANCE_REPORT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$
begin
  begin
    perform public.staff_service_list_attendance_month_report(
      extract(year from current_date)::int,
      extract(month from current_date)::int);
    raise exception 'N_OUTSIDER_ATTENDANCE_REPORT_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- O) Finance sees projections/assigned checkpoint only, never base free text.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
declare
  v_overtime jsonb := public.staff_service_list_overtime_financial_projection();
  v_promotion jsonb := public.staff_service_list_promotion_financial_projection();
  v_clearance jsonb := public.staff_service_list_assigned_clearance_checkpoints();
begin
  if exists (select 1 from public.staff_overtime_claims)
     or exists (select 1 from public.staff_promotion_cases)
     or exists (select 1 from public.staff_clearance_cases)
     or exists (select 1 from public.staff_clearance_checkpoints)
     or exists (select 1 from public.staff_performance_evaluations)
     or exists (select 1 from public.staff_training_enrollments) then
    raise exception 'O_FINANCE_BASE_ROW_DISCLOSURE';
  end if;

  if jsonb_array_length(v_overtime) < 1 then
    raise exception 'O_FINANCE_OVERTIME_PROJECTION_EMPTY';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_overtime) item
    where item ? 'reason' or item ? 'manager_reason'
       or item ? 'hr_reason' or item ? 'staff_profile_id'
  ) then
    raise exception 'O_FINANCE_OVERTIME_PROJECTION_LEAK';
  end if;

  if jsonb_array_length(v_promotion) < 1 then
    raise exception 'O_FINANCE_PROMOTION_PROJECTION_EMPTY';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_promotion) item
    where item ? 'notes' or item ? 'staff_profile_id'
  ) then
    raise exception 'O_FINANCE_PROMOTION_PROJECTION_LEAK';
  end if;

  if jsonb_array_length(v_clearance) <> 1 then
    raise exception 'O_FINANCE_CLEARANCE_PROJECTION_SCOPE_WRONG';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_clearance) item
    where item ->> 'checkpoint_kind' <> 'finance'
       or item ? 'reason' or item ? 'decision_reason'
       or item ? 'custody_override_reason' or item ? 'staff_profile_id'
  ) then
    raise exception 'O_FINANCE_CLEARANCE_PROJECTION_LEAK';
  end if;
end;
$$;

-- Sensitive columns are not granted to the shared authenticated role at all.
reset role;
do $$
begin
  if exists (
    select 1 from information_schema.column_privileges
    where table_schema = 'public' and grantee = 'authenticated'
      and (
        (table_name = 'staff_issued_documents'
         and column_name in ('verification_token_digest', 'object_path'))
        or (table_name = 'staff_training_enrollments'
            and column_name in ('certificate_bucket',
                                'certificate_object_path',
                                'certificate_sha256'))
        or (table_name = 'staff_value_added_audit_events'
            and column_name = 'metadata')
        or (table_name in ('staff_overtime_claims',
                           'staff_promotion_cases',
                           'staff_clearance_cases')
            and column_name = 'idempotency_key')
      )
  ) then
    raise exception 'O_SENSITIVE_COLUMN_GRANT_PRESENT';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- P) Public verification probe amplification is bucketed and token-free.
-- ---------------------------------------------------------------------------
create temporary table staff_02e_probe_snapshot (
  failed_before bigint not null,
  rows_before bigint not null
) on commit drop;

insert into staff_02e_probe_snapshot (failed_before, rows_before)
select
  coalesce((
    select failed_attempts
    from public.staff_document_verification_probe_stats
    where window_start = date_trunc('hour', now())
  ), 0),
  (select count(*) from public.staff_document_verification_probe_stats);

set local role anon;
set local request.jwt.claim.sub = '';
select public.staff_service_verify_issued_document(repeat('b', 64));
select public.staff_service_verify_issued_document(repeat('b', 64));
reset role;

do $$
declare
  v_failed_before bigint;
  v_rows_before bigint;
  v_after bigint;
  v_rows_after bigint;
begin
  select failed_before, rows_before
  into v_failed_before, v_rows_before
  from staff_02e_probe_snapshot;
  select failed_attempts into v_after
  from public.staff_document_verification_probe_stats
  where window_start = date_trunc('hour', now());
  select count(*) into v_rows_after
  from public.staff_document_verification_probe_stats;

  if v_after - v_failed_before <> 2 then
    raise exception 'P_PROBE_COUNTER_NOT_AGGREGATED';
  end if;
  if v_rows_after > v_rows_before + 1 then
    raise exception 'P_PROBE_ROW_AMPLIFICATION';
  end if;
  if exists (
    select 1 from public.staff_value_added_audit_events
    where metadata::text like '%' || repeat('b', 64) || '%'
       or metadata ? 'verification_token'
       or metadata ? 'verification_token_digest'
  ) then
    raise exception 'P_PROBE_TOKEN_MATERIAL_AUDITED';
  end if;
  if exists (
    select 1
    from public.staff_value_added_audit_events
    where module = 'issued_document'
      and event_type = 'document_verified'
      and occurred_at >= date_trunc('hour', now())
    group by subject_id
    having count(*) > 1
  ) then
    raise exception 'P_SUCCESS_AUDIT_NOT_HOURLY_BOUNDED';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- G) Audit ledger is append-only and scoped.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '77777777-7777-4777-8777-777777777777';
do $$
begin
  begin
    update public.staff_value_added_audit_events set reason = 'tamper';
    raise exception 'G_AUDIT_UPDATE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%G_AUDIT_UPDATE_UNEXPECTED_SUCCESS%' then raise; end if;
  end;

  begin
    delete from public.staff_value_added_audit_events;
    raise exception 'G_AUDIT_DELETE_UNEXPECTED_SUCCESS';
  exception
    when sqlstate '42501' then null;
    when others then
      if sqlerrm like '%G_AUDIT_DELETE_UNEXPECTED_SUCCESS%' then raise; end if;
  end;
end;
$$;

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $$
begin
  if exists (
    select 1 from public.staff_value_added_audit_events
    where actor_user_id is distinct from
      '22222222-2222-4222-8222-222222222222'::uuid
  ) then
    raise exception 'G_AUDIT_CROSS_ACTOR_DISCLOSURE';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- H) Capability probe is boolean-only and role-accurate.
-- ---------------------------------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
do $$
declare
  v jsonb := public.staff_service_get_value_added_capabilities();
begin
  if (v ->> 'can_issue_documents')::boolean
     or (v ->> 'can_view_financial_impact')::boolean
     or (v ->> 'can_manage_evaluations')::boolean then
    raise exception 'H_EMPLOYEE_CAPABILITY_LEAK';
  end if;
end;
$$;

set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';
do $$
declare
  v jsonb := public.staff_service_get_value_added_capabilities();
begin
  if not (v ->> 'can_view_financial_impact')::boolean then
    raise exception 'H_FINANCE_CAPABILITY_WRONG';
  end if;
  if (v ->> 'can_issue_documents')::boolean then
    raise exception 'H_FINANCE_ISSUE_CAPABILITY_LEAK';
  end if;
end;
$$;

set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';
do $$
declare
  v jsonb := public.staff_service_get_value_added_capabilities();
begin
  if (v ->> 'can_decide_clearance')::boolean
     or (v ->> 'can_issue_documents')::boolean then
    raise exception 'H_OUTSIDER_CAPABILITY_LEAK';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- I) No broad client grants; only the public verifier is exposed to anon.
-- ---------------------------------------------------------------------------
reset role;
do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'staff_document_verification_probe_stats',
        'staff_value_added_audit_events',
        'staff_issued_documents',
        'staff_performance_cycles',
        'staff_performance_evaluations',
        'staff_attendance_days',
        'staff_overtime_claims',
        'staff_overtime_financial_impact',
        'staff_training_courses',
        'staff_training_enrollments',
        'staff_promotion_cases',
        'staff_promotion_financial_impact',
        'staff_clearance_cases',
        'staff_clearance_checkpoints'
      )
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then
    raise exception 'I_BROAD_CLIENT_TABLE_GRANT';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'staff_issued_documents',
        'staff_overtime_financial_impact',
        'staff_promotion_financial_impact'
      )
      and grantee = 'anon'
  ) then
    raise exception 'I_ANON_TABLE_GRANT';
  end if;

  if exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name in (
        'staff_service_issue_document',
        'staff_service_revoke_issued_document',
        'staff_service_finalize_evaluation',
        'staff_service_acknowledge_evaluation',
        'staff_service_get_attendance_summary',
        'staff_service_submit_overtime_claim',
        'staff_service_decide_overtime_claim',
        'staff_service_request_training_enrollment',
        'staff_service_decide_training_enrollment',
        'staff_service_complete_training_enrollment',
        'staff_service_decide_clearance_checkpoint',
        'staff_service_complete_clearance_case',
        'staff_service_list_overtime_financial_projection',
        'staff_service_list_promotion_financial_projection',
        'staff_service_list_assigned_clearance_checkpoints',
        'staff_service_upsert_evaluation_draft',
        'staff_service_open_promotion_case',
        'staff_service_update_promotion_case',
        'staff_service_open_clearance_case',
        'staff_service_list_attendance_month_report',
        'staff_service_get_value_added_capabilities'
      )
      and grantee in ('anon', 'PUBLIC')
  ) then
    raise exception 'I_ANON_RPC_GRANT';
  end if;

  if not exists (
    select 1
    from information_schema.role_routine_grants
    where routine_schema = 'public'
      and routine_name = 'staff_service_verify_issued_document'
      and grantee = 'anon'
  ) then
    raise exception 'I_PUBLIC_VERIFIER_NOT_EXPOSED';
  end if;
end;
$$;

select 'PASS_STAFF_SELF_SERVICE_PG17_VALUE_ADDED_02E' as verdict;

rollback;
