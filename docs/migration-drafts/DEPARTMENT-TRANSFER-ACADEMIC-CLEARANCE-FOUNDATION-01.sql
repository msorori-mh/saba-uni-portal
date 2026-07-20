-- SOURCE-ONLY DRAFT. DO NOT APPLY WITHOUT SEPARATE AUTHORIZATION.
-- Academic clearance is subordinate to a department_transfer student request.
begin;

create type public.academic_clearance_status as enum ('draft','department_review','academic_affairs_review','approved','rejected','superseded');
create type public.course_equivalency_decision as enum ('equivalent','partially_equivalent','general_requirement','not_equivalent','needs_review','committee_decision_required');

create table public.academic_clearance_cases (
  id uuid primary key default gen_random_uuid(),
  supersedes_case_id uuid references public.academic_clearance_cases(id) on delete restrict,
  student_request_id uuid not null references public.student_requests(id) on delete restrict,
  student_profile_id uuid not null references public.student_profiles(id) on delete restrict,
  source_department_id uuid not null references public.departments(id) on delete restrict,
  target_department_id uuid not null references public.departments(id) on delete restrict,
  target_study_plan_id uuid not null references public.study_plans(id) on delete restrict,
  status public.academic_clearance_status not null default 'draft',
  source_snapshot_at timestamptz not null,
  target_snapshot_at timestamptz not null,
  accepted_credit_hours numeric(6,2) not null default 0 check (accepted_credit_hours >= 0),
  remaining_credit_hours numeric(6,2) not null check (remaining_credit_hours >= 0),
  proposed_level_id uuid references public.academic_levels(id) on delete restrict,
  approved_at timestamptz, approved_by uuid references auth.users(id) on delete restrict,
  lock_version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (source_department_id <> target_department_id),
  check (status <> 'approved' or (approved_at is not null and approved_by is not null))
);
create unique index academic_clearance_one_current_case on public.academic_clearance_cases(student_request_id) where status not in ('rejected','superseded');
create table public.academic_clearance_authority_config (
  id boolean primary key default true check (id), academic_affairs_unit_code text not null,
  academic_affairs_role_code text not null, approved_course_result_status text not null, is_approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete restrict, approved_at timestamptz,
  check (not is_approved or (approved_by is not null and approved_at is not null))
);

