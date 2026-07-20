-- SOURCE-ONLY DRAFT. DO NOT APPLY WITHOUT SEPARATE AUTHORIZATION.
-- Academic clearance is subordinate to a department_transfer student request.
begin;

create type public.academic_clearance_status as enum ('draft','department_review','academic_affairs_review','approved','rejected','superseded');
create type public.course_equivalency_decision as enum ('equivalent','partially_equivalent','general_requirement','not_equivalent','needs_review','committee_decision_required');

create table public.academic_clearance_cases (
  id uuid primary key default gen_random_uuid(),
  student_request_id uuid not null unique references public.student_requests(id) on delete restrict,
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
  check ((status = 'approved') = (approved_at is not null and approved_by is not null))
);

create table public.academic_clearance_source_courses (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  student_grade_id uuid not null references public.student_grades(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_code text not null, course_name text not null, credit_hours numeric(5,2) not null check (credit_hours >= 0),
  final_grade text, passed boolean not null, snapshot jsonb not null, unique(case_id, student_grade_id)
);
create table public.academic_clearance_target_courses (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  study_plan_course_id uuid not null references public.study_plan_courses(id) on delete restrict,
  course_id uuid not null references public.courses(id) on delete restrict,
  course_code text not null, course_name text not null, credit_hours numeric(5,2) not null check (credit_hours >= 0),
  level_id uuid references public.academic_levels(id) on delete restrict, is_required boolean not null, snapshot jsonb not null,
  unique(case_id, study_plan_course_id)
);
create table public.academic_clearance_equivalencies (
  id uuid primary key default gen_random_uuid(), case_id uuid not null references public.academic_clearance_cases(id) on delete restrict,
  source_course_id uuid not null references public.academic_clearance_source_courses(id) on delete restrict,
  target_course_id uuid references public.academic_clearance_target_courses(id) on delete restrict,
  decision public.course_equivalency_decision not null default 'needs_review',
  accepted_credit_hours numeric(5,2) not null default 0 check (accepted_credit_hours >= 0), rationale text not null check (length(btrim(rationale)) > 0),
  decided_by uuid not null references auth.users(id) on delete restrict, decided_at timestamptz not null default now(),
  check ((decision in ('equivalent','partially_equivalent')) = (target_course_id is not null)),
  check (decision not in ('not_equivalent','needs_review','committee_decision_required') or accepted_credit_hours = 0),
  unique(case_id, source_course_id, target_course_id)
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

-- No broad admin/registrar/dean bypass. Direct processing assignment wins and must
-- bind the department_head role to this exact target department.
create function public.current_user_can_edit_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from academic_clearance_cases c
    join request_processing_assignments a on a.department_id=c.target_department_id and a.is_active=true
    join processing_roles r on r.id=a.role_id and r.code='department_head'
    left join faculty_profiles fp on fp.id=a.faculty_profile_id
    left join staff_profiles sp on sp.id=a.staff_profile_id
    where c.id=p_case_id and c.status in ('draft','department_review')
      and coalesce(fp.user_id,sp.user_id)=auth.uid()
  );
$$;
create function public.current_user_can_review_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from academic_clearance_cases c
    join request_processing_assignments a on a.unit_id is not null and a.is_active=true
    join processing_units u on u.id=a.unit_id and u.code='academic_affairs'
    join processing_roles r on r.id=a.role_id and r.code='academic_affairs_reviewer'
    left join faculty_profiles fp on fp.id=a.faculty_profile_id left join staff_profiles sp on sp.id=a.staff_profile_id
    where c.id=p_case_id and c.status in ('academic_affairs_review','approved') and coalesce(fp.user_id,sp.user_id)=auth.uid()
  );
$$;

alter table public.academic_clearance_cases enable row level security;
alter table public.academic_clearance_source_courses enable row level security;
alter table public.academic_clearance_target_courses enable row level security;
alter table public.academic_clearance_equivalencies enable row level security;
alter table public.academic_clearance_approvals enable row level security;
alter table public.academic_clearance_audit_log enable row level security;
revoke all on public.academic_clearance_cases, public.academic_clearance_source_courses, public.academic_clearance_target_courses, public.academic_clearance_equivalencies, public.academic_clearance_approvals, public.academic_clearance_audit_log from anon, authenticated;
grant select on public.academic_clearance_cases, public.academic_clearance_source_courses, public.academic_clearance_target_courses, public.academic_clearance_equivalencies, public.academic_clearance_approvals to authenticated;
create policy clearance_case_assignee_read on public.academic_clearance_cases for select to authenticated using (current_user_can_edit_academic_clearance(id) or current_user_can_review_academic_clearance(id));
create policy clearance_source_assignee_read on public.academic_clearance_source_courses for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_target_assignee_read on public.academic_clearance_target_courses for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_decision_assignee_read on public.academic_clearance_equivalencies for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
create policy clearance_approval_assignee_read on public.academic_clearance_approvals for select to authenticated using (current_user_can_edit_academic_clearance(case_id) or current_user_can_review_academic_clearance(case_id));
-- Mutations are RPC-only; audit has no client policy and is RPC/service readable only.

