-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Original k3 migration file: supabase/migrations/20260730100003_1811ed11-afad-4cbc-8f8a-287ba5b13a19.sql
-- Intended apply order: M4 of 8 (original timestamp 20260730100003).
-- Relocated from supabase/migrations/ to docs/migration-drafts/ per source-only mission rules.

-- GRADUATION-PROJECTS-COMPLETION-HARDENING-01 (forward-only, NOT_APPLIED).
-- Closes the GP-02 contract gaps on top of the packaged foundation+lifecycle:
--   * activates the co_supervisor role (subject shape, assignment RPC, read surface)
--   * exactly-one active supervisor / co_supervisor per project
--   * exactly-one pending discussion request per project
--   * exactly-one panel chair per discussion
--   * rubric definition tables (reference data; managed via GP-06 admin RPCs)
--   * notification dedupe log (written by the GP-05 notification contract)
--   * external file scan-state decision RPC (service-role only, no app grant)
-- No table grants are added; deny-by-default RLS stays intact.
begin;
do $$ begin
  if to_regprocedure('public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)') is null then
    raise exception 'graduation projects lifecycle missing; apply reviewed lifecycle first';
  end if;
  if not exists(
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'graduation_project_assignment_role' and e.enumlabel = 'co_supervisor'
  ) then
    raise exception 'co_supervisor enum value missing; apply the enum migration first';
  end if;
  if to_regclass('public.graduation_project_rubrics') is not null then
    raise exception 'graduation projects hardening already exists; refuse ambiguous retry';
  end if;
end $$;

-- co_supervisor is a faculty-side assignment subject (same shape as supervisor).
alter table public.graduation_project_assignments drop constraint assignment_subject_shape;
alter table public.graduation_project_assignments add constraint assignment_subject_shape check (
  (role = 'student' and student_profile_id is not null and faculty_profile_id is null) or
  (role in ('supervisor','co_supervisor','coordinator','department_head','dean','panel_member')
    and faculty_profile_id is not null and student_profile_id is null)
);

-- Exactly-one-active-assignment hardening (per project, per supervision slot).
create unique index graduation_project_single_active_supervisor
  on public.graduation_project_assignments(project_id, role)
  where active and role in ('supervisor','co_supervisor');
create unique index graduation_project_single_pending_discussion_request
  on public.graduation_project_discussion_requests(project_id) where state = 'pending';
create unique index graduation_project_single_panel_chair
  on public.graduation_project_panel_members(discussion_id) where chair;

-- Faculty role assignment: co_supervisor becomes assignable; supervision slots are
-- guarded with a P0001 message instead of surfacing raw 23505 from the new index.
create or replace function public.assign_graduation_project_faculty(
  p_project_id uuid, p_role text, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
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
  insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values(p_project_id,p_role::public.graduation_project_assignment_role,p_faculty_profile_id,p_user_id,p.department_id,auth.uid()) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'faculty_assigned','graduation_project_assignments',new_id,p_correlation_id);
  return new_id;
end $$;