create table public.academic_clearance_source_courses (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  student_grade_id uuid not null references public.student_grades(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_code text not null, course_name text not null, credit_hours numeric(5,2) not null check (credit_hours >= 0),
  final_grade text, passed boolean not null, snapshot jsonb not null, unique(case_id, student_grade_id), unique(case_id,id)
);
create table public.academic_clearance_target_courses (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  study_plan_course_id uuid not null references public.study_plan_courses(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_code text not null, course_name text not null, credit_hours numeric(5,2) not null check (credit_hours >= 0),
  level_id uuid references public.academic_levels(id) on delete restrict, is_required boolean not null, snapshot jsonb not null,
  unique(case_id, study_plan_course_id), unique(case_id,id)
);
create table public.academic_clearance_equivalencies (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  source_course_id uuid not null,
  target_course_id uuid,
  decision public.course_equivalency_decision not null default 'needs_review',
  accepted_credit_hours numeric(5,2) not null default 0 check (accepted_credit_hours >= 0), rationale text not null check (length(btrim(rationale)) > 0),
  decided_by uuid not null references auth.users(id) on delete restrict, decided_at timestamptz not null default now(),
  check ((decision in ('equivalent','partially_equivalent')) = (target_course_id is not null)),
  check (decision not in ('not_equivalent','needs_review','committee_decision_required') or accepted_credit_hours = 0),
  foreign key(case_id,source_course_id) references public.academic_clearance_source_courses(case_id,id) on delete restrict,
  foreign key(case_id,target_course_id) references public.academic_clearance_target_courses(case_id,id) on delete restrict,
  unique(case_id, source_course_id), unique(case_id, target_course_id)
);
create table public.academic_clearance_approvals (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  stage text not null check (stage in ('target_department','academic_affairs','correction')),
  decision text not null check (decision in ('approved','rejected','returned','superseded')),
  actor_id uuid not null references auth.users(id) on delete restrict, rationale text not null check(length(btrim(rationale)) > 0),
  created_at timestamptz not null default now()
);
create table public.academic_clearance_audit_log (
  id bigint generated always as identity primary key, case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict, action text not null, before_state jsonb, after_state jsonb,
  correlation_id uuid not null default gen_random_uuid(), created_at timestamptz not null default now()
);

create function public.validate_academic_clearance_source_binding() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from academic_clearance_cases c
    join academic_clearance_authority_config cfg on cfg.id and cfg.is_approved
    join student_grades sg on sg.id=new.student_grade_id and sg.status='approved' and sg.approved_at is not null
    join student_enrollments se on se.id=sg.student_enrollment_id and se.student_profile_id=c.student_profile_id
    join grade_components gc on gc.id=sg.grade_component_id
    join course_sections cs on cs.id=se.course_section_id and cs.id=gc.course_section_id
    join course_offerings co on co.id=cs.course_offering_id and co.course_id=new.course_id
    join student_course_grade_summary gs on gs.enrollment_id=se.id and gs.student_profile_id=c.student_profile_id
      and gs.course_id=new.course_id and gs.overall_status=cfg.approved_course_result_status
    where c.id=new.case_id and new.passed and new.snapshot ? 'official_result_reference'
  ) then raise exception 'ACADEMIC_CLEARANCE_SOURCE_NOT_APPROVED_TRANSCRIPT'; end if;
  return new;
end $$;
create function public.validate_academic_clearance_target_binding() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists (
    select 1 from academic_clearance_cases c join study_plan_courses spc
      on spc.id=new.study_plan_course_id and spc.study_plan_id=c.target_study_plan_id
      and spc.course_id=new.course_id and spc.level_id is not distinct from new.level_id
    where c.id=new.case_id
  ) then raise exception 'ACADEMIC_CLEARANCE_TARGET_NOT_IN_PLAN'; end if;
  return new;
end $$;
create trigger clearance_source_binding before insert or update on public.academic_clearance_source_courses for each row execute function public.validate_academic_clearance_source_binding();
create trigger clearance_target_binding before insert or update on public.academic_clearance_target_courses for each row execute function public.validate_academic_clearance_target_binding();

create function public.validate_academic_clearance_credit() returns trigger language plpgsql security definer set search_path=public as $$
declare v_source numeric; v_target numeric;
begin
  select credit_hours into v_source from academic_clearance_source_courses where case_id=new.case_id and id=new.source_course_id;
  if new.target_course_id is not null then select credit_hours into v_target from academic_clearance_target_courses where case_id=new.case_id and id=new.target_course_id; end if;
  if new.accepted_credit_hours > v_source or (v_target is not null and new.accepted_credit_hours > v_target)
     or (new.decision in ('equivalent','partially_equivalent','general_requirement') and new.accepted_credit_hours <= 0)
  then raise exception 'ACADEMIC_CLEARANCE_CREDIT_EXCEEDS_BOUND'; end if;
  return new;
end $$;
create trigger clearance_credit_guard before insert or update on public.academic_clearance_equivalencies for each row execute function public.validate_academic_clearance_credit();

-- No broad admin/registrar/dean bypass. Direct processing assignment wins and must
-- bind the department_head role to this exact target department.
create function public.current_user_can_edit_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select (select count(*) from academic_clearance_cases c
    join request_processing_assignments a on a.department_id=c.target_department_id and a.is_active=true
    join request_processing_units u on u.id=a.unit_id and u.code='department' and u.is_active
    join request_processing_roles r on r.id=a.role_id and r.unit_id=u.id and r.code='department_head' and r.is_active
    where c.id=p_case_id and c.status in ('draft','department_review')
  )=1 and exists (
    select 1 from academic_clearance_cases c join request_processing_assignments a
      on a.department_id=c.target_department_id and a.is_active and a.user_id=auth.uid()
    join request_processing_units u on u.id=a.unit_id and u.code='department' and u.is_active
    join request_processing_roles r on r.id=a.role_id and r.unit_id=u.id and r.code='department_head' and r.is_active
    where c.id=p_case_id and c.status in ('draft','department_review')
  );
$$;
create function public.current_user_can_review_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select (select count(*) from academic_clearance_authority_config cfg
    join request_processing_units u on u.code=cfg.academic_affairs_unit_code and u.is_active
    join request_processing_roles r on r.unit_id=u.id and r.code=cfg.academic_affairs_role_code and r.is_active
    join request_processing_assignments a on a.unit_id=u.id and a.role_id=r.id and a.is_active
    where cfg.id and cfg.is_approved)=1 and exists (
    select 1 from academic_clearance_cases c
    join academic_clearance_authority_config cfg on cfg.id and cfg.is_approved
    join request_processing_units u on u.code=cfg.academic_affairs_unit_code and u.is_active
    join request_processing_roles r on r.unit_id=u.id and r.code=cfg.academic_affairs_role_code and r.is_active
    join request_processing_assignments a on a.unit_id=u.id and a.role_id=r.id and a.is_active and a.user_id=auth.uid()
    where c.id=p_case_id and c.status in ('academic_affairs_review','approved')
  );
$$;

alter table public.academic_clearance_cases enable row level security;
alter table public.academic_clearance_source_courses enable row level security;
alter table public.academic_clearance_target_courses enable row level security;
alter table public.academic_clearance_equivalencies enable row level security;
alter table public.academic_clearance_approvals enable row level security;
alter table public.academic_clearance_audit_log enable row level security;
alter table public.academic_clearance_authority_config enable row level security;
revoke all on public.academic_clearance_cases, public.academic_clearance_source_courses, public.academic_clearance_target_courses, public.academic_clearance_equivalencies, public.academic_clearance_approvals, public.academic_clearance_audit_log from anon, authenticated;
revoke all on public.academic_clearance_authority_config from anon, authenticated;
grant select on public.academic_clearance_cases, public.academic_clearance_source_courses, public.academic_clearance_target_courses, public.academic_clearance_equivalencies, public.academic_clearance_approvals to authenticated;
create policy clearance_case_assignee_read on public.academic_clearance_cases for select to authenticated using (current_user_can_edit_academic_clearance(id) or current_user_can_review_academic_clearance(id));
create policy clearance_source_assignee_read on public.academic_clearance_source_courses for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_target_assignee_read on public.academic_clearance_target_courses for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_decision_assignee_read on public.academic_clearance_equivalencies for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_approval_assignee_read on public.academic_clearance_approvals for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
-- Mutations are RPC-only; audit has no client policy and is RPC/service readable only.

create function public.approve_academic_clearance(p_case_id uuid,p_expected_lock_version bigint,p_rationale text) returns void language plpgsql security definer set search_path=public as $$
declare v_case academic_clearance_cases; v_unresolved bigint; v_missing bigint;
begin
  if not current_user_can_review_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_case from academic_clearance_cases where id=p_case_id for update;
  if v_case.status <> 'academic_affairs_review' or v_case.lock_version <> p_expected_lock_version then raise exception 'ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE'; end if;
  select count(*) into v_unresolved from academic_clearance_equivalencies where case_id=p_case_id and decision in ('needs_review','committee_decision_required');
  if v_unresolved > 0 then raise exception 'ACADEMIC_CLEARANCE_UNRESOLVED'; end if;
  select count(*) into v_missing from academic_clearance_source_courses s
    where s.case_id=p_case_id and not exists(select 1 from academic_clearance_equivalencies e where e.case_id=s.case_id and e.source_course_id=s.id);
  if v_missing > 0 or not exists(select 1 from academic_clearance_source_courses where case_id=p_case_id)
  then raise exception 'ACADEMIC_CLEARANCE_COMPARISON_INCOMPLETE'; end if;
  update academic_clearance_cases c set status='approved',approved_at=now(),approved_by=auth.uid(),lock_version=lock_version+1,
    accepted_credit_hours=(select coalesce(sum(accepted_credit_hours),0) from academic_clearance_equivalencies where case_id=p_case_id),
    remaining_credit_hours=(select total_credit_hours from study_plans where id=c.target_study_plan_id)-(select coalesce(sum(accepted_credit_hours),0) from academic_clearance_equivalencies where case_id=p_case_id),
    proposed_level_id=(select tc.level_id from academic_clearance_target_courses tc join academic_levels l on l.id=tc.level_id
      where tc.case_id=p_case_id and tc.is_required and not exists(select 1 from academic_clearance_equivalencies e where e.case_id=tc.case_id and e.target_course_id=tc.id and e.accepted_credit_hours>=tc.credit_hours)
      order by l.level_number limit 1) where id=p_case_id;
  insert into academic_clearance_approvals(case_id,stage,decision,actor_id,rationale) values(p_case_id,'academic_affairs','approved',auth.uid(),p_rationale);
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'approved',to_jsonb(v_case),(select to_jsonb(x) from academic_clearance_cases x where x.id=p_case_id));
end $$;

