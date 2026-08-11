-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Package: GP independent security audit findings remediation 02
-- Mission: PORTAL-GP-INDEPENDENT-SECURITY-AUDIT-FINDINGS-REMEDIATION-02
-- Source draft: docs/migration-drafts/GRADUATION-PROJECTS-INDEPENDENT-SECURITY-AUDIT-REMEDIATION-02.sql
--
-- MIGRATION STRATEGY (R7):
-- - SET U (20260806*/20260807*) are historical/applied → DO NOT REWRITE.
-- - 20260808010000 (L4) and 20260811010000 (identity/notes) are PR340-only,
--   conclusively NOT_APPLIED per closure report evidence → left identity-stable.
-- - This forward-only migration supersedes conclude / submit_evaluation /
--   get_detail / create_team after those predecessors.
-- DO NOT APPLY until L4 + identity/revision-notes predecessors are applied
-- (or intentionally chained in disposable PG17 harnesses).

begin;

do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'GP_SECURITY_REMEDIATION_02_A1_MISSING: graduation projects foundation required';
  end if;
  if to_regclass('public.graduation_project_evaluations') is null then
    raise exception 'GP_SECURITY_REMEDIATION_02_EVAL_MISSING: evaluations table required';
  end if;
  if to_regprocedure('public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is null then
    raise exception 'GP_SECURITY_REMEDIATION_02_CREATE_TEAM_MISSING: create_graduation_project_team required';
  end if;
end $$;

-- =============================================================================
-- H-01: evaluation round versioning (bind evidence to revision cycle)
-- =============================================================================

alter table public.graduation_projects
  add column if not exists evaluation_round integer not null default 1;

alter table public.graduation_project_evaluations
  add column if not exists evaluation_round integer not null default 1;

do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'graduation_project_evaluations'
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid) in (
        'UNIQUE (discussion_id, panel_member_id)',
        'UNIQUE (panel_member_id, discussion_id)'
      )
  loop
    execute format(
      'alter table public.graduation_project_evaluations drop constraint %I',
      r.conname
    );
  end loop;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.graduation_project_evaluations'::regclass
      and conname = 'graduation_project_evaluations_discussion_panel_round_key'
  ) then
    alter table public.graduation_project_evaluations
      add constraint graduation_project_evaluations_discussion_panel_round_key
      unique (discussion_id, panel_member_id, evaluation_round);
  end if;
end $$;

-- Ensure programs / profile columns exist for M-01 + identity_options
-- (production already has them; disposable harnesses may not)
alter table public.programs add column if not exists department_id uuid;
alter table public.programs add column if not exists is_active boolean not null default true;
alter table public.student_profiles add column if not exists status text;
alter table public.student_profiles add column if not exists full_name_ar text;
alter table public.student_profiles add column if not exists full_name_en text;
alter table public.student_profiles add column if not exists academic_number text;
alter table public.student_profiles add column if not exists program_id uuid;
alter table public.faculty_profiles add column if not exists status text;
alter table public.faculty_profiles add column if not exists full_name_ar text;
alter table public.faculty_profiles add column if not exists full_name_en text;
alter table public.faculty_profiles add column if not exists employee_number text;
alter table public.faculty_profiles add column if not exists program_id uuid;
alter table public.faculty_profiles add column if not exists faculty_id uuid;
update public.student_profiles set status = 'active' where status is null;
update public.faculty_profiles set status = 'active' where status is null;

-- =============================================================================
-- Helpers: corrected-final readiness for post-revisions rounds
-- =============================================================================

create or replace function public.gp_current_revision_final_ready(p_project_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_rev_at timestamptz;
  v_file_id uuid;
begin
  select max(e.occurred_at) into v_rev_at
  from public.graduation_project_events e
  where e.project_id = p_project_id
    and e.event_type = 'result_concluded'
    and coalesce(e.payload->>'final_decision', '') = 'revisions_required';

  if v_rev_at is null then
    return true; -- no revisions cycle yet
  end if;

  select f.id into v_file_id
  from public.graduation_project_files f
  where f.project_id = p_project_id
    and f.category = 'final'
    and f.is_current
    and f.upload_status = 'active'
    and f.scan_state = 'clean';

  if v_file_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.graduation_project_events sub
    join public.graduation_project_events ready
      on ready.project_id = sub.project_id
     and ready.event_type = 'final_marked_ready'
     and ready.entity_id = sub.entity_id
     and ready.occurred_at >= sub.occurred_at
    where sub.project_id = p_project_id
      and sub.event_type = 'final_submitted'
      and sub.entity_id = v_file_id
      and sub.occurred_at >= v_rev_at
  );
end $$;

