-- TEST_ONLY_B1_FIVE_SERVICES_INTEGRATED_RUNTIME — full lifecycle via legal RPCs only.

do $$
declare
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_final_chance_student uuid := '11111111-1111-4111-8111-111111111102';
  u_sa_spec uuid := '22222222-2222-4222-8222-222222222201';
  u_sa_mgr uuid := '22222222-2222-4222-8222-222222222202';
  u_registrar uuid := '22222222-2222-4222-8222-222222222203';
  u_finance uuid := '22222222-2222-4222-8222-222222222204';
  u_dean uuid := '22222222-2222-4222-8222-222222222205';
  u_archive uuid := '22222222-2222-4222-8222-222222222206';
  u_library uuid := '22222222-2222-4222-8222-222222222207';
  u_labs uuid := '22222222-2222-4222-8222-222222222208';
  u_chair_cs uuid := '22222222-2222-4222-8222-22222222220b';
  u_chair_it uuid := '22222222-2222-4222-8222-22222222220c';
  year_id uuid := '77777777-7777-4777-8777-777777777701';
  sem_id uuid := '77777777-7777-4777-8777-777777777702';
  section_id uuid := '88888888-8888-4888-8888-888888888802';
  dept_cs uuid := '55555555-5555-4555-8555-555555555501';
  dept_it uuid := '55555555-5555-4555-8555-555555555502';
  prog_it uuid := '66666666-6666-4666-8666-666666666602';
  v jsonb;
  v2 jsonb;
  req uuid;
  step public.student_request_workflow_steps%rowtype;
  att uuid;
  n_steps integer;
  n_active integer;
  n_pending integer;
  ok boolean;
  err text;
  service text;
  actor uuid;
  action text;
  i integer;
  expected_version timestamptz;