create function public.correct_academic_clearance(p_case_id uuid,p_expected_lock_version bigint,p_rationale text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_old academic_clearance_cases; v_new_id uuid;
begin
  if not current_user_can_review_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_old from academic_clearance_cases where id=p_case_id for update;
  if v_old.status<>'approved' or v_old.lock_version<>p_expected_lock_version or length(btrim(p_rationale))=0 then raise exception 'ACADEMIC_CLEARANCE_CORRECTION_INVALID'; end if;
  update academic_clearance_cases set status='superseded',lock_version=lock_version+1,updated_at=now() where id=p_case_id;
  insert into academic_clearance_cases(supersedes_case_id,student_request_id,student_profile_id,source_department_id,target_department_id,target_study_plan_id,status,source_snapshot_at,target_snapshot_at,remaining_credit_hours)
  values(v_old.id,v_old.student_request_id,v_old.student_profile_id,v_old.source_department_id,v_old.target_department_id,v_old.target_study_plan_id,'draft',v_old.source_snapshot_at,v_old.target_snapshot_at,v_old.remaining_credit_hours) returning id into v_new_id;
  insert into academic_clearance_approvals(case_id,stage,decision,actor_id,rationale) values(p_case_id,'correction','superseded',auth.uid(),p_rationale);
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'superseded_for_correction',to_jsonb(v_old),jsonb_build_object('replacement_case_id',v_new_id));
  return v_new_id;
