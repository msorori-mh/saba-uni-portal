-- DRAFT MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL FROM THE OWNER
-- Package: GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01
--
-- Owner decisions (2026-10-06):
--   1. Students form the team; the department head approves it.
--   2. The department head assigns the supervisor from any college faculty
--      member (himself included). The assignment is final: no accept/decline.
--   3. The proposal is reviewed by the supervisor, then approved by the
--      department head.
--   4. When the department head supervises a project himself, the project's
--      coordinator authority (proposal approval, committee, defence, result)
--      moves to the vice dean for academic affairs.
--
-- Shape: additive. Existing RPCs keep their bodies. The new rules are enforced
-- by two triggers so that the legacy RPCs cannot bypass them:
--   * graduation_projects: proposal submit needs an approved team + supervisor;
--     head approval needs the supervisor's endorsement; an approved proposal
--     with an accepted supervisor becomes active immediately.
--   * graduation_project_assignments: faculty roles are no longer bound to the
--     project's department (college-wide supervisors, vice-dean coordinator);
--     students cannot change the team after the head approved it.
begin;

do $$ begin
  if to_regclass('public.graduation_projects') is null
     or to_regclass('public.graduation_project_assignments') is null then
    raise exception 'GP_HEAD_WF_FOUNDATION_MISSING';
  end if;
  if to_regclass('public.organizational_positions') is null
     or to_regclass('public.position_assignments') is null then
    raise exception 'GP_HEAD_WF_POSITIONS_MISSING';
  end if;
  if to_regprocedure('public.require_student_gp_fourth_level_eligibility(uuid)') is null
     or to_regprocedure('public.gp_effective_policy(uuid,uuid)') is null
     or to_regprocedure('public.gp_take_replay(uuid,uuid,text,jsonb)') is null then
    raise exception 'GP_HEAD_WF_PREREQUISITE_FUNCTIONS_MISSING';
  end if;
end $$;

-- =============================================================================
-- 1. Workflow columns
-- =============================================================================
alter table public.graduation_projects
  add column if not exists team_submitted_at timestamptz,
  add column if not exists team_approved_at timestamptz,
  add column if not exists team_approved_by uuid references auth.users(id) on delete restrict,
  add column if not exists proposal_supervisor_endorsed_at timestamptz;

-- Projects that already left the draft stage were approved under the old flow.
update public.graduation_projects
   set team_approved_at = coalesce(approved_at, created_at),
       proposal_supervisor_endorsed_at = coalesce(approved_at, created_at)
 where team_approved_at is null
   and lifecycle_state not in ('draft');

-- =============================================================================
-- 2. Authority helpers (positions are the single source of truth)
-- =============================================================================
create or replace function public.gp_department_head_user(p_department_id uuid)
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select pa.user_id
  from public.position_assignments pa
  join public.organizational_positions op on op.id = pa.position_id
  where op.is_department_head_position
    and op.is_active
    and op.department_id = p_department_id
    and pa.is_active
    and (pa.assigned_to is null or pa.assigned_to >= current_date)
  order by pa.assigned_from desc, pa.id
  limit 1
$$;

create or replace function public.gp_vice_dean_academic_user()
returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select pa.user_id
  from public.position_assignments pa
  join public.organizational_positions op on op.id = pa.position_id
  where op.code = 'vice_dean_academic'
    and op.is_active
    and pa.is_active
    and (pa.assigned_to is null or pa.assigned_to >= current_date)
  order by pa.assigned_from desc, pa.id
  limit 1
$$;

-- True when the caller manages graduation projects of the department:
-- the department head by position, or an explicitly delegated coordinator.
create or replace function public.gp_caller_manages_department(p_department_id uuid)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and (
    public.gp_department_head_user(p_department_id) = auth.uid()
    or exists (
      select 1 from public.graduation_project_department_coordinators c
      where c.department_id = p_department_id and c.user_id = auth.uid()
        and c.active and c.ended_at is null
    )
  )
$$;

-- Returns the caller's faculty profile id, or raises when the caller does not
-- manage the department's graduation projects.
create or replace function public.gp_require_department_manager(p_department_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_fp uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  if not public.gp_caller_manages_department(p_department_id) then
    raise exception 'department graduation-project manager capability required';
  end if;
  select fp.id into v_fp from public.faculty_profiles fp where fp.user_id = auth.uid() limit 1;
  if v_fp is null then raise exception 'manager faculty profile required'; end if;
  return v_fp;
end $$;

-- Faculty profile id of the user who should coordinate a NEW project of the
-- department (the head, else the delegated coordinator). Null when none.
create or replace function public.gp_department_manager_faculty(p_department_id uuid)
returns table(user_id uuid, faculty_profile_id uuid)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.user_id, x.faculty_profile_id from (
    select fp.user_id, fp.id as faculty_profile_id, 0 as ord
    from public.faculty_profiles fp
    where fp.user_id = public.gp_department_head_user(p_department_id)
    union all
    select c.user_id, c.faculty_profile_id, 1
    from public.graduation_project_department_coordinators c
    where c.department_id = p_department_id and c.active and c.ended_at is null
  ) x
  order by x.ord
  limit 1
$$;

-- Makes p_user_id the single active coordinator of the project.
create or replace function public.gp_set_project_coordinator(
  p_project_id uuid, p_department_id uuid, p_user_id uuid, p_faculty_profile_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  select id into v_id from public.graduation_project_assignments
   where project_id = p_project_id and role = 'coordinator' and active and user_id = p_user_id;
  update public.graduation_project_assignments
     set active = false, ended_at = now()
   where project_id = p_project_id and role = 'coordinator' and active
     and user_id <> p_user_id;
  if v_id is null then
    insert into public.graduation_project_assignments(
        project_id, role, faculty_profile_id, user_id, department_id, assigned_by)
      values (p_project_id, 'coordinator', p_faculty_profile_id, p_user_id, p_department_id, auth.uid())
      returning id into v_id;
  end if;
  return v_id;
end $$;

-- =============================================================================
-- 3. Assignment guard: college-wide faculty roles + team lock after approval
-- =============================================================================
create or replace function public.guard_graduation_project_assignment()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_user uuid; v_department uuid; v_team_approved timestamptz;
begin
  if new.student_profile_id is not null then
    select user_id, department_id into v_user, v_department
      from public.student_profiles where id = new.student_profile_id;
    if v_user is null or v_user <> new.user_id
       or v_department is null or v_department <> new.department_id then
      raise exception 'assignment identity/department mismatch';
    end if;
  elsif new.faculty_profile_id is not null then
    -- Faculty roles (supervisor, coordinator, panel member) may come from any
    -- department of the college; only the identity binding is enforced. The
    -- project/department pairing is still enforced by the composite FK.
    select user_id into v_user from public.faculty_profiles where id = new.faculty_profile_id;
    if v_user is null or v_user <> new.user_id then
      raise exception 'assignment identity/department mismatch';
    end if;
  else
    raise exception 'assignment identity/department mismatch';
  end if;

  -- After the head approved the team only the project coordinator may change
  -- its student membership.
  if new.role = 'student' and auth.uid() is not null
     and (tg_op = 'INSERT' or (old.active and not new.active)) then
    select team_approved_at into v_team_approved
      from public.graduation_projects where id = new.project_id;
    if v_team_approved is not null and not exists (
      select 1 from public.graduation_project_assignments c
      where c.project_id = new.project_id and c.role = 'coordinator'
        and c.active and c.user_id = auth.uid()
    ) then
      raise exception 'graduation project team is locked after approval';
    end if;
  end if;
  return new;
end $$;

-- =============================================================================
-- 4. Lifecycle guard on graduation_projects
-- =============================================================================
create or replace function public.gp_enforce_department_head_workflow()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare v_has_supervisor boolean;
begin
  if new.lifecycle_state is not distinct from old.lifecycle_state then
    return new;
  end if;

  select exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = new.id and a.role = 'supervisor' and a.active
      and a.supervision_status = 'accepted'
  ) into v_has_supervisor;

  if new.lifecycle_state = 'submitted' and old.lifecycle_state in ('draft','revision_required') then
    if new.team_approved_at is null then
      raise exception 'graduation project team approval required before proposal';
    end if;
    if not v_has_supervisor then
      raise exception 'graduation project supervisor required before proposal';
    end if;
    -- Every (re)submission needs a fresh supervisor endorsement.
    new.proposal_supervisor_endorsed_at := null;
  elsif new.lifecycle_state = 'approved' and old.lifecycle_state = 'submitted' then
    if new.proposal_supervisor_endorsed_at is null then
      raise exception 'supervisor endorsement required before proposal approval';
    end if;
    -- The supervisor is already assigned and final: start the project.
    if v_has_supervisor then
      new.lifecycle_state := 'active';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tg_gp_enforce_department_head_workflow on public.graduation_projects;
create trigger tg_gp_enforce_department_head_workflow
  before update of lifecycle_state on public.graduation_projects
  for each row execute function public.gp_enforce_department_head_workflow();

-- =============================================================================
-- 5. Student: create own team (leader), add members, submit team
-- =============================================================================
create or replace function public.student_create_graduation_project_team(p_correlation_id uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  sp public.student_profiles;
  v_year uuid; v_sem uuid; v_id uuid; v_leader uuid; v_replay uuid;
  m record; pol public.graduation_project_policies;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  if p_correlation_id is null then raise exception 'correlation id required'; end if;
  select * into sp from public.student_profiles where user_id = auth.uid() limit 1;
  if sp.id is null then raise exception 'student profile required'; end if;

  select e.entity_id into v_replay from public.graduation_project_events e
   where e.correlation_id = p_correlation_id and e.event_type = 'team_created'
     and e.actor_user_id = auth.uid() limit 1;
  if v_replay is not null then return v_replay; end if;

  perform public.require_student_gp_fourth_level_eligibility(sp.id);
  if sp.department_id is null or sp.program_id is null then
    raise exception 'student program/department required';
  end if;
  if not exists (
    select 1 from public.programs pr
    where pr.id = sp.program_id and pr.department_id = sp.department_id
      and coalesce(pr.is_active, false)
  ) then
    raise exception 'program department mismatch';
  end if;

  select s.id, s.academic_year_id into v_sem, v_year
    from public.semesters s where s.is_current order by s.start_date desc limit 1;
  if v_sem is null then raise exception 'current semester required'; end if;

  select * into m from public.gp_department_manager_faculty(sp.department_id);
  if m.user_id is null or m.faculty_profile_id is null then
    raise exception 'department graduation-project manager not configured';
  end if;

  pol := public.gp_effective_policy(sp.department_id, v_year);

  insert into public.graduation_projects(
      department_id, program_id, academic_year_id, semester_id, lifecycle_state,
      policy_id, policy_snapshot, policy_pinned_at, policy_pin_source)
    values (sp.department_id, sp.program_id, v_year, v_sem, 'draft',
      pol.id, to_jsonb(pol), now(), 'PUBLISHED_POLICY_AT_CREATE')
    returning id into v_id;
  begin
    insert into public.graduation_project_assignments(
        project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by)
      values (v_id, 'student', sp.id, auth.uid(), sp.department_id, true, auth.uid())
      returning id into v_leader;
  exception when unique_violation then
    raise exception 'student already has an active graduation project team';
  end;
  perform public.gp_set_project_coordinator(v_id, sp.department_id, m.user_id, m.faculty_profile_id);

  insert into public.graduation_project_events(
      project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
      correlation_id, payload)
    values (v_id, auth.uid(), v_leader, 'team_created', 'graduation_projects', v_id,
      p_correlation_id,
      jsonb_build_object('created_by', 'student_leader', 'leader_assignment_id', v_leader,
        'policy_id', pol.id, 'policy_pin_source', 'PUBLISHED_POLICY_AT_CREATE'));
  return v_id;
end $$;

-- Candidates the leader may add: same program, current level 4, with a login
-- account and no active team. No account identifiers are returned.
create or replace function public.gp_list_team_candidates(p_project_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare p public.graduation_projects; v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
      and ((a.role = 'student' and a.is_leader) or a.role = 'coordinator')
  ) then
    raise exception 'exact direct processing assignment required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_profile_id', s.id, 'full_name_ar', s.full_name_ar,
      'academic_number', s.academic_number) order by s.full_name_ar), '[]'::jsonb)
    into v
  from public.student_profiles s
  where s.program_id = p.program_id
    and s.department_id = p.department_id
    and s.user_id is not null
    and public.student_is_current_fourth_academic_level(s.id)
    and not exists (
      select 1 from public.graduation_project_assignments a
      where a.user_id = s.user_id and a.role = 'student' and a.active
    );
  return v;
end $$;

-- Adds a member by student profile only; the account is resolved server-side
-- and authorisation stays in add_graduation_project_team_member.
create or replace function public.gp_add_team_member_by_profile(
  p_project_id uuid, p_student_profile_id uuid, p_correlation_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_user uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select user_id into v_user from public.student_profiles where id = p_student_profile_id;
  if v_user is null then raise exception 'student login account required'; end if;
  return public.add_graduation_project_team_member(
    p_project_id, p_student_profile_id, v_user, p_correlation_id);
end $$;

create or replace function public.gp_submit_team_for_approval(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  pol public.graduation_project_policies; v_members int; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_leader(p_project_id);
  v_req := jsonb_build_object('expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'team_submitted', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'draft' then raise exception 'team submission state denied'; end if;
  if p.team_approved_at is not null then raise exception 'team already approved'; end if;
  if p.team_submitted_at is not null then raise exception 'team already submitted'; end if;
  pol := public.gp_project_policy(p_project_id);
  select count(*) into v_members from public.graduation_project_assignments
   where project_id = p_project_id and role = 'student' and active;
  if v_members < coalesce(pol.min_team_size, 1) then
    raise exception 'graduation project team size below configured minimum';
  end if;
  update public.graduation_projects
     set team_submitted_at = now(), version = version + 1, updated_at = now()
   where id = p_project_id;
  insert into public.graduation_project_events(
      project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
      correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'team_submitted', 'graduation_projects', p_project_id,
      p_correlation_id, jsonb_build_object('request', v_req, 'members', v_members));
  return p_project_id;
end $$;

-- =============================================================================
-- 6. Department head: return team, approve team + assign supervisor (final)
-- =============================================================================
create or replace function public.gp_return_team(
  p_project_id uuid, p_reason text, p_expected_version bigint, p_correlation_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare p public.graduation_projects; v_fp uuid; v_coord uuid; v_req jsonb; v_replay uuid;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  v_fp := public.gp_require_department_manager(p.department_id);
  v_req := jsonb_build_object('reason', p_reason, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'team_returned', v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'draft' or p.team_submitted_at is null or p.team_approved_at is not null then
    raise exception 'team return state denied';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'review reason required'; end if;
  select id into v_coord from public.graduation_project_assignments
   where project_id = p_project_id and role = 'coordinator' and active and user_id = auth.uid();
  update public.graduation_projects
     set team_submitted_at = null, version = version + 1, updated_at = now()
   where id = p_project_id;
  insert into public.graduation_project_events(
      project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
      reason, correlation_id, payload)
    values (p_project_id, auth.uid(), v_coord, 'team_returned', 'graduation_projects', p_project_id,
      btrim(p_reason), p_correlation_id, jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

create or replace function public.gp_approve_team_and_assign_supervisor(
  p_project_id uuid, p_supervisor_faculty_profile_id uuid,
  p_expected_version bigint, p_correlation_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  p public.graduation_projects; sup public.faculty_profiles;
  v_manager_fp uuid; v_vd uuid; v_vd_fp uuid; v_coord uuid; v_sup uuid;
  v_req jsonb; v_replay uuid; v_first boolean;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  v_manager_fp := public.gp_require_department_manager(p.department_id);
  v_req := jsonb_build_object('supervisor_faculty_profile_id', p_supervisor_faculty_profile_id,
    'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, 'supervisor_assigned', v_req);
  if v_replay is not null then return v_replay; end if;
  perform public.gp_assert_version(p, p_expected_version);

  if p.lifecycle_state in ('rejected','archived','completed','cancelled') then
    raise exception 'supervisor assignment state denied';
  end if;
  v_first := p.team_approved_at is null;
  if v_first and (p.lifecycle_state <> 'draft' or p.team_submitted_at is null) then
    raise exception 'team approval requires a submitted team';
  end if;

  select * into sup from public.faculty_profiles where id = p_supervisor_faculty_profile_id;
  if sup.id is null or sup.user_id is null or sup.status is distinct from 'active' then
    raise exception 'supervisor must be an active faculty member with a login account';
  end if;

  -- Coordinator authority: the head, unless he supervises the project himself.
  if sup.user_id = auth.uid() then
    v_vd := public.gp_vice_dean_academic_user();
    if v_vd is null then
      raise exception 'vice dean for academic affairs is not configured';
    end if;
    if v_vd = auth.uid() then
      raise exception 'self supervision requires a different approving authority';
    end if;
    select id into v_vd_fp from public.faculty_profiles where user_id = v_vd limit 1;
    if v_vd_fp is null then
      raise exception 'vice dean for academic affairs has no faculty profile';
    end if;
    v_coord := public.gp_set_project_coordinator(p_project_id, p.department_id, v_vd, v_vd_fp);
  else
    v_coord := public.gp_set_project_coordinator(p_project_id, p.department_id, auth.uid(), v_manager_fp);
  end if;

  update public.graduation_project_assignments
     set active = false, ended_at = now(),
         supervision_status = case when supervision_status = 'pending' then 'declined' else supervision_status end
   where project_id = p_project_id and role = 'supervisor' and active;
  insert into public.graduation_project_assignments(
      project_id, role, faculty_profile_id, user_id, department_id, supervision_status, assigned_by)
    values (p_project_id, 'supervisor', sup.id, sup.user_id, p.department_id, 'accepted', auth.uid())
    returning id into v_sup;

  update public.graduation_projects
     set team_approved_at = coalesce(team_approved_at, now()),
         team_approved_by = coalesce(team_approved_by, auth.uid()),
         version = version + 1, updated_at = now()
   where id = p_project_id;

  if v_first then
    insert into public.graduation_project_events(
        project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
        correlation_id, payload)
      values (p_project_id, auth.uid(), null, 'team_approved', 'graduation_projects', p_project_id,
        gen_random_uuid(), jsonb_build_object('source_correlation_id', p_correlation_id));
  end if;
  insert into public.graduation_project_events(
      project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
      correlation_id, payload)
    values (p_project_id, auth.uid(), null, 'supervisor_assigned',
      'graduation_project_assignments', v_sup, p_correlation_id,
      jsonb_build_object('request', v_req, 'final', true, 'coordinator_assignment_id', v_coord,
        'self_supervision', sup.user_id = auth.uid()));
  return v_sup;
end $$;

-- =============================================================================
-- 7. Supervisor: endorse or return the submitted proposal
-- =============================================================================
create or replace function public.gp_supervisor_review_proposal(
  p_project_id uuid, p_action text, p_reason text,
  p_expected_version bigint, p_correlation_id uuid
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  v_event text; v_req jsonb; v_replay uuid; v_round int;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  select * into a from public.graduation_project_assignments x
   where x.project_id = p_project_id and x.user_id = auth.uid() and x.role = 'supervisor'
     and x.active and x.ended_at is null and x.supervision_status = 'accepted';
  if a.id is null then raise exception 'accepted supervisor assignment required'; end if;
  if p_action not in ('endorse','return') then raise exception 'proposal review action unknown'; end if;
  v_event := case p_action when 'endorse' then 'proposal_supervisor_endorsed'
                           else 'proposal_supervisor_returned' end;
  v_req := jsonb_build_object('action', p_action, 'reason', p_reason, 'expected_version', p_expected_version);
  v_replay := public.gp_take_replay(p_project_id, p_correlation_id, v_event, v_req);
  if v_replay is not null then return p_project_id; end if;
  perform public.gp_assert_version(p, p_expected_version);
  if p.lifecycle_state <> 'submitted' or p.proposal_supervisor_endorsed_at is not null then
    raise exception 'proposal review precondition failed';
  end if;
  if p_action = 'return' and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'review reason required';
  end if;
  select count(*) into v_round from public.graduation_project_approvals
   where project_id = p_project_id and stage like 'proposal_supervisor_round_%';
  if p_action = 'endorse' then
    update public.graduation_projects
       set proposal_supervisor_endorsed_at = now(), version = version + 1, updated_at = now()
     where id = p_project_id;
  else
    update public.graduation_projects
       set lifecycle_state = 'revision_required', version = version + 1, updated_at = now()
     where id = p_project_id;
  end if;
  insert into public.graduation_project_approvals(project_id, stage, decision, assignment_id, reason)
    values (p_project_id, 'proposal_supervisor_round_' || (v_round + 1),
      case when p_action = 'endorse' then 'approved' else 'revision_required' end, a.id, p_reason);
  insert into public.graduation_project_events(
      project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id,
      reason, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, v_event, 'graduation_projects', p_project_id,
      p_reason, p_correlation_id, jsonb_build_object('request', v_req));
  return p_project_id;
end $$;

-- =============================================================================
-- 8. Read models
-- =============================================================================
create or replace function public.gp_project_workflow_status(p_project_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare p public.graduation_projects; v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
  ) and not public.gp_caller_manages_department(p.department_id) then
    raise exception 'graduation project access denied';
  end if;
  select jsonb_build_object(
    'project_id', p.id,
    'lifecycle_state', p.lifecycle_state::text,
    'version', p.version,
    'team_submitted_at', p.team_submitted_at,
    'team_approved_at', p.team_approved_at,
    'proposal_supervisor_endorsed_at', p.proposal_supervisor_endorsed_at,
    'supervisor_name', (
      select fp.full_name_ar from public.graduation_project_assignments a
      join public.faculty_profiles fp on fp.id = a.faculty_profile_id
      where a.project_id = p.id and a.role = 'supervisor' and a.active limit 1),
    'coordinator_name', (
      select fp.full_name_ar from public.graduation_project_assignments a
      join public.faculty_profiles fp on fp.id = a.faculty_profile_id
      where a.project_id = p.id and a.role = 'coordinator' and a.active limit 1),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('full_name_ar', s.full_name_ar,
          'academic_number', s.academic_number, 'is_leader', a.is_leader)
          order by a.is_leader desc, s.full_name_ar)
      from public.graduation_project_assignments a
      join public.student_profiles s on s.id = a.student_profile_id
      where a.project_id = p.id and a.role = 'student' and a.active), '[]'::jsonb),
    'viewer', jsonb_build_object(
      'is_leader', exists (select 1 from public.graduation_project_assignments a
        where a.project_id = p.id and a.user_id = auth.uid() and a.active
          and a.role = 'student' and a.is_leader),
      'is_supervisor', exists (select 1 from public.graduation_project_assignments a
        where a.project_id = p.id and a.user_id = auth.uid() and a.active
          and a.role = 'supervisor' and a.supervision_status = 'accepted'),
      'is_coordinator', exists (select 1 from public.graduation_project_assignments a
        where a.project_id = p.id and a.user_id = auth.uid() and a.active
          and a.role = 'coordinator'),
      'manages_department', public.gp_caller_manages_department(p.department_id))
  ) into v;
  return v;
end $$;

-- Department head board. Never raises for ordinary faculty: returns
-- can_manage=false with no rows.
create or replace function public.gp_department_projects_overview()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_depts uuid[]; v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select coalesce(array_agg(d.id), '{}') into v_depts
    from public.departments d where public.gp_caller_manages_department(d.id);
  if cardinality(v_depts) = 0 then
    return jsonb_build_object('can_manage', false, 'projects', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(t.j order by t.sort_key desc), '[]'::jsonb) into v
  from (
    select p.updated_at as sort_key, jsonb_build_object(
      'project_id', p.id,
      'title', p.title,
      'lifecycle_state', p.lifecycle_state::text,
      'version', p.version,
      'program_name_ar', (select pr.name_ar from public.programs pr where pr.id = p.program_id),
      'team_submitted_at', p.team_submitted_at,
      'team_approved_at', p.team_approved_at,
      'proposal_supervisor_endorsed_at', p.proposal_supervisor_endorsed_at,
      'supervisor_name', (
        select fp.full_name_ar from public.graduation_project_assignments a
        join public.faculty_profiles fp on fp.id = a.faculty_profile_id
        where a.project_id = p.id and a.role = 'supervisor' and a.active limit 1),
      'supervisor_faculty_profile_id', (
        select a.faculty_profile_id from public.graduation_project_assignments a
        where a.project_id = p.id and a.role = 'supervisor' and a.active limit 1),
      'coordinator_name', (
        select fp.full_name_ar from public.graduation_project_assignments a
        join public.faculty_profiles fp on fp.id = a.faculty_profile_id
        where a.project_id = p.id and a.role = 'coordinator' and a.active limit 1),
      'members', coalesce((
        select jsonb_agg(jsonb_build_object('full_name_ar', s.full_name_ar,
            'academic_number', s.academic_number, 'is_leader', a.is_leader)
            order by a.is_leader desc, s.full_name_ar)
        from public.graduation_project_assignments a
        join public.student_profiles s on s.id = a.student_profile_id
        where a.project_id = p.id and a.role = 'student' and a.active), '[]'::jsonb)
    ) as j
    from public.graduation_projects p
    where p.department_id = any (v_depts)
      and p.lifecycle_state not in ('archived','cancelled')
  ) t;
  return jsonb_build_object('can_manage', true, 'projects', v);
end $$;

-- College-wide supervisor directory with current load, for department managers.
create or replace function public.gp_list_supervisor_options()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  if not exists (select 1 from public.departments d where public.gp_caller_manages_department(d.id)) then
    raise exception 'department graduation-project manager capability required';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'faculty_profile_id', fp.id,
      'full_name_ar', fp.full_name_ar,
      'academic_rank', fp.academic_rank,
      'department_name_ar', (select d.name_ar from public.departments d where d.id = fp.department_id),
      'is_self', fp.user_id = auth.uid(),
      'active_projects', (
        select count(*) from public.graduation_project_assignments a
        join public.graduation_projects p on p.id = a.project_id
        where a.faculty_profile_id = fp.id and a.role = 'supervisor' and a.active
          and p.lifecycle_state not in ('archived','cancelled','completed','rejected'))
    ) order by fp.full_name_ar), '[]'::jsonb) into v
  from public.faculty_profiles fp
  where fp.status = 'active' and fp.user_id is not null;
  return v;
end $$;

-- =============================================================================
-- 9. Grants
-- =============================================================================
revoke all on function public.gp_department_head_user(uuid) from public, anon, authenticated;
revoke all on function public.gp_vice_dean_academic_user() from public, anon, authenticated;
revoke all on function public.gp_department_manager_faculty(uuid) from public, anon, authenticated;
revoke all on function public.gp_set_project_coordinator(uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.gp_require_department_manager(uuid) from public, anon, authenticated;
revoke all on function public.gp_caller_manages_department(uuid) from public, anon;
grant execute on function public.gp_caller_manages_department(uuid) to authenticated;

revoke all on function public.student_create_graduation_project_team(uuid) from public, anon;
grant execute on function public.student_create_graduation_project_team(uuid) to authenticated;
revoke all on function public.gp_list_team_candidates(uuid) from public, anon;
grant execute on function public.gp_list_team_candidates(uuid) to authenticated;
revoke all on function public.gp_add_team_member_by_profile(uuid,uuid,uuid) from public, anon;
grant execute on function public.gp_add_team_member_by_profile(uuid,uuid,uuid) to authenticated;
revoke all on function public.gp_submit_team_for_approval(uuid,bigint,uuid) from public, anon;
grant execute on function public.gp_submit_team_for_approval(uuid,bigint,uuid) to authenticated;
revoke all on function public.gp_return_team(uuid,text,bigint,uuid) from public, anon;
grant execute on function public.gp_return_team(uuid,text,bigint,uuid) to authenticated;
revoke all on function public.gp_approve_team_and_assign_supervisor(uuid,uuid,bigint,uuid) from public, anon;
grant execute on function public.gp_approve_team_and_assign_supervisor(uuid,uuid,bigint,uuid) to authenticated;
revoke all on function public.gp_supervisor_review_proposal(uuid,text,text,bigint,uuid) from public, anon;
grant execute on function public.gp_supervisor_review_proposal(uuid,text,text,bigint,uuid) to authenticated;
revoke all on function public.gp_project_workflow_status(uuid) from public, anon;
grant execute on function public.gp_project_workflow_status(uuid) to authenticated;
revoke all on function public.gp_department_projects_overview() from public, anon;
grant execute on function public.gp_department_projects_overview() to authenticated;
revoke all on function public.gp_list_supervisor_options() from public, anon;
grant execute on function public.gp_list_supervisor_options() to authenticated;

commit;
