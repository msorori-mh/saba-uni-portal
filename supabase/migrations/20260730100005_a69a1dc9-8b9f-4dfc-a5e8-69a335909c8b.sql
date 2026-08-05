-- GRADUATION-PROJECTS-ADMIN-SETTINGS-01 (forward-only, NOT_APPLIED).
-- GP-06 contract closure:
--   * per-department settings (team size, supervisor capacity, co-supervisor
--     rule, correction/defense windows, proposal submission window)
--   * settings-driven enforcement inside the existing RPCs (team min/max,
--     supervisor capacity, co-supervisor rule, proposal window)
--   * rubric management RPCs over the GP-02 reference tables
--   * defense report RPC (scheduled defenses, missing evaluations, results
--     distribution)
-- No table grants added; deny-by-default RLS stays intact.
begin;
do $$ begin
  if to_regclass('public.graduation_project_rubrics') is null then
    raise exception 'graduation projects hardening missing; apply reviewed hardening first';
  end if;
  if to_regclass('public.graduation_project_settings') is not null then
    raise exception 'graduation projects admin settings package already exists; refuse ambiguous retry';
  end if;
end $$;

create table public.graduation_project_settings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  academic_year_id uuid references public.academic_years(id) on delete restrict,
  team_min integer not null default 1 check (team_min >= 1),
  team_max integer not null default 3 check (team_max >= 1),
  supervisor_capacity integer check (supervisor_capacity is null or supervisor_capacity > 0),
  co_supervisor_allowed boolean not null default true,
  correction_window_days integer not null default 30 check (correction_window_days > 0),
  defense_notice_days integer not null default 7 check (defense_notice_days >= 0),
  proposal_window_opens_at timestamptz,
  proposal_window_closes_at timestamptz,
  active boolean not null default true,
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (team_max >= team_min),
  check (proposal_window_opens_at is null or proposal_window_closes_at is null
    or proposal_window_closes_at > proposal_window_opens_at)
);
create unique index graduation_project_settings_department_year
  on public.graduation_project_settings(department_id, academic_year_id) nulls not distinct;
alter table public.graduation_project_settings enable row level security;
revoke all on public.graduation_project_settings from anon, authenticated;

-- Settings resolution: year-specific row wins, department default (null year) next.
create function public.graduation_project_settings_for(p_department_id uuid, p_academic_year_id uuid)
returns public.graduation_project_settings language sql stable security invoker
set search_path=public,pg_temp as $$
  select s.* from public.graduation_project_settings s
  where s.department_id=p_department_id and s.active
    and (s.academic_year_id=p_academic_year_id or s.academic_year_id is null)
  order by s.academic_year_id nulls last
  limit 1
$$;
revoke all on function public.graduation_project_settings_for(uuid,uuid) from public, anon, authenticated;

-- Settings administration: department_head/dean of the department only (direct
-- active assignment on a project of the department, same rule as reports).
create function public.upsert_graduation_project_settings(
  p_department_id uuid, p_academic_year_id uuid, p_team_min integer, p_team_max integer,
  p_supervisor_capacity integer, p_co_supervisor_allowed boolean,
  p_correction_window_days integer, p_defense_notice_days integer, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('department_head','dean') and p.department_id=p_department_id) then
    raise exception 'settings administration assignment required';
  end if;
  if p_team_min is null or p_team_max is null or p_team_min<1 or p_team_max<p_team_min
    or (p_supervisor_capacity is not null and p_supervisor_capacity<=0)
    or p_correction_window_days is null or p_correction_window_days<=0
    or p_defense_notice_days is null or p_defense_notice_days<0 then
    raise exception 'settings invalid';
  end if;
  select s.id into v_id from public.graduation_project_settings s
    where s.department_id=p_department_id and s.academic_year_id is not distinct from p_academic_year_id
    for update;
  if v_id is null then
    insert into public.graduation_project_settings(department_id,academic_year_id,team_min,team_max,
      supervisor_capacity,co_supervisor_allowed,correction_window_days,defense_notice_days,updated_by)
      values(p_department_id,p_academic_year_id,p_team_min,p_team_max,p_supervisor_capacity,
        p_co_supervisor_allowed,p_correction_window_days,p_defense_notice_days,auth.uid())
      returning id into v_id;
  else
    update public.graduation_project_settings set
      team_min=p_team_min, team_max=p_team_max,
      supervisor_capacity=p_supervisor_capacity,
      co_supervisor_allowed=p_co_supervisor_allowed,
      correction_window_days=p_correction_window_days,
      defense_notice_days=p_defense_notice_days,
      updated_by=auth.uid(), updated_at=now()
      where id=v_id;
  end if;
  return v_id;
