-- GRADUATION-PROJECTS-FILES-AND-NOTIFICATIONS-01 (forward-only, NOT_APPLIED).
-- GP-05 contract closure:
--   * attachment policy in register_graduation_project_file: MIME allowlist,
--     50 MiB size cap, stage binding via file_kind (default keeps old calls valid)
--   * notification fan-out: append-only event log -> deduped notification_log
--     (unique key + ON CONFLICT DO NOTHING; re-fired events never duplicate)
--   * own-notifications read RPC (the only app read path; table stays revoked)
--   * orphan-file review RPC for the service path (cleanup stays a privileged,
--     separately authorized batch — this package never deletes)
begin;
do $$ begin
  if to_regclass('public.graduation_project_notification_log') is null then
    raise exception 'graduation projects hardening missing; apply reviewed hardening first';
  end if;
  if to_regprocedure('public.list_my_graduation_project_notifications()') is not null then
    raise exception 'graduation projects files/notifications package already exists; refuse ambiguous retry';
  end if;
end $$;

-- Attachment contract. One function identity: the 8-arg form keeps working via
-- the defaulted p_file_kind, so existing callers remain valid.
alter table public.graduation_project_files
  add column file_kind text not null default 'attachment'
    check (file_kind in ('attachment','proposal','milestone_submission','supervisor_feedback',
      'final_manuscript','presentation','source_archive','defense_minutes','correction_version','archived_final'));

drop function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid);
create function public.register_graduation_project_file(
  p_project_id uuid, p_submission_id uuid, p_object_key text, p_original_name text,
  p_media_type text, p_byte_size bigint, p_sha256 text, p_correlation_id uuid,
  p_file_kind text default 'attachment'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['student','supervisor']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='file_registered';
  if new_id is not null then return new_id; end if;
  if p.state not in ('active','corrections_required') then raise exception 'file registration state denied'; end if;
  if p_object_key is null or not (p_object_key like 'graduation-projects/'||p_project_id::text||'/%')
    or p_object_key like '%..%' or p_object_key ilike 'http%' then
    raise exception 'file object key outside project scope';
  end if;
  if length(trim(coalesce(p_original_name,'')))=0 or length(trim(coalesce(p_media_type,'')))=0
    or p_byte_size is null or p_byte_size<=0 or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'file metadata invalid';
  end if;
  -- Attachment policy: MIME allowlist + 50 MiB cap + stage binding.
  if p_media_type not in (
    'application/pdf','application/zip','application/x-zip-compressed',
    'image/png','image/jpeg','text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) then
    raise exception 'file media type not allowed';
  end if;
  if p_byte_size > 52428800 then raise exception 'file size exceeds limit'; end if;
  if p_file_kind not in ('attachment','proposal','milestone_submission','supervisor_feedback',
    'final_manuscript','presentation','source_archive','defense_minutes','correction_version','archived_final') then
    raise exception 'file kind invalid';
  end if;
  if p_file_kind in ('milestone_submission','supervisor_feedback') and p_submission_id is null then
    raise exception 'file stage binding invalid';
  end if;
  if p_submission_id is not null and not exists(select 1 from public.graduation_project_submissions where id=p_submission_id and project_id=p_project_id) then
    raise exception 'submission not found';
  end if;
  if p_file_kind='final_manuscript' and not exists(
    select 1 from public.graduation_project_submissions s join public.graduation_project_milestones m
      on (m.id,m.project_id)=(s.milestone_id,s.project_id)
    where s.id=p_submission_id and s.project_id=p_project_id and m.milestone_kind='final') then
    raise exception 'final manuscript must attach to a final milestone submission';
  end if;
  if exists(select 1 from public.graduation_project_files where object_key=p_object_key) then
    raise exception 'file object key already registered';
  end if;
  insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,uploaded_by_assignment_id,file_kind)
    values(p_project_id,p_submission_id,p_object_key,trim(p_original_name),trim(p_media_type),p_byte_size,p_sha256,a.id,p_file_kind) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id,payload)
    values(p_project_id,auth.uid(),a.id,'file_registered','graduation_project_files',new_id,p_correlation_id,jsonb_build_object('file_kind',p_file_kind));
  return new_id;
end $$;
revoke all on function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text) from public, anon;
grant execute on function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid,text) to authenticated;

-- Detail read surface: expose file_kind alongside the other file metadata.
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
      'scan_decided_at',f.scan_decided_at,'file_kind',f.file_kind,
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

