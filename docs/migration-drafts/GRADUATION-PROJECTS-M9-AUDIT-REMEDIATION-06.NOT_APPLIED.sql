-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Intended apply order: M9 of 9 (k3 sequence continues 20260730100008; original
-- package M1..M8 used 20260730100000..20260730100007).
--
-- GRADUATION-PROJECTS-M9-AUDIT-REMEDIATION-06 (forward-only, NOT_APPLIED).
-- Remediates Audit-05 findings on top of the verified M1..M8 chain:
--   * F-1  MEDIUM: end_graduation_project_assignment gains an authority/rank
--          boundary derived from existing assignment-role semantics
--          (dean 60 > department_head 50 > coordinator 40 > supervisor/
--          co_supervisor 30 > panel_member 20 > student 10). Strictly-greater
--          authority is required: a lower- or same-rank actor can never
--          terminate a same- or higher-rank assignment. The actor whitelist
--          (coordinator, department_head) is unchanged; dean is NOT added
--          (no new grant, no bypass). Fail-closed: unknown/ambiguous role
--          pairs rank 0 and are denied.
--   * F-2  MEDIUM: upsert_graduation_project_settings and
--          upsert_graduation_project_rubric now consume p_correlation_id and
--          append one deterministic canonical event per successful mutation.
--          The canonical audit mechanism (graduation_project_events) is
--          extended, not duplicated: a nullable department_id scope is added
--          for department-level events with an exactly-one-scope CHECK and a
--          partial unique dedupe key (department_id, correlation_id,
--          event_type) where project_id is null. Rejected mutations raise
--          before any write: zero mutation, zero event.
--   * F-6  LOW: create_graduation_project replay lookup is department-scoped
--          (a correlation collision can no longer return another
--          department's project id).
--   * F-7  LOW: add_graduation_project_team_member replays before state
--          gates, matching the documented assign_graduation_project_faculty
--          ordering (faithful retry returns the recorded id).
--   * F-9  LOW: resolve_graduation_project_supervisor_note requires the
--          authoring supervisor assignment (note ownership), fail-closed.
-- F-3, F-4, F-5 are product-decision-dependent and intentionally unchanged
-- (documented in the remediation report); their current behavior is
-- fail-closed at the ACL layer.
--
-- All replacements are CREATE OR REPLACE with unchanged signatures, SECURITY
-- DEFINER, pinned search_path and literal contracts; revokes/grants are
-- re-issued explicitly. No table grants, no RLS policies, no storage objects.
begin;
do $$ begin
  if to_regprocedure('public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)') is null
     or to_regclass('public.graduation_project_settings') is null then
    raise exception 'graduation projects M1..M8 missing; apply the reviewed package first';
  end if;
  -- M7/M8 are guard-text replacements (their sentinels exist since M2), so
  -- verify the current bodies actually carry both completeness guards.
  if pg_get_functiondef('public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid)'::regprocedure) not like '%panel incomplete for defense%'
     or pg_get_functiondef('public.conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid)'::regprocedure) not like '%order by d.starts_at desc limit 1%' then
    raise exception 'graduation projects M7/M8 completeness guards missing; apply the reviewed package first';
  end if;
  if to_regclass('public.graduation_project_events_department_correlation_key') is not null then
    raise exception 'graduation projects audit remediation already exists; refuse ambiguous retry';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Canonical audit mechanism extension (F-2): department-scoped events.
-- Exactly one scope per row: project events keep department_id null;
-- department events keep project_id null. Existing rows satisfy the CHECK.
-- The append-only trigger, RLS default-deny and table revokes are unchanged
-- and cover the new column. The M5 notify trigger falls through unknown
-- event types, so department events create no notifications.
alter table public.graduation_project_events alter column project_id drop not null;
alter table public.graduation_project_events
  add column department_id uuid references public.departments(id) on delete restrict;
alter table public.graduation_project_events add constraint graduation_project_events_scope check (
  (project_id is not null and department_id is null) or
  (project_id is null and department_id is not null));
create unique index graduation_project_events_department_correlation_key
  on public.graduation_project_events(department_id, correlation_id, event_type)
  where project_id is null;

-- ---------------------------------------------------------------------------
-- F-1: authority rank derived from existing assignment-role semantics.
-- Internal helper; no app grant. Unknown/null roles rank 0 (fail closed).
create function public.graduation_project_assignment_rank(p_role public.graduation_project_assignment_role)
returns integer language sql immutable security invoker set search_path=public,pg_temp as $$
  select case p_role
    when 'dean' then 60 when 'department_head' then 50 when 'coordinator' then 40
    when 'supervisor' then 30 when 'co_supervisor' then 30
    when 'panel_member' then 20 when 'student' then 10 else 0 end
$$;
revoke all on function public.graduation_project_assignment_rank(public.graduation_project_assignment_role) from public, anon, authenticated;

-- F-1: rank boundary. Strictly-greater authority required; checked BEFORE the
-- already-ended no-op return so stale higher/same-rank attempts also deny.
create or replace function public.end_graduation_project_assignment(
  p_project_id uuid, p_assignment_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; t public.graduation_project_assignments; p public.graduation_projects;
  v_recorded uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  -- LOW-2 (review 4982): replay returns the recorded entity_id, never the passed-in id.
  select entity_id into v_recorded from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='assignment_ended';
  if v_recorded is not null then return v_recorded; end if;
  if p.state in ('completed','archived','rejected','cancelled') then raise exception 'assignment end state denied'; end if;
  select * into t from public.graduation_project_assignments where id=p_assignment_id and project_id=p_project_id for update;
  if t.id is null then raise exception 'assignment not found'; end if;
  if t.id=a.id then raise exception 'cannot end own assignment'; end if;
  -- F-1 (audit-05): strictly-greater authority required. A coordinator may end
  -- supervisor/co_supervisor/panel_member/student assignments; a department_head
  -- may additionally end coordinator assignments; same- or higher-rank targets
  -- (incl. department_head, dean) are denied. Fail-closed on ambiguous ranks.
  if public.graduation_project_assignment_rank(a.role) <= public.graduation_project_assignment_rank(t.role) then
    raise exception 'assignment termination authority denied';
  end if;
  if not t.active then return t.id; end if;
  update public.graduation_project_assignments set active=false,ended_at=now() where id=t.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'assignment_ended','graduation_project_assignments',t.id,p_correlation_id);
  return t.id;
end $$;
revoke all on function public.end_graduation_project_assignment(uuid,uuid,uuid) from public, anon;
grant execute on function public.end_graduation_project_assignment(uuid,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F-2: settings upsert consumes p_correlation_id and appends one canonical
-- department-scoped event per successful mutation. Faithful replay returns
-- the recorded settings id. Rejections raise before any write.
create or replace function public.upsert_graduation_project_settings(
  p_department_id uuid, p_academic_year_id uuid, p_team_min integer, p_team_max integer,
  p_supervisor_capacity integer, p_co_supervisor_allowed boolean,
  p_correction_window_days integer, p_defense_notice_days integer, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_before public.graduation_project_settings; v_changed text[];
begin
  if p_correlation_id is null then raise exception 'correlation id required'; end if;
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('department_head','dean') and p.department_id=p_department_id) then
    raise exception 'settings administration assignment required';
  end if;
  select entity_id into v_id from public.graduation_project_events
    where project_id is null and department_id=p_department_id
      and correlation_id=p_correlation_id and event_type='settings_upserted';
  if v_id is not null then return v_id; end if;
  if p_team_min is null or p_team_max is null or p_team_min<1 or p_team_max<p_team_min
    or (p_supervisor_capacity is not null and p_supervisor_capacity<=0)
    or p_correction_window_days is null or p_correction_window_days<=0
    or p_defense_notice_days is null or p_defense_notice_days<0 then
    raise exception 'settings invalid';
  end if;
  select s.* into v_before from public.graduation_project_settings s
    where s.department_id=p_department_id and s.academic_year_id is not distinct from p_academic_year_id
    for update;
  v_id:=v_before.id;
  if v_id is null then
    insert into public.graduation_project_settings(department_id,academic_year_id,team_min,team_max,
      supervisor_capacity,co_supervisor_allowed,correction_window_days,defense_notice_days,updated_by)
      values(p_department_id,p_academic_year_id,p_team_min,p_team_max,p_supervisor_capacity,
        p_co_supervisor_allowed,p_correction_window_days,p_defense_notice_days,auth.uid())
      returning id into v_id;
    v_changed:=array['team_min','team_max','supervisor_capacity','co_supervisor_allowed','correction_window_days','defense_notice_days'];
  else
    update public.graduation_project_settings set
      team_min=p_team_min, team_max=p_team_max,
      supervisor_capacity=p_supervisor_capacity,
      co_supervisor_allowed=p_co_supervisor_allowed,
      correction_window_days=p_correction_window_days,
      defense_notice_days=p_defense_notice_days,
      updated_by=auth.uid(), updated_at=now()
      where id=v_id;
    select array_agg(k order by k) into v_changed from (values
      ('team_min', v_before.team_min is distinct from p_team_min),
      ('team_max', v_before.team_max is distinct from p_team_max),
      ('supervisor_capacity', v_before.supervisor_capacity is distinct from p_supervisor_capacity),
      ('co_supervisor_allowed', v_before.co_supervisor_allowed is distinct from p_co_supervisor_allowed),
      ('correction_window_days', v_before.correction_window_days is distinct from p_correction_window_days),
      ('defense_notice_days', v_before.defense_notice_days is distinct from p_defense_notice_days)
    ) d(k, changed) where d.changed;
  end if;
  -- Canonical audit event: department scope, non-PII config scalars only.
  insert into public.graduation_project_events(project_id,department_id,actor_user_id,actor_assignment_id,
      event_type,entity_type,entity_id,correlation_id,payload)
    values(null,p_department_id,auth.uid(),null,'settings_upserted','graduation_project_settings',v_id,p_correlation_id,
      jsonb_build_object('operation', case when v_before.id is null then 'insert' else 'update' end,
        'changed_keys', coalesce(to_jsonb(v_changed),'[]'::jsonb),
        'after', jsonb_build_object('team_min',p_team_min,'team_max',p_team_max,
          'supervisor_capacity',p_supervisor_capacity,'co_supervisor_allowed',p_co_supervisor_allowed,
          'correction_window_days',p_correction_window_days,'defense_notice_days',p_defense_notice_days),
        'before', case when v_before.id is null then null else jsonb_build_object(
          'team_min',v_before.team_min,'team_max',v_before.team_max,
          'supervisor_capacity',v_before.supervisor_capacity,'co_supervisor_allowed',v_before.co_supervisor_allowed,
          'correction_window_days',v_before.correction_window_days,'defense_notice_days',v_before.defense_notice_days) end));
  return v_id;
end $$;
revoke all on function public.upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) from public, anon;
grant execute on function public.upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) to authenticated;