end $$;

create function public.get_graduation_project_settings(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'department_id',s.department_id,
      'academic_year_id',s.academic_year_id,'team_min',s.team_min,'team_max',s.team_max,
      'supervisor_capacity',s.supervisor_capacity,'co_supervisor_allowed',s.co_supervisor_allowed,
      'correction_window_days',s.correction_window_days,'defense_notice_days',s.defense_notice_days,
      'proposal_window_opens_at',s.proposal_window_opens_at,
      'proposal_window_closes_at',s.proposal_window_closes_at,'active',s.active,
      'updated_at',s.updated_at) order by s.academic_year_id nulls last),'[]'::jsonb)
    from public.graduation_project_settings s where s.department_id=p_department_id);
end $$;

-- Team add: enforce settings-driven team_max.
create or replace function public.add_graduation_project_team_member(p_project_id uuid,p_student_profile_id uuid,p_student_user_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
  v_settings public.graduation_project_settings; v_count integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p.state not in ('draft','revision_required') then raise exception 'team mutation state denied'; end if;
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='team_member_added';
  if new_id is not null then return new_id; end if;
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

-- Proposal submit: enforce settings-driven proposal window and team_min.
create or replace function public.submit_graduation_project_proposal(p_project_id uuid,p_expected_version bigint,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  v_settings public.graduation_project_settings; v_count integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  a:=public.require_graduation_project_assignment(p_project_id,array['student']::public.graduation_project_assignment_role[]);
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='proposal_submitted') then return p_project_id; end if;
  if p.state<>'draft' or p.version<>p_expected_version then raise exception 'proposal transition precondition failed'; end if;
  v_settings:=public.graduation_project_settings_for(p.department_id,p.academic_year_id);
  if v_settings.id is not null then
    if (v_settings.proposal_window_opens_at is not null and now()<v_settings.proposal_window_opens_at)
      or (v_settings.proposal_window_closes_at is not null and now()>v_settings.proposal_window_closes_at) then
      raise exception 'proposal window closed';
    end if;
    select count(*) into v_count from public.graduation_project_assignments
      where project_id=p_project_id and role='student' and active;
    if v_count<v_settings.team_min then raise exception 'team below minimum size'; end if;
  end if;
  update public.graduation_projects set state='submitted',version=version+1,updated_at=now() where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'proposal_submitted','graduation_projects',p_project_id,p_correlation_id);
  return p_project_id;
end $$;

-- Faculty assignment: settings-driven co-supervisor rule + supervisor capacity.
create or replace function public.assign_graduation_project_faculty(
  p_project_id uuid, p_role text, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
  v_settings public.graduation_project_settings; v_count integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p_role not in ('supervisor','co_supervisor','coordinator','panel_member') then raise exception 'faculty assignment role denied'; end if;
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='faculty_assigned';
  if new_id is not null then return new_id; end if;
  if p_role='panel_member' then
    if p.state not in ('approved','active','discussion_requested','discussion_scheduled') then raise exception 'faculty assignment state denied'; end if;
  elsif p.state not in ('draft','revision_required','approved','active') then raise exception 'faculty assignment state denied'; end if;
  if exists(select 1 from public.graduation_project_assignments where project_id=p_project_id and role=p_role::public.graduation_project_assignment_role and user_id=p_user_id and active) then
    raise exception 'faculty assignment already exists';
  end if;
  if p_role in ('supervisor','co_supervisor') and exists(select 1 from public.graduation_project_assignments
    where project_id=p_project_id and role=p_role::public.graduation_project_assignment_role and active) then
    raise exception 'project supervisor slot already filled';
  end if;
  v_settings:=public.graduation_project_settings_for(p.department_id,p.academic_year_id);
  if v_settings.id is not null then
    if p_role='co_supervisor' and not v_settings.co_supervisor_allowed then
      raise exception 'co-supervisor not allowed by settings';
    end if;
    if p_role='supervisor' and v_settings.supervisor_capacity is not null then
      select count(*) into v_count from public.graduation_project_assignments x
        join public.graduation_projects xp on xp.id=x.project_id
        where x.user_id=p_user_id and x.role='supervisor' and x.active
          and xp.department_id=p.department_id and xp.state not in ('archived','rejected','cancelled','completed');
      if v_count>=v_settings.supervisor_capacity then raise exception 'supervisor capacity reached'; end if;
    end if;
  end if;
  insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values(p_project_id,p_role::public.graduation_project_assignment_role,p_faculty_profile_id,p_user_id,p.department_id,auth.uid()) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'faculty_assigned','graduation_project_assignments',new_id,p_correlation_id);
  return new_id;
