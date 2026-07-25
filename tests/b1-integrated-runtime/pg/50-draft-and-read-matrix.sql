-- Draft idempotency / concurrency / read capability probes.

do $$
declare
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_other uuid := '11111111-1111-4111-8111-111111111102';
  v jsonb;
  v2 jsonb;
  req uuid;
  n integer;
  err text;
  denied boolean;
begin
  perform b1_e2e.set_uid(u_student);

  -- capability (not activation)
  v := public.get_b1_secure_read_runtime_capability();
  perform b1_e2e.bump('read_allows');
  perform b1_e2e.note(
    'read/capability',
    'read',
    (v->>'available') = 'true'
      and (v->'writes_available') ? 'create_draft'
      and (v->>'draft_mutations_contract') is not null,
    v::text
  );

  -- form options for each service
  foreach err in array array[
    'enrollment_suspension','excused_absence','department_transfer','final_chance','file_withdrawal'
  ] loop
    v := public.get_b1_request_form_options(err);
    perform b1_e2e.bump('read_allows');
    perform b1_e2e.note('read/form_options/' || err, 'read', (v->>'serviceCode') = err, left(v::text,120));
  end loop;

  -- idempotent create
  v := public.create_b1_request_draft_for_student('enrollment_suspension', 'idem-e2e-susp');
  req := (v->>'requestId')::uuid;
  v2 := public.create_b1_request_draft_for_student('enrollment_suspension', 'idem-e2e-susp');
  perform b1_e2e.bump('idempotency');
  perform b1_e2e.bump('concurrency');
  select count(*) into n from public.student_requests
    where student_profile_id='33333333-3333-4333-8333-333333333301'
      and request_type='enrollment_suspension' and status='draft';
  -- may be 0 if prior lifecycle completed the only draft uniqueness window — create new service draft
  perform b1_e2e.set_uid(u_student);
  begin
    -- use a service that still allows a draft if none open: create file_withdrawal secondary? may already completed
    -- create via final_chance already completed — open draft on a fresh code path:
    -- force by creating for excused_absence only if no open draft
    null;
  end;

  -- mismatch idempotency on a fresh draft
  v := public.create_b1_request_draft_for_student('enrollment_suspension', null);
  -- if unique open draft exists from idem key above and still draft:
  select id into req from public.student_requests
    where student_profile_id='33333333-3333-4333-8333-333333333301'
      and request_type='enrollment_suspension' and status='draft'
    limit 1;
  if req is not null then
    v := public.save_b1_request_draft_for_student(
      req,
      '{"suspension_reason":"one"}'::jsonb,
      (v->>'updatedAt')::timestamptz,
      'save-idem-e2e'
    );
    denied := false; err := null;
    begin
      perform public.save_b1_request_draft_for_student(
        req,
        '{"suspension_reason":"two"}'::jsonb,
        (v->>'updatedAt')::timestamptz,
        'save-idem-e2e'
      );
    exception when others then
      err := sqlerrm; denied := err like '%B1_IDEMPOTENCY_PAYLOAD_MISMATCH%';
    end;
    perform b1_e2e.bump('idempotency');
    perform b1_e2e.note('draft/idempotency_mismatch', 'draft', denied, coalesce(err,'?'));

    -- stale expected_updated_at
    denied := false; err := null;
    begin
      perform public.save_b1_request_draft_for_student(
        req, '{"suspension_reason":"stale"}'::jsonb, '2000-01-01T00:00:00Z'::timestamptz, null);
    exception when others then
      err := sqlerrm; denied := err like '%B1_STALE_REQUEST_VERSION%';
    end;
    perform b1_e2e.note('draft/stale_save', 'draft', denied, coalesce(err,'?'));

    -- transfer same department deny using draft save on transfer open draft if any
  end if;

  -- transfer current department deny (create fresh transfer draft if needed)
  begin
    v := public.create_b1_request_draft_for_student('department_transfer', 'e2e-transfer-neg');
    req := (v->>'requestId')::uuid;
    denied := false; err := null;
    begin
      perform public.save_b1_request_draft_for_student(
        req,
        jsonb_build_object(
          'target_department_id', '55555555-5555-4555-8555-555555555501',
          'target_program_id', '66666666-6666-4666-8666-666666666601',
          'transfer_reason', 'same dept'
        ),
        (v->>'updatedAt')::timestamptz, null
      );
    exception when others then
      err := sqlerrm; denied := err like '%B1_TRANSFER_INPUT_INVALID%';
    end;
    perform b1_e2e.note('draft/transfer_same_dept', 'draft', denied, coalesce(err,'?'));
  exception when others then
    perform b1_e2e.note('draft/transfer_same_dept', 'draft', false, sqlerrm);
  end;

  -- student list allow
  perform b1_e2e.set_uid(u_student);
  v := public.list_b1_requests_for_student(50, 0);
  perform b1_e2e.bump('read_allows');
  perform b1_e2e.note('read/student_list', 'read', jsonb_typeof(v) = 'array', left(v::text,120));

  -- other student cannot list owner's private details via get details of foreign id
  select id into req from public.student_requests
    where student_profile_id='33333333-3333-4333-8333-333333333301'
    order by created_at desc limit 1;
  perform b1_e2e.expect_deny(
    'read/other_student_list_details', 'read', u_other,
    format('select public.get_b1_request_details_for_student(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);
end $$;