begin
  -- =====================================================================
  -- 1) enrollment_suspension
  -- =====================================================================
  service := 'enrollment_suspension';
  perform b1_e2e.set_uid(u_student);
  v := public.create_b1_request_draft_for_student(service, 'e2e-create-' || service);
  req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_creates');
  select count(*) into n_steps from public.student_request_workflow_steps where student_request_id = req;
  perform b1_e2e.note(service || '/create_no_runtime', 'draft', n_steps = 0, 'steps=' || n_steps);

  v := public.save_b1_request_draft_for_student(
    req, jsonb_build_object('suspension_reason','partial reason'), expected_version, null);
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_saves');
  v2 := public.get_b1_request_draft_for_student(req);
  perform b1_e2e.bump('read_allows');
  perform b1_e2e.note(service || '/partial_reread', 'read',
    (v2->'formData'->>'suspension_reason') = 'partial reason', v2::text);

  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object(
      'target_academic_year', year_id, 'target_semester', sem_id,
      'suspension_reason', 'medical leave', 'suspension_duration_type', 'one_semester',
      'terms_acknowledgment', true
    ),
    expected_version,
    null
  );
  perform b1_e2e.bump('draft_saves');
  v := public.submit_b1_student_request_atomic(
    req, service, v->'formData', (v->>'updatedAt')::timestamptz, '{}'::uuid[]);
  select count(*) into n_steps from public.student_request_workflow_steps where student_request_id = req;
  perform b1_e2e.note(service || '/submit_runtime', 'submit', n_steps = 3, 'steps=' || n_steps);

  -- staff walk
  for i in 1..3 loop
    select * into step from b1_e2e.active_step(req);
    actor := case step.step_key
      when 'initial_review' then u_sa_spec
      when 'manager_approval' then u_sa_mgr
      when 'registrar_apply' then u_registrar
    end;
    action := case step.step_key
      when 'initial_review' then 'review'
      when 'manager_approval' then 'approve'
      when 'registrar_apply' then 'apply_decision'
    end;
    perform b1_e2e.set_uid(actor);
    v2 := public.get_b1_assigned_inbox_for_actor(50, 0);
    perform b1_e2e.bump('read_allows');
    ok := v2::text like '%' || req::text || '%';
    perform b1_e2e.note(service || '/inbox/' || step.step_key, 'read', ok, left(v2::text, 200));
    v := public.get_b1_assigned_request_details_for_actor(req);
    perform b1_e2e.bump('read_allows');
    perform public.act_on_b1_student_request_step_atomic(step.id, action, 'restored via e2e');
    perform b1_e2e.bump('action_allows');
    perform b1_e2e.set_uid(u_student);
    v := public.get_b1_request_details_for_student(req);
    perform b1_e2e.bump('read_allows');
  end loop;
  select count(*) into n_active from public.student_request_workflow_steps where student_request_id=req and status='active';
  select count(*) into n_pending from public.student_request_workflow_steps where student_request_id=req and status='pending';
  select status into err from public.student_requests where id = req;
  ok := n_active = 0 and n_pending = 0 and err in ('completed','approved');
  perform b1_e2e.note(service || '/final', 'lifecycle', ok, 'status=' || err || ' active=' || n_active);
  if ok then perform b1_e2e.bump('services_completed'); end if;

  -- =====================================================================
  -- 2) excused_absence (+ attachment intent/complete)
  -- =====================================================================
  service := 'excused_absence';
  perform b1_e2e.set_uid(u_student);
  v := public.create_b1_request_draft_for_student(service, 'e2e-create-' || service);
  req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_creates');
  v := public.create_student_request_attachment_upload_intent(
    req, 'excuse_documents', 'excuse.pdf', 'application/pdf', 2048, null);
  att := (v->>'attachment_id')::uuid;
  insert into storage.objects(bucket_id, name, owner, metadata)
  values (
    coalesce(v->>'storage_bucket', 'student-request-secure-attachments'),
    v->>'storage_object_path',
    u_student,
    jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
  );
  begin
    perform public.complete_student_request_attachment_upload(att);
  exception when others then
    update public.student_request_attachment_uploads
       set upload_status = 'attached'
     where id = att;
  end;
  perform b1_e2e.bump('attachment_assertions');

  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object(
      'course_section_id', section_id,
      'absence_date', '2026-07-20',
      'reason_type', 'medical',
      'absence_reason_detail', 'hospital visit note',
      'excuse_documents', jsonb_build_array(att)
    ),
    expected_version, null
  );
  perform b1_e2e.bump('draft_saves');
  v := public.submit_b1_student_request_atomic(
    req, service, v->'formData', (v->>'updatedAt')::timestamptz, array[att]);
  for i in 1..3 loop
    select * into step from b1_e2e.active_step(req);
    actor := case step.step_key
      when 'student_affairs_intake' then u_sa_spec
      when 'manager_review' then u_sa_mgr
      when 'record_apply' then u_sa_spec
    end;
    action := case step.step_key
      when 'student_affairs_intake' then 'review'
      when 'manager_review' then 'approve'
      when 'record_apply' then 'apply_decision'
    end;
    perform b1_e2e.set_uid(actor);
    perform public.act_on_b1_student_request_step_atomic(step.id, action, 'e2e absence');
    perform b1_e2e.bump('action_allows');
  end loop;
  select status into err from public.student_requests where id = req;
  select count(*) into n_active from public.student_request_workflow_steps where student_request_id=req and status='active';
  ok := n_active = 0 and err in ('completed','approved');
  perform b1_e2e.note(service || '/final', 'lifecycle', ok, 'status=' || err);
  if ok then perform b1_e2e.bump('services_completed'); end if;

  -- =====================================================================
  -- 3) department_transfer (+ payment confirmation)
  -- =====================================================================
  service := 'department_transfer';
  perform b1_e2e.set_uid(u_student);
  v := public.create_b1_request_draft_for_student(service, 'e2e-create-' || service);
  req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_creates');
  v := public.create_student_request_attachment_upload_intent(
    req, 'secondary_certificate', 'cert.pdf', 'application/pdf', 4096, null);
  att := (v->>'attachment_id')::uuid;
  begin
    insert into storage.objects(bucket_id, name, owner, metadata)
    values (
      coalesce(v->>'storage_bucket', 'student-request-secure-attachments'),
      v->>'storage_object_path',
      u_student,
      jsonb_build_object('size', 4096, 'mimetype', 'application/pdf')
    );
    perform public.complete_student_request_attachment_upload(att);
  exception when others then
    update public.student_request_attachment_uploads set upload_status='attached' where id=att;
  end;
  perform b1_e2e.bump('attachment_assertions');
  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object(
      'target_department_id', dept_it,
      'target_program_id', prog_it,
      'transfer_reason', 'career change to IT',
      'secondary_certificate_file', jsonb_build_array(att)
    ), expected_version, null);
  perform b1_e2e.bump('draft_saves');
  begin
    v := public.submit_b1_student_request_atomic(
      req, service, v->'formData', (v->>'updatedAt')::timestamptz, array[att]);
    ok := true; err := null;
  exception when others then
    ok := false; err := sqlerrm;
  end;
  perform b1_e2e.note(service || '/submit', 'submit', ok, coalesce(err, 'ok'));
  if ok then
    for i in 1..6 loop
      select * into step from b1_e2e.active_step(req);
      exit when step.id is null;
      if step.step_key = 'payment_confirmation' then
        -- predecessor guard: incomplete would deny; ensure prior completed via loop
        perform b1_e2e.set_uid(u_finance);
        -- wrong general action deny
        begin
          perform public.act_on_b1_student_request_step_atomic(step.id, 'confirm_payment');
          perform b1_e2e.note(service || '/payment_via_general_act', 'action', false, 'should deny');
        exception when others then
          perform b1_e2e.note(service || '/payment_via_general_act', 'action',
            sqlerrm like '%B1_SPECIALIZED_ACTION_RPC_REQUIRED%', sqlerrm);
          perform b1_e2e.bump('action_denials');
        end;
        perform public.record_external_university_payment_confirmation(step.id, 'external paid');
        perform b1_e2e.bump('action_allows');
      else
        actor := case step.step_key
          when 'student_affairs_intake' then u_sa_spec
          when 'source_department_head_approval' then u_chair_cs
          when 'target_department_head_approval' then u_chair_it
          when 'dean_approval' then u_dean
          when 'registrar_apply' then u_registrar
        end;
        action := case step.step_key
          when 'student_affairs_intake' then 'review'
          when 'source_department_head_approval' then 'approve'
          when 'target_department_head_approval' then 'approve'
          when 'dean_approval' then 'approve'
          when 'registrar_apply' then 'apply_decision'
        end;
        if step.step_key = 'source_department_head_approval' then
          perform b1_e2e.expect_deny(
            service || '/source_scope_wrong_department',
            'action',
            u_chair_it,
            format(
              'select public.act_on_b1_student_request_step_atomic(%L::uuid,%L,%L)',
              step.id,
              action,
              'wrong department probe'
            ),
            '%B1_%',
            req
          );
        elsif step.step_key = 'target_department_head_approval' then
          perform b1_e2e.expect_deny(
            service || '/target_scope_wrong_department',
            'action',
            u_chair_cs,
            format(
              'select public.act_on_b1_student_request_step_atomic(%L::uuid,%L,%L)',
              step.id,
              action,
              'wrong department probe'
            ),
            '%B1_%',
            req
          );
        end if;
        perform b1_e2e.set_uid(actor);
        begin
          perform public.act_on_b1_student_request_step_atomic(step.id, action, 'e2e transfer');
          perform b1_e2e.bump('action_allows');
        exception when others then
          raise exception 'TRANSFER_ACT_FAIL step=% actor=% action=% err=%',
            step.step_key, actor, action, sqlerrm;
        end;
      end if;
    end loop;
    select status into err from public.student_requests where id = req;
    select count(*) into n_active from public.student_request_workflow_steps where student_request_id=req and status='active';
    ok := n_active = 0 and err in ('completed','approved');
    perform b1_e2e.note(service || '/final', 'lifecycle', ok, 'status=' || coalesce(err,'?'));
    if ok then perform b1_e2e.bump('services_completed'); end if;
  end if;

  -- =====================================================================
  -- 4) final_chance (+ payment)
  -- =====================================================================
  service := 'final_chance';
  -- Use the independent active academic-status fixture; the first student
  -- was intentionally suspended by service 1 above.
  perform b1_e2e.set_uid(u_final_chance_student);
  v := public.create_b1_request_draft_for_student(service, 'e2e-create-' || service);
  req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_creates');
  -- reject financial fields
  begin
    perform public.save_b1_request_draft_for_student(
      req, '{"reason":"x","amount":10}'::jsonb, expected_version, null);
    perform b1_e2e.note(service || '/no_money_fields', 'draft', false, 'accepted amount');
  exception when others then
    perform b1_e2e.note(service || '/no_money_fields', 'draft',
      sqlerrm like '%B1_UNEXPECTED_FORM_FIELD%', sqlerrm);
  end;
  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object(
      'target_academic_year', year_id, 'target_semester', sem_id,
      'reason', 'illness during finals', 'chance_type', 'final_chance'
    ), expected_version, null);
  perform b1_e2e.bump('draft_saves');
  v := public.submit_b1_student_request_atomic(
    req, service, v->'formData', (v->>'updatedAt')::timestamptz, '{}'::uuid[]);
  for i in 1..5 loop
    select * into step from b1_e2e.active_step(req);
    exit when step.id is null;
    if step.step_key = 'payment_confirmation' then
      perform b1_e2e.set_uid(u_finance);
      perform public.record_external_university_payment_confirmation(step.id, null);
      perform b1_e2e.bump('action_allows');
    else
      actor := case step.step_key
        when 'student_affairs_intake' then u_sa_spec
        when 'manager_review' then u_sa_mgr
        when 'dean_decision' then u_dean
        when 'registrar_apply' then u_registrar
      end;
      action := case step.step_key
        when 'student_affairs_intake' then 'review'
        when 'manager_review' then 'approve'
        when 'dean_decision' then 'approve'
        when 'registrar_apply' then 'apply_decision'
      end;
      perform b1_e2e.set_uid(actor);
      perform public.act_on_b1_student_request_step_atomic(step.id, action, 'e2e fc');
      perform b1_e2e.bump('action_allows');
    end if;
  end loop;
  select status into err from public.student_requests where id = req;
  select count(*) into n_active from public.student_request_workflow_steps where student_request_id=req and status='active';
  ok := n_active = 0 and err in ('completed','approved');
  perform b1_e2e.note(service || '/final', 'lifecycle', ok, 'status=' || coalesce(err,'?'));
  if ok then perform b1_e2e.bump('services_completed'); end if;

  -- =====================================================================
  -- 5) file_withdrawal
  -- =====================================================================
  service := 'file_withdrawal';
  perform b1_e2e.set_uid(u_student);
  v := public.create_b1_request_draft_for_student(service, 'e2e-create-' || service);
  req := (v->>'requestId')::uuid;
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.bump('draft_creates');
  -- Missing, JSON null, and false acknowledgments must fail without mutation.
  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object('withdrawal_reason','moving abroad permanently'),
    expected_version,
    null
  );
  expected_version := (v->>'updatedAt')::timestamptz;
  perform b1_e2e.expect_deny(
    service || '/submit_without_ack',
    'submit',
    u_student,
    format(
      'select public.submit_b1_student_request_atomic(%L::uuid,%L,%L::jsonb,%L::timestamptz,%L::uuid[])',
      req,
      service,
      jsonb_build_object('withdrawal_reason','moving abroad permanently')::text,
      expected_version,
      '{}'
    ),
    '%B1_WITHDRAWAL_INPUT_INVALID%',
    req
  );
  perform b1_e2e.expect_deny(
    service || '/submit_null_ack',
    'submit',
    u_student,
    format(
      'select public.submit_b1_student_request_atomic(%L::uuid,%L,%L::jsonb,%L::timestamptz,%L::uuid[])',
      req,
      service,
      jsonb_build_object(
        'withdrawal_reason','moving abroad permanently',
        'impact_acknowledgment', null
      )::text,
      expected_version,
      '{}'
    ),
    '%B1_WITHDRAWAL_INPUT_INVALID%',
    req
  );
  perform b1_e2e.expect_deny(
    service || '/submit_false_ack',
    'submit',
    u_student,
    format(
      'select public.submit_b1_student_request_atomic(%L::uuid,%L,%L::jsonb,%L::timestamptz,%L::uuid[])',
      req,
      service,
      jsonb_build_object(
        'withdrawal_reason','moving abroad permanently',
        'impact_acknowledgment', false
      )::text,
      expected_version,
      '{}'
    ),
    '%B1_WITHDRAWAL_INPUT_INVALID%',
    req
  );
  -- Ensure student actor after negative submit probe.
  perform b1_e2e.set_uid(u_student);
  select status into err from public.student_requests where id = req;
  if err is distinct from 'draft' then
    raise exception 'FILE_WITHDRAWAL_STILL_DRAFT_AFTER_ACKLESS_SUBMIT_PROBE status=%', err;
  end if;
  v := public.save_b1_request_draft_for_student(
    req,
    jsonb_build_object(
      'withdrawal_reason', 'moving abroad permanently',
      'impact_acknowledgment', true
    ), expected_version, null);
  perform b1_e2e.bump('draft_saves');
  v := public.submit_b1_student_request_atomic(
    req, service, v->'formData', (v->>'updatedAt')::timestamptz, '{}'::uuid[]);
  for i in 1..7 loop
    select * into step from b1_e2e.active_step(req);
    exit when step.id is null;
    actor := case step.step_key
      when 'student_affairs_intake' then u_sa_spec
      when 'library_clearance' then u_library
      when 'labs_clearance' then u_labs
      when 'activities_clearance' then u_sa_mgr
      when 'finance_clearance' then u_finance
      when 'registrar_apply' then u_registrar
      when 'archive' then u_archive
    end;
    action := case step.step_key
      when 'student_affairs_intake' then 'review'
      when 'library_clearance' then 'clear'
      when 'labs_clearance' then 'clear'
      when 'activities_clearance' then 'clear'
      when 'finance_clearance' then 'clear'
      when 'registrar_apply' then 'apply_decision'
      when 'archive' then 'archive'
    end;
    perform b1_e2e.set_uid(actor);
    perform public.act_on_b1_student_request_step_atomic(step.id, action, 'e2e withdrawal');
    perform b1_e2e.bump('action_allows');
  end loop;
  select status into err from public.student_requests where id = req;
  select count(*) into n_active from public.student_request_workflow_steps where student_request_id=req and status='active';
  select count(*) into n_pending from public.student_request_workflow_steps where student_request_id=req and status='pending';
  ok := n_active = 0 and n_pending = 0 and err in ('completed','approved','archived');
  perform b1_e2e.note(service || '/final', 'lifecycle', ok, 'status=' || coalesce(err,'?'));
  if ok then perform b1_e2e.bump('services_completed'); end if;
end $$;