-- Notification fan-out. notification_type reuses the event vocabulary so one
-- Arabic label set covers both. Recipients are resolved from active direct
-- assignments of THIS project only; the actor never notifies themselves.
create function public.graduation_project_notify_from_event() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_recipient uuid;
begin
  -- single-recipient events: the subject assignment's user
  if new.event_type in ('team_member_added','faculty_assigned','assignment_ended') then
    select a.user_id into v_recipient from public.graduation_project_assignments a
      where a.id=new.entity_id and a.project_id=new.project_id;
    if v_recipient is not null and v_recipient<>new.actor_user_id then
      insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
        values(new.project_id,v_recipient,new.event_type,new.entity_type,new.entity_id,new.correlation_id)
        on conflict do nothing;
    end if;
    return new;
  end if;
  if new.event_type='panel_member_assigned' then
    select a.user_id into v_recipient from public.graduation_project_panel_members pm
      join public.graduation_project_assignments a on a.id=pm.assignment_id and a.project_id=pm.project_id
      where pm.id=new.entity_id and pm.project_id=new.project_id;
    if v_recipient is not null and v_recipient<>new.actor_user_id then
      insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
        values(new.project_id,v_recipient,new.event_type,new.entity_type,new.entity_id,new.correlation_id)
        on conflict do nothing;
    end if;
    return new;
  end if;
  if new.event_type='discussion_request_rejected' then
    select a.user_id into v_recipient from public.graduation_project_discussion_requests r
      join public.graduation_project_assignments a on a.id=r.requested_by_assignment_id and a.project_id=r.project_id
      where r.id=new.entity_id and r.project_id=new.project_id;
    if v_recipient is not null and v_recipient<>new.actor_user_id then
      insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
        values(new.project_id,v_recipient,new.event_type,new.entity_type,new.entity_id,new.correlation_id)
        on conflict do nothing;
    end if;
    return new;
  end if;
  -- role fan-out events
  if new.event_type in ('proposal_submitted','proposal_resubmitted','discussion_requested') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('coordinator','department_head') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('proposal_review_started','proposal_approved','proposal_rejected','proposal_revision_required',
      'submission_accepted','submission_revision_required','supervisor_note_added','result_completed','corrections_requested','correction_accepted') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role='student' and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('deliverable_submitted') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('supervisor','co_supervisor') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('project_activated','milestone_set','discussion_scheduled','discussion_postponed','discussion_cancelled','project_archived') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('student','supervisor','co_supervisor') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('discussion_held') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('student','supervisor','co_supervisor','panel_member') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('evaluation_finalized') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('department_head','dean') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  elsif new.event_type in ('correction_completed') then
    insert into public.graduation_project_notification_log(project_id,recipient_user_id,notification_type,entity_type,entity_id,correlation_id)
      select new.project_id,a.user_id,new.event_type,new.entity_type,new.entity_id,new.correlation_id
      from public.graduation_project_assignments a
      where a.project_id=new.project_id and a.active and a.role in ('supervisor','department_head','dean') and a.user_id<>new.actor_user_id
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger graduation_project_events_notify after insert on public.graduation_project_events
for each row execute function public.graduation_project_notify_from_event();

-- Own notifications: the only application read path over the revoked log table.
create function public.list_my_graduation_project_notifications()
returns table(project_id uuid, notification_type text, entity_type text, entity_id uuid, occurred_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select n.project_id,n.notification_type,n.entity_type,n.entity_id,n.created_at
  from public.graduation_project_notification_log n
  where n.recipient_user_id=auth.uid()
  order by n.id desc
  limit 100
$$;
revoke all on function public.list_my_graduation_project_notifications() from public, anon;
grant execute on function public.list_my_graduation_project_notifications() to authenticated;

-- Orphan review for the separately authorized cleanup batch. Review-only: this
-- package never deletes. Not executable by app roles (service path only).
create function public.list_graduation_project_orphan_files()
returns table(file_id uuid, project_id uuid, object_key text, reason text)
language sql stable security definer set search_path=public,pg_temp as $$
  select f.id,f.project_id,f.object_key,
    case when f.scan_state='pending' then 'scan_pending_expired' else 'unlinked_terminal' end
  from public.graduation_project_files f
  join public.graduation_projects p on p.id=f.project_id
  where (f.scan_state='pending' and f.created_at < now() - interval '30 days')
     or (f.submission_id is null and p.state in ('archived','rejected','cancelled'))
$$;
revoke all on function public.list_graduation_project_orphan_files() from public, anon, authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    execute 'grant execute on function public.list_graduation_project_orphan_files() to service_role';
  end if;
end $$;
commit;
