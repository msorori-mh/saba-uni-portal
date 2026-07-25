-- Negative authorization matrix samples with zero-mutation proofs.

do $$
declare
  u_student uuid := '11111111-1111-4111-8111-111111111101';
  u_other uuid := '11111111-1111-4111-8111-111111111102';
  u_sa_spec uuid := '22222222-2222-4222-8222-222222222201';
  u_sa_mgr uuid := '22222222-2222-4222-8222-222222222202';
  u_admin uuid := '22222222-2222-4222-8222-22222222220e';
  u_dean uuid := '22222222-2222-4222-8222-22222222220f';
  u_registrar uuid := '22222222-2222-4222-8222-222222222203';
  u_chair_mis uuid := '22222222-2222-4222-8222-22222222220d';
  req uuid;
  step_id uuid;
begin
  -- pick a submitted/completed suspension request created by lifecycle
  select r.id into req
  from public.student_requests r
  where r.student_profile_id = '33333333-3333-4333-8333-333333333301'
    and r.request_type = 'enrollment_suspension'
  order by r.created_at desc
  limit 1;

  if req is null then
    perform b1_e2e.note('authz/no_request_fixture', 'action', false, 'missing suspension request');
    return;
  end if;

  select s.id into step_id
  from public.student_request_workflow_steps s
  where s.student_request_id = req
  order by s.step_order
  limit 1;

  -- anon
  perform b1_e2e.expect_deny(
    'authz/anon_student_details', 'read', null,
    format('select public.get_b1_request_details_for_student(%L::uuid)', req),
    '%AUTHENTICATION_REQUIRED%', req);

  -- other student
  perform b1_e2e.expect_deny(
    'authz/other_student_details', 'read', u_other,
    format('select public.get_b1_request_details_for_student(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  -- student on staff details
  perform b1_e2e.expect_deny(
    'authz/student_on_staff_details', 'read', u_student,
    format('select public.get_b1_assigned_request_details_for_actor(%L::uuid)', req),
    '%B1_READ_ACCESS_DENIED%', req);

  -- admin unassigned act
  if step_id is not null then
    perform b1_e2e.expect_deny(
      'authz/admin_unassigned_act', 'action', u_admin,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'review'),
      '%B1_%', req);

    -- dean role-only unassigned
    perform b1_e2e.expect_deny(
      'authz/dean_unassigned_act', 'action', u_dean,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'approve'),
      '%B1_%', req);

    -- registrar outside active step (completed first step)
    perform b1_e2e.expect_deny(
      'authz/registrar_on_completed_step', 'action', u_registrar,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'apply_decision'),
      '%B1_%', req);

    -- same role wrong stage: manager on first step id
    perform b1_e2e.expect_deny(
      'authz/manager_on_wrong_step', 'action', u_sa_mgr,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'approve'),
      '%B1_%', req);

    -- specialist replay completed step
    perform b1_e2e.expect_deny(
      'authz/specialist_replay', 'action', u_sa_spec,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'review'),
      '%B1_%', req);

    -- other department head
    perform b1_e2e.expect_deny(
      'authz/other_dept_head', 'action', u_chair_mis,
      format('select public.act_on_b1_student_request_step_atomic(%L::uuid,%L)', step_id, 'approve'),
      '%B1_%', req);
  end if;

  -- save after completed/submitted deny (status gate precedes version; any timestamp OK)
  perform b1_e2e.expect_deny(
    'authz/save_after_terminal', 'draft', u_student,
    format(
      'select public.save_b1_request_draft_for_student(%L::uuid,%L::jsonb,%L::timestamptz,null)',
      req,
      '{"suspension_reason":"x"}',
      (select updated_at from public.student_requests where id = req)
    ),
    '%B1_DRAFT_ACCESS_DENIED%', req);
end $$;