-- Discussion request: exactly one pending request per project, guarded message.
create or replace function public.request_graduation_project_discussion(p_project_id uuid,p_correlation_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  a:=public.require_graduation_project_assignment(p_project_id,array['student','supervisor']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='discussion_requested';
  if new_id is not null then return new_id; end if;
  if not public.graduation_project_is_discussion_ready(p_project_id) then raise exception 'discussion readiness failed'; end if;
  if exists(select 1 from public.graduation_project_discussion_requests where project_id=p_project_id and state='pending') then
    raise exception 'discussion request already pending';
  end if;
  insert into public.graduation_project_discussion_requests(project_id,requested_by_assignment_id) values(p_project_id,a.id) returning id into new_id;
  update public.graduation_projects set state='discussion_requested',version=version+1 where id=p_project_id and state='active';
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'discussion_requested','graduation_project_discussion_requests',new_id,p_correlation_id);
  return new_id;
end $$;

-- Panel assignment: exactly one chair per discussion, guarded message.
create or replace function public.assign_graduation_project_panel_member(
  p_project_id uuid, p_discussion_id uuid, p_assignment_id uuid, p_chair boolean, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; d public.graduation_project_discussions;
  t public.graduation_project_assignments; new_id uuid;
begin
  select * into d from public.graduation_project_discussions where id=p_discussion_id and project_id=p_project_id for update;
  if d.id is null then raise exception 'discussion not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='panel_member_assigned';
  if new_id is not null then return new_id; end if;
  if d.state<>'scheduled' then raise exception 'panel assignment precondition failed'; end if;
  select * into t from public.graduation_project_assignments where id=p_assignment_id and project_id=p_project_id and active and role='panel_member';
  if t.id is null then raise exception 'panel assignment precondition failed'; end if;
  if exists(select 1 from public.graduation_project_panel_members where discussion_id=d.id and assignment_id=t.id) then
    raise exception 'panel member already assigned';
  end if;
  if coalesce(p_chair,false) and exists(select 1 from public.graduation_project_panel_members where discussion_id=d.id and chair) then
    raise exception 'panel chair already assigned';
  end if;
  insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id,chair)
    values(p_project_id,d.id,t.id,coalesce(p_chair,false)) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'panel_member_assigned','graduation_project_panel_members',new_id,p_correlation_id);
  return new_id;
end $$;

-- Scan-decision audit columns (the external scanner holds no auth.users identity,
-- so the decision is audited on the file row itself instead of the events log).
alter table public.graduation_project_files
  add column scan_decided_at timestamptz,
  add column scan_correlation_id uuid;

