-- GP-1A: pinning columns
ALTER TABLE public.graduation_projects
  ADD COLUMN IF NOT EXISTS policy_id uuid REFERENCES public.graduation_project_policies(id),
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS policy_pinned_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_pin_source text;

-- Immutability of the pin
CREATE OR REPLACE FUNCTION public.gp_guard_policy_pin_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF OLD.policy_snapshot IS NOT NULL AND NEW.policy_snapshot IS DISTINCT FROM OLD.policy_snapshot THEN
    RAISE EXCEPTION 'graduation project policy snapshot is immutable';
  END IF;
  IF OLD.policy_id IS NOT NULL AND NEW.policy_id IS DISTINCT FROM OLD.policy_id THEN
    RAISE EXCEPTION 'graduation project policy pin is immutable';
  END IF;
  IF OLD.policy_pinned_at IS NOT NULL AND NEW.policy_pinned_at IS DISTINCT FROM OLD.policy_pinned_at THEN
    RAISE EXCEPTION 'graduation project policy pin is immutable';
  END IF;
  IF OLD.policy_pin_source IS NOT NULL AND NEW.policy_pin_source IS DISTINCT FROM OLD.policy_pin_source THEN
    RAISE EXCEPTION 'graduation project policy pin is immutable';
  END IF;
  IF NEW.policy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.graduation_project_policies gp
    WHERE gp.id = NEW.policy_id AND gp.status IN ('published','superseded')
  ) THEN
    RAISE EXCEPTION 'only published policy versions may be pinned';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_gp_policy_pin_immutable ON public.graduation_projects;
CREATE TRIGGER tg_gp_policy_pin_immutable
  BEFORE UPDATE ON public.graduation_projects
  FOR EACH ROW EXECUTE FUNCTION public.gp_guard_policy_pin_immutable();

-- Published policy rows are immutable (except lifecycle transition to superseded)
CREATE OR REPLACE FUNCTION public.gp_guard_published_policy_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF OLD.status = 'published' THEN
    IF (NEW.min_team_size, NEW.max_team_size, NEW.allow_co_supervisor, NEW.max_supervisors,
        NEW.required_progress_reports, NEW.min_committee_members, NEW.max_committee_members,
        NEW.passing_score, NEW.max_revision_rounds, NEW.proposal_window_start, NEW.proposal_window_end,
        NEW.defense_window_start, NEW.defense_window_end, NEW.department_id, NEW.academic_year_id, NEW.version)
       IS DISTINCT FROM
       (OLD.min_team_size, OLD.max_team_size, OLD.allow_co_supervisor, OLD.max_supervisors,
        OLD.required_progress_reports, OLD.min_committee_members, OLD.max_committee_members,
        OLD.passing_score, OLD.max_revision_rounds, OLD.proposal_window_start, OLD.proposal_window_end,
        OLD.defense_window_start, OLD.defense_window_end, OLD.department_id, OLD.academic_year_id, OLD.version)
    THEN
      RAISE EXCEPTION 'published graduation project policy is immutable; publish a new version instead';
    END IF;
    IF NEW.status NOT IN ('published','superseded') THEN
      RAISE EXCEPTION 'published policy may only be superseded';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_gp_published_policy_immutable ON public.graduation_project_policies;
CREATE TRIGGER tg_gp_published_policy_immutable
  BEFORE UPDATE ON public.graduation_project_policies
  FOR EACH ROW EXECUTE FUNCTION public.gp_guard_published_policy_immutable();

-- GP-1D: single runtime accessor reading the pinned snapshot
CREATE OR REPLACE FUNCTION public.gp_project_policy(p_project_id uuid)
RETURNS public.graduation_project_policies
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r public.graduation_project_policies; snap jsonb; p public.graduation_projects;
BEGIN
  SELECT * INTO p FROM public.graduation_projects WHERE id = p_project_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'project not found'; END IF;
  snap := p.policy_snapshot;
  IF snap IS NULL THEN
    -- Not yet pinned (should not happen after backfill): pin-on-read is not allowed.
    RAISE EXCEPTION 'graduation project policy is not pinned';
  END IF;
  r := jsonb_populate_record(NULL::public.graduation_project_policies, snap);
  RETURN r;
END $$;

-- GP-1C: backfill existing projects at cutover
DO $backfill$
DECLARE r record; pol public.graduation_project_policies;
BEGIN
  FOR r IN SELECT id, department_id, academic_year_id FROM public.graduation_projects WHERE policy_snapshot IS NULL LOOP
    pol := public.gp_effective_policy(r.department_id, r.academic_year_id);
    UPDATE public.graduation_projects
      SET policy_snapshot = to_jsonb(pol),
          policy_id = pol.id,
          policy_pinned_at = now(),
          policy_pin_source = CASE WHEN pol.id IS NULL
            THEN 'BUILTIN_DEFAULT_AT_CUTOVER' ELSE 'CURRENT_EFFECTIVE_POLICY_AT_CUTOVER' END
      WHERE id = r.id;
  END LOOP;
END $backfill$;

-- GP-1B: pin at creation
CREATE OR REPLACE FUNCTION public.create_graduation_project_team(p_department_id uuid, p_leader_student_profile_id uuid, p_leader_user_id uuid, p_program_id uuid, p_academic_year_id uuid, p_semester_id uuid, p_correlation_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
declare
  c public.graduation_project_department_coordinators;
  v_id uuid; v_coord uuid; v_leader uuid; v_replay uuid; v_payload jsonb; v_req jsonb;
  pol public.graduation_project_policies;
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

  if not exists (
    select 1 from public.programs pr
    where pr.id = p_program_id
      and pr.department_id = p_department_id
      and coalesce(pr.is_active, false) = true
  ) then
    raise exception 'program department mismatch';
  end if;

  if to_regprocedure('public.require_student_gp_fourth_level_eligibility(uuid)') is not null then
    perform public.require_student_gp_fourth_level_eligibility(p_leader_student_profile_id);
  end if;

  pol := public.gp_effective_policy(p_department_id, p_academic_year_id);

  insert into public.graduation_projects(
      department_id, program_id, academic_year_id, semester_id, lifecycle_state,
      policy_id, policy_snapshot, policy_pinned_at, policy_pin_source)
    values (p_department_id, p_program_id, p_academic_year_id, p_semester_id, 'draft',
      pol.id, to_jsonb(pol), now(),
      case when pol.id is null then 'BUILTIN_DEFAULT_AT_CREATE' else 'PUBLISHED_POLICY_AT_CREATE' end)
    returning id into v_id;
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
      jsonb_build_object('leader_assignment_id', v_leader, 'coordinator_assignment_id', v_coord, 'request', v_req,
        'policy_id', pol.id, 'policy_pin_source', case when pol.id is null then 'BUILTIN_DEFAULT_AT_CREATE' else 'PUBLISHED_POLICY_AT_CREATE' end));
  return v_id;
end $function$;

-- GP-1D: runtime reads switch to the pinned policy
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

  pol := public.gp_project_policy(p_project_id);
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

  pol := public.gp_project_policy(p_project_id);
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

  pol := public.gp_project_policy(p_project_id);
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