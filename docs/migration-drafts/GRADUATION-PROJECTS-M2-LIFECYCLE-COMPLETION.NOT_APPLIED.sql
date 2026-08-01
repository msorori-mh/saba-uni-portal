-- NOT_APPLIED — SOURCE-ONLY DRAFT — DO NOT APPLY
-- Original k3 migration file: supabase/migrations/20260730100001_96beebe1-d809-4302-a782-c2f6483e102a.sql
-- Intended apply order: M2 of 8 (original timestamp 20260730100001).
-- Relocated from supabase/migrations/ to docs/migration-drafts/ per source-only mission rules.

-- GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01 packaged as forward-only migration (NOT_APPLIED).
-- Source: docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql (PG17-verified).

begin;
do $$ begin
  if to_regclass('public.graduation_projects') is null then
    raise exception 'graduation projects foundation missing; apply reviewed foundation first';
  end if;
  if to_regprocedure('public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid)') is not null then
    raise exception 'graduation projects lifecycle completion already exists; refuse ambiguous retry';
  end if;
end $$;

-- Project creation is delegated: the caller must already hold an active coordinator or
-- department_head assignment on an existing project of the same department. The very
-- first coordinator/department_head/dean assignments of a department are provisioned by
-- a separately authorized privileged step using approved coordinator identities (G4).
-- The creator's department role is propagated onto the new project (audited), so every
-- project always has at least one directly accountable assignment.
create function public.create_graduation_project(
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
  select entity_id into v_id from public.graduation_project_events
    where correlation_id=p_correlation_id and event_type='project_created';
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

-- Proposal review: coordinator/department_head moves submitted/under_review proposals.
create function public.review_graduation_project_proposal(
  p_project_id uuid, p_action text, p_reason text, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  v_event text; v_state public.graduation_project_state; v_decision text; v_stage text; v_round integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p_action not in ('start_review','approve','reject','require_revision') then raise exception 'proposal review action unknown'; end if;
  v_event:=case p_action when 'start_review' then 'proposal_review_started' when 'approve' then 'proposal_approved'
    when 'reject' then 'proposal_rejected' else 'proposal_revision_required' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_project_id; end if;
  if p.version<>p_expected_version then raise exception 'proposal review precondition failed'; end if;
  if p_action in ('reject','require_revision') and length(trim(coalesce(p_reason,'')))=0 then raise exception 'review reason required'; end if;
  if p_action='start_review' then
    if p.state<>'submitted' then raise exception 'proposal review precondition failed'; end if;
    v_state:='under_review';
  elsif p_action='approve' then
    if p.state<>'under_review' then raise exception 'proposal review precondition failed'; end if;
    v_state:='approved'; v_decision:='approved';
  elsif p_action='reject' then
    if p.state not in ('submitted','under_review') then raise exception 'proposal review precondition failed'; end if;
    v_state:='rejected'; v_decision:='rejected';
  else
    if p.state not in ('submitted','under_review') then raise exception 'proposal review precondition failed'; end if;
    v_state:='revision_required'; v_decision:='revision_required';
  end if;
  update public.graduation_projects set state=v_state,version=version+1,updated_at=now(),
    approved_at=case when v_state='approved' then now() else approved_at end where id=p_project_id;
  if v_decision is not null then
    select count(*) into v_round from public.graduation_project_approvals where project_id=p_project_id and stage like 'proposal_round_%';
    v_stage:='proposal_round_'||(v_round+1);
    insert into public.graduation_project_approvals(project_id,stage,decision,assignment_id,reason)
      values(p_project_id,v_stage,v_decision,a.id,p_reason);
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,reason,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_projects',p_project_id,p_reason,p_correlation_id);
  return p_project_id;
end $$;

-- Resubmission after a revision_required decision (revision_required -> submitted).
create function public.resubmit_graduation_project_proposal(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['student']::public.graduation_project_assignment_role[]);
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='proposal_resubmitted') then return p_project_id; end if;
  if p.state<>'revision_required' or p.version<>p_expected_version then raise exception 'proposal resubmission precondition failed'; end if;
  update public.graduation_projects set state='submitted',version=version+1,updated_at=now() where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'proposal_resubmitted','graduation_projects',p_project_id,p_correlation_id);
  return p_project_id;
end $$;

-- Activation: approved project becomes active work.
create function public.activate_graduation_project(
  p_project_id uuid, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='project_activated') then return p_project_id; end if;
  if p.state<>'approved' or p.version<>p_expected_version then raise exception 'project activation precondition failed'; end if;
  update public.graduation_projects set state='active',version=version+1,updated_at=now() where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'project_activated','graduation_projects',p_project_id,p_correlation_id);
  return p_project_id;
end $$;

