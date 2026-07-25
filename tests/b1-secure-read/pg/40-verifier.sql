-- Disposable positive/negative matrix for B1 secure-read contracts.
begin;

create schema if not exists b1_secure_read_v;
create table b1_secure_read_v.results (
  case_id text not null,
  status text not null check (status in ('PASS','FAIL')),
  detail text
);

create or replace function b1_secure_read_v.note(p_case text, p_ok boolean, p_detail text)
returns void language plpgsql as $$
begin
  insert into b1_secure_read_v.results(case_id,status,detail)
  values (p_case, case when p_ok then 'PASS' else 'FAIL' end, p_detail);
end $$;

create or replace function b1_secure_read_v.set_uid(p uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
end $$;

-- Fixtures
do $$
declare
  u_student uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  u_other uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  u_staff uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  u_admin uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  sp_id uuid := '11111111-1111-1111-1111-111111111111';
  sp_other uuid := '22222222-2222-2222-2222-222222222222';
  req_id uuid := '33333333-3333-3333-3333-333333333333';
  req_other uuid := '44444444-4444-4444-4444-444444444444';
  step_id uuid := '55555555-5555-5555-5555-555555555555';
  step_other uuid := '66666666-6666-6666-6666-666666666666';
  cfg_id uuid := '77777777-7777-7777-7777-777777777777';
  att_id uuid := '88888888-8888-8888-8888-888888888888';
  dept_id uuid := '99999999-9999-9999-9999-999999999999';
  year_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  sem_id uuid := 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';
  v jsonb;
  denied boolean;
  err text;
begin
  insert into auth.users(id) values (u_student),(u_other),(u_staff),(u_admin);
  insert into public.departments(id,name_ar) values (dept_id,'قسم الاختبار');
  insert into public.academic_years(id,name,is_current,status) values (year_id,'2025/2026',true,'active');
  insert into public.semesters(id,academic_year_id,name,is_current,status) values (sem_id,year_id,'الأول',true,'active');
  insert into public.request_types(code,name_ar) values
    ('enrollment_suspension','إيقاف قيد'),
    ('absence_excuse','عذر غياب');
  insert into public.request_types(code,name_ar) values
    ('transfer','department transfer'),
    ('extra_chance','final chance'),
    ('file_withdrawal','file withdrawal');
  insert into public.student_profiles(id,user_id,full_name_ar,academic_number,department_id,status)
    values (sp_id,u_student,'طالب أ','S001',dept_id,'active'),
           (sp_other,u_other,'طالب ب','S002',dept_id,'active');
  insert into public.student_requests(id,student_profile_id,request_type,request_number,status,form_data,submitted_at)
    values (req_id,sp_id,'enrollment_suspension','R-1','submitted','{"notes":"x"}'::jsonb,now()),
           (req_other,sp_other,'absence_excuse','R-2','submitted','{"notes":"y"}'::jsonb,now());
  insert into public.request_type_workflow_steps(id,action_type,can_return_to_student,can_reject)
    values (cfg_id,'review',true,true);
  insert into public.student_request_workflow_steps(
    id,student_request_id,workflow_step_id,step_key,step_name_ar,step_order,assigned_user_id,status
  ) values
    (step_id,req_id,cfg_id,'initial_review','مراجعة أولية',1,u_staff,'active'),
    (step_other,req_other,cfg_id,'initial_review','مراجعة أولية',1,u_staff,'active');
  -- Force other-request step assignee away from staff for wrong-request denial on details of req_other via different assignee
  update public.student_request_workflow_steps set assigned_user_id = u_admin where id = step_other;
  insert into public.student_request_attachment_uploads(
    id,student_request_id,student_profile_id,field_key,original_file_name,mime_type,size_bytes,storage_bucket,storage_object_path,upload_status,created_by
  ) values (
    att_id,req_id,sp_id,'excuse_documents','a.pdf','application/pdf',100,
    'student-request-secure-attachments','secret/path/a.pdf','attached',u_student
  );

  -- anon denied
  perform b1_secure_read_v.set_uid(null);
  denied := false;
  err := null;
  begin
    perform public.get_b1_secure_read_runtime_capability();
  exception when others then
    err := sqlerrm;
    denied := err like '%AUTHENTICATION_REQUIRED%';
  end;
  perform b1_secure_read_v.note('anon_capability', denied, err);

  -- RPC existence alone must not advertise runtime readiness or viewer identity.
  perform b1_secure_read_v.set_uid(u_student);
  begin
    v := public.get_b1_secure_read_runtime_capability();
    perform b1_secure_read_v.note(
      'capability_fail_closed_before_activation',
      (v->>'available')='false' and not (v ? 'viewer') and jsonb_array_length(v->'services') = 0,
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('capability_fail_closed_before_activation', false, sqlerrm);
  end;

  update public.request_types set is_active = true, student_visible = true;
  insert into public.request_type_workflows(request_type_id,status,is_active)
    select id, 'active', true from public.request_types;
  v := public.get_b1_secure_read_runtime_capability();
  perform b1_secure_read_v.note(
    'capability_exact_activation_allow',
    (v->>'available')='true' and jsonb_array_length(v->'services') = 5 and not (v ? 'viewer'),
    v::text
  );
  insert into public.request_type_workflows(request_type_id,status,is_active)
    select id, 'active', true from public.request_types where code = 'enrollment_suspension';
  v := public.get_b1_secure_read_runtime_capability();
  perform b1_secure_read_v.note(
    'capability_ambiguous_workflow_deny',
    (v->>'available')='false' and jsonb_array_length(v->'services') = 4,
    v::text
  );
  delete from public.request_type_workflows w
  where w.request_type_id = (
    select id from public.request_types where code = 'enrollment_suspension'
  )
  and w.ctid not in (
    select min(x.ctid) from public.request_type_workflows x
    where x.request_type_id = w.request_type_id
  );
  update public.request_types set is_active = false, student_visible = false;

  -- student details own allow
  begin
    v := public.get_b1_request_details_for_student(req_id);
    perform b1_secure_read_v.note(
      'student_own_details',
      (v->>'requestId') = req_id::text
        and v::text not ilike '%storage_bucket%'
        and v::text not ilike '%storage_object_path%'
        and v::text not ilike '%secret/path%',
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('student_own_details', false, sqlerrm);
  end;

  -- student other deny opaque
  denied := false;
  err := null;
  begin
    perform public.get_b1_request_details_for_student(req_other);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('student_other_details_deny', denied, err);

  update public.student_profiles set status = 'inactive' where id = sp_id;
  denied := false;
  err := null;
  begin
    perform public.get_b1_request_details_for_student(req_id);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('inactive_student_details_deny', denied, err);
  denied := false;
  err := null;
  begin
    perform public.list_b1_request_attachments_for_viewer(req_id);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('inactive_student_attachments_deny', denied, err);
  update public.student_profiles set status = 'active' where id = sp_id;

  -- staff assigned inbox allow
  perform b1_secure_read_v.set_uid(u_staff);
  begin
    v := public.get_b1_assigned_inbox_for_actor(50,0);
    perform b1_secure_read_v.note(
      'staff_inbox_assigned',
      jsonb_array_length(v) >= 1 and v::text like '%' || req_id::text || '%',
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('staff_inbox_assigned', false, sqlerrm);
  end;

  -- staff details for assigned allow
  begin
    v := public.get_b1_assigned_request_details_for_actor(req_id);
    perform b1_secure_read_v.note(
      'staff_assigned_details',
      (v->>'stepId') = step_id::text
        and v::text not ilike '%storage_bucket%'
        and (v->>'allowedAction') is not null,
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('staff_assigned_details', false, sqlerrm);
  end;

  perform set_config('b1.test.deny_action', 'review', true);
  v := public.get_b1_step_allowed_actions(step_id);
  perform b1_secure_read_v.note(
    'guard_denied_primary_not_advertised',
    (v->>'allowedAction') is null and not ((v->'allowedActions') ? 'review'),
    v::text
  );
  v := public.get_b1_assigned_request_details_for_actor(req_id);
  perform b1_secure_read_v.note(
    'guard_denied_details_primary_not_advertised',
    (v->>'allowedAction') is null and not ((v->'allowedActions') ? 'review'),
    v::text
  );
  perform set_config('b1.test.deny_action', 'return', true);
  v := public.get_b1_step_allowed_actions(step_id);
  perform b1_secure_read_v.note(
    'guard_denied_return_not_advertised',
    not ((v->'allowedActions') ? 'return'),
    v::text
  );
  perform set_config('b1.test.deny_action', 'reject', true);
  v := public.get_b1_step_allowed_actions(step_id);
  perform b1_secure_read_v.note(
    'guard_denied_reject_not_advertised',
    not ((v->'allowedActions') ? 'reject'),
    v::text
  );
  perform set_config('b1.test.deny_action', '', true);

  -- admin unassigned deny
  perform b1_secure_read_v.set_uid(u_admin);
  denied := false;
  err := null;
  begin
    -- admin is assignee of step_other only; req_id should deny
    perform public.get_b1_assigned_request_details_for_actor(req_id);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('admin_unassigned_deny', denied, err);

  -- student cannot use staff RPC
  perform b1_secure_read_v.set_uid(u_student);
  denied := false;
  err := null;
  begin
    perform public.get_b1_assigned_request_details_for_actor(req_id);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('student_on_staff_rpc_deny', denied, err);

  -- attachment viewer owner allow without path leak
  begin
    v := public.list_b1_request_attachments_for_viewer(req_id);
    perform b1_secure_read_v.note(
      'owner_attachments_no_path',
      jsonb_array_length(v) = 1
        and v::text like '%att:%'
        and v::text not ilike '%storage_bucket%'
        and v::text not ilike '%secret/path%',
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('owner_attachments_no_path', false, sqlerrm);
  end;

  -- other student attachment deny
  perform b1_secure_read_v.set_uid(u_other);
  denied := false;
  err := null;
  begin
    perform public.list_b1_request_attachments_for_viewer(req_id);
  exception when others then
    err := sqlerrm;
    denied := err like '%B1_READ_ACCESS_DENIED%';
  end;
  perform b1_secure_read_v.note('other_student_attachment_deny', denied, err);

  -- form options for all five canonical services
  perform b1_secure_read_v.set_uid(u_student);
  begin
    v := public.get_b1_request_form_options('enrollment_suspension');
    perform b1_secure_read_v.note(
      'form_options_suspension',
      (v->>'serviceCode') = 'enrollment_suspension' and jsonb_typeof(v->'academicYears')='array',
      v::text
    );
  exception when others then
    perform b1_secure_read_v.note('form_options_suspension', false, sqlerrm);
  end;
  foreach err in array array[
    'excused_absence',
    'department_transfer',
    'final_chance',
    'file_withdrawal'
  ] loop
    begin
      v := public.get_b1_request_form_options(err);
      perform b1_secure_read_v.note(
        'form_options_' || err,
        (v->>'serviceCode') = err,
        v::text
      );
    exception when others then
      perform b1_secure_read_v.note('form_options_' || err, false, sqlerrm);
    end;
  end loop;

  -- grant checks
  perform b1_secure_read_v.note(
    'grants_authenticated_only',
    has_function_privilege('authenticated','public.get_b1_secure_read_runtime_capability()'::regprocedure,'execute')
      and not has_function_privilege('anon','public.get_b1_secure_read_runtime_capability()'::regprocedure,'execute'),
    'grant matrix'
  );

  perform b1_secure_read_v.note(
    'zero_mutation_assertions',
    (select count(*) from public.student_requests) = 2
      and (select count(*) from public.student_request_workflow_steps) = 2
      and (select count(*) from public.student_request_attachment_uploads) = 1
      and (select count(*) from public.workflow_events) = 0
      and (select count(*) from public.notifications) = 0
      and not exists (
        select 1 from public.student_requests
        where updated_at > submitted_at
      ),
    'requests=2 steps=2 attachments=1 events=0 notifications=0'
  );
end $$;

select case_id, status, detail from b1_secure_read_v.results order by case_id;

do $$
begin
  if exists (select 1 from b1_secure_read_v.results where status='FAIL') then
    raise exception 'B1_SECURE_READ_VERIFIER_FAILED';
  end if;
end $$;

-- Leave results visible to harness query, then rollback all fixtures.
ROLLBACK;