end $$;

create function public.enforce_academic_clearance_immutability() returns trigger language plpgsql set search_path=public as $$
declare v_status academic_clearance_status;
begin
  if tg_table_name='academic_clearance_cases' then
    if old.status='approved' and not (tg_op='UPDATE' and new.status='superseded' and (to_jsonb(new)-array['status','lock_version','updated_at'])=(to_jsonb(old)-array['status','lock_version','updated_at'])) then raise exception 'APPROVED_CLEARANCE_IMMUTABLE'; end if;
  else
    select status into v_status from academic_clearance_cases where id=old.case_id;
    if v_status in ('approved','superseded') then raise exception 'APPROVED_CLEARANCE_EVIDENCE_IMMUTABLE'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
create trigger clearance_case_immutable before update or delete on public.academic_clearance_cases for each row execute function public.enforce_academic_clearance_immutability();
create trigger clearance_source_immutable before update or delete on public.academic_clearance_source_courses for each row execute function public.enforce_academic_clearance_immutability();
create trigger clearance_target_immutable before update or delete on public.academic_clearance_target_courses for each row execute function public.enforce_academic_clearance_immutability();
create trigger clearance_equivalency_immutable before update or delete on public.academic_clearance_equivalencies for each row execute function public.enforce_academic_clearance_immutability();
create trigger clearance_approvals_append_only before update or delete on public.academic_clearance_approvals for each row execute function public.enforce_academic_clearance_immutability();
create trigger clearance_audit_append_only before update or delete on public.academic_clearance_audit_log for each row execute function public.enforce_academic_clearance_immutability();

