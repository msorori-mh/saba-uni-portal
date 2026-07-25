-- Disposable matrix for B1 secure draft mutations (+ secure-read regression).
begin;

create schema if not exists b1_draft_v;
create table b1_draft_v.results (
  case_id text not null,
  status text not null check (status in ('PASS','FAIL')),
  detail text
);

create or replace function b1_draft_v.note(p_case text, p_ok boolean, p_detail text)
returns void language plpgsql as $$
begin
  insert into b1_draft_v.results(case_id,status,detail)
  values (p_case, case when p_ok then 'PASS' else 'FAIL' end, p_detail);
end $$;

create or replace function b1_draft_v.set_uid(p uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
end $$;

do $$
declare
  u_student uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  u_other uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  u_staff uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  u_admin uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  u_registrar uuid := 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  u_dean uuid := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  u_inactive uuid := 'abababab-abab-abab-abab-abababababab';
  sp_id uuid := '11111111-1111-1111-1111-111111111111';
  sp_other uuid := '22222222-2222-2222-2222-222222222222';
  sp_inactive uuid := '33333333-3333-3333-3333-333333333333';
  dept_id uuid := '99999999-9999-9999-9999-999999999999';
  dept_target uuid := 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
  prog_id uuid := 'bbbbbbbb-1111-2222-3333-cccccccccccc';
  prog_target uuid := 'cccccccc-1111-2222-3333-dddddddddddd';
  year_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  sem_id uuid := 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  course_id uuid := '12121212-1212-1212-1212-121212121212';
  offering_id uuid := '13131313-1313-1313-1313-131313131313';
  section_id uuid := '14141414-1414-1414-1414-141414141414';
  v jsonb;
  v2 jsonb;
  err text;
  denied boolean;
  n_before integer;
  n_after integer;
  req uuid;
  req2 uuid;
  expected_version timestamptz;
  workflow_id uuid;
  workflow_step_id uuid;
  code text;
  canon text;
begin
  insert into auth.users(id) values
    (u_student),(u_other),(u_staff),(u_admin),(u_registrar),(u_dean),(u_inactive);
  insert into public.departments(id,name_ar,is_active) values
    (dept_id,'قسم أ',true),(dept_target,'قسم ب',true);
  insert into public.programs(id,code,name_ar,department_id,is_active) values
    (prog_id,'P1','برنامج أ',dept_id,true),(prog_target,'P2','برنامج ب',dept_target,true);
  insert into public.academic_years(id,name,is_current,status) values (year_id,'2025/2026',true,'active');
  insert into public.semesters(id,academic_year_id,name,is_current,status) values (sem_id,year_id,'الأول',true,'active');
  insert into public.courses(id,code,name_ar) values (course_id,'CS101','مقدمة');
  insert into public.course_offerings(id,course_id,academic_year_id,semester_id,status)
    values (offering_id,course_id,year_id,sem_id,'active');
  insert into public.course_sections(id,course_offering_id,status) values (section_id,offering_id,'active');

  insert into public.request_types(code,name_ar,is_active,student_visible) values
    ('enrollment_suspension','إيقاف قيد',true,false),
    ('absence_excuse','عذر غياب',true,false),
    ('transfer','تحويل قسم',true,false),
    ('extra_chance','فرصة أخيرة',true,false),
    ('file_withdrawal','سحب ملف',true,false);

  insert into public.student_profiles(id,user_id,full_name_ar,academic_number,department_id,program_id,status)
    values (sp_id,u_student,'طالب أ','S001',dept_id,prog_id,'active'),
           (sp_other,u_other,'طالب ب','S002',dept_id,prog_id,'active'),
           (sp_inactive,u_inactive,'طالب غير نشط','S003',dept_id,prog_id,'inactive');
  insert into public.student_enrollments(student_profile_id,course_section_id,enrollment_status)
    values (sp_id,section_id,'enrolled');

  -- anon deny
  perform b1_draft_v.set_uid(null);
  denied := false; err := null;
  begin
    perform public.create_b1_request_draft_for_student('enrollment_suspension', null);
  exception when others then
    err := sqlerrm; denied := err like '%AUTHENTICATION_REQUIRED%';
  end;
  perform b1_draft_v.note('anon_create_deny', denied, err);

  -- no student profile (staff user)
  perform b1_draft_v.set_uid(u_staff);
  denied := false; err := null;
  begin
    perform public.create_b1_request_draft_for_student('enrollment_suspension', null);
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note('staff_no_profile_deny', denied, err);

  perform b1_draft_v.set_uid(u_inactive);
  denied := false; err := null;
  begin
    perform public.create_b1_request_draft_for_student('enrollment_suspension', null);
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note('inactive_student_profile_deny', denied, err);

  foreach code in array array['registrar','dean'] loop
    perform b1_draft_v.set_uid(case when code = 'registrar' then u_registrar else u_dean end);
    denied := false; err := null;
    begin
      perform public.create_b1_request_draft_for_student('enrollment_suspension', null);
    exception when others then
      err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
    end;
    perform b1_draft_v.note(code || '_create_deny', denied, err);
  end loop;

  -- create all five + idempotent retry
  perform b1_draft_v.set_uid(u_student);
  denied := false; err := null;
  begin
    perform public.create_b1_request_draft_for_student('enrollment_suspension', 'hidden-deny');
  exception when others then
    err := sqlerrm; denied := err like '%B1_REQUEST_TYPE_INACTIVE%';
  end;
  perform b1_draft_v.note('hidden_service_create_deny', denied, err);

  v := public.get_b1_secure_read_runtime_capability();
  perform b1_draft_v.note(
    'runtime_capability_fail_closed_before_activation',
    (v->>'available') = 'false'
      and not (v ? 'viewer')
      and jsonb_array_length(v->'writes_available') = 0
      and (v->'writes_fail_closed') ? 'create_draft'
      and (v->'writes_fail_closed') ? 'save_draft',
    v::text
  );

  update public.request_types set student_visible = true;
  insert into public.request_type_workflows(request_type_id,status,is_active)
    select id,'active',true from public.request_types;

  foreach canon in array array[
    'enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal'
  ] loop
    begin
      v := public.create_b1_request_draft_for_student(canon, 'idem-' || canon);
      v2 := public.create_b1_request_draft_for_student(canon, 'idem-' || canon);
      perform b1_draft_v.note(
        'create_' || canon,
        (v->>'requestId') is not null
          and (v->>'requestId') = (v2->>'requestId')
          and (v->>'serviceCode') = canon
          and (v->>'status') = 'draft',
        v::text
      );
    exception when others then
      perform b1_draft_v.note('create_' || canon, false, sqlerrm);
    end;
  end loop;

  -- concurrent-style duplicate: second create without key returns same draft
  begin
    v := public.create_b1_request_draft_for_student('enrollment_suspension', null);
    select count(*) into n_before from public.student_requests
      where student_profile_id = sp_id and request_type = 'enrollment_suspension' and status = 'draft';
    v2 := public.create_b1_request_draft_for_student('enrollment_suspension', null);
    select count(*) into n_after from public.student_requests
      where student_profile_id = sp_id and request_type = 'enrollment_suspension' and status = 'draft';
    perform b1_draft_v.note(
      'create_dedupe_open_draft',
      n_before = 1 and n_after = 1 and (v->>'requestId') = (v2->>'requestId'),
      format('before=%s after=%s', n_before, n_after)
    );
  exception when others then
    perform b1_draft_v.note('create_dedupe_open_draft', false, sqlerrm);
  end;

  -- idempotency mismatch deny + zero mutation
  begin
    select id into req from public.student_requests
      where student_profile_id = sp_id and request_type = 'file_withdrawal' and status = 'draft' limit 1;
    select updated_at into expected_version from public.student_requests where id = req;
    denied := false; err := null;
    v := public.save_b1_request_draft_for_student(
      req, '{"withdrawal_reason":"reason-one-long-enough"}'::jsonb,
      expected_version, 'save-key-1'
    );
    v2 := public.save_b1_request_draft_for_student(
      req, '{"withdrawal_reason":"reason-one-long-enough"}'::jsonb,
      expected_version, 'save-key-1'
    );
    perform b1_draft_v.note(
      'save_idempotent_retry_same_version',
      (v->>'requestId') = (v2->>'requestId') and (v->>'updatedAt') = (v2->>'updatedAt'),
      v2::text
    );
    select form_data into v2 from public.student_requests where id = req;
    begin
      perform public.save_b1_request_draft_for_student(
        req, '{"withdrawal_reason":"reason-two-different-payload"}'::jsonb,
        (select updated_at from public.student_requests where id = req), 'save-key-1'
      );
    exception when others then
      err := sqlerrm; denied := err like '%B1_IDEMPOTENCY_PAYLOAD_MISMATCH%';
    end;
    perform b1_draft_v.note(
      'idempotency_mismatch_zero_mutation',
      denied and (select form_data from public.student_requests where id = req) = v2,
      coalesce(err, 'no-error') || ' kept=' || v2::text
    );
  exception when others then
    perform b1_draft_v.note('idempotency_mismatch_zero_mutation', false, sqlerrm);
  end;

  -- partial save suspension (no terms required)
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'enrollment_suspension' and status = 'draft' limit 1;
  begin
    v := public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object('suspension_reason','سبب أولي'),
      (select updated_at from public.student_requests where id = req),
      null
    );
    perform b1_draft_v.note(
      'partial_save_suspension',
      (v->'formData'->>'suspension_reason') = 'سبب أولي'
        and not exists (select 1 from public.enrollment_suspension_details d where d.request_id = req),
      v::text
    );
  exception when others then
    perform b1_draft_v.note('partial_save_suspension', false, sqlerrm);
  end;

  -- full save suspension syncs detail
  begin
    v := public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'target_academic_year', year_id,
        'target_semester', sem_id,
        'suspension_reason', 'سبب كافٍ',
        'suspension_duration_type', 'one_semester',
        'terms_acknowledgment', true
      ),
      (v->>'updatedAt')::timestamptz,
      null
    );
    perform b1_draft_v.note(
      'full_save_suspension_detail',
      exists (select 1 from public.enrollment_suspension_details d where d.request_id = req),
      v::text
    );
  exception when others then
    perform b1_draft_v.note('full_save_suspension_detail', false, sqlerrm);
  end;

  -- unexpected field deny + zero mutation
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'extra_chance' and status = 'draft' limit 1;
  select form_data into v from public.student_requests where id = req;
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, '{"reason":"سبب","amount":10}'::jsonb,
      (select updated_at from public.student_requests where id = req), null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_UNEXPECTED_FORM_FIELD%';
  end;
  perform b1_draft_v.note(
    'extra_field_deny_zero_mutation',
    denied and (select form_data from public.student_requests where id = req) = v,
    err
  );

  -- transfer same department deny
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'transfer' and status = 'draft' limit 1;
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'target_department_id', dept_id,
        'target_program_id', prog_id,
        'transfer_reason', 'سبب تحويل'
      ),
      (select updated_at from public.student_requests where id = req),
      null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_TRANSFER_INPUT_INVALID%';
  end;
  perform b1_draft_v.note('transfer_same_dept_deny', denied, err);

  -- transfer valid save
  begin
    v := public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'target_department_id', dept_target,
        'target_program_id', prog_target,
        'transfer_reason', 'سبب تحويل مقبول'
      ),
      (select updated_at from public.student_requests where id = req),
      null
    );
    perform b1_draft_v.note(
      'transfer_valid_save',
      exists (select 1 from public.transfer_request_details d where d.request_id = req
        and d.current_department_id = dept_id and d.requested_department_id = dept_target),
      v::text
    );
  exception when others then
    perform b1_draft_v.note('transfer_valid_save', false, sqlerrm);
  end;

  -- excused absence save
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'absence_excuse' and status = 'draft' limit 1;
  begin
    v := public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'course_section_id', section_id,
        'absence_date', current_date::text,
        'reason_type', 'medical',
        'absence_reason_detail', 'تفاصيل'
      ),
      (select updated_at from public.student_requests where id = req),
      null
    );
    perform b1_draft_v.note(
      'absence_valid_save',
      exists (select 1 from public.absence_excuse_details d where d.request_id = req),
      v::text
    );
  exception when others then
    perform b1_draft_v.note('absence_valid_save', false, sqlerrm);
  end;

  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'course_section_id', section_id,
        'absence_date', (current_date + 1)::text,
        'reason_type', 'medical'
      ),
      (select updated_at from public.student_requests where id = req),
      null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_ABSENCE_INPUT_INVALID%';
  end;
  perform b1_draft_v.note('absence_future_date_deny', denied, err);

  -- final_chance no money + save
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'extra_chance' and status = 'draft' limit 1;
  begin
    v := public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object(
        'target_academic_year', year_id,
        'target_semester', sem_id,
        'reason', 'سبب أكاديمي',
        'chance_type', 'final_chance'
      ),
      (select updated_at from public.student_requests where id = req),
      null
    );
    perform b1_draft_v.note(
      'final_chance_valid_save',
      exists (select 1 from public.extra_chance_details d where d.request_id = req),
      v::text
    );
  exception when others then
    perform b1_draft_v.note('final_chance_valid_save', false, sqlerrm);
  end;

  -- Even an exact active assignee is not a student draft owner.
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'enrollment_suspension' and status = 'draft' limit 1;
  select w.id into workflow_id
  from public.request_type_workflows w
  join public.request_types rt on rt.id = w.request_type_id
  where rt.code = 'enrollment_suspension';
  insert into public.request_type_workflow_steps(workflow_id,action_type)
    values (workflow_id,'review') returning id into workflow_step_id;
  insert into public.student_request_workflow_steps(
    student_request_id,workflow_id,workflow_step_id,step_key,step_name_ar,
    step_order,assigned_user_id,status
  ) values (
    req,workflow_id,workflow_step_id,'review','مراجعة',1,u_staff,'pending'
  );
  perform b1_draft_v.set_uid(u_staff);
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, jsonb_build_object('suspension_reason','x'),
      (select updated_at from public.student_requests where id = req), null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note('exact_assigned_employee_save_deny', denied, err);

  -- other student deny opaque + zero mutation
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'enrollment_suspension' and status = 'draft' limit 1;
  select count(*) into n_before from public.student_requests where id = req;
  perform b1_draft_v.set_uid(u_other);
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, '{"suspension_reason":"x"}'::jsonb,
      (select updated_at from public.student_requests where id = req), null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note(
    'other_student_save_deny',
    denied and err not ilike '%enrollment_suspension_details%' and err not ilike '%student_requests%',
    err
  );

  -- admin deny (no profile)
  perform b1_draft_v.set_uid(u_admin);
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, '{"suspension_reason":"x"}'::jsonb,
      (select updated_at from public.student_requests where id = req), null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note('admin_save_deny', denied, err);

  -- submitted final-state deny
  perform b1_draft_v.set_uid(u_student);
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'file_withdrawal' and status = 'draft' limit 1;
  update public.student_requests set status = 'submitted' where id = req;
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, '{"withdrawal_reason":"سبب سحب طويل بما يكفي","impact_acknowledgment":true}'::jsonb,
      (select updated_at from public.student_requests where id = req), null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
  end;
  perform b1_draft_v.note('submitted_save_deny', denied, err);

  foreach code in array array['completed','cancelled'] loop
    update public.student_requests set status = code where id = req;
    denied := false; err := null;
    begin
      perform public.save_b1_request_draft_for_student(
        req,
        jsonb_build_object(
          'withdrawal_reason','سبب سحب طويل بما يكفي',
          'impact_acknowledgment',true
        ),
        (select updated_at from public.student_requests where id = req),
        null
      );
    exception when others then
      err := sqlerrm; denied := err like '%B1_DRAFT_ACCESS_DENIED%';
    end;
    perform b1_draft_v.note(code || '_save_deny', denied, err);
  end loop;

  -- stale version deny
  select id into req from public.student_requests
    where student_profile_id = sp_id and request_type = 'absence_excuse' and status = 'draft' limit 1;
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req,
      jsonb_build_object('reason_type','medical'),
      '2000-01-01T00:00:00Z'::timestamptz,
      null
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_STALE_REQUEST_VERSION%';
  end;
  perform b1_draft_v.note('stale_version_deny', denied, err);

  -- optimistic concurrency token is mandatory; null cannot bypass the guard
  denied := false; err := null;
  begin
    perform public.save_b1_request_draft_for_student(
      req, jsonb_build_object('reason_type','medical'), null, 'null-version-deny'
    );
  exception when others then
    err := sqlerrm; denied := err like '%B1_STALE_REQUEST_VERSION%';
  end;
  perform b1_draft_v.note('null_version_deny', denied, err);

  -- outside five deny
  denied := false; err := null;
  begin
    perform public.create_b1_request_draft_for_student('enrollment_certificate', null);
  exception when others then
    err := sqlerrm; denied := err like '%B1_CANONICAL_CODE_REQUIRED%';
  end;
  perform b1_draft_v.note('outside_five_create_deny', denied, err);

  -- secure-read regression: capability shows writes_available
  begin
    v := public.get_b1_secure_read_runtime_capability();
    perform b1_draft_v.note(
      'secure_read_capability_writes_open',
      (v->>'available') = 'true'
        and (v->'writes_available') ? 'create_draft'
        and (v->'writes_available') ? 'save_draft'
        and jsonb_array_length(coalesce(v->'writes_fail_closed','[]'::jsonb)) = 0,
      v::text
    );
  exception when others then
    perform b1_draft_v.note('secure_read_capability_writes_open', false, sqlerrm);
  end;

  -- grants
  perform b1_draft_v.note(
    'grants_authenticated_only',
    has_function_privilege('authenticated','public.create_b1_request_draft_for_student(text,text)'::regprocedure,'execute')
      and has_function_privilege('authenticated','public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure,'execute')
      and not has_function_privilege('anon','public.create_b1_request_draft_for_student(text,text)'::regprocedure,'execute'),
    'grant matrix'
  );

  -- no workflow steps created by draft mutations
  perform b1_draft_v.note(
    'no_additional_runtime_or_side_effects_from_drafts',
    (select count(*) from public.student_request_workflow_steps) = 1
      and not exists (select 1 from public.student_request_events)
      and not exists (select 1 from public.notifications)
      and not exists (select 1 from public.student_request_attachment_uploads),
    'fixture workflow count=1; event/notification/attachment counts=0'
  );
end $$;

select case_id, status, detail from b1_draft_v.results order by case_id;

do $$
begin
  if exists (select 1 from b1_draft_v.results where status='FAIL') then
    raise exception 'B1_SECURE_DRAFT_VERIFIER_FAILED';
  end if;
end $$;

ROLLBACK;
