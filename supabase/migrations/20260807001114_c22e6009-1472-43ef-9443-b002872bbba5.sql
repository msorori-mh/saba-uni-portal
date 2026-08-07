do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'graduation projects foundation missing; apply A1 first';
  end if;
  if to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is not null then
    raise exception 'graduation project lifecycle RPCs already exist; refuse ambiguous retry';
  end if;
end $$;

create function public.gp_assert_version(p public.graduation_projects, p_expected bigint)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p.version <> p_expected then raise exception 'project version precondition failed'; end if;
  if p.lifecycle_state = 'archived' then raise exception 'archived project is immutable'; end if;
end $$;

create function public.gp_proposal_complete(p public.graduation_projects)
returns boolean language sql immutable as $$
  select length(btrim(coalesce(p.title,''))) between 3 and 300
    and length(btrim(coalesce(p.problem_statement,''))) > 0
    and length(btrim(coalesce(p.objectives,''))) > 0
    and length(btrim(coalesce(p.summary,''))) > 0
$$;

create function public.gp_has_current_clean_file(p_project_id uuid, p_category public.graduation_project_file_category)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.graduation_project_files f
    where f.project_id = p_project_id and f.category = p_category and f.is_current
      and f.upload_status = 'active' and f.scan_state = 'clean'
  )
$$;

create function public.gp_team_mutator(p_project_id uuid)
returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.graduation_projects; a public.graduation_project_assignments;
begin
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if p.lifecycle_state in ('rejected','archived') then raise exception 'team mutation state denied'; end if;
  if p.lifecycle_state in ('draft','revision_required') then
    select * into a from public.graduation_project_assignments x
    where x.project_id = p_project_id and x.user_id = auth.uid() and x.active and x.ended_at is null
      and ((x.role = 'student' and x.is_leader) or x.role = 'coordinator')
    order by case when x.role = 'coordinator' then 0 else 1 end limit 1;
    if a.id is null then raise exception 'exact direct processing assignment required'; end if;
    return a;
  end if;
  return public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
end $$;

