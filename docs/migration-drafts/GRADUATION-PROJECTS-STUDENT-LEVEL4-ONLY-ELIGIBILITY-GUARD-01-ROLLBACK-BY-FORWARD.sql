-- SOURCE-ONLY ROLLBACK-BY-FORWARD COMPANION — DO NOT APPLY automatically
-- Mission: GP-PRODUCTION-MIGRATION-DUPLICATE-SET-RECONCILIATION-AND-PROMOTION-01
-- Target: undo promoted L4 guard 20260808010000_gp_student_level4_only_eligibility_guard_01.sql
-- Restores pre-L4 bodies from canonical production SET U (U1/U3/U4).
--
-- SAFER SIGNED-DOWNLOAD CONTRACT:
-- Does NOT re-introduce A2 replay-before-authorization defect.
-- Restores pre-L4 eligibility (no student_is_current_fourth_academic_level gate)
-- while keeping authz-before-replay + actor-bound idempotent replay.
--
-- NOT APPLIED. Operator-only recovery after explicit approval.

begin;

-- Fail-closed: L4 predicate must exist (otherwise nothing to roll back)
do $$ begin
  if to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is null then
    raise exception 'GP_STUDENT_L4_ROLLBACK_PREDICATE_MISSING: nothing to roll back';
  end if;
  if to_regclass('public.graduation_projects') is null then
    raise exception 'GP_STUDENT_L4_ROLLBACK_A1_MISSING';
  end if;
end $$;

-- ===== restore pre-L4 bodies (SET U) =====
create or replace function public.require_graduation_project_leader(p_project_id uuid)
returns public.graduation_project_assignments
language plpgsql security definer set search_path = public, pg_temp as $$
declare a public.graduation_project_assignments;
begin
  select * into a from public.graduation_project_assignments x
  where x.project_id = p_project_id and x.user_id = auth.uid()
    and x.active and x.ended_at is null and x.role = 'student' and x.is_leader;
  if a.id is null then raise exception 'exact team leader assignment required'; end if;
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
    return a;
  end if;
  return public.require_graduation_project_assignment(p_project_id, array['coordinator']::public.graduation_project_assignment_role[]);
end $$;

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

create or replace function public.list_my_graduation_projects()
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

-- ===== safer signed download (authz-before-replay, no L4 gate) =====
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

  -- Safer rollback contract: preserve authz-before-replay hardening from L4.
  -- Do NOT restore A2 replay-before-authorization defect. L4 eligibility gate removed only.
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

-- ===== restore pre-L4 storage predicate (U4) =====
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
      )
  );
end $$;

revoke all on function public.can_upload_graduation_project_object(text) from public, anon;
grant execute on function public.can_upload_graduation_project_object(text) to authenticated;

-- ===== drop L4-only helpers (after bodies no longer reference them) =====
drop function if exists public.require_caller_student_gp_fourth_level_when_student_only();
drop function if exists public.require_student_actor_gp_fourth_level(uuid);
drop function if exists public.require_student_gp_fourth_level_eligibility(uuid);
drop function if exists public.student_is_current_fourth_academic_level(uuid);

commit;