end $$;

-- Rubric management over the GP-02 reference tables.
create function public.upsert_graduation_project_rubric(
  p_department_id uuid, p_rubric_id uuid, p_code text, p_version_label text, p_title text,
  p_passing_threshold numeric, p_criteria jsonb, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_rows integer; v_codes integer; v_seqs integer;
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('department_head','dean') and p.department_id=p_department_id) then
    raise exception 'rubric administration assignment required';
  end if;
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
  return v_id;
end $$;

create function public.list_graduation_project_rubrics(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean','supervisor','co_supervisor') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'code',r.code,'version_label',r.version_label,
      'title',r.title,'passing_threshold',r.passing_threshold,'active',r.active,
      'criteria',(select coalesce(jsonb_agg(jsonb_build_object('criterion_code',c.criterion_code,
          'criterion_label',c.criterion_label,'maximum_score',c.maximum_score,'weight',c.weight,
          'sequence_no',c.sequence_no) order by c.sequence_no),'[]'::jsonb)
        from public.graduation_project_rubric_criteria c where c.rubric_id=r.id and c.department_id=r.department_id))
      order by r.code,r.version_label),'[]'::jsonb)
    from public.graduation_project_rubrics r where r.department_id=p_department_id and r.active);
end $$;

-- Defense report: scheduled defenses, panel completeness, missing evaluations,
-- results distribution. Same department authority as the other reports.
create function public.get_graduation_project_defense_report(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return jsonb_build_object('department_id',p_department_id,
    'scheduled_defenses',(select coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'title',p.proposal_title,
        'discussion_id',d.id,'starts_at',d.starts_at,'venue',d.venue,
        'panel_size',(select count(*) from public.graduation_project_panel_members pm where pm.discussion_id=d.id and pm.project_id=d.project_id),
        'has_chair',exists(select 1 from public.graduation_project_panel_members pm where pm.discussion_id=d.id and pm.project_id=d.project_id and pm.chair))
        order by d.starts_at),'[]'::jsonb)
      from public.graduation_project_discussions d
      join public.graduation_projects p on p.id=d.project_id and p.department_id=p_department_id
      where d.state in ('scheduled','postponed')),
    'missing_evaluations',(select coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'title',p.proposal_title,
        'discussion_id',d.id,'panel_size',x.panel_size,'finalized',x.finalized,'pending',x.panel_size-x.finalized)
        order by p.updated_at desc),'[]'::jsonb)
      from public.graduation_project_discussions d
      join public.graduation_projects p on p.id=d.project_id and p.department_id=p_department_id
      join lateral (select count(*) panel_size,
          count(*) filter(where e.state='finalized') finalized
        from public.graduation_project_panel_members pm
        left join public.graduation_project_evaluations e
          on e.panel_member_id=pm.id and e.discussion_id=pm.discussion_id and e.project_id=pm.project_id
        where pm.discussion_id=d.id and pm.project_id=d.project_id) x on true
      where d.state='held' and x.panel_size>x.finalized),
    'results_distribution',(select coalesce(jsonb_object_agg(b.bucket,b.n),'{}'::jsonb) from
      (select case when t.avg_total>=90 then '90-100' when t.avg_total>=80 then '80-89'
          when t.avg_total>=70 then '70-79' when t.avg_total>=60 then '60-69' else 'below-60' end bucket,
        count(*) n
        from (select e.project_id,avg(e.total_score) avg_total from public.graduation_project_evaluations e
          join public.graduation_projects p on p.id=e.project_id and p.department_id=p_department_id
          where e.state='finalized' group by e.project_id) t
        group by 1) b));
end $$;

revoke all on function public.upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) from public, anon;
revoke all on function public.get_graduation_project_settings(uuid) from public, anon;
revoke all on function public.upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) from public, anon;
revoke all on function public.list_graduation_project_rubrics(uuid) from public, anon;
revoke all on function public.get_graduation_project_defense_report(uuid) from public, anon;
grant execute on function public.upsert_graduation_project_settings(uuid,uuid,integer,integer,integer,boolean,integer,integer,uuid) to authenticated;
grant execute on function public.get_graduation_project_settings(uuid) to authenticated;
grant execute on function public.upsert_graduation_project_rubric(uuid,uuid,text,text,text,numeric,jsonb,uuid) to authenticated;
grant execute on function public.list_graduation_project_rubrics(uuid) to authenticated;
grant execute on function public.get_graduation_project_defense_report(uuid) to authenticated;
commit;