revoke all on function public.gp_current_revision_final_ready(uuid) from public, anon;
grant execute on function public.gp_current_revision_final_ready(uuid) to authenticated;

-- =============================================================================
-- M-01: create team — active program must belong to p_department_id
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

  -- Fail closed before any mutation: active program in the same department
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

revoke all on function public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  from public, anon;
grant execute on function public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)
  to authenticated;

-- =============================================================================
-- H-01: submit evaluation bound to current evaluation_round
-- =============================================================================

create or replace function public.submit_graduation_project_evaluation(
  p_project_id uuid, p_score numeric, p_notes text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.graduation_project_assignments;
  p public.graduation_projects;
  d public.graduation_project_discussions;
  pm public.graduation_project_panel_members;
  e_id uuid;
  v_req jsonb;
  v_replay uuid;
  v_round int;
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

  v_round := coalesce(p.evaluation_round, 1);

  -- After revisions_required, new-round evaluations require corrected final readiness
  if p.final_decision = 'revisions_required'
     or exists (
       select 1 from public.graduation_project_events e
       where e.project_id = p_project_id
         and e.event_type = 'result_concluded'
         and coalesce(e.payload->>'final_decision', '') = 'revisions_required'
     ) then
    if not public.gp_current_revision_final_ready(p_project_id) then
      raise exception 'corrected final readiness required before evaluation';
    end if;
  end if;

  select * into d from public.graduation_project_discussions where project_id = p_project_id and state = 'held';
  if d.id is null then raise exception 'defense not held'; end if;
  select * into pm from public.graduation_project_panel_members
    where discussion_id = d.id and assignment_id = a.id and project_id = p_project_id;
  if pm.id is null then raise exception 'committee panel assignment required'; end if;
  if exists (
    select 1 from public.graduation_project_evaluations
    where discussion_id = d.id
      and panel_member_id = pm.id
      and evaluation_round = v_round
      and state = 'submitted'
  ) then
    raise exception 'evaluation already submitted';
  end if;
  insert into public.graduation_project_evaluations(
    project_id, discussion_id, panel_member_id, score, notes, state, submitted_at, evaluation_round
  ) values (
    p_project_id, d.id, pm.id, p_score, p_notes, 'submitted', now(), v_round
  )
  on conflict (discussion_id, panel_member_id, evaluation_round) do update
    set score = excluded.score, notes = excluded.notes, state = 'submitted', submitted_at = now()
    where public.graduation_project_evaluations.state = 'draft'
  returning id into e_id;
  if e_id is null then raise exception 'evaluation already submitted'; end if;
  insert into public.graduation_project_events(project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload)
    values (p_project_id, auth.uid(), a.id, 'evaluation_submitted', 'graduation_project_evaluations', e_id, p_correlation_id,
      jsonb_build_object('request', v_req, 'score', p_score, 'evaluation_round', v_round));
  return e_id;
end $$;

revoke all on function public.submit_graduation_project_evaluation(uuid,numeric,text,uuid)
  from public, anon;
grant execute on function public.submit_graduation_project_evaluation(uuid,numeric,text,uuid)
  to authenticated;

-- =============================================================================
-- H-01: conclude — only current-round evaluations authorize the decision
-- =============================================================================

drop function if exists public.conclude_graduation_project_result(uuid, text, bigint, uuid);
drop function if exists public.conclude_graduation_project_result(uuid, text, bigint, uuid, text);

create function public.conclude_graduation_project_result(
  p_project_id uuid,
  p_decision text,
  p_expected_version bigint,
  p_correlation_id uuid,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a := public.require_graduation_project_assignment(
    p_project_id,
    array['coordinator']::public.graduation_project_assignment_role[]
  );
  v_req := jsonb_build_object(
    'decision', p_decision,
    'expected_version', p_expected_version,
    'notes', v_notes
  );
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

  -- Terminal decision after revisions_required requires corrected-final readiness
  if v_had_revisions and v_dec in ('passed', 'failed') then
    if not public.gp_current_revision_final_ready(p_project_id) then
      raise exception 'corrected final readiness required before final decision';
    end if;
  end if;

  select * into d from public.graduation_project_discussions
    where project_id = p_project_id and state = 'held';
  if d.id is null then raise exception 'defense not held'; end if;

  select count(*) into v_panel
  from public.graduation_project_panel_members
  where discussion_id = d.id;

  -- ONLY current evaluation_round evidence may authorize the decision
  select count(*) into v_submitted
  from public.graduation_project_evaluations
  where discussion_id = d.id
    and state = 'submitted'
    and evaluation_round = v_round;

  if v_panel < 2 or v_submitted <> v_panel then
    raise exception 'all committee evaluations required';
  end if;

  select round(avg(score), 2) into v_avg
  from public.graduation_project_evaluations
  where discussion_id = d.id
    and state = 'submitted'
    and evaluation_round = v_round;

  update public.graduation_projects
    set final_decision = v_dec,
        average_score = v_avg,
        -- Open a fresh evidence round after revisions_required so stale evals cannot authorize later
        evaluation_round = case
          when v_dec = 'revisions_required' then v_round + 1
          else v_round
        end,
        version = version + 1,
        updated_at = now()
    where id = p_project_id;

  insert into public.graduation_project_events(
    project_id, actor_user_id, actor_assignment_id, event_type, entity_type, entity_id, correlation_id, payload
  ) values (
    p_project_id, auth.uid(), a.id, 'result_concluded', 'graduation_projects', p_project_id, p_correlation_id,
    jsonb_build_object(
      'request', v_req,
      'final_decision', v_dec::text,
      'average_score', v_avg,
      'notes', v_notes,
      'evaluation_round', v_round
    )
  );
  return p_project_id;
end $$;

revoke all on function public.conclude_graduation_project_result(uuid, text, bigint, uuid, text)
  from public, anon;
grant execute on function public.conclude_graduation_project_result(uuid, text, bigint, uuid, text)
  to authenticated;

-- =============================================================================
-- M-02 / M-03 / H-03 / L-01: detail projection fixes
-- - join-safe committee counts (no panel×eval cartesian)
-- - archive safe summary
-- - identity_options preserved
-- - viewer_is_leader boolean for UI parity
-- =============================================================================

create or replace function public.get_graduation_project_detail(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  p public.graduation_projects;
  v_roles text[];
  v_is_coord boolean;
  v_is_panel boolean;
  v_is_leader boolean;
  v_own_eval jsonb;
  v_agg jsonb;
  v_identity jsonb := '{}'::jsonb;
  v_notes text;
  v_committee_count int := 0;
  v_archive jsonb;
  v_round int;
  v jsonb;
begin
  if auth.uid() is null then raise exception 'graduation project access denied'; end if;
  select * into p from public.graduation_projects where id = p_project_id;
  if p.id is null then raise exception 'project not found'; end if;
  if not exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
  ) then raise exception 'exact direct processing assignment required'; end if;
  if to_regprocedure('public.require_student_actor_gp_fourth_level(uuid)') is not null then
    perform public.require_student_actor_gp_fourth_level(p_project_id);
  end if;

  select array_agg(distinct a.role::text) into v_roles
    from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active;
  v_is_coord := 'coordinator' = any (v_roles);
  v_is_panel := 'panel_member' = any (v_roles);
  v_is_leader := exists (
    select 1 from public.graduation_project_assignments a
    where a.project_id = p_project_id and a.user_id = auth.uid() and a.active
      and a.role = 'student' and a.is_leader
  );
  v_round := coalesce(p.evaluation_round, 1);

  if v_is_panel then
    select jsonb_build_object(
      'evaluation_id', e.id, 'score', e.score, 'notes', e.notes, 'state', e.state,
      'evaluation_round', e.evaluation_round
    )
      into v_own_eval
    from public.graduation_project_evaluations e
    join public.graduation_project_panel_members pm on pm.id = e.panel_member_id
    join public.graduation_project_assignments asg on asg.id = pm.assignment_id
    where e.project_id = p_project_id
      and asg.user_id = auth.uid()
      and e.evaluation_round = v_round
    order by e.submitted_at desc nulls last
    limit 1;
  end if;

  select count(*) into v_committee_count
  from public.graduation_project_panel_members pm
  join public.graduation_project_discussions dd on dd.id = pm.discussion_id
  where dd.project_id = p_project_id;

  if v_is_coord then
    select jsonb_build_object(
      'submitted_count', (
        select count(*)::int
        from public.graduation_project_evaluations e
        join public.graduation_project_discussions d on d.id = e.discussion_id
        where d.project_id = p_project_id
          and e.state = 'submitted'
          and e.evaluation_round = v_round
      ),
      'required_count', v_committee_count,
      'average_score', p.average_score,
      'evaluation_round', v_round
    ) into v_agg;
  end if;

  select nullif(btrim(coalesce(e.payload->>'notes', e.payload->'request'->>'notes', '')), '')
    into v_notes
  from public.graduation_project_events e
  where e.project_id = p_project_id and e.event_type = 'result_concluded'
  order by e.occurred_at desc nulls last
  limit 1;

  -- M-03: safe archive projection (no storage paths / unnecessary PII)
  select jsonb_build_object(
    'archive_id', ar.id,
    'archived_at', ar.archived_at,
    'final_decision', ar.final_decision::text,
    'average_score', ar.average_score,
    'final_file_id', ar.final_file_id,
    'summary', coalesce(nullif(btrim(p.title), ''), 'مشروع مؤرشف')
  ) into v_archive
  from public.graduation_project_final_archives ar
  where ar.project_id = p_project_id;

  if v_is_coord or v_is_leader then
    select jsonb_build_object(
      'students', coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', sp.id,
          'user_id', sp.user_id,
          'name', sp.full_name_ar,
          'academic_number', sp.academic_number
        ) order by sp.full_name_ar)
        from public.student_profiles sp
        where sp.department_id = p.department_id
          and sp.status = 'active'
          and sp.user_id is not null
          and (
            case
              when to_regprocedure('public.student_is_current_fourth_academic_level(uuid)') is null then true
              else public.student_is_current_fourth_academic_level(sp.id)
            end
          )
          and not exists (
            select 1 from public.graduation_project_assignments a
            where a.user_id = sp.user_id and a.role = 'student' and a.active
          )
      ), '[]'::jsonb),
      'supervisors', case when v_is_coord then coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', fp.id,
          'user_id', fp.user_id,
          'name', fp.full_name_ar,
          'employee_number', fp.employee_number
        ) order by fp.full_name_ar)
        from public.faculty_profiles fp
        where fp.department_id = p.department_id
          and fp.status = 'active'
          and fp.user_id is not null
      ), '[]'::jsonb) else '[]'::jsonb end,
      'committee', case when v_is_coord then coalesce((
        select jsonb_agg(jsonb_build_object(
          'profile_id', fp.id,
          'user_id', fp.user_id,
          'name', fp.full_name_ar,
          'employee_number', fp.employee_number
        ) order by fp.full_name_ar)
        from public.faculty_profiles fp
        where fp.department_id = p.department_id
          and fp.status = 'active'
          and fp.user_id is not null
      ), '[]'::jsonb) else '[]'::jsonb end
    ) into v_identity;
  end if;

  select jsonb_build_object(
    'project_id', p.id,
    'department_id', p.department_id,
    'title', p.title,
    'problem_statement', p.problem_statement,
    'objectives', p.objectives,
    'summary', p.summary,
    'lifecycle_state', p.lifecycle_state::text,
    'final_decision', p.final_decision::text,
    'revisions_notes', v_notes,
    'average_score', case when v_is_coord then p.average_score else null end,
    'version', p.version,
    'evaluation_round', v_round,
    'viewer_is_leader', v_is_leader,
    'team', coalesce((select jsonb_agg(jsonb_build_object(
        'assignment_id', x.id, 'user_id', x.user_id, 'is_leader', x.is_leader, 'active', x.active
      )) from public.graduation_project_assignments x
      where x.project_id = p_project_id and x.role = 'student'), '[]'::jsonb),
    'supervisor', (select jsonb_build_object(
        'user_id', x.user_id, 'status', x.supervision_status::text, 'active', x.active
      ) from public.graduation_project_assignments x
      where x.project_id = p_project_id and x.role = 'supervisor' and x.active
        and x.supervision_status in ('pending','accepted') limit 1),
    'progress', coalesce((select jsonb_agg(jsonb_build_object(
        'id', pe.id, 'version_no', pe.version_no, 'summary', pe.summary,
        'state', pe.state, 'review_comments', pe.review_comments,
        'file_id', pe.file_id
      ) order by pe.version_no)
      from public.graduation_project_progress_entries pe where pe.project_id = p_project_id), '[]'::jsonb),
    'final_file', (select jsonb_build_object(
        'file_id', ff.id, 'scan_state', ff.scan_state::text,
        'is_current', ff.is_current, 'upload_status', ff.upload_status::text
      ) from public.graduation_project_files ff
      where ff.project_id = p_project_id and ff.category = 'final' and ff.is_current limit 1),
    'proposal_file', (select jsonb_build_object(
        'file_id', pf.id, 'scan_state', pf.scan_state::text, 'is_current', pf.is_current
      ) from public.graduation_project_files pf
      where pf.project_id = p_project_id and pf.category = 'proposal' and pf.is_current limit 1),
    'defense', (select jsonb_build_object(
        'discussion_id', dd.id, 'starts_at', dd.starts_at, 'venue', dd.venue,
        'state', dd.state, 'committee_count', v_committee_count
      ) from public.graduation_project_discussions dd where dd.project_id = p_project_id),
    'own_evaluation', v_own_eval,
    'evaluation_aggregate', v_agg,
    'archive', v_archive,
    'identity_options', v_identity,
    'viewer_roles', to_jsonb(v_roles)
  ) into v;
  return v;
end $$;

revoke all on function public.get_graduation_project_detail(uuid) from public, anon;
grant execute on function public.get_graduation_project_detail(uuid) to authenticated;

commit;