-- F-2: rubric upsert consumes p_correlation_id and appends one canonical
-- department-scoped event per successful mutation (after the criteria
-- rewrite succeeds; any rejection leaves zero mutation and zero event).
create or replace function public.upsert_graduation_project_rubric(
  p_department_id uuid, p_rubric_id uuid, p_code text, p_version_label text, p_title text,
  p_passing_threshold numeric, p_criteria jsonb, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_rows integer; v_codes integer; v_seqs integer;
  v_before_title text; v_before_threshold numeric(7,2); v_before_criteria integer;
begin
  if p_correlation_id is null then raise exception 'correlation id required'; end if;
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('department_head','dean') and p.department_id=p_department_id) then
    raise exception 'rubric administration assignment required';
  end if;
  select entity_id into v_id from public.graduation_project_events
    where project_id is null and department_id=p_department_id
      and correlation_id=p_correlation_id and event_type='rubric_upserted';
  if v_id is not null then return v_id; end if;
  if length(trim(coalesce(p_code,''))) not between 2 and 60
    or length(trim(coalesce(p_version_label,'')))=0
    or length(trim(coalesce(p_title,''))) not between 3 and 300
    or (p_passing_threshold is not null and p_passing_threshold<=0)
    or p_criteria is null or jsonb_typeof(p_criteria)<>'array' or jsonb_array_length(p_criteria)=0
    or exists(select 1 from jsonb_array_elements(p_criteria) el where jsonb_typeof(el)<>'object'
        or length(trim(coalesce(el->>'criterion_code','')))=0 or length(trim(coalesce(el->>'criterion_label','')))=0
        or coalesce(el->>'maximum_score','') !~ '^[0-9]+([.][0-9]+)?$' or (el->>'maximum_score')::numeric<=0
        or coalesce(el->>'sequence_no','') !~ '^[0-9]+$' or (el->>'sequence_no')::integer<=0
        or coalesce(el->>'weight','1') !~ '^[0-9]+([.][0-9]+)?$' or (coalesce(el->>'weight','1'))::numeric<=0) then
    raise exception 'rubric payload invalid';
  end if;
  select count(*),count(distinct el->>'criterion_code'),count(distinct (el->>'sequence_no')::integer)
    into v_rows,v_codes,v_seqs from jsonb_array_elements(p_criteria) el;
  if v_rows<>v_codes or v_rows<>v_seqs then raise exception 'rubric payload invalid'; end if;
  if p_rubric_id is null then
    insert into public.graduation_project_rubrics(department_id,code,version_label,title,passing_threshold)
      values(p_department_id,trim(p_code),trim(p_version_label),trim(p_title),p_passing_threshold)
      returning id into v_id;
  else
    select r.title, r.passing_threshold,
        (select count(*) from public.graduation_project_rubric_criteria c where c.rubric_id=r.id and c.department_id=p_department_id)
      into v_before_title, v_before_threshold, v_before_criteria
      from public.graduation_project_rubrics r where r.id=p_rubric_id and r.department_id=p_department_id
      for update of r;
    update public.graduation_project_rubrics set title=trim(p_title),passing_threshold=p_passing_threshold
      where id=p_rubric_id and department_id=p_department_id returning id into v_id;
    if v_id is null then raise exception 'rubric not found'; end if;
    -- migration-review allowlist: SECURITY DEFINER child-row replacement only.
    -- Replaces department-scoped rubric criteria after admin-assignment + payload guards; not bulk cleanup.
    delete from public.graduation_project_rubric_criteria where rubric_id=v_id and department_id=p_department_id;
  end if;
  insert into public.graduation_project_rubric_criteria(rubric_id,department_id,criterion_code,criterion_label,maximum_score,weight,sequence_no)
    select v_id,p_department_id,trim(el->>'criterion_code'),trim(el->>'criterion_label'),
      (el->>'maximum_score')::numeric,(coalesce(el->>'weight','1'))::numeric,(el->>'sequence_no')::integer
    from jsonb_array_elements(p_criteria) el;
  insert into public.graduation_project_events(project_id,department_id,actor_user_id,actor_assignment_id,
      event_type,entity_type,entity_id,correlation_id,payload)
    values(null,p_department_id,auth.uid(),null,'rubric_upserted','graduation_project_rubrics',v_id,p_correlation_id,
      jsonb_build_object('operation', case when p_rubric_id is null then 'insert' else 'update' end,
        'code', trim(p_code), 'version_label', trim(p_version_label),
        'criteria_count', v_rows,
        'after', jsonb_build_object('title',trim(p_title),'passing_threshold',p_passing_threshold),
        'before', case when p_rubric_id is null then null else jsonb_build_object(
          'title',v_before_title,'passing_threshold',v_before_threshold,'criteria_count',v_before_criteria) end));
  return v_id;
