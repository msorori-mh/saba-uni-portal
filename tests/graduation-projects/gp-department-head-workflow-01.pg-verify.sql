-- GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01 — functional verifier.
-- Fail-closed: any unexpected outcome raises and aborts the chain.
\set ON_ERROR_STOP on

create or replace function pg_temp.act(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false) $$;

create or replace function pg_temp.must_fail(p_sql text, p_like text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm not like '%' || p_like || '%' then
      raise exception 'WRONG_ERROR for [%]: got [%], wanted like [%]', p_sql, sqlerrm, p_like;
    end if;
    return;
  end;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', p_sql;
end $$;

do $$
declare
  d_it uuid := 'd0000000-0000-4000-8000-000000000001';
  d_cs uuid := 'd0000000-0000-4000-8000-000000000002';
  pr_it uuid := 'b0000000-0000-4000-8000-000000000001';
  yr uuid := 'c0000000-0000-4000-8000-000000000001';
  sem uuid := 'c0000000-0000-4000-8000-000000000002';
  l4 uuid := 'c0000000-0000-4000-8000-000000000004';
  l3 uuid := 'c0000000-0000-4000-8000-000000000003';
  u_head uuid := 'a0000000-0000-4000-8000-000000000001';
  u_sup uuid := 'a0000000-0000-4000-8000-000000000002';
  u_vd uuid := 'a0000000-0000-4000-8000-000000000003';
  u_x uuid := 'a0000000-0000-4000-8000-000000000004';
  u_s1 uuid := 'a0000000-0000-4000-8000-000000000011';
  u_s2 uuid := 'a0000000-0000-4000-8000-000000000012';
  u_s3 uuid := 'a0000000-0000-4000-8000-000000000013';
  u_s4 uuid := 'a0000000-0000-4000-8000-000000000014';
  u_s5 uuid := 'a0000000-0000-4000-8000-000000000015';
  f_head uuid := 'f0000000-0000-4000-8000-000000000001';
  f_sup uuid := 'f0000000-0000-4000-8000-000000000002';
  f_vd uuid := 'f0000000-0000-4000-8000-000000000003';
  f_x uuid := 'f0000000-0000-4000-8000-000000000004';
  s1 uuid := 'e0000000-0000-4000-8000-000000000011';
  s2 uuid := 'e0000000-0000-4000-8000-000000000012';
  s3 uuid := 'e0000000-0000-4000-8000-000000000013';
  s4 uuid := 'e0000000-0000-4000-8000-000000000014';
  s5 uuid := 'e0000000-0000-4000-8000-000000000015';
  pos_head uuid; pos_vd uuid;
  p1 uuid; p2 uuid; p3 uuid; v jsonb; r record; n int; ver bigint;
begin
  insert into auth.users(id) values (u_head),(u_sup),(u_vd),(u_x),(u_s1),(u_s2),(u_s3),(u_s4),(u_s5);
  insert into public.departments(id, name_ar) values (d_it,'تكنولوجيا المعلومات'),(d_cs,'علوم الحاسوب');
  insert into public.programs(id, department_id, is_active, name_ar) values (pr_it, d_it, true, 'تكنولوجيا المعلومات');
  insert into public.academic_years(id) values (yr);
  insert into public.semesters(id, academic_year_id, is_current, start_date) values (sem, yr, true, current_date);
  insert into public.academic_levels(id, name, level_number) values (l4,'الرابع',4),(l3,'الثالث',3)
    on conflict (level_number) do nothing;
  select id into l4 from public.academic_levels where level_number = 4;
  select id into l3 from public.academic_levels where level_number = 3;
  insert into public.faculty_profiles(id, user_id, department_id, status, full_name_ar) values
    (f_head, u_head, d_it, 'active', 'رئيس القسم'),
    (f_sup, u_sup, d_cs, 'active', 'مشرف من قسم آخر'),
    (f_vd, u_vd, d_cs, 'active', 'نائب العميد'),
    (f_x, u_x, d_it, 'active', 'عضو عادي');
  insert into public.student_profiles(id, user_id, department_id, program_id, status, full_name_ar, academic_number) values
    (s1, u_s1, d_it, pr_it, 'active', 'طالب 1', '24230001'),
    (s2, u_s2, d_it, pr_it, 'active', 'طالب 2', '24230002'),
    (s3, u_s3, d_it, pr_it, 'active', 'طالب 3', '24230003'),
    (s4, u_s4, d_it, pr_it, 'active', 'طالب 4', '25230004'),
    (s5, u_s5, d_it, pr_it, 'active', 'طالب 5', '24230005');
  insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id)
    values (s1,yr,sem,l4),(s2,yr,sem,l4),(s3,yr,sem,l4),(s4,yr,sem,l3),(s5,yr,sem,l4);
  insert into public.organizational_positions(code, name_ar, department_id, is_department_head_position)
    values ('it_department_head','رئيس قسم تكنولوجيا المعلومات', d_it, true) returning id into pos_head;
  insert into public.organizational_positions(code, name_ar) values ('vice_dean_academic','نائب العميد للشؤون الأكاديمية')
    returning id into pos_vd;
  insert into public.position_assignments(position_id, user_id) values (pos_head, u_head), (pos_vd, u_vd);
  insert into public.graduation_project_policies(status, min_team_size, max_team_size,
      required_progress_reports, min_committee_members, max_committee_members, passing_score,
      max_revision_rounds, published_at)
    values ('published', 2, 4, 1, 2, 3, 50, 2, now());

  -- 1. Ordinary faculty: no management capability.
  perform pg_temp.act(u_x);
  v := public.gp_department_projects_overview();
  if (v->>'can_manage')::boolean then raise exception 'T1 ordinary faculty must not manage'; end if;
  perform pg_temp.must_fail('select public.gp_list_supervisor_options()', 'manager capability required');

  -- 2. Student creates own team; non-L4 and duplicates are refused.
  perform pg_temp.act(u_s1);
  p1 := public.student_create_graduation_project_team(gen_random_uuid());
  select count(*) into n from public.graduation_project_assignments
   where project_id = p1 and role = 'coordinator' and active and user_id = u_head;
  if n <> 1 then raise exception 'T2 head must coordinate the new project'; end if;
  perform pg_temp.must_fail('select public.student_create_graduation_project_team(gen_random_uuid())',
    'already has an active graduation project team');
  perform pg_temp.act(u_s4);
  begin
    perform public.student_create_graduation_project_team(gen_random_uuid());
    raise exception 'T2 non-L4 student must be refused';
  exception when others then
    if sqlerrm like 'T2 %' then raise; end if;
  end;
  perform pg_temp.act(u_x);
  perform pg_temp.must_fail('select public.student_create_graduation_project_team(gen_random_uuid())',
    'student profile required');

  -- 3. Candidates + add member by profile (no account ids exposed).
  perform pg_temp.act(u_s1);
  v := public.gp_list_team_candidates(p1);
  if jsonb_array_length(v) <> 3 then raise exception 'T3 expected 3 candidates, got %', v; end if;
  if v::text like '%user_id%' then raise exception 'T3 candidates must not expose account ids'; end if;
  perform public.gp_add_team_member_by_profile(p1, s2, gen_random_uuid());
  perform pg_temp.act(u_s2);
  perform pg_temp.must_fail(format('select public.gp_list_team_candidates(%L)', p1), 'assignment required');

  -- 4. Proposal cannot be submitted before team approval (trigger, any caller).
  perform pg_temp.act(null);
  perform pg_temp.must_fail(format(
    'update public.graduation_projects set lifecycle_state = ''submitted'' where id = %L', p1),
    'team approval required');

  -- 5. Approval needs a submitted team; only the leader submits.
  select version into ver from public.graduation_projects where id = p1;
  perform pg_temp.act(u_head);
  perform pg_temp.must_fail(format(
    'select public.gp_approve_team_and_assign_supervisor(%L,%L,%s,gen_random_uuid())', p1, f_sup, ver),
    'requires a submitted team');
  perform pg_temp.act(u_s2);
  perform pg_temp.must_fail(format(
    'select public.gp_submit_team_for_approval(%L,%s,gen_random_uuid())', p1, ver), 'leader assignment required');
  perform pg_temp.act(u_s1);
  perform public.gp_submit_team_for_approval(p1, ver, gen_random_uuid());
  select version into ver from public.graduation_projects where id = p1;

  -- 6. Only the department manager approves; cross-department supervisor; final.
  perform pg_temp.act(u_x);
  perform pg_temp.must_fail(format(
    'select public.gp_approve_team_and_assign_supervisor(%L,%L,%s,gen_random_uuid())', p1, f_sup, ver),
    'manager capability required');
  perform pg_temp.act(u_sup);
  perform pg_temp.must_fail(format(
    'select public.gp_approve_team_and_assign_supervisor(%L,%L,%s,gen_random_uuid())', p1, f_sup, ver),
    'manager capability required');
  perform pg_temp.act(u_head);
  perform public.gp_approve_team_and_assign_supervisor(p1, f_sup, ver, gen_random_uuid());
  select * into r from public.graduation_project_assignments
   where project_id = p1 and role = 'supervisor' and active;
  if r.user_id <> u_sup or r.supervision_status <> 'accepted' then
    raise exception 'T6 supervisor must be assigned as accepted (final)';
  end if;
  if (select team_approved_at from public.graduation_projects where id = p1) is null then
    raise exception 'T6 team must be approved';
  end if;
  v := public.gp_department_projects_overview();
  if not (v->>'can_manage')::boolean or jsonb_array_length(v->'projects') <> 1 then
    raise exception 'T6 head overview wrong: %', v;
  end if;
  v := public.gp_list_supervisor_options();
  if not exists (select 1 from jsonb_array_elements(v) e
       where e->>'faculty_profile_id' = f_sup::text and (e->>'active_projects')::int = 1)
     or not exists (select 1 from jsonb_array_elements(v) e
       where e->>'faculty_profile_id' = f_head::text and (e->>'is_self')::boolean) then
    raise exception 'T6 supervisor options wrong: %', v;
  end if;

  -- 7. Team is locked for students after approval.
  perform pg_temp.act(u_s1);
  perform pg_temp.must_fail(format(
    'select public.gp_add_team_member_by_profile(%L,%L,gen_random_uuid())', p1, s3), 'locked after approval');

  -- 8-9. Proposal: supervisor endorsement precedes head approval; then active.
  perform pg_temp.act(null);
  update public.graduation_projects
     set title = 'مشروع', problem_statement = 'x', objectives = 'x', summary = 'x',
         lifecycle_state = 'submitted', version = version + 1
   where id = p1;
  select version into ver from public.graduation_projects where id = p1;
  perform pg_temp.act(u_head);
  perform pg_temp.must_fail(format(
    'select public.review_graduation_project_proposal(%L,''accept'',null,%s,gen_random_uuid())', p1, ver),
    'supervisor endorsement required');
  perform pg_temp.must_fail(format(
    'select public.gp_supervisor_review_proposal(%L,''endorse'',null,%s,gen_random_uuid())', p1, ver),
    'accepted supervisor assignment required');
  perform pg_temp.act(u_sup);
  perform pg_temp.must_fail(format(
    'select public.gp_supervisor_review_proposal(%L,''return'',null,%s,gen_random_uuid())', p1, ver),
    'review reason required');
  perform public.gp_supervisor_review_proposal(p1, 'endorse', null, ver, gen_random_uuid());
  select version into ver from public.graduation_projects where id = p1;
  perform pg_temp.act(u_head);
  perform public.review_graduation_project_proposal(p1, 'accept', null, ver, gen_random_uuid());
  if (select lifecycle_state from public.graduation_projects where id = p1) <> 'active' then
    raise exception 'T9 approved proposal with final supervisor must become active';
  end if;

  -- 10. Head supervises himself -> coordinator authority moves to the vice dean.
  perform pg_temp.act(u_s3);
  p2 := public.student_create_graduation_project_team(gen_random_uuid());
  perform pg_temp.act(u_s3);
  perform pg_temp.must_fail(format(
    'select public.gp_submit_team_for_approval(%L,%s,gen_random_uuid())', p2,
    (select version from public.graduation_projects where id = p2)), 'below configured minimum');
  perform public.gp_add_team_member_by_profile(p2, s5, gen_random_uuid());
  select version into ver from public.graduation_projects where id = p2;
  perform public.gp_submit_team_for_approval(p2, ver, gen_random_uuid());
  select version into ver from public.graduation_projects where id = p2;
  perform pg_temp.act(u_head);
  perform public.gp_approve_team_and_assign_supervisor(p2, f_head, ver, gen_random_uuid());
  select count(*) into n from public.graduation_project_assignments
   where project_id = p2 and role = 'coordinator' and active;
  if n <> 1 or not exists (select 1 from public.graduation_project_assignments
     where project_id = p2 and role = 'coordinator' and active and user_id = u_vd) then
    raise exception 'T10 vice dean must be the single coordinator when the head supervises';
  end if;
  perform pg_temp.act(null);
  update public.graduation_projects
     set title = 'مشروع 2', problem_statement = 'x', objectives = 'x', summary = 'x',
         lifecycle_state = 'submitted', version = version + 1
   where id = p2;
  select version into ver from public.graduation_projects where id = p2;
  perform pg_temp.act(u_head);
  perform public.gp_supervisor_review_proposal(p2, 'endorse', null, ver, gen_random_uuid());
  select version into ver from public.graduation_projects where id = p2;
  perform pg_temp.must_fail(format(
    'select public.review_graduation_project_proposal(%L,''accept'',null,%s,gen_random_uuid())', p2, ver),
    'assignment required');
  perform pg_temp.act(u_vd);
  perform public.review_graduation_project_proposal(p2, 'accept', null, ver, gen_random_uuid());
  if (select lifecycle_state from public.graduation_projects where id = p2) <> 'active' then
    raise exception 'T10 vice dean approval must activate the project';
  end if;

  -- 11. Re-assigning to another supervisor returns coordination to the head.
  select version into ver from public.graduation_projects where id = p2;
  perform pg_temp.act(u_head);
  perform public.gp_approve_team_and_assign_supervisor(p2, f_sup, ver, gen_random_uuid());
  if not exists (select 1 from public.graduation_project_assignments
     where project_id = p2 and role = 'coordinator' and active and user_id = u_head)
     or exists (select 1 from public.graduation_project_assignments
     where project_id = p2 and role = 'coordinator' and active and user_id = u_vd) then
    raise exception 'T11 coordination must return to the head';
  end if;

  -- 12. Self supervision is refused when no vice dean is configured.
  perform pg_temp.act(null);
  update public.position_assignments set is_active = false where position_id = pos_vd;
  select version into ver from public.graduation_projects where id = p2;
  perform pg_temp.act(u_head);
  perform pg_temp.must_fail(format(
    'select public.gp_approve_team_and_assign_supervisor(%L,%L,%s,gen_random_uuid())', p2, f_head, ver),
    'vice dean for academic affairs is not configured');

  -- 13. Workflow status is visible to participants only.
  perform pg_temp.act(u_s1);
  v := public.gp_project_workflow_status(p1);
  if not (v->'viewer'->>'is_leader')::boolean or v->>'supervisor_name' is null then
    raise exception 'T13 leader status wrong: %', v;
  end if;
  perform pg_temp.must_fail(format('select public.gp_project_workflow_status(%L)', p2), 'access denied');

  perform pg_temp.act(null);
  raise notice 'GP_DEPARTMENT_HEAD_WORKFLOW_01_VERIFIER: PASS';
end $$;