create function public.approve_academic_clearance(p_case_id uuid,p_expected_lock_version bigint,p_rationale text) returns void language plpgsql security definer set search_path=public as $$
declare v_case academic_clearance_cases; v_unresolved bigint;
begin
  if not current_user_can_review_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_case from academic_clearance_cases where id=p_case_id for update;
  if v_case.status <> 'academic_affairs_review' or v_case.lock_version <> p_expected_lock_version then raise exception 'ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE'; end if;
  select count(*) into v_unresolved from academic_clearance_equivalencies where case_id=p_case_id and decision in ('needs_review','committee_decision_required');
  if v_unresolved > 0 then raise exception 'ACADEMIC_CLEARANCE_UNRESOLVED'; end if;
  update academic_clearance_cases c set status='approved',approved_at=now(),approved_by=auth.uid(),lock_version=lock_version+1,
    accepted_credit_hours=(select coalesce(sum(accepted_credit_hours),0) from academic_clearance_equivalencies where case_id=p_case_id),
    remaining_credit_hours=greatest(0,(select total_credit_hours from study_plans where id=c.target_study_plan_id)-(select coalesce(sum(accepted_credit_hours),0) from academic_clearance_equivalencies where case_id=p_case_id)) where id=p_case_id;
  insert into academic_clearance_approvals(case_id,stage,decision,actor_id,rationale) values(p_case_id,'academic_affairs','approved',auth.uid(),p_rationale);
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'approved',to_jsonb(v_case),(select to_jsonb(x) from academic_clearance_cases x where x.id=p_case_id));
end $$;

-- Existing transfer finalization RPC must call this guard while holding the request row lock.
create function public.assert_department_transfer_clearance_approved(p_student_request_id uuid) returns void language plpgsql stable security definer set search_path=public as $$
begin
  if not exists(select 1 from academic_clearance_cases where student_request_id=p_student_request_id and status='approved') then raise exception 'ACADEMIC_CLEARANCE_REQUIRED'; end if;
end $$;

-- Corrections never mutate approved evidence: create a replacement case and mark the old one superseded in one privileged RPC.
create view public.academic_clearance_minutes as select c.id,c.student_request_id,c.status,c.accepted_credit_hours,c.remaining_credit_hours,c.proposed_level_id,c.approved_at,
 jsonb_agg(jsonb_build_object('source_code',s.course_code,'target_code',t.course_code,'decision',e.decision,'accepted_hours',e.accepted_credit_hours,'rationale',e.rationale) order by s.course_code) equivalencies
 from academic_clearance_cases c join academic_clearance_equivalencies e on e.case_id=c.id join academic_clearance_source_courses s on s.id=e.source_course_id left join academic_clearance_target_courses t on t.id=e.target_course_id group by c.id;
create view public.academic_clearance_reporting as select c.target_department_id,c.status,count(*) case_count,avg(c.accepted_credit_hours) avg_accepted_hours,
 count(*) filter(where c.status in ('draft','department_review','academic_affairs_review') and c.updated_at < now()-interval '14 days') overdue_count from academic_clearance_cases c group by c.target_department_id,c.status;
create view public.academic_clearance_course_outcomes as select t.course_id,t.course_code,e.decision,count(*) decision_count from academic_clearance_equivalencies e join academic_clearance_target_courses t on t.id=e.target_course_id where e.decision in ('equivalent','partially_equivalent','not_equivalent') group by t.course_id,t.course_code,e.decision;

revoke all on function public.approve_academic_clearance(uuid,bigint,text),public.assert_department_transfer_clearance_approved(uuid) from public,anon;
grant execute on function public.approve_academic_clearance(uuid,bigint,text) to authenticated;
-- assert guard is intentionally not granted to clients; only transfer finalization owner invokes it.
commit;