-- Detail read surface: co_supervisor gains staff-level read visibility (no new
-- write authority; every write RPC keeps its own exact role whitelist).
create or replace function public.get_graduation_project_detail(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_roles text[]; v_staff boolean; v_panel boolean; v_student boolean; v_result jsonb;
begin
  perform public.require_graduation_project_assignment(p_project_id,
    array['student','supervisor','co_supervisor','coordinator','department_head','dean','panel_member']::public.graduation_project_assignment_role[]);
  select array_agg(distinct a.role::text order by a.role::text) into v_roles
    from public.graduation_project_assignments a
    where a.project_id=p_project_id and a.user_id=auth.uid() and a.active and a.ended_at is null;
  v_staff:=v_roles && array['supervisor','co_supervisor','coordinator','department_head','dean'];
  v_panel:=v_roles && array['panel_member'];
  v_student:=v_roles && array['student'];
  with
  pr as (select jsonb_build_object('id',p.id,'department_id',p.department_id,'program_id',p.program_id,
      'academic_year_id',p.academic_year_id,'semester_id',p.semester_id,'proposal_title',p.proposal_title,
      'proposal_abstract',p.proposal_abstract,'state',p.state,'progress_percent',p.progress_percent,
      'at_risk',p.at_risk,'version',p.version,'approved_at',p.approved_at,'completed_at',p.completed_at,
      'archived_at',p.archived_at,'created_at',p.created_at,'updated_at',p.updated_at) v
    from public.graduation_projects p where p.id=p_project_id),
  asg as (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'role',a.role,'user_id',a.user_id,
      'student_profile_id',a.student_profile_id,'faculty_profile_id',a.faculty_profile_id,'active',a.active,
      'assigned_at',a.assigned_at,'ended_at',a.ended_at) order by a.assigned_at),'[]'::jsonb) v
    from public.graduation_project_assignments a where a.project_id=p_project_id),
  ms as (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'milestone_kind',m.milestone_kind,
      'sequence_no',m.sequence_no,'weight',m.weight,'due_at',m.due_at,'status',m.status,
      'completion_percent',m.completion_percent) order by m.sequence_no),'[]'::jsonb) v
    from public.graduation_project_milestones m where m.project_id=p_project_id),
  sb as (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'milestone_id',s.milestone_id,'version_no',s.version_no,
      'state',s.state,'summary',s.summary,'submitted_at',s.submitted_at,'accepted_at',s.accepted_at,
      'submitted_by_assignment_id',s.submitted_by_assignment_id) order by s.submitted_at),'[]'::jsonb) v
    from public.graduation_project_submissions s where s.project_id=p_project_id),
  fl as (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'submission_id',f.submission_id,
      'original_name',f.original_name,'media_type',f.media_type,'byte_size',f.byte_size,'scan_state',f.scan_state,
      'object_key',case when f.scan_state='clean' then f.object_key else null end,
      'scan_decided_at',f.scan_decided_at,
      'uploaded_by_assignment_id',f.uploaded_by_assignment_id,'created_at',f.created_at) order by f.created_at),'[]'::jsonb) v
    from public.graduation_project_files f where f.project_id=p_project_id),
  nt as (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'submission_id',n.submission_id,'note',n.note,
      'supervisor_assignment_id',n.supervisor_assignment_id,'created_at',n.created_at,'resolved_at',n.resolved_at)
      order by n.created_at),'[]'::jsonb) v
    from public.graduation_project_supervisor_notes n where n.project_id=p_project_id),
  ap as (select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'stage',g.stage,'decision',g.decision,
      'assignment_id',g.assignment_id,'reason',g.reason,'decided_at',g.decided_at) order by g.decided_at),'[]'::jsonb) v
    from public.graduation_project_approvals g where g.project_id=p_project_id),
  dr as (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'state',r.state,'requested_at',r.requested_at,
      'decided_at',r.decided_at,'decision_reason',r.decision_reason,
      'requested_by_assignment_id',r.requested_by_assignment_id) order by r.requested_at),'[]'::jsonb) v
    from public.graduation_project_discussion_requests r where r.project_id=p_project_id),
  ds as (select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'request_id',d.request_id,'starts_at',d.starts_at,
      'venue',d.venue,'state',d.state,'coordinator_assignment_id',d.coordinator_assignment_id) order by d.starts_at),'[]'::jsonb) v
    from public.graduation_project_discussions d where d.project_id=p_project_id),
  pm as (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'discussion_id',x.discussion_id,'assignment_id',x.assignment_id,
      'chair',x.chair,'conflict_declared',x.conflict_declared)),'[]'::jsonb) v
    from public.graduation_project_panel_members x where x.project_id=p_project_id),
  ev as (select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'discussion_id',e.discussion_id,
      'panel_member_id',e.panel_member_id,'rubric_version',e.rubric_version,'state',e.state,'total_score',e.total_score,
      'comments',e.comments,'submitted_at',e.submitted_at,'finalized_at',e.finalized_at,
      'scores',(select coalesce(jsonb_agg(jsonb_build_object('criterion_code',sc.criterion_code,'criterion_label',sc.criterion_label,
        'maximum_score',sc.maximum_score,'awarded_score',sc.awarded_score,'comment',sc.comment)
        order by sc.criterion_code),'[]'::jsonb)
        from public.graduation_project_evaluation_scores sc where sc.evaluation_id=e.id))
      order by e.submitted_at nulls first),'[]'::jsonb) v
    from public.graduation_project_evaluations e
    where e.project_id=p_project_id and (v_staff or e.state='finalized'
      or (v_panel and e.panel_member_id in (select x.id from public.graduation_project_panel_members x
        join public.graduation_project_assignments xa on xa.id=x.assignment_id and xa.project_id=x.project_id
        where x.project_id=p_project_id and xa.user_id=auth.uid() and xa.active)))),
  cr as (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'due_at',c.due_at,
      'completed_at',c.completed_at,'accepted_at',c.accepted_at,
      'requested_by_assignment_id',c.requested_by_assignment_id) order by c.due_at nulls last),'[]'::jsonb) v
    from public.graduation_project_corrections c where c.project_id=p_project_id),
  ar as (select jsonb_build_object('id',fa.id,'archived_at',fa.archived_at,
      'approved_by_assignment_id',fa.approved_by_assignment_id,'final_file_id',fa.final_file_id,
      'final_file_name',ff.original_name,'final_file_object_key',case when ff.scan_state='clean' then ff.object_key else null end) v
    from public.graduation_project_final_archives fa
    join public.graduation_project_files ff on ff.id=fa.final_file_id and ff.project_id=fa.project_id
    where fa.project_id=p_project_id),
  evn as (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'event_type',t.event_type,'entity_type',t.entity_type,
      'entity_id',t.entity_id,'actor_user_id',t.actor_user_id,'actor_assignment_id',t.actor_assignment_id,
      'reason',t.reason,'payload',t.payload,'occurred_at',t.occurred_at) order by t.id),'[]'::jsonb) v
    from public.graduation_project_events t where t.project_id=p_project_id)
  select jsonb_build_object('project',pr.v,'viewer_roles',v_roles,'assignments',asg.v,'milestones',ms.v,
    'submissions',sb.v,'files',fl.v,'notes',nt.v,'approvals',ap.v,'discussion_requests',dr.v,'discussions',ds.v,
    'panel_members',pm.v,'evaluations',ev.v,'corrections',cr.v,'archive',ar.v,'events',evn.v)
  into v_result from pr,asg,ms,sb,fl,nt,ap,dr,ds,pm,ev,cr,evn left join ar on true;
  return v_result;