create function public.create_graduation_project_team(
  p_department_id uuid, p_leader_student_profile_id uuid, p_leader_user_id uuid,
  p_program_id uuid, p_academic_year_id uuid, p_semester_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.graduation_project_department_coordinators;
  v_id uuid; v_coord uuid; v_leader uuid; v_replay uuid; v_payload jsonb; v_req jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  c := public.require_graduation_project_department_coordinator(p_department_id);
  v_req := jsonb_build_object(
    'department_id', p_department_id, 'leader_student_profile_id', p_leader_student_profile_id,
    'leader_user_id', p_leader_user_id, 'program_id', p_program_id,
    'academic_year_id', p_academic_year_id, 'semester_id', p_semester_id
  );
  select e.entity_id, e.payload into v_replay, v_payload
  from public.graduation_project_events e
  where e.correlation_id = p_correlation_id and e.event_type = 'team_created' limit 1;
  if v_replay is not null then
    if v_payload ? 'request' and v_payload->'request' is distinct from v_req then
      raise exception 'idempotent replay payload mismatch';
    end if;
    return v_replay;
  end if;
  insert into public.graduation_projects(department_id, program_id, academic_year_id, semester_id, lifecycle_state)
    values (p_department_id, p_program_id, p_academic_year_id, p_semester_id, 'draft') returning id into v_id;
  insert into public.graduation_project_assignments(project_id, role, faculty_profile_id, user_id, department_id, assigned_by)
    values (v_id, 'coordinator', c.faculty_profile_id, auth.uid(), p_department_id, auth.uid()) returning id into v_coord;
  begin
    insert into public.graduation_project_assignments(project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by)
      values (v_id, 'student', p_leader_student_profile_id, p_leader_user_id, p_department_id, true, auth.uid()) returning id into v_leader;
  exception when unique_violation then
    raise exception 'student already has an active graduation project team';
  end;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (v_id, auth.uid(), v_coord, 'team_created', 'graduation_projects', v_id, p_correlation_id,
      jsonb_build_object('leader_assignment_id', v_leader, 'coordinator_assignment_id', v_coord, 'request', v_req));
  return v_id;
end $$;

create function public.add_graduation_project_team_member(
  p_project_id uuid, p_student_profile_id uuid, p_student_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.gp_team_mutator(p_project_id);
  v_req := jsonb_build_object('student_profile_id', p_student_profile_id, 'student_user_id', p_student_user_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'team_member_added', v_req);
  if v_replay is not null then return v_replay; end if;
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
end $$;

create function public.remove_graduation_project_team_member(
  p_project_id uuid, p_assignment_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; t public.graduation_project_assignments; p public.graduation_projects;
  v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.gp_team_mutator(p_project_id);
  v_req := jsonb_build_object('assignment_id', p_assignment_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'team_member_removed', v_req);
  if v_replay is not null then return v_replay; end if;
  select * into t from public.graduation_project_assignments where id = p_assignment_id and project_id = p_project_id for update;
  if t.id is null or not t.active or t.role <> 'student' then raise exception 'team member assignment not found'; end if;
  if t.is_leader then raise exception 'cannot remove team leader'; end if;
  update public.graduation_project_assignments set active = false, ended_at = now() where id = t.id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'team_member_removed', 'graduation_project_assignments', t.id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return t.id;
end $$;

create function public.upsert_graduation_project_proposal(
  p_project_id uuid, p_title text, p_problem_statement text, p_objectives text, p_summary text,
  p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object(
    'title', p_title, 'problem_statement', p_problem_statement, 'objectives', p_objectives,
    'summary', p_summary, 'expected_version', p_expected_version
  );
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'proposal_upserted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state not in ('draft','revision_required') then raise exception 'proposal edit state denied'; end if;
  if length(btrim(coalesce(p_title,''))) not between 3 and 300 then raise exception 'proposal title invalid'; end if;
  update public.graduation_projects set
    title = btrim(p_title), problem_statement = btrim(p_problem_statement),
    objectives = btrim(p_objectives), summary = btrim(p_summary),
    version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_upserted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create function public.submit_graduation_project_proposal(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'proposal_submitted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'draft' then raise exception 'proposal transition precondition failed'; end if;
  if not public.gp_proposal_complete(p) then raise exception 'proposal fields incomplete'; end if;
  if not public.gp_has_current_clean_file(p_project_id, 'proposal') then raise exception 'proposal attachment required'; end if;
  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_submitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create function public.resubmit_graduation_project_proposal(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'proposal_resubmitted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'revision_required' then raise exception 'proposal resubmission precondition failed'; end if;
  if not public.gp_proposal_complete(p) then raise exception 'proposal fields incomplete'; end if;
  if not public.gp_has_current_clean_file(p_project_id, 'proposal') then raise exception 'proposal attachment required'; end if;
  update public.graduation_projects set lifecycle_state = 'submitted', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'proposal_resubmitted', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create function public.review_graduation_project_proposal(
  p_project_id uuid, p_action text, p_reason text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.graduation_project_assignments; p public.graduation_projects;
  v_event text; v_state public.graduation_project_state; v_decision text; v_stage text; v_round int;
  v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  if p_action not in ('accept','return','reject') then raise exception 'proposal review action unknown'; end if;
  v_event := case p_action when 'accept' then 'proposal_accepted' when 'return' then 'proposal_returned' else 'proposal_rejected' end;
  v_req := jsonb_build_object('action', p_action, 'reason', p_reason, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, v_event, v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'submitted' then raise exception 'proposal review precondition failed'; end if;
  if p_action in ('return','reject') and length(btrim(coalesce(p_reason,''))) = 0 then raise exception 'review reason required'; end if;
  if p_action = 'accept' then v_state := 'approved'; v_decision := 'approved';
  elsif p_action = 'return' then v_state := 'revision_required'; v_decision := 'revision_required';
  else v_state := 'rejected'; v_decision := 'rejected'; end if;
  update public.graduation_projects set lifecycle_state = v_state, version = version + 1, updated_at = now(),
    approved_at = case when v_state = 'approved' then now() else approved_at end where id = p_project_id;
  select count(*) into v_round from public.graduation_project_approvals where project_id = p_project_id and stage like 'proposal_round_%';
  v_stage := 'proposal_round_' || (v_round + 1);
  insert into public.graduation_project_approvals(project_id, stage, decision, assignment_id, reason)
    values (p_project_id, v_stage, v_decision, a.id, p_reason);
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, reason, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, v_event, 'graduation_projects', p_project_id, p_reason, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create function public.assign_graduation_project_supervisor(
  p_project_id uuid, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('faculty_profile_id', p_faculty_profile_id, 'user_id', p_user_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'supervisor_assigned', v_req);
  if v_replay is not null then return v_replay; end if;
  if p.lifecycle_state in ('rejected','archived','draft','submitted','revision_required') then
    raise exception 'supervisor assignment state denied';
  end if;
  update public.graduation_project_assignments
    set active = false, ended_at = now(),
        supervision_status = case when supervision_status = 'pending' then 'declined' else supervision_status end
    where project_id = p_project_id and role = 'supervisor' and active and supervision_status in ('pending','accepted');
  insert into public.graduation_project_assignments(project_id, role, faculty_profile_id, user_id, department_id, supervision_status, assigned_by)
    values (p_project_id, 'supervisor', p_faculty_profile_id, p_user_id, p.department_id, 'pending', auth.uid()) returning id into new_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'supervisor_assigned', 'graduation_project_assignments', new_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return new_id;
end $$;

create function public.respond_graduation_project_supervision(
  p_project_id uuid, p_response text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; v_event text; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  select * into a from public.graduation_project_assignments
    where project_id = p_project_id and user_id = auth.uid() and role = 'supervisor' and active
      and supervision_status = 'pending' for update;
  if a.id is null then raise exception 'pending supervisor assignment required'; end if;
  if p_response not in ('accept','decline') then raise exception 'supervision response unknown'; end if;
  v_event := case when p_response = 'accept' then 'supervision_accepted' else 'supervision_declined' end;
  v_req := jsonb_build_object('response', p_response, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, v_event, v_req);
  if v_replay is not null then return a.id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p_response = 'accept' then
    update public.graduation_project_assignments set supervision_status = 'accepted' where id = a.id;
    if p.lifecycle_state = 'approved' then
      update public.graduation_projects set lifecycle_state = 'active', version = version + 1, updated_at = now() where id = p_project_id;
    else
      update public.graduation_projects set version = version + 1, updated_at = now() where id = p_project_id;
    end if;
  else
    update public.graduation_project_assignments set supervision_status = 'declined', active = false, ended_at = now() where id = a.id;
    update public.graduation_projects set version = version + 1, updated_at = now() where id = p_project_id;
  end if;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, v_event, 'graduation_project_assignments', a.id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return a.id;
end $$;

create function public.submit_graduation_project_progress(
  p_project_id uuid, p_summary text, p_file_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  new_id uuid; v_ver int; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('summary', p_summary, 'file_id', p_file_id);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'progress_submitted', v_req);
  if v_replay is not null then return v_replay; end if;
  if p.lifecycle_state <> 'active' and p.final_decision is distinct from 'revisions_required' then
    raise exception 'progress submit state denied';
  end if;
  if length(btrim(coalesce(p_summary,''))) = 0 then raise exception 'progress summary required'; end if;
  if p_file_id is not null then
    select * into f from public.graduation_project_files where id = p_file_id and project_id = p_project_id;
    if f.id is null or f.category <> 'progress' or f.upload_status <> 'active' then raise exception 'progress file invalid'; end if;
  end if;
  update public.graduation_project_progress_entries set state = 'superseded'
    where project_id = p_project_id and state in ('submitted','returned');
  select coalesce(max(version_no),0)+1 into v_ver from public.graduation_project_progress_entries where project_id = p_project_id;
  insert into public.graduation_project_progress_entries(project_id, version_no, summary, state, file_id, submitted_by_assignment_id)
    values (p_project_id, v_ver, btrim(p_summary), 'submitted', p_file_id, a.id) returning id into new_id;
  if p_file_id is not null then update public.graduation_project_files set progress_entry_id = new_id where id = p_file_id; end if;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'progress_submitted', 'graduation_project_progress_entries', new_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return new_id;
end $$;

create function public.review_graduation_project_progress(
  p_entry_id uuid, p_action text, p_comments text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; e public.graduation_project_progress_entries;
  v_event text; v_project_id uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select project_id into v_project_id from public.graduation_project_progress_entries where id = p_entry_id;
  if v_project_id is null then raise exception 'progress entry not found'; end if;
  perform 1 from public.graduation_projects where id = v_project_id for update;
  a := public.require_graduation_project_accepted_supervisor(v_project_id);
  select * into e from public.graduation_project_progress_entries where id = p_entry_id for update;
  if e.id is null then raise exception 'progress entry not found'; end if;
  if p_action not in ('approve','return') then raise exception 'progress review action unknown'; end if;
  v_event := case when p_action = 'approve' then 'progress_approved' else 'progress_returned' end;
  v_req := jsonb_build_object('entry_id', p_entry_id, 'action', p_action, 'comments', p_comments);
  v_replay := public.gp_take_replay(e.project_id, p_correlation_id, v_event, v_req);
  if v_replay is not null then return e.id; end if;
  if e.state <> 'submitted' then raise exception 'progress review precondition failed'; end if;
  if p_action = 'return' and length(btrim(coalesce(p_comments,''))) = 0 then raise exception 'review comments required'; end if;
  update public.graduation_project_progress_entries set
    state = case when p_action = 'approve' then 'approved' else 'returned' end,
    reviewed_by_assignment_id = a.id, review_comments = p_comments, reviewed_at = now() where id = e.id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, reason, correlation_id, payload)
    values (e.project_id, auth.uid(), a.id, v_event, 'graduation_project_progress_entries', e.id, p_comments, p_correlation_id,
      jsonb_build_object('request', v_req));
  return e.id;
end $$;

create function public.submit_graduation_project_final(
  p_project_id uuid, p_file_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('file_id', p_file_id, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'final_submitted', v_req);
  if v_replay is not null then return p_file_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'active' and p.final_decision is distinct from 'revisions_required' then
    raise exception 'final submit state denied';
  end if;
  select * into f from public.graduation_project_files where id = p_file_id and project_id = p_project_id for update;
  if f.id is null or f.category <> 'final' or not f.is_current or f.upload_status <> 'active' or f.scan_state <> 'clean' then
    raise exception 'current clean final file required';
  end if;
  update public.graduation_projects set version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'final_submitted', 'graduation_project_files', f.id, p_correlation_id,
      jsonb_build_object('request', v_req, 'file_id', f.id));
  return f.id;
end $$;

create function public.review_graduation_project_final(
  p_project_id uuid, p_action text, p_comments text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  v_event text; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_accepted_supervisor(p_project_id);
  if p_action not in ('ready','return') then raise exception 'final review action unknown'; end if;
  v_event := case when p_action = 'ready' then 'final_marked_ready' else 'final_returned' end;
  v_req := jsonb_build_object('action', p_action, 'comments', p_comments, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, v_event, v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'active' and p.final_decision is distinct from 'revisions_required' then
    raise exception 'final review state denied';
  end if;
  if p_action = 'return' and length(btrim(coalesce(p_comments,''))) = 0 then raise exception 'review comments required'; end if;
  select * into f from public.graduation_project_files
    where project_id = p_project_id and category = 'final' and is_current and upload_status = 'active' and scan_state = 'clean';
  if f.id is null then raise exception 'current clean final file required'; end if;
  if not exists (
    select 1 from public.graduation_project_events ev
    where ev.project_id = p_project_id and ev.event_type = 'final_submitted' and ev.entity_id = f.id
  ) then raise exception 'final submission required before review'; end if;
  update public.graduation_projects set version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, reason, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, v_event, 'graduation_project_files', f.id, p_comments, p_correlation_id,
      jsonb_build_object('request', v_req, 'file_id', f.id, 'action', p_action));
  return p_project_id;
end $$;

create function public.schedule_graduation_project_defense(
  p_project_id uuid, p_starts_at timestamptz, p_venue text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  d_id uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('starts_at', p_starts_at, 'venue', p_venue, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'defense_scheduled', v_req);
  if v_replay is not null then return v_replay; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'active' then raise exception 'defense schedule state denied'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments s
    where s.project_id = p_project_id and s.role = 'supervisor' and s.active and s.supervision_status = 'accepted'
  ) then raise exception 'accepted supervisor required'; end if;
  select * into f from public.graduation_project_files
    where project_id = p_project_id and category = 'final' and is_current and upload_status = 'active' and scan_state = 'clean';
  if f.id is null then raise exception 'current clean final file required'; end if;
  if not exists (
    select 1 from public.graduation_project_events ev
    where ev.project_id = p_project_id and ev.event_type = 'final_marked_ready' and ev.entity_id = f.id
      and ev.occurred_at >= (
        select max(x.occurred_at) from public.graduation_project_events x
        where x.project_id = p_project_id and x.event_type = 'final_submitted' and x.entity_id = f.id
      )
  ) then raise exception 'final readiness required'; end if;
  if length(btrim(coalesce(p_venue,''))) = 0 or p_starts_at is null then raise exception 'defense schedule fields required'; end if;
  insert into public.graduation_project_discussions(project_id, starts_at, venue, coordinator_assignment_id, state)
    values (p_project_id, p_starts_at, btrim(p_venue), a.id, 'scheduled') returning id into d_id;
  update public.graduation_projects set lifecycle_state = 'defense_scheduled', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'defense_scheduled', 'graduation_project_discussions', d_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'starts_at', p_starts_at, 'venue', btrim(p_venue)));
  return d_id;
end $$;

create function public.assign_graduation_project_committee_member(
  p_project_id uuid, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; d public.graduation_project_discussions;
  asg_id uuid; pm_id uuid; v_req jsonb; v_replay uuid;
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
end $$;

create function public.mark_graduation_project_defense_held(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; d public.graduation_project_discussions;
  v_count int; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'defense_held', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'defense_scheduled' then raise exception 'defense held state denied'; end if;
  select * into d from public.graduation_project_discussions where project_id = p_project_id for update;
  select count(*) into v_count from public.graduation_project_panel_members where discussion_id = d.id;
  if v_count < 2 then raise exception 'at least two committee members required'; end if;
  update public.graduation_project_discussions set state = 'held', held_at = now() where id = d.id;
  update public.graduation_projects set lifecycle_state = 'evaluating', version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'defense_held', 'graduation_project_discussions', d.id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create function public.submit_graduation_project_evaluation(
  p_project_id uuid, p_score numeric, p_notes text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; d public.graduation_project_discussions;
  pm public.graduation_project_panel_members; e_id uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['panel_member']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('score', p_score, 'notes', p_notes);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'evaluation_submitted', v_req);
  if v_replay is not null then return v_replay; end if;
  if p.lifecycle_state <> 'evaluating' then raise exception 'evaluation state denied'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'evaluation score invalid'; end if;
  select * into d from public.graduation_project_discussions where project_id = p_project_id and state = 'held';
  if d.id is null then raise exception 'defense not held'; end if;
  select * into pm from public.graduation_project_panel_members
    where discussion_id = d.id and assignment_id = a.id and project_id = p_project_id;
  if pm.id is null then raise exception 'committee panel assignment required'; end if;
  if exists (select 1 from public.graduation_project_evaluations where discussion_id = d.id and panel_member_id = pm.id and state = 'submitted') then
    raise exception 'evaluation already submitted';
  end if;
  insert into public.graduation_project_evaluations(project_id, discussion_id, panel_member_id, score, notes, state, submitted_at)
    values (p_project_id, d.id, pm.id, p_score, p_notes, 'submitted', now())
  on conflict (discussion_id, panel_member_id) do update
    set score = excluded.score, notes = excluded.notes, state = 'submitted', submitted_at = now()
    where public.graduation_project_evaluations.state = 'draft'
  returning id into e_id;
  if e_id is null then raise exception 'evaluation already submitted'; end if;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'evaluation_submitted', 'graduation_project_evaluations', e_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'score', p_score));
  return e_id;
end $$;

create function public.conclude_graduation_project_result(
  p_project_id uuid, p_decision text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; d public.graduation_project_discussions;
  v_avg numeric(5,2); v_panel int; v_submitted int; v_dec public.graduation_project_final_decision; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('decision', p_decision, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'result_concluded', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'evaluating' then raise exception 'result conclusion state denied'; end if;
  begin v_dec := p_decision::public.graduation_project_final_decision;
  exception when invalid_text_representation then raise exception 'final decision invalid'; end;
  if v_dec not in ('passed','revisions_required','failed') then raise exception 'final decision invalid'; end if;
  select * into d from public.graduation_project_discussions where project_id = p_project_id and state = 'held';
  select count(*) into v_panel from public.graduation_project_panel_members where discussion_id = d.id;
  select count(*) into v_submitted from public.graduation_project_evaluations where discussion_id = d.id and state = 'submitted';
  if v_panel < 2 or v_submitted <> v_panel then raise exception 'all committee evaluations required'; end if;
  select round(avg(score), 2) into v_avg from public.graduation_project_evaluations where discussion_id = d.id and state = 'submitted';
  update public.graduation_projects set final_decision = v_dec, average_score = v_avg, version = version + 1, updated_at = now()
    where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'result_concluded', 'graduation_projects', p_project_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'final_decision', v_dec::text, 'average_score', v_avg));
  return p_project_id;
end $$;

create function public.archive_graduation_project(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; f public.graduation_project_files;
  v_id uuid; v_snap jsonb; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'project_archived', v_req);
  if v_replay is not null then return v_replay; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.final_decision is null or p.final_decision not in ('passed','failed') then raise exception 'project not archive-ready'; end if;
  if p.lifecycle_state = 'archived' then raise exception 'project already archived'; end if;
  select * into f from public.graduation_project_files
    where project_id = p_project_id and category = 'final' and is_current and upload_status = 'active' and scan_state = 'clean';
  if f.id is null then raise exception 'clean current final file required'; end if;
  select jsonb_build_object(
    'team', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', x.id, 'user_id', x.user_id, 'is_leader', x.is_leader, 'active', x.active))
      from public.graduation_project_assignments x where x.project_id = p_project_id and x.role = 'student'), '[]'::jsonb),
    'leader_user_id', (select user_id from public.graduation_project_assignments where project_id = p_project_id and role = 'student' and is_leader and active limit 1),
    'supervisor', (select jsonb_build_object('assignment_id', x.id, 'user_id', x.user_id, 'status', x.supervision_status)
      from public.graduation_project_assignments x where x.project_id = p_project_id and x.role = 'supervisor' and x.active and x.supervision_status = 'accepted' limit 1),
    'committee', coalesce((select jsonb_agg(jsonb_build_object('panel_member_id', pm.id, 'user_id', asg.user_id))
      from public.graduation_project_panel_members pm join public.graduation_project_assignments asg on asg.id = pm.assignment_id
      join public.graduation_project_discussions dd on dd.id = pm.discussion_id where dd.project_id = p_project_id), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('evaluation_id', ev.id, 'panel_member_id', ev.panel_member_id, 'score', ev.score, 'notes', ev.notes))
      from public.graduation_project_evaluations ev join public.graduation_project_discussions dd on dd.id = ev.discussion_id
      where dd.project_id = p_project_id and ev.state = 'submitted'), '[]'::jsonb),
    'final_decision', p.final_decision::text,
    'average_score', p.average_score,
    'final_file', jsonb_build_object('file_id', f.id, 'object_key', f.object_key, 'sha256', f.sha256),
    'title', p.title, 'problem_statement', p.problem_statement, 'objectives', p.objectives, 'summary', p.summary
  ) into v_snap;
  insert into public.graduation_project_final_archives(project_id, final_file_id, archived_by_assignment_id, snapshot, average_score, final_decision, correlation_id)
    values (p_project_id, f.id, a.id, v_snap, p.average_score, p.final_decision, p_correlation_id) returning id into v_id;
  update public.graduation_projects set lifecycle_state = 'archived', archived_at = now(), version = version + 1, updated_at = now() where id = p_project_id;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'project_archived', 'graduation_project_final_archives', v_id, p_correlation_id,
      jsonb_build_object('request', v_req));
  return v_id;
end $$;

create function public.list_my_graduation_projects()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.updated_at desc), '[]'::jsonb) into v
  from (
    select p.id as project_id, p.department_id, p.title, p.lifecycle_state::text, p.final_decision::text,
      p.version, p.updated_at,
      coalesce((select jsonb_agg(distinct a.role::text) from public.graduation_project_assignments a
        where a.project_id = p.id and a.user_id = auth.uid() and a.active), '[]'::jsonb) as roles
    from public.graduation_projects p
    where exists (
      select 1 from public.graduation_project_assignments a
      where a.project_id = p.id and a.user_id = auth.uid() and a.active
    )
  ) t;
  return v;
end $$;

create function public.get_graduation_project_detail(p_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p public.graduation_projects; v_roles text[]; v_is_coord boolean; v_is_panel boolean; v_own_eval jsonb; v_agg jsonb; v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
  ) then raise exception 'exact direct processing assignment required'; end if;
  select array_agg(distinct a.role::text) into v_roles from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active;
  v_is_coord := 'coordinator' = any (v_roles);
  v_is_panel := 'panel_member' = any (v_roles);
  if v_is_panel then
    select jsonb_build_object('evaluation_id', e.id, 'score', e.score, 'notes', e.notes, 'state', e.state)
      into v_own_eval
    from public.graduation_project_evaluations e
    join public.graduation_project_panel_members pm on pm.id = e.panel_member_id
    join public.graduation_project_assignments asg on asg.id = pm.assignment_id
    where e.project_id = p_project_id and asg.user_id = auth.uid()
    order by e.submitted_at desc nulls last limit 1;
  end if;
  if v_is_coord then
    select jsonb_build_object(
      'submitted_count', count(*) filter (where e.state = 'submitted'),
      'average_score', p.average_score
    ) into v_agg
    from public.graduation_project_discussions d
    left join public.graduation_project_evaluations e on e.discussion_id = d.id
    where d.project_id = p_project_id;
  end if;
  select jsonb_build_object(
    'project_id', p.id, 'department_id', p.department_id, 'title', p.title,
    'problem_statement', p.problem_statement, 'objectives', p.objectives, 'summary', p.summary,
    'lifecycle_state', p.lifecycle_state::text, 'final_decision', p.final_decision::text,
    'average_score', case when v_is_coord then p.average_score else null end,
    'version', p.version,
    'team', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', x.id, 'user_id', x.user_id, 'is_leader', x.is_leader, 'active', x.active
      )) from public.graduation_project_assignments x where x.project_id = p_project_id and x.role = 'student'), '[]'::jsonb),
    'supervisor', (select jsonb_build_object('user_id', x.user_id, 'status', x.supervision_status::text, 'active', x.active)
      from public.graduation_project_assignments x
      where x.project_id = p_project_id and x.role = 'supervisor' and x.active
        and x.supervision_status in ('pending','accepted') limit 1),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'version_no', pe.version_no, 'summary', pe.summary, 'state', pe.state, 'review_comments', pe.review_comments
      ) order by pe.version_no) from public.graduation_project_progress_entries pe where pe.project_id = p_project_id), '[]'::jsonb),
    'final_file', (select jsonb_build_object('file_id', ff.id, 'scan_state', ff.scan_state::text, 'is_current', ff.is_current, 'upload_status', ff.upload_status::text)
      from public.graduation_project_files ff where ff.project_id = p_project_id and ff.category = 'final' and ff.is_current limit 1),
    'proposal_file', (select jsonb_build_object('file_id', pf.id, 'scan_state', pf.scan_state::text, 'is_current', pf.is_current)
      from public.graduation_project_files pf where pf.project_id = p_project_id and pf.category = 'proposal' and pf.is_current limit 1),
    'defense', (select jsonb_build_object('discussion_id', dd.id, 'starts_at', dd.starts_at, 'venue', dd.venue, 'state', dd.state)
      from public.graduation_project_discussions dd where dd.project_id = p_project_id),
    'own_evaluation', v_own_eval,
    'evaluation_aggregate', v_agg,
    'viewer_roles', to_jsonb(v_roles)
  ) into v;
  return v;