end $$;
revoke all on function public.upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) from public, anon;
grant execute on function public.upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F-6: replay lookup scoped to the target department. A correlation-id
-- collision can no longer return another department's project id (existence
-- leak); the caller's own faithful retry still returns its recorded id.
create or replace function public.create_graduation_project(
  p_department_id uuid, p_title text, p_abstract text, p_program_id uuid,
  p_academic_year_id uuid, p_semester_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_actor public.graduation_project_assignments; v_assignment uuid;
begin
  select a.* into v_actor from public.graduation_project_assignments a
    join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head') and p.department_id=p_department_id
    order by a.assigned_at limit 1;
  if v_actor.id is null then raise exception 'project creation assignment required'; end if;
  select e.entity_id into v_id from public.graduation_project_events e
    join public.graduation_projects p on p.id=e.entity_id
    where e.correlation_id=p_correlation_id and e.event_type='project_created'
      and p.department_id=p_department_id;
  if v_id is not null then return v_id; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 300 then raise exception 'project title invalid'; end if;
  insert into public.graduation_projects(department_id,program_id,academic_year_id,semester_id,proposal_title,proposal_abstract)
    values(p_department_id,p_program_id,p_academic_year_id,p_semester_id,trim(p_title),p_abstract) returning id into v_id;
  insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values(v_id,v_actor.role,v_actor.faculty_profile_id,auth.uid(),p_department_id,auth.uid()) returning id into v_assignment;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(v_id,auth.uid(),v_assignment,'project_created','graduation_projects',v_id,p_correlation_id);
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(v_id,auth.uid(),v_assignment,'faculty_assigned','graduation_project_assignments',v_assignment,p_correlation_id);
  return v_id;
end $$;
revoke all on function public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F-7: replay before state gates (same ordering as the documented
-- assign_graduation_project_faculty LOW-3 fix). Settings-driven team_max
-- enforcement from M6 is preserved unchanged.
create or replace function public.add_graduation_project_team_member(p_project_id uuid,p_student_profile_id uuid,p_student_user_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
  v_settings public.graduation_project_settings; v_count integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='team_member_added';
  if new_id is not null then return new_id; end if;
  if p.state not in ('draft','revision_required') then raise exception 'team mutation state denied'; end if;
  v_settings:=public.graduation_project_settings_for(p.department_id,p.academic_year_id);
  if v_settings.id is not null then
    select count(*) into v_count from public.graduation_project_assignments
      where project_id=p_project_id and role='student' and active;
    if v_count>=v_settings.team_max then raise exception 'team size limit reached'; end if;
  end if;
  insert into public.graduation_project_assignments(project_id,role,student_profile_id,user_id,department_id,assigned_by)
    values(p_project_id,'student',p_student_profile_id,p_student_user_id,p.department_id,auth.uid()) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'team_member_added','graduation_project_assignments',new_id,p_correlation_id);
  return new_id;
end $$;
revoke all on function public.add_graduation_project_team_member(uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.add_graduation_project_team_member(uuid,uuid,uuid,uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F-9: note resolution requires the authoring supervisor assignment.
create or replace function public.resolve_graduation_project_supervisor_note(
  p_project_id uuid, p_note_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; n public.graduation_project_supervisor_notes;
  v_recorded uuid;
begin
  a:=public.require_graduation_project_assignment(p_project_id,array['supervisor']::public.graduation_project_assignment_role[]);
  -- LOW-2 (review 4982): replay returns the recorded entity_id, never the passed-in id.
  select entity_id into v_recorded from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='supervisor_note_resolved';
  if v_recorded is not null then return v_recorded; end if;
  select * into n from public.graduation_project_supervisor_notes where id=p_note_id and project_id=p_project_id for update;
  if n.id is null or n.resolved_at is not null then raise exception 'note resolution precondition failed'; end if;
  if n.supervisor_assignment_id<>a.id then raise exception 'note ownership required'; end if;
  update public.graduation_project_supervisor_notes set resolved_at=now() where id=n.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'supervisor_note_resolved','graduation_project_supervisor_notes',n.id,p_correlation_id);
  return n.id;
end $$;
revoke all on function public.resolve_graduation_project_supervisor_note(uuid,uuid,uuid) from public, anon;
grant execute on function public.resolve_graduation_project_supervisor_note(uuid,uuid,uuid) to authenticated;

commit;