-- Faculty role assignment (supervisor/coordinator/panel_member). Institutional roles
-- (department_head/dean) stay privileged bootstrap assignments, not RPC-assignable.
create function public.assign_graduation_project_faculty(
  p_project_id uuid, p_role text, p_faculty_profile_id uuid, p_user_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p_role not in ('supervisor','coordinator','panel_member') then raise exception 'faculty assignment role denied'; end if;
  -- LOW-3 (review 4982): the idempotency replay check runs before the state
  -- gates, matching the sibling write RPCs, so a faithful retry returns the
  -- recorded assignment even after the project left the assignable states.
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='faculty_assigned';
  if new_id is not null then return new_id; end if;
  if p_role='panel_member' then
    if p.state not in ('approved','active','discussion_requested','discussion_scheduled') then raise exception 'faculty assignment state denied'; end if;
  elsif p.state not in ('draft','revision_required','approved','active') then raise exception 'faculty assignment state denied'; end if;
  -- LOW-1 (review 4982): guard the active-assignment unique index with a
  -- guarded P0001 message instead of surfacing raw 23505.
  if exists(select 1 from public.graduation_project_assignments where project_id=p_project_id and role=p_role::public.graduation_project_assignment_role and user_id=p_user_id and active) then
    raise exception 'faculty assignment already exists';
  end if;
  insert into public.graduation_project_assignments(project_id,role,faculty_profile_id,user_id,department_id,assigned_by)
    values(p_project_id,p_role::public.graduation_project_assignment_role,p_faculty_profile_id,p_user_id,p.department_id,auth.uid()) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'faculty_assigned','graduation_project_assignments',new_id,p_correlation_id);
  return new_id;
end $$;

-- End an assignment (not own, not in terminal states).
create function public.end_graduation_project_assignment(
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
  if not t.active then return t.id; end if;
  update public.graduation_project_assignments set active=false,ended_at=now() where id=t.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'assignment_ended','graduation_project_assignments',t.id,p_correlation_id);
  return t.id;
end $$;

-- Deliverable submission by a student against an open milestone. Only one live
-- ('submitted') version per milestone; older live versions become superseded.
create function public.submit_graduation_project_deliverable(
  p_project_id uuid, p_milestone_id uuid, p_summary text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  m public.graduation_project_milestones; new_id uuid; v_version integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['student']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='deliverable_submitted';
  if new_id is not null then return new_id; end if;
  if p.state<>'active' then raise exception 'deliverable submission state denied'; end if;
  select * into m from public.graduation_project_milestones where id=p_milestone_id and project_id=p_project_id for update;
  if m.id is null then raise exception 'milestone not found'; end if;
  if m.status not in ('pending','in_progress','late') then raise exception 'deliverable submission state denied'; end if;
  select coalesce(max(version_no),0)+1 into v_version from public.graduation_project_submissions where milestone_id=m.id and project_id=p_project_id;
  update public.graduation_project_submissions set state='superseded'
    where milestone_id=m.id and project_id=p_project_id and state='submitted';
  insert into public.graduation_project_submissions(project_id,milestone_id,version_no,submitted_by_assignment_id,summary)
    values(p_project_id,m.id,v_version,a.id,p_summary) returning id into new_id;
  update public.graduation_project_milestones set status='submitted' where id=m.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'deliverable_submitted','graduation_project_submissions',new_id,p_correlation_id);
  return new_id;
end $$;

-- Supervisor reviews a live submission: accept (milestone accepted, progress recomputed)
-- or require revision (milestone back to in_progress with a mandatory note).
create function public.review_graduation_project_submission(
  p_project_id uuid, p_submission_id uuid, p_action text, p_note text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  s public.graduation_project_submissions; v_event text;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['supervisor']::public.graduation_project_assignment_role[]);
  if p_action not in ('accept','require_revision') then raise exception 'submission review action unknown'; end if;
  v_event:=case p_action when 'accept' then 'submission_accepted' else 'submission_revision_required' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_submission_id; end if;
  if p.state<>'active' then raise exception 'submission review precondition failed'; end if;
  select * into s from public.graduation_project_submissions where id=p_submission_id and project_id=p_project_id for update;
  if s.id is null or s.state<>'submitted' then raise exception 'submission review precondition failed'; end if;
  if p_action='require_revision' and length(trim(coalesce(p_note,'')))=0 then raise exception 'revision note required'; end if;
  if p_action='accept' then
    update public.graduation_project_submissions set state='accepted',accepted_at=now() where id=s.id;
    update public.graduation_project_milestones set status='accepted',completion_percent=100 where id=s.milestone_id and project_id=p_project_id;
  else
    update public.graduation_project_submissions set state='revision_required' where id=s.id;
    update public.graduation_project_milestones set status='in_progress' where id=s.milestone_id and project_id=p_project_id;
  end if;
  if length(trim(coalesce(p_note,'')))>0 then
    insert into public.graduation_project_supervisor_notes(project_id,submission_id,supervisor_assignment_id,note)
      values(p_project_id,s.id,a.id,p_note);
  end if;
  update public.graduation_projects set updated_at=now(),
    progress_percent=(select coalesce(sum(weight*completion_percent)/nullif(sum(weight),0),0) from public.graduation_project_milestones where project_id=p_project_id),
    at_risk=exists(select 1 from public.graduation_project_milestones where project_id=p_project_id and due_at<now() and status<>'accepted')
    where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_project_submissions',s.id,p_correlation_id);
  return s.id;
end $$;

-- Supervisor note on a project or a specific submission.
create function public.add_graduation_project_supervisor_note(
  p_project_id uuid, p_submission_id uuid, p_note text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; new_id uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['supervisor']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='supervisor_note_added';
  if new_id is not null then return new_id; end if;
  if p.state not in ('active','discussion_requested','discussion_scheduled','evaluating','corrections_required') then raise exception 'note state denied'; end if;
  if length(trim(coalesce(p_note,'')))=0 then raise exception 'note text required'; end if;
  if p_submission_id is not null and not exists(select 1 from public.graduation_project_submissions where id=p_submission_id and project_id=p_project_id) then
    raise exception 'submission not found';
  end if;
  insert into public.graduation_project_supervisor_notes(project_id,submission_id,supervisor_assignment_id,note)
    values(p_project_id,p_submission_id,a.id,p_note) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'supervisor_note_added','graduation_project_supervisor_notes',new_id,p_correlation_id);
  return new_id;
end $$;

create function public.resolve_graduation_project_supervisor_note(
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
  update public.graduation_project_supervisor_notes set resolved_at=now() where id=n.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'supervisor_note_resolved','graduation_project_supervisor_notes',n.id,p_correlation_id);
  return n.id;
end $$;

-- Private attachment metadata registration. This never creates buckets, objects or
-- public URLs; the binary path stays blocked until the separately approved storage
-- policy. Files become retrievable only after an external scan marks scan_state='clean'.
create function public.register_graduation_project_file(
  p_project_id uuid, p_submission_id uuid, p_object_key text, p_original_name text,
  p_media_type text, p_byte_size bigint, p_sha256 text, p_correlation_id uuid
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
  if p_submission_id is not null and not exists(select 1 from public.graduation_project_submissions where id=p_submission_id and project_id=p_project_id) then
    raise exception 'submission not found';
  end if;
  -- LOW-1 (review 4982): guard the object_key unique constraint with a guarded
  -- P0001 message instead of surfacing raw 23505.
  if exists(select 1 from public.graduation_project_files where object_key=p_object_key) then
    raise exception 'file object key already registered';
  end if;
  insert into public.graduation_project_files(project_id,submission_id,object_key,original_name,media_type,byte_size,sha256,uploaded_by_assignment_id)
    values(p_project_id,p_submission_id,p_object_key,trim(p_original_name),trim(p_media_type),p_byte_size,p_sha256,a.id) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'file_registered','graduation_project_files',new_id,p_correlation_id);
  return new_id;
end $$;

-- Schedule a pending discussion request: approves the request, creates the discussion
-- and moves the project to discussion_scheduled atomically.
create function public.schedule_graduation_project_discussion(
  p_project_id uuid, p_request_id uuid, p_starts_at timestamptz, p_venue text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  r public.graduation_project_discussion_requests; new_id uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  select entity_id into new_id from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='discussion_scheduled';
  if new_id is not null then return new_id; end if;
  if p.state<>'discussion_requested' then raise exception 'discussion scheduling precondition failed'; end if;
  select * into r from public.graduation_project_discussion_requests where id=p_request_id and project_id=p_project_id for update;
  if r.id is null or r.state<>'pending' then raise exception 'discussion scheduling precondition failed'; end if;
  if p_starts_at is null or length(trim(coalesce(p_venue,'')))=0 then raise exception 'discussion schedule details invalid'; end if;
  update public.graduation_project_discussion_requests set state='approved',decided_at=now() where id=r.id;
  insert into public.graduation_project_discussions(project_id,request_id,starts_at,venue,coordinator_assignment_id)
    values(p_project_id,r.id,p_starts_at,trim(p_venue),a.id) returning id into new_id;
  update public.graduation_projects set state='discussion_scheduled',version=version+1,updated_at=now() where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'discussion_scheduled','graduation_project_discussions',new_id,p_correlation_id);
  return new_id;
end $$;

create function public.reject_graduation_project_discussion_request(
  p_project_id uuid, p_request_id uuid, p_reason text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  r public.graduation_project_discussion_requests; v_recorded uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  -- LOW-2 (review 4982): replay returns the recorded entity_id, never the passed-in id.
  select entity_id into v_recorded from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='discussion_request_rejected';
  if v_recorded is not null then return v_recorded; end if;
  if p.state<>'discussion_requested' then raise exception 'discussion rejection precondition failed'; end if;
  select * into r from public.graduation_project_discussion_requests where id=p_request_id and project_id=p_project_id for update;
  if r.id is null or r.state<>'pending' then raise exception 'discussion rejection precondition failed'; end if;
  if length(trim(coalesce(p_reason,'')))=0 then raise exception 'review reason required'; end if;
  update public.graduation_project_discussion_requests set state='rejected',decided_at=now(),decision_reason=p_reason where id=r.id;
  update public.graduation_projects set state='active',version=version+1,updated_at=now() where id=p_project_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,reason,correlation_id)
    values(p_project_id,auth.uid(),a.id,'discussion_request_rejected','graduation_project_discussion_requests',r.id,p_reason,p_correlation_id);
  return r.id;
end $$;

-- Attach an active panel_member assignment to a scheduled discussion.
create function public.assign_graduation_project_panel_member(
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
  -- LOW-1 (review 4982): guard the (discussion_id, assignment_id) unique index
  -- with a guarded P0001 message instead of surfacing raw 23505.
  if exists(select 1 from public.graduation_project_panel_members where discussion_id=d.id and assignment_id=t.id) then
    raise exception 'panel member already assigned';
  end if;
  insert into public.graduation_project_panel_members(project_id,discussion_id,assignment_id,chair)
    values(p_project_id,d.id,t.id,coalesce(p_chair,false)) returning id into new_id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'panel_member_assigned','graduation_project_panel_members',new_id,p_correlation_id);
  return new_id;
end $$;

-- Discussion outcome: held (project moves to evaluating), postponed (stays scheduled)
-- or cancelled (request cancelled, project back to active).
create function public.record_graduation_project_discussion_outcome(
  p_project_id uuid, p_discussion_id uuid, p_outcome text, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  d public.graduation_project_discussions; v_event text;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['coordinator','department_head']::public.graduation_project_assignment_role[]);
  if p_outcome not in ('held','postponed','cancelled') then raise exception 'discussion outcome unknown'; end if;
  v_event:=case p_outcome when 'held' then 'discussion_held' when 'postponed' then 'discussion_postponed' else 'discussion_cancelled' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_discussion_id; end if;
  select * into d from public.graduation_project_discussions where id=p_discussion_id and project_id=p_project_id for update;
  if d.id is null then raise exception 'discussion not found'; end if;
  if p_outcome='held' then
    if d.state not in ('scheduled','postponed') or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    update public.graduation_project_discussions set state='held' where id=d.id;
    update public.graduation_projects set state='evaluating',version=version+1,updated_at=now() where id=p_project_id;
  elsif p_outcome='postponed' then
    if d.state<>'scheduled' or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    update public.graduation_project_discussions set state='postponed' where id=d.id;
  else
    if d.state not in ('scheduled','postponed') or p.state<>'discussion_scheduled' then raise exception 'discussion outcome precondition failed'; end if;
    update public.graduation_project_discussions set state='cancelled' where id=d.id;
    update public.graduation_project_discussion_requests set state='cancelled',decided_at=now() where id=d.request_id;
    update public.graduation_projects set state='active',version=version+1,updated_at=now() where id=p_project_id;
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_project_discussions',d.id,p_correlation_id);
  return d.id;
end $$;

-- Panel member saves (draft) or submits their own evaluation with rubric scores.
-- p_scores: jsonb array of {"criterion_code","criterion_label","maximum_score","awarded_score","comment"?}.
create function public.save_graduation_project_evaluation(
  p_project_id uuid, p_discussion_id uuid, p_rubric_version text,
  p_scores jsonb, p_comments text, p_submit boolean, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  d public.graduation_project_discussions; pm public.graduation_project_panel_members;
  e public.graduation_project_evaluations; v_id uuid; v_total numeric(7,2);
  v_event text; v_codes integer; v_rows integer;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['panel_member']::public.graduation_project_assignment_role[]);
  v_event:=case when coalesce(p_submit,false) then 'evaluation_submitted' else 'evaluation_saved' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then
    select id into v_id from public.graduation_project_evaluations where discussion_id in (select id from public.graduation_project_discussions where project_id=p_project_id)
      and panel_member_id in (select id from public.graduation_project_panel_members where assignment_id=a.id and project_id=p_project_id);
    return v_id;
  end if;
  select * into d from public.graduation_project_discussions where id=p_discussion_id and project_id=p_project_id;
  if d.id is null or d.state<>'held' or p.state<>'evaluating' then raise exception 'evaluation write precondition failed'; end if;
  select * into pm from public.graduation_project_panel_members where discussion_id=d.id and project_id=p_project_id and assignment_id=a.id;
  if pm.id is null then raise exception 'evaluation write precondition failed'; end if;
  if p_scores is null or jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)=0 then raise exception 'evaluation scores invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_scores) el where jsonb_typeof(el)<>'object'
      or coalesce(el->>'criterion_code','')='' or coalesce(el->>'criterion_label','')=''
      or coalesce(el->>'maximum_score','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(el->>'awarded_score','') !~ '^[0-9]+([.][0-9]+)?$'
      -- LOW-5 (review 4982): the magnitude cap prevents a raw numeric(7,2) overflow.
      or (el->>'maximum_score')::numeric<=0 or (el->>'maximum_score')::numeric>99999.99 or (el->>'awarded_score')::numeric<0
      or (el->>'awarded_score')::numeric>(el->>'maximum_score')::numeric) then
    raise exception 'evaluation scores invalid';
  end if;
  select count(*),count(distinct el->>'criterion_code') into v_rows,v_codes from jsonb_array_elements(p_scores) el;
  if v_rows<>v_codes then raise exception 'evaluation scores invalid'; end if;
  if length(trim(coalesce(p_rubric_version,'')))=0 then raise exception 'evaluation scores invalid'; end if;
  select coalesce(sum((el->>'awarded_score')::numeric),0) into v_total from jsonb_array_elements(p_scores) el;
  select * into e from public.graduation_project_evaluations where discussion_id=d.id and panel_member_id=pm.id and project_id=p_project_id for update;
  if e.id is not null and e.state<>'draft' then raise exception 'evaluation already submitted'; end if;
  if e.id is null then
    insert into public.graduation_project_evaluations(project_id,discussion_id,panel_member_id,rubric_version,state,total_score,comments,submitted_at)
      values(p_project_id,d.id,pm.id,trim(p_rubric_version),case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
        v_total,p_comments,case when coalesce(p_submit,false) then now() else null end) returning id into v_id;
  else
    v_id:=e.id;
    update public.graduation_project_evaluations set rubric_version=trim(p_rubric_version),total_score=v_total,comments=p_comments,
      state=case when coalesce(p_submit,false) then 'submitted' else 'draft' end,
      submitted_at=case when coalesce(p_submit,false) then now() else submitted_at end where id=v_id;
    -- migration-review allowlist: SECURITY DEFINER child-row replacement only.
    -- Replaces draft evaluation scores after FOR UPDATE + draft-state guard; not bulk cleanup.
    delete from public.graduation_project_evaluation_scores where evaluation_id=v_id;
  end if;
  insert into public.graduation_project_evaluation_scores(evaluation_id,criterion_code,criterion_label,maximum_score,awarded_score,comment)
    select v_id,el->>'criterion_code',el->>'criterion_label',(el->>'maximum_score')::numeric,(el->>'awarded_score')::numeric,el->>'comment'
    from jsonb_array_elements(p_scores) el;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_project_evaluations',v_id,p_correlation_id);
  return v_id;
end $$;

-- Result conclusion by department_head/dean: completed, or corrections_required with an
-- explicit corrections list. Requires every recorded evaluation to be finalized.
create function public.conclude_graduation_project_result(
  p_project_id uuid, p_outcome text, p_corrections jsonb, p_expected_version bigint, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects;
  v_event text; v_stage text; v_round integer; v_correction jsonb;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['department_head','dean']::public.graduation_project_assignment_role[]);
  if p_outcome not in ('completed','corrections_required') then raise exception 'result outcome unknown'; end if;
  v_event:=case p_outcome when 'completed' then 'result_completed' else 'corrections_requested' end;
  if exists(select 1 from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type=v_event) then return p_project_id; end if;
  if p.state<>'evaluating' or p.version<>p_expected_version then raise exception 'result conclusion precondition failed'; end if;
  if not exists(select 1 from public.graduation_project_evaluations e where e.project_id=p_project_id and e.state='finalized')
    or exists(select 1 from public.graduation_project_evaluations e where e.project_id=p_project_id and e.state<>'finalized') then
    raise exception 'evaluations not finalized';
  end if;
  if p_outcome='corrections_required' then
    if p_corrections is null or jsonb_typeof(p_corrections)<>'array' or jsonb_array_length(p_corrections)=0
      or exists(select 1 from jsonb_array_elements(p_corrections) el where jsonb_typeof(el)<>'object' or length(trim(coalesce(el->>'description','')))=0) then
      raise exception 'corrections payload invalid';
    end if;
  end if;
  select count(*) into v_round from public.graduation_project_approvals where project_id=p_project_id and stage like 'result_round_%';
  v_stage:='result_round_'||(v_round+1);
  insert into public.graduation_project_approvals(project_id,stage,decision,assignment_id)
    values(p_project_id,v_stage,case p_outcome when 'completed' then 'approved' else 'revision_required' end,a.id);
  if p_outcome='completed' then
    update public.graduation_projects set state='completed',completed_at=now(),version=version+1,updated_at=now() where id=p_project_id;
  else
    for v_correction in select * from jsonb_array_elements(p_corrections) loop
      insert into public.graduation_project_corrections(project_id,requested_by_assignment_id,description,due_at)
        values(p_project_id,a.id,trim(v_correction->>'description'),
          case when coalesce(v_correction->>'due_at','')~'^[0-9]{4}-' then (v_correction->>'due_at')::timestamptz else null end);
    end loop;
    update public.graduation_projects set state='corrections_required',version=version+1,updated_at=now() where id=p_project_id;
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,v_event,'graduation_projects',p_project_id,p_correlation_id);
  return p_project_id;
end $$;

-- Student marks a requested correction as completed.
create function public.complete_graduation_project_correction(
  p_project_id uuid, p_correction_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; c public.graduation_project_corrections;
  v_recorded uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['student']::public.graduation_project_assignment_role[]);
  -- LOW-2 (review 4982): replay returns the recorded entity_id, never the passed-in id.
  select entity_id into v_recorded from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='correction_completed';
  if v_recorded is not null then return v_recorded; end if;
  if p.state<>'corrections_required' then raise exception 'correction completion precondition failed'; end if;
  select * into c from public.graduation_project_corrections where id=p_correction_id and project_id=p_project_id for update;
  if c.id is null or c.completed_at is not null then raise exception 'correction completion precondition failed'; end if;
  update public.graduation_project_corrections set completed_at=now() where id=c.id;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'correction_completed','graduation_project_corrections',c.id,p_correlation_id);
  return c.id;
end $$;

-- department_head/dean accepts a completed correction; when none remain unaccepted the
-- project returns to evaluating for result conclusion.
create function public.accept_graduation_project_correction(
  p_project_id uuid, p_correction_id uuid, p_correlation_id uuid
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.graduation_project_assignments; p public.graduation_projects; c public.graduation_project_corrections;
  v_recorded uuid;
begin
  select * into p from public.graduation_projects where id=p_project_id for update;
  if p.id is null then raise exception 'project not found'; end if;
  a:=public.require_graduation_project_assignment(p_project_id,array['department_head','dean']::public.graduation_project_assignment_role[]);
  -- LOW-2 (review 4982): replay returns the recorded entity_id, never the passed-in id.
  select entity_id into v_recorded from public.graduation_project_events where project_id=p_project_id and correlation_id=p_correlation_id and event_type='correction_accepted';
  if v_recorded is not null then return v_recorded; end if;
  if p.state not in ('corrections_required','evaluating') then raise exception 'correction acceptance precondition failed'; end if;
  select * into c from public.graduation_project_corrections where id=p_correction_id and project_id=p_project_id for update;
  if c.id is null or c.completed_at is null or c.accepted_at is not null then raise exception 'correction acceptance precondition failed'; end if;
  update public.graduation_project_corrections set accepted_at=now() where id=c.id;
  if p.state='corrections_required' and not exists(select 1 from public.graduation_project_corrections where project_id=p_project_id and accepted_at is null) then
    update public.graduation_projects set state='evaluating',version=version+1,updated_at=now() where id=p_project_id;
  end if;
  insert into public.graduation_project_events(project_id,actor_user_id,actor_assignment_id,event_type,entity_type,entity_id,correlation_id)
    values(p_project_id,auth.uid(),a.id,'correction_accepted','graduation_project_corrections',c.id,p_correlation_id);
  return c.id;
end $$;

-- Read surface (fail-closed, assignment-scoped). No table/view grants are added;
-- every read flows through these narrowly authorized security definer functions.

create function public.list_my_graduation_projects()
returns table(project_id uuid, department_id uuid, title text, state public.graduation_project_state,
  progress_percent numeric, at_risk boolean, version bigint, roles text[], updated_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query
    select p.id,p.department_id,p.proposal_title,p.state,p.progress_percent,p.at_risk,p.version,
      array_agg(distinct a.role::text order by a.role::text),max(p.updated_at)
    from public.graduation_projects p
    join public.graduation_project_assignments a on a.project_id=p.id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
    group by p.id
    order by max(p.updated_at) desc;
end $$;

create function public.get_graduation_project_detail(p_project_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_roles text[]; v_staff boolean; v_panel boolean; v_student boolean; v_result jsonb;
begin
  perform public.require_graduation_project_assignment(p_project_id,
    array['student','supervisor','coordinator','department_head','dean','panel_member']::public.graduation_project_assignment_role[]);
  select array_agg(distinct a.role::text order by a.role::text) into v_roles
    from public.graduation_project_assignments a
    where a.project_id=p_project_id and a.user_id=auth.uid() and a.active and a.ended_at is null;
  v_staff:=v_roles && array['supervisor','coordinator','department_head','dean'];
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

-- Department report authorization: an active coordinator/department_head/dean
-- assignment on any project of the department is required.
create function public.get_graduation_project_states_report(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return (select jsonb_build_object('department_id',p_department_id,
    'summary',jsonb_build_object('total',count(*),
      'by_state',(select coalesce(jsonb_object_agg(s.state,s.n),'{}'::jsonb) from
        (select p2.state::text state,count(*) n from public.graduation_projects p2 where p2.department_id=p_department_id group by p2.state) s),
      'at_risk',count(*) filter(where p.at_risk),
      'with_overdue',count(*) filter(where exists(select 1 from public.graduation_project_milestones m
        where m.project_id=p.id and m.due_at<now() and m.status<>'accepted')),
      'discussion_ready',count(*) filter(where public.graduation_project_is_discussion_ready(p.id))),
    'projects',coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'title',p.proposal_title,'state',p.state,
      'progress_percent',p.progress_percent,'at_risk',p.at_risk,'version',p.version,
      'overdue_milestones',(select count(*) from public.graduation_project_milestones m
        where m.project_id=p.id and m.due_at<now() and m.status<>'accepted'),
      'discussion_ready',public.graduation_project_is_discussion_ready(p.id),'updated_at',p.updated_at)
      order by p.updated_at desc),'[]'::jsonb))
  from public.graduation_projects p where p.department_id=p_department_id);
end $$;

create function public.get_graduation_project_assignments_report(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return jsonb_build_object('department_id',p_department_id,
    'supervisors',(select coalesce(jsonb_agg(jsonb_build_object('assignment_id',sup.assignment_id,'user_id',sup.user_id,
        'active_projects',sup.active_projects,'at_risk_projects',sup.at_risk_projects,'avg_progress',sup.avg_progress)
        order by sup.active_projects desc),'[]'::jsonb)
      from (select a.id assignment_id,a.user_id,count(distinct p.id) active_projects,
          count(distinct p.id) filter(where p.at_risk) at_risk_projects,
          round(coalesce(avg(p.progress_percent),0),2) avg_progress
        from public.graduation_project_assignments a
        join public.graduation_projects p on p.id=a.project_id and p.department_id=p_department_id
        where a.role='supervisor' and a.active and p.state not in ('archived','rejected','cancelled')
        group by a.id,a.user_id) sup),
    'teams',(select coalesce(jsonb_agg(jsonb_build_object('project_id',t.project_id,'students',t.students,
        'supervisors',t.supervisors) order by t.project_id),'[]'::jsonb)
      from (select p.id project_id,
          count(distinct a.id) filter(where a.role='student' and a.active) students,
          count(distinct a.id) filter(where a.role='supervisor' and a.active) supervisors
        from public.graduation_projects p
        left join public.graduation_project_assignments a on a.project_id=p.id
        where p.department_id=p_department_id group by p.id) t),
    'unassigned_projects',(select coalesce(jsonb_agg(p.id order by p.created_at),'[]'::jsonb)
      from public.graduation_projects p
      where p.department_id=p_department_id and p.state in ('approved','active')
        and not exists(select 1 from public.graduation_project_assignments a
          where a.project_id=p.id and a.role='supervisor' and a.active)));
end $$;

create function public.get_graduation_project_evaluations_report(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return jsonb_build_object('department_id',p_department_id,
    'projects',(select coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'title',p.proposal_title,'state',p.state,
        'finalized_evaluations',coalesce(x.finalized,0),'avg_total',x.avg_total,'min_total',x.min_total,'max_total',x.max_total,
        'rubric_versions',coalesce(x.rubrics,'[]'::jsonb),'pending_corrections',coalesce(x.pending_corrections,0))
        order by p.updated_at desc),'[]'::jsonb)
      from public.graduation_projects p
      left join lateral (select count(*) filter(where e.state='finalized') finalized,
          round(avg(e.total_score) filter(where e.state='finalized'),2) avg_total,
          min(e.total_score) filter(where e.state='finalized') min_total,
          max(e.total_score) filter(where e.state='finalized') max_total,
          jsonb_agg(distinct e.rubric_version) filter(where e.state='finalized') rubrics,
          (select count(*) from public.graduation_project_corrections c where c.project_id=p.id and c.accepted_at is null) pending_corrections
        from public.graduation_project_evaluations e where e.project_id=p.id) x on true
      where p.department_id=p_department_id
        and exists(select 1 from public.graduation_project_evaluations e2 where e2.project_id=p.id and e2.state='finalized')));
end $$;

create function public.get_graduation_project_archive_report(p_department_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.graduation_project_assignments a join public.graduation_projects p on p.id=a.project_id
    where a.user_id=auth.uid() and a.active and a.ended_at is null
      and a.role in ('coordinator','department_head','dean') and p.department_id=p_department_id) then
    raise exception 'department report assignment required';
  end if;
  return jsonb_build_object('department_id',p_department_id,
    'archives',(select coalesce(jsonb_agg(jsonb_build_object('project_id',p.id,'title',p.proposal_title,
        'archived_at',fa.archived_at,'approved_by_assignment_id',fa.approved_by_assignment_id,
        'final_file',jsonb_build_object('id',ff.id,'original_name',ff.original_name,
          'object_key',case when ff.scan_state='clean' then ff.object_key else null end,
          'byte_size',ff.byte_size,'sha256',ff.sha256,'scan_state',ff.scan_state))
        order by fa.archived_at desc),'[]'::jsonb)
      from public.graduation_project_final_archives fa
      join public.graduation_projects p on p.id=fa.project_id and p.department_id=p_department_id
      join public.graduation_project_files ff on ff.id=fa.final_file_id and ff.project_id=fa.project_id));
end $$;

-- Grants: deny-by-default, executable only by authenticated callers. The functions
-- themselves re-verify auth.uid() and exact direct active assignments.
revoke all on function public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.review_graduation_project_proposal(uuid,text,text,bigint,uuid) from public, anon;
revoke all on function public.resubmit_graduation_project_proposal(uuid,bigint,uuid) from public, anon;
revoke all on function public.activate_graduation_project(uuid,bigint,uuid) from public, anon;
revoke all on function public.assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid) from public, anon;
revoke all on function public.end_graduation_project_assignment(uuid,uuid,uuid) from public, anon;
revoke all on function public.submit_graduation_project_deliverable(uuid,uuid,text,uuid) from public, anon;
revoke all on function public.review_graduation_project_submission(uuid,uuid,text,text,uuid) from public, anon;
revoke all on function public.add_graduation_project_supervisor_note(uuid,uuid,text,uuid) from public, anon;
revoke all on function public.resolve_graduation_project_supervisor_note(uuid,uuid,uuid) from public, anon;
revoke all on function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid) from public, anon;
revoke all on function public.schedule_graduation_project_discussion(uuid,uuid,timestamptz,text,uuid) from public, anon;
revoke all on function public.reject_graduation_project_discussion_request(uuid,uuid,text,uuid) from public, anon;
revoke all on function public.assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid) from public, anon;
revoke all on function public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid) from public, anon;
revoke all on function public.save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid) from public, anon;
revoke all on function public.conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid) from public, anon;
revoke all on function public.complete_graduation_project_correction(uuid,uuid,uuid) from public, anon;
revoke all on function public.accept_graduation_project_correction(uuid,uuid,uuid) from public, anon;
revoke all on function public.list_my_graduation_projects() from public, anon;
revoke all on function public.get_graduation_project_detail(uuid) from public, anon;
revoke all on function public.get_graduation_project_states_report(uuid) from public, anon;
revoke all on function public.get_graduation_project_assignments_report(uuid) from public, anon;
revoke all on function public.get_graduation_project_evaluations_report(uuid) from public, anon;
revoke all on function public.get_graduation_project_archive_report(uuid) from public, anon;
grant execute on function public.create_graduation_project(uuid,text,text,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.review_graduation_project_proposal(uuid,text,text,bigint,uuid) to authenticated;
grant execute on function public.resubmit_graduation_project_proposal(uuid,bigint,uuid) to authenticated;
grant execute on function public.activate_graduation_project(uuid,bigint,uuid) to authenticated;
grant execute on function public.assign_graduation_project_faculty(uuid,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.end_graduation_project_assignment(uuid,uuid,uuid) to authenticated;
grant execute on function public.submit_graduation_project_deliverable(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.review_graduation_project_submission(uuid,uuid,text,text,uuid) to authenticated;
grant execute on function public.add_graduation_project_supervisor_note(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.resolve_graduation_project_supervisor_note(uuid,uuid,uuid) to authenticated;
grant execute on function public.register_graduation_project_file(uuid,uuid,text,text,text,bigint,text,uuid) to authenticated;
grant execute on function public.schedule_graduation_project_discussion(uuid,uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.reject_graduation_project_discussion_request(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.assign_graduation_project_panel_member(uuid,uuid,uuid,boolean,uuid) to authenticated;
grant execute on function public.record_graduation_project_discussion_outcome(uuid,uuid,text,uuid) to authenticated;
grant execute on function public.save_graduation_project_evaluation(uuid,uuid,text,jsonb,text,boolean,uuid) to authenticated;
grant execute on function public.conclude_graduation_project_result(uuid,text,jsonb,bigint,uuid) to authenticated;
grant execute on function public.complete_graduation_project_correction(uuid,uuid,uuid) to authenticated;
grant execute on function public.accept_graduation_project_correction(uuid,uuid,uuid) to authenticated;
grant execute on function public.list_my_graduation_projects() to authenticated;
grant execute on function public.get_graduation_project_detail(uuid) to authenticated;
grant execute on function public.get_graduation_project_states_report(uuid) to authenticated;
grant execute on function public.get_graduation_project_assignments_report(uuid) to authenticated;
grant execute on function public.get_graduation_project_evaluations_report(uuid) to authenticated;
grant execute on function public.get_graduation_project_archive_report(uuid) to authenticated;
-- Direct table writes stay revoked; lifecycle mutations flow only through the atomic
-- RPCs above and the merged foundation RPCs. No bucket or storage policy is created.
commit;