end $$;

create function public.list_administration_graduation_projects_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  if not exists (
    select 1 from public.graduation_project_department_coordinators c
    where c.user_id = auth.uid() and c.active and c.ended_at is null
  ) then raise exception 'administration graduation-project viewer capability required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'project_id', p.id, 'department_id', p.department_id, 'title', p.title,
    'lifecycle_state', p.lifecycle_state::text, 'final_decision', p.final_decision::text, 'archived_at', p.archived_at
  ) order by p.created_at desc), '[]'::jsonb) into v
  from public.graduation_projects p
  where exists (
    select 1 from public.graduation_project_department_coordinators c
    where c.user_id = auth.uid() and c.active and c.department_id = p.department_id
  );
  return v;
end $$;

revoke all on function public.gp_assert_version(public.graduation_projects, bigint) from public, anon, authenticated;
revoke all on function public.gp_proposal_complete(public.graduation_projects) from public, anon, authenticated;
revoke all on function public.gp_has_current_clean_file(uuid, public.graduation_project_file_category) from public, anon, authenticated;
revoke all on function public.gp_team_mutator(uuid) from public, anon, authenticated;

revoke all on function public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.add_graduation_project_team_member(uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.remove_graduation_project_team_member(uuid,uuid,uuid) from public, anon;
revoke all on function public.upsert_graduation_project_proposal(uuid,text,text,text,text,bigint,uuid) from public, anon;
revoke all on function public.submit_graduation_project_proposal(uuid,bigint,uuid) from public, anon;
revoke all on function public.resubmit_graduation_project_proposal(uuid,bigint,uuid) from public, anon;
revoke all on function public.review_graduation_project_proposal(uuid,text,text,bigint,uuid) from public, anon;
revoke all on function public.assign_graduation_project_supervisor(uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.respond_graduation_project_supervision(uuid,text,bigint,uuid) from public, anon;
revoke all on function public.submit_graduation_project_progress(uuid,text,uuid,uuid) from public, anon;
revoke all on function public.review_graduation_project_progress(uuid,text,text,uuid) from public, anon;
revoke all on function public.submit_graduation_project_final(uuid,uuid,bigint,uuid) from public, anon;
revoke all on function public.review_graduation_project_final(uuid,text,text,bigint,uuid) from public, anon;
revoke all on function public.schedule_graduation_project_defense(uuid,timestamptz,text,bigint,uuid) from public, anon;
revoke all on function public.assign_graduation_project_committee_member(uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.mark_graduation_project_defense_held(uuid,bigint,uuid) from public, anon;
revoke all on function public.submit_graduation_project_evaluation(uuid,numeric,text,uuid) from public, anon;
revoke all on function public.conclude_graduation_project_result(uuid,text,bigint,uuid) from public, anon;
revoke all on function public.archive_graduation_project(uuid,bigint,uuid) from public, anon;
revoke all on function public.list_my_graduation_projects() from public, anon;
revoke all on function public.get_graduation_project_detail(uuid) from public, anon;
revoke all on function public.list_administration_graduation_projects_overview() from public, anon;

grant execute on function public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.add_graduation_project_team_member(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.remove_graduation_project_team_member(uuid,uuid,uuid) to authenticated;
grant execute on function public.upsert_graduation_project_proposal(uuid,text,text,text,text,bigint,uuid) to authenticated;
grant execute on function public.submit_graduation_project_proposal(uuid,bigint,uuid) to authenticated;
grant execute on function public.resubmit_graduation_project_proposal(uuid,bigint,uuid) to authenticated;
grant execute on function public.review_graduation_project_proposal(uuid,text,text,bigint,uuid) to authenticated;
grant execute on function public.assign_graduation_project_supervisor(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.respond_graduation_project_supervision(uuid,text,bigint,uuid) to authenticated;
grant execute on function public.submit_graduation_project_progress(uuid,text,uuid,uuid) to authenticated;
grant execute on function public.review_graduation_project_progress(uuid,text,text,uuid) to authenticated;
grant execute on function public.submit_graduation_project_final(uuid,uuid,bigint,uuid) to authenticated;
grant execute on function public.review_graduation_project_final(uuid,text,text,bigint,uuid) to authenticated;
grant execute on function public.schedule_graduation_project_defense(uuid,timestamptz,text,bigint,uuid) to authenticated;
grant execute on function public.assign_graduation_project_committee_member(uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.mark_graduation_project_defense_held(uuid,bigint,uuid) to authenticated;
grant execute on function public.submit_graduation_project_evaluation(uuid,numeric,text,uuid) to authenticated;
grant execute on function public.conclude_graduation_project_result(uuid,text,bigint,uuid) to authenticated;
grant execute on function public.archive_graduation_project(uuid,bigint,uuid) to authenticated;
grant execute on function public.list_my_graduation_projects() to authenticated;
grant execute on function public.get_graduation_project_detail(uuid) to authenticated;
grant execute on function public.list_administration_graduation_projects_overview() to authenticated;