-- Existing transfer finalization RPC must call this guard while holding the request row lock.
create function public.assert_department_transfer_clearance_approved(p_student_request_id uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from academic_clearance_cases where student_request_id=p_student_request_id and status='approved') then raise exception 'ACADEMIC_CLEARANCE_REQUIRED'; end if;
end $$;

-- Forward source replacement for the already-applied trigger function. This is
-- the actual final-transfer guard; the applied migration file is not edited.
create or replace function public.apply_transfer_on_approval() returns trigger language plpgsql security definer set search_path=public as $$
declare v_details record;
begin
  if new.request_type='transfer' and new.status='approved' and coalesce(old.status,'') is distinct from 'approved' then
    perform public.assert_department_transfer_clearance_approved(new.id);
    select requested_program_id,requested_department_id into v_details from public.transfer_request_details where request_id=new.id;
    if v_details.requested_program_id is not null then
      perform set_config('app.bypass_student_lock','1',true);
      update public.student_profiles set program_id=v_details.requested_program_id,department_id=coalesce(v_details.requested_department_id,department_id),updated_at=now() where id=new.student_profile_id;
      perform set_config('app.bypass_student_lock','0',true);
    end if;
  end if;
  return new;
end $$;

-- Corrections never mutate approved evidence: create a replacement case and mark the old one superseded in one privileged RPC.
create view public.academic_clearance_minutes as select c.id,c.student_request_id,c.status,c.accepted_credit_hours,c.remaining_credit_hours,c.proposed_level_id,c.approved_at,
 jsonb_agg(jsonb_build_object('source_code',s.course_code,'target_code',t.course_code,'decision',e.decision,'accepted_hours',e.accepted_credit_hours,'rationale',e.rationale) order by s.course_code) equivalencies
 from academic_clearance_cases c join academic_clearance_equivalencies e on e.case_id=c.id join academic_clearance_source_courses s on s.id=e.source_course_id left join academic_clearance_target_courses t on t.id=e.target_course_id group by c.id;
create view public.academic_clearance_reporting as select c.target_department_id,c.status,count(*) case_count,avg(c.accepted_credit_hours) avg_accepted_hours,
 count(*) filter(where c.status in ('draft','department_review','academic_affairs_review') and c.updated_at < now()-interval '14 days') overdue_count from academic_clearance_cases c group by c.target_department_id,c.status;
create view public.academic_clearance_course_outcomes as select s.course_id source_course_id,s.course_code source_course_code,t.course_id target_course_id,t.course_code target_course_code,e.decision,count(*) decision_count from academic_clearance_equivalencies e join academic_clearance_source_courses s on s.id=e.source_course_id and s.case_id=e.case_id left join academic_clearance_target_courses t on t.id=e.target_course_id and t.case_id=e.case_id where e.decision in ('equivalent','partially_equivalent','not_equivalent') group by s.course_id,s.course_code,t.course_id,t.course_code,e.decision;

revoke all on function public.approve_academic_clearance(uuid,bigint,text),public.assert_department_transfer_clearance_approved(uuid) from public,anon;
revoke all on function public.correct_academic_clearance(uuid,bigint,text) from public,anon;
grant execute on function public.approve_academic_clearance(uuid,bigint,text) to authenticated;
grant execute on function public.correct_academic_clearance(uuid,bigint,text) to authenticated;
-- assert guard is intentionally not granted to clients; only transfer finalization owner invokes it.
commit;
