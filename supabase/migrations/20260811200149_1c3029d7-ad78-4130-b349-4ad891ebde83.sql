CREATE OR REPLACE FUNCTION public.add_graduation_project_team_member(p_project_id uuid, p_student_profile_id uuid, p_student_user_id uuid, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid; v_req jsonb; v_replay uuid;
  pol public.graduation_project_policies; v_members int;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.gp_team_mutator(p_project_id);
  v_req := jsonb_build_object('student_profile_id', p_student_profile_id, 'student_user_id', p_student_user_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'team_member_added', v_req);
  if v_replay is not null then return v_replay; end if;
  perform public.require_student_gp_fourth_level_eligibility(p_student_profile_id);

  pol := public.gp_effective_policy(p.department_id, p.academic_year_id);
  select count(*) into v_members from public.graduation_project_assignments
    where project_id = p_project_id and role = 'student' and active;
  if v_members + 1 > pol.max_team_size then
    raise exception 'graduation project team size limit exceeded';
  end if;

  begin
    insert into public.graduation_project_assignments(project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by)
      values (p_project_id, 'student', p_student_profile_id, p_student_user_id, p.department_id, false, auth.uid())
      returning id into new_id;
  exception when unique_violation then
    raise exception 'student already has an active graduation project team';
  end;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'team_member_added', 'graduation_project_assignments', new_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return new_id;
end $function$;

CREATE OR REPLACE FUNCTION public.assign_graduation_project_committee_member(p_project_id uuid, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare a public.graduation_project_assignments; p public.graduation_projects; d public.graduation_project_discussions;
  asg_id uuid; pm_id uuid; v_req jsonb; v_replay uuid;
  pol public.graduation_project_policies; v_panel int;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('faculty_profile_id', p_faculty_profile_id, 'user_id', p_user_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'committee_member_assigned', v_req);
  if v_replay is not null then return v_replay; end if;
  if p.lifecycle_state <> 'defense_scheduled' then raise exception 'committee assignment state denied'; end if;
  select * into d from public.graduation_project_discussions where project_id = p_project_id for update;
  if d.id is null then raise exception 'defense not scheduled'; end if;

  pol := public.gp_effective_policy(p.department_id, p.academic_year_id);
  select count(*) into v_panel from public.graduation_project_panel_members where discussion_id = d.id;
  if v_panel + 1 > pol.max_committee_members then
    raise exception 'graduation project committee size limit exceeded';
  end if;

  select id into asg_id from public.graduation_project_assignments
    where project_id = p_project_id and role = 'panel_member' and user_id = p_user_id and active;
  if asg_id is null then
    insert into public.graduation_project_assignments(project_id, role, faculty_profile_id, user_id, department_id, assigned_by)
      values (p_project_id, 'panel_member', p_faculty_profile_id, p_user_id, p.department_id, auth.uid()) returning id into asg_id;
  end if;
  insert into public.graduation_project_panel_members(project_id, discussion_id, assignment_id)
    values (p_project_id, d.id, asg_id) returning id into pm_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'committee_member_assigned', 'graduation_project_panel_members', pm_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'assignment_id', asg_id));
  return pm_id;
end $function$;

CREATE OR REPLACE FUNCTION public.conclude_graduation_project_result(p_project_id uuid, p_decision text, p_expected_version bigint, p_correlation_id uuid, p_notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  a public.graduation_project_assignments;
  p public.graduation_projects;
  d public.graduation_project_discussions;
  v_avg numeric(5,2);
  v_panel int;
  v_submitted int;
  v_dec public.graduation_project_final_decision;
  v_req jsonb;
  v_replay uuid;
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_round int;
  v_had_revisions boolean;
  pol public.graduation_project_policies;
  v_min_panel int;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(
    p_project_id,
    array['coordinator']::public.graduation_project_assignment_role[]
  );
  v_req := jsonb_build_object('decision', p_decision, 'expected_version', p_expected_version, 'notes', v_notes);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'result_concluded', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'evaluating' then raise exception 'result conclusion state denied'; end if;
  begin
    v_dec := p_decision::public.graduation_project_final_decision;
  exception when invalid_text_representation then
    raise exception 'final decision invalid';
  end;
  if v_dec not in ('passed','revisions_required','failed') then
    raise exception 'final decision invalid';
  end if;
  if v_dec = 'revisions_required' and v_notes is null then
    raise exception 'revision notes required';
  end if;

  v_round := coalesce(p.evaluation_round, 1);
  v_had_revisions := (
    p.final_decision = 'revisions_required'
    or exists (
      select 1 from public.graduation_project_events e
      where e.project_id = p_project_id
        and e.event_type = 'result_concluded'
        and coalesce(e.payload->>'final_decision', '') = 'revisions_required'
    )
  );

  if v_had_revisions and v_dec in ('passed', 'failed') then
    if not public.gp_current_revision_final_ready(p_project_id) then
      raise exception 'corrected final readiness required before final decision';
    end if;
  end if;

  select * into d from public.graduation_project_discussions
    where project_id = p_project_id and state = 'held';
  if d.id is null then raise exception 'defense not held'; end if;

  pol := public.gp_effective_policy(p.department_id, p.academic_year_id);
  v_min_panel := greatest(2, coalesce(pol.min_committee_members, 2));

  select count(*) into v_panel
  from public.graduation_project_panel_members
  where discussion_id = d.id;

  select count(*) into v_submitted
  from public.graduation_project_evaluations
  where discussion_id = d.id and state = 'submitted' and evaluation_round = v_round;

  if v_panel < v_min_panel or v_submitted <> v_panel then
    raise exception 'all committee evaluations required';
  end if;

  select round(avg(score), 2) into v_avg
  from public.graduation_project_evaluations
  where discussion_id = d.id and state = 'submitted' and evaluation_round = v_round;

  if v_dec = 'passed' and v_avg < pol.passing_score then
    raise exception 'average score below configured passing score';
  end if;

  if v_dec = 'revisions_required' and v_round > coalesce(pol.max_revision_rounds, 2) then
    raise exception 'revision rounds limit exceeded';
  end if;

  update public.graduation_projects
    set final_decision = v_dec,
        average_score = v_avg,
        evaluation_round = case when v_dec = 'revisions_required' then v_round + 1 else v_round end,
        version = version + 1,
        updated_at = now()
    where id = p_project_id;

  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    p_project_id, auth.uid(), a.id, 'result_concluded', 'graduation_projects', p_project_id, p_correlation_id,
    jsonb_build_object('request', v_req, 'final_decision', v_dec::text, 'average_score', v_avg,
      'notes', v_notes, 'evaluation_round', v_round, 'policy_passing_score', pol.passing_score)
  );
  return p_project_id;
end $function$;