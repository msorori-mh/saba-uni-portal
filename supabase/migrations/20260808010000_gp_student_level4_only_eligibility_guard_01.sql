-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Package: GRADUATION-PROJECTS student Level-4-only eligibility guard
-- Mission: GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01
-- Source draft: docs/migration-drafts/GRADUATION-PROJECTS-STUDENT-LEVEL4-ONLY-ELIGIBILITY-GUARD-01.sql
-- Source draft SHA256: 9d85fb4b6d7cd5b1ad4c19fb99d913d13b48fce6c83fcde7fca10340a934f1d6
-- Production scenario: P1-U (SET U applied; SET N quarantined as evidence)
-- Predecessor chain (canonical): U1 A1 -> U2 A2 -> U3 A3 -> U4 storage predicate fix
-- DO NOT APPLY until production read-only preflight PASSes.
begin;

do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'GP_STUDENT_L4_GUARD_A1_MISSING: graduation projects foundation required';
  end if;
  if to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is null then
    raise exception 'GP_STUDENT_L4_GUARD_A3_MISSING: lifecycle RPCs required';
  end if;
  if to_regclass('public.student_academic_status') is null then
    raise exception 'GP_STUDENT_L4_GUARD_ACADEMIC_STATUS_MISSING: student_academic_status required';
  end if;
  if to_regclass('public.academic_levels') is null then
    raise exception 'GP_STUDENT_L4_GUARD_ACADEMIC_LEVELS_MISSING: academic_levels required';
  end if;
  if to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is not null then
    raise exception 'GP_STUDENT_L4_GUARD_PREDICATE_EXISTS: student_is_current_fourth_academic_level already present';
  end if;
end $$;

-- =============================================================================
-- G1 — Canonical Level-4 predicate (exactly one authoritative current row)
-- =============================================================================

create or replace function public.student_is_current_fourth_academic_level(
  p_student_profile_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_top_rows integer;
  v_any_null_level boolean;
  v_orphan_level boolean;
  v_level_number integer;
begin
  if p_student_profile_id is null then
    return false;
  end if;

  with ranked as (
    select
      sas.level_id,
      dense_rank() over (
        order by sas.updated_at desc nulls last, sas.created_at desc
      ) as rnk
    from public.student_academic_status sas
    where sas.student_profile_id = p_student_profile_id
  )
  select
    count(*),
    bool_or(r.level_id is null),
    bool_or(r.level_id is not null and al.id is null),
    max(al.level_number)
  into
    v_top_rows,
    v_any_null_level,
    v_orphan_level,
    v_level_number
  from ranked r
  left join public.academic_levels al on al.id = r.level_id
  where r.rnk = 1;

  -- Exactly one authoritative current snapshot — tied top rows always deny
  -- (including duplicate L4/L4 and conflicting L4/L3 timestamps).
  if coalesce(v_top_rows, 0) <> 1 then
    return false;
  end if;
  if coalesce(v_any_null_level, true) then
    return false;
  end if;
  if coalesce(v_orphan_level, true) then
    return false;
  end if;
  if v_level_number is distinct from 4 then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.require_student_gp_fourth_level_eligibility(
  p_student_profile_id uuid
) returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.student_is_current_fourth_academic_level(p_student_profile_id) then
    raise exception 'fourth-level student eligibility required';
  end if;
end;
$$;

-- Student-only actor path on a project: require current L4.
-- Non-student assignment on the SAME project follows existing staff auth (no L4).
-- Staff role on an unrelated project never unlocks this project's student path.
create or replace function public.require_student_actor_gp_fourth_level(
  p_project_id uuid
) returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_profile_id uuid;
  v_has_student boolean;
  v_has_non_student boolean;
begin
  if auth.uid() is null then
    raise exception 'graduation project access denied';
  end if;

  select exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id
      and a.user_id = auth.uid()
      and a.active and a.ended_at is null
      and a.role = 'student'
  ), exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id
      and a.user_id = auth.uid()
      and a.active and a.ended_at is null
      and a.role <> 'student'
  )
  into v_has_student, v_has_non_student;

  -- No student assignment on this project: staff/faculty path unchanged.
  if not v_has_student then
    return;
  end if;

  -- Same-project non-student assignment: existing staff authorization applies.
  if v_has_non_student then
    return;
  end if;

  select a.student_profile_id into v_student_profile_id
  from public.graduation_project_assignments a
  where a.project_id = p_project_id
    and a.user_id = auth.uid()
    and a.active and a.ended_at is null
    and a.role = 'student'
  order by a.is_leader desc, a.assigned_at
  limit 1;

  perform public.require_student_gp_fourth_level_eligibility(v_student_profile_id);
end;
$$;

-- Pure-student callers (no active non-student GP assignment / coordinator seat)
-- must be current L4. Does NOT globally unlock student projects for dual-role actors.
create or replace function public.require_caller_student_gp_fourth_level_when_student_only()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_student_profile_id uuid;
  v_has_staff_capability boolean;
begin
  if auth.uid() is null then
    raise exception 'graduation project access denied';
  end if;

  select sp.id into v_student_profile_id
  from public.student_profiles sp
  where sp.user_id = auth.uid()
  limit 1;

  if v_student_profile_id is null then
    return;
  end if;

  select exists (
    select 1 from public.graduation_project_assignments a
    where a.user_id = auth.uid() and a.active and a.ended_at is null and a.role <> 'student'
  ) or exists (
    select 1 from public.graduation_project_department_coordinators c
    where c.user_id = auth.uid() and c.active and c.ended_at is null
  )
  into v_has_staff_capability;

  -- Dual-role actors are not raised here; list/detail enforce per-project rules.
  if v_has_staff_capability then
    return;
  end if;

  perform public.require_student_gp_fourth_level_eligibility(v_student_profile_id);
end;
$$;

-- =============================================================================
-- Wire into shared student write helpers (defense in depth)
-- =============================================================================

create or replace function public.require_graduation_project_leader(p_project_id uuid)
returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments;
begin
  select * into a from public.graduation_project_assignments x
  where x.project_id = p_project_id and x.user_id = auth.uid()
    and x.active and x.ended_at is null and x.role = 'student' and x.is_leader;
  if a.id is null then raise exception 'exact team leader assignment required'; end if;
  perform public.require_student_gp_fourth_level_eligibility(a.student_profile_id);
  return a;
end $$;

create or replace function public.gp_team_mutator(p_project_id uuid)
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
    if a.role = 'student' then
      perform public.require_student_gp_fourth_level_eligibility(a.student_profile_id);
    end if;
    return a;
  end if;
  return public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
end $$;

-- =============================================================================
-- Team create / add member — every student member must be current L4
-- Zero side effects: eligibility checked before any mutating insert
-- =============================================================================

create or replace function public.create_graduation_project_team(
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
  -- Fail closed before any project/assignment insert
  perform public.require_student_gp_fourth_level_eligibility(p_leader_student_profile_id);
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

create or replace function public.add_graduation_project_team_member(
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
  -- Fail closed before member insert (leader L4 already enforced by gp_team_mutator when student)
  perform public.require_student_gp_fourth_level_eligibility(p_student_profile_id);
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

-- =============================================================================
-- Student read / download surfaces — per-project dual-role isolation
-- =============================================================================

create or replace function public.list_my_graduation_projects()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  -- Raise only for pure-student non-L4 callers; dual-role actors continue with
  -- per-project filtering below (staff project B never unlocks student project A).
  perform public.require_caller_student_gp_fourth_level_when_student_only();
  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.updated_at desc), '[]'::jsonb) into v
  from (
    select p.id as project_id, p.department_id, p.title, p.lifecycle_state::text, p.final_decision::text,
      p.version, p.updated_at,
      coalesce((select jsonb_agg(distinct a.role::text) from public.graduation_project_assignments a
        where a.project_id = p.id and a.user_id = auth.uid() and a.active), '[]'::jsonb) as roles
    from public.graduation_projects p
    where exists (
      select 1 from public.graduation_project_assignments a
      where a.project_id = p.id
        and a.user_id = auth.uid()
        and a.active
        and a.ended_at is null
        and (
          a.role <> 'student'
          or public.student_is_current_fourth_academic_level(a.student_profile_id)
        )
    )
  ) t;
  return v;
end $$;

create or replace function public.get_graduation_project_detail(p_project_id uuid)
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
  perform public.require_student_actor_gp_fourth_level(p_project_id);
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

-- Authz before any replayed storage coordinates; replay bound to actor_user_id.
create or replace function public.create_graduation_project_signed_download(
  p_file_id uuid,
  p_correlation_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.graduation_project_files;
  v_ok boolean;
  v_replay_entity uuid;
  v_replay_actor uuid;
  v_payload jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into f from public.graduation_project_files where id = p_file_id;
  if f.id is null then raise exception 'file not found'; end if;

  -- All authorization checks BEFORE returning any replayed payload / coordinates.
  if f.upload_status not in ('active','superseded') or f.scan_state <> 'clean' then
    raise exception 'file download not authorized';
  end if;
  select exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = f.project_id and a.user_id = auth.uid() and a.active and a.ended_at is null
      and (
        a.role in ('student','coordinator','panel_member')
        or (a.role = 'supervisor' and a.supervision_status in ('pending','accepted'))
      )
  ) into v_ok;
  if not v_ok then raise exception 'exact project assignment required'; end if;
  perform public.require_student_actor_gp_fourth_level(f.project_id);

  select e.entity_id, e.actor_user_id, e.payload
    into v_replay_entity, v_replay_actor, v_payload
  from public.graduation_project_events e
  where e.project_id = f.project_id
    and e.correlation_id = p_correlation_id
    and e.event_type = 'file_download_authorized'
  limit 1;

  if v_replay_entity is not null then
    if v_replay_entity <> f.id then raise exception 'idempotent replay entity mismatch'; end if;
    if v_replay_actor is distinct from auth.uid() then
      raise exception 'idempotent replay actor mismatch';
    end if;
    if v_payload is not null then return v_payload; end if;
    return jsonb_build_object(
      'storage_bucket', 'graduation-projects', 'storage_object_path', f.object_key, 'expires_in_seconds', 300
    );
  end if;

  v_payload := jsonb_build_object(
    'storage_bucket', 'graduation-projects',
    'storage_object_path', f.object_key,
    'expires_in_seconds', 300
  );
  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    f.project_id, auth.uid(), null, 'file_download_authorized', 'graduation_project_files', f.id, p_correlation_id, v_payload
  );
  return v_payload;
end $$;

-- =============================================================================
-- Storage INSERT predicate — re-check student L4 at object INSERT time
-- Staff/faculty upload assignments are unchanged (no student-level gate).
-- =============================================================================

create or replace function public.can_upload_graduation_project_object(
  p_object_name text
) returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.graduation_project_files f
    where f.object_key = p_object_name
      and f.upload_status = 'pending'
      and exists (
        select 1
        from public.graduation_project_assignments a
        where a.id = f.uploaded_by_assignment_id
          and a.project_id = f.project_id
          and a.user_id = auth.uid()
          and a.active = true
          and a.ended_at is null
          and (
            a.role <> 'student'
            or public.student_is_current_fourth_academic_level(a.student_profile_id)
          )
      )
  );
end $$;

revoke all on function public.can_upload_graduation_project_object(text) from public, anon;
grant execute on function public.can_upload_graduation_project_object(text) to authenticated;

revoke all on function public.student_is_current_fourth_academic_level(uuid) from public, anon;
revoke all on function public.require_student_gp_fourth_level_eligibility(uuid) from public, anon, authenticated;
revoke all on function public.require_student_actor_gp_fourth_level(uuid) from public, anon, authenticated;
revoke all on function public.require_caller_student_gp_fourth_level_when_student_only() from public, anon, authenticated;

grant execute on function public.student_is_current_fourth_academic_level(uuid) to authenticated;

comment on function public.student_is_current_fourth_academic_level(uuid) is
  'GP student eligibility: true only when exactly one authoritative current student_academic_status row maps to academic_levels.level_number = 4. Fail-closed on ties/ambiguity.';

commit;