end $$;

-- Scan-decision audit columns were added above (before the detail reader).

-- External scanner decision RPC. One-way: pending -> clean|quarantined|rejected.
-- Replaying the same decision is a no-op; a conflicting decision fails closed.
-- Intentionally NOT granted to anon/authenticated: only the service role (when
-- present) may execute it, and only from the approved scanning pipeline.
create function public.set_graduation_project_file_scan_state(
  p_file_id uuid, p_scan_state text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare f public.graduation_project_files;
begin
  if p_scan_state not in ('clean','quarantined','rejected') then raise exception 'scan state invalid'; end if;
  select * into f from public.graduation_project_files where id=p_file_id for update;
  if f.id is null then raise exception 'file not found'; end if;
  if f.scan_state<>'pending' then
    if f.scan_state=p_scan_state then return f.id; end if;
    raise exception 'file scan state already decided';
  end if;
  update public.graduation_project_files set scan_state=p_scan_state,scan_decided_at=now(),scan_correlation_id=p_correlation_id where id=f.id;
  return f.id;
end $$;

-- Rubric definitions (reference data). Write path arrives with the GP-06 admin
-- settings RPCs; evaluation entry keeps referencing rubric version labels.
create table public.graduation_project_rubrics (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete restrict,
  code text not null check (length(trim(code)) between 2 and 60),
  version_label text not null check (length(trim(version_label)) between 1 and 60),
  title text not null check (length(trim(title)) between 3 and 300),
  passing_threshold numeric(7,2) check (passing_threshold is null or passing_threshold > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(department_id, code, version_label),
  unique(id, department_id)
);
create table public.graduation_project_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  rubric_id uuid not null,
  department_id uuid not null,
  criterion_code text not null check (length(trim(criterion_code)) between 1 and 60),
  criterion_label text not null check (length(trim(criterion_label)) between 1 and 300),
  maximum_score numeric(7,2) not null check (maximum_score > 0),
  weight numeric(6,3) not null default 1 check (weight > 0),
  sequence_no integer not null check (sequence_no > 0),
  foreign key(rubric_id, department_id) references public.graduation_project_rubrics(id, department_id) on delete restrict,
  unique(rubric_id, criterion_code),
  unique(rubric_id, sequence_no)
);

-- Notification dedupe log. The GP-05 notification contract appends one row per
-- (project, recipient, type, entity); the unique key makes fan-out idempotent.
create table public.graduation_project_notification_log (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.graduation_projects(id) on delete restrict,
  recipient_user_id uuid not null references auth.users(id) on delete restrict,
  notification_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique(project_id, recipient_user_id, notification_type, entity_id)
);

alter table public.graduation_project_rubrics enable row level security;
alter table public.graduation_project_rubric_criteria enable row level security;
alter table public.graduation_project_notification_log enable row level security;
revoke all on public.graduation_project_rubrics,
  public.graduation_project_rubric_criteria,
  public.graduation_project_notification_log from anon, authenticated;

revoke all on function public.set_graduation_project_file_scan_state(uuid,text,uuid) from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.set_graduation_project_file_scan_state(uuid,text,uuid) to service_role';
  end if;
end $$;
commit;
