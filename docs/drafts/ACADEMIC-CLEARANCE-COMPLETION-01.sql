-- DRAFT ONLY — DO NOT APPLY. SOURCE-ONLY DRAFT. DO NOT APPLY WITHOUT SEPARATE AUTHORIZATION.
-- ACADEMIC-CLEARANCE-COMPLETION-01 (Q-14)
--
-- Completes the seven-status academic clearance lifecycle and adopts the
-- resolved D-10 seven-value comparison vocabulary on top of the merged
-- foundation draft docs/migration-drafts/DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql
-- (applied first in review/verification order; both drafts remain unapplied).
--
-- Forward-only: no applied migration and no merged draft is edited. Enums gain
-- values; functions and views are replaced with CREATE OR REPLACE; two new
-- reviewer RPCs are added. Academic clearance stays subordinate to a
-- department_transfer student request, and original grades are never mutated —
-- they are read only as immutable snapshot evidence.

-- PostgreSQL cannot use a freshly added enum value inside the transaction that
-- added it, so both enum extensions run outside the transaction block.
alter type public.academic_clearance_status add value if not exists 'returned' before 'approved';
alter type public.course_equivalency_decision add value if not exists 'supporting_requirement' after 'general_requirement';

begin;

-- The target-department chair (owner of the academic review, D-10 rule 3) keeps
-- editing while the case is draft, under department review, or returned by
-- academic affairs for rework.
create or replace function public.current_user_can_edit_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from academic_clearance_cases c
    join student_request_workflow_steps ws on ws.student_request_id=c.student_request_id
      and ws.status='active' and ws.assigned_user_id=auth.uid()
    join request_processing_assignments a on a.department_id=c.target_department_id
      and a.is_active and a.user_id=ws.assigned_user_id and a.unit_id=ws.processing_unit_id and a.role_id=ws.processing_role_id
    join request_processing_units u on u.id=a.unit_id and u.code='department' and u.is_active
    join request_processing_roles r on r.id=a.role_id and r.unit_id=u.id and r.code='department_head' and r.is_active
    where c.id=p_case_id and c.status in ('draft','department_review','returned')
  );
$$;

-- Academic affairs reviews in-flight cases and retains read access to rejected
-- cases (its own terminal, documented decisions).
create or replace function public.current_user_can_review_academic_clearance(p_case_id uuid) returns boolean language sql stable security definer set search_path=public as $$
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
    where c.id=p_case_id and c.status in ('academic_affairs_review','approved','rejected')
  );
$$;

-- Returned cases are editable again; saving the comparison moves them back to
-- department review for resubmission. Nothing else changes.
create or replace function public.save_academic_clearance_equivalency(p_case_id uuid,p_expected_lock_version bigint,p_source_course_id uuid,p_target_course_id uuid,p_decision public.course_equivalency_decision,p_accepted_credit_hours numeric,p_rationale text) returns void language plpgsql security definer set search_path=public as $$
declare v_case academic_clearance_cases;
begin
  if not current_user_can_edit_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_case from academic_clearance_cases where id=p_case_id for update;
  if v_case.lock_version<>p_expected_lock_version or v_case.status not in ('draft','department_review','returned') then raise exception 'ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE'; end if;
  insert into academic_clearance_equivalencies(case_id,source_course_id,target_course_id,decision,accepted_credit_hours,rationale,decided_by)
  values(p_case_id,p_source_course_id,p_target_course_id,p_decision,p_accepted_credit_hours,p_rationale,auth.uid())
  on conflict(case_id,source_course_id) do update set target_course_id=excluded.target_course_id,decision=excluded.decision,accepted_credit_hours=excluded.accepted_credit_hours,rationale=excluded.rationale,decided_by=auth.uid(),decided_at=now();
  update academic_clearance_cases set status='department_review',lock_version=lock_version+1,updated_at=now() where id=p_case_id;
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'chair_equivalency_saved',to_jsonb(v_case),jsonb_build_object('source_course_id',p_source_course_id,'decision',p_decision));
end $$;

-- supporting_requirement is credit-bearing like general_requirement: it counts
-- accepted hours without mapping to a specific target-plan course.
create or replace function public.validate_academic_clearance_credit() returns trigger language plpgsql security definer set search_path=public as $$
declare v_source numeric; v_target numeric;
begin
  select credit_hours into v_source from academic_clearance_source_courses where case_id=new.case_id and id=new.source_course_id;
  if new.target_course_id is not null then select credit_hours into v_target from academic_clearance_target_courses where case_id=new.case_id and id=new.target_course_id; end if;
  if new.accepted_credit_hours > v_source or (v_target is not null and new.accepted_credit_hours > v_target)
     or (new.decision in ('equivalent','partially_equivalent','general_requirement','supporting_requirement') and new.accepted_credit_hours <= 0)
  then raise exception 'ACADEMIC_CLEARANCE_CREDIT_EXCEEDS_BOUND'; end if;
  return new;
end $$;

-- Rejected cases are terminal like approved ones: the case row cannot be
-- updated or deleted and its child evidence stays immutable. The reject RPC
-- records its approvals/audit provenance through INSERT, which these
-- UPDATE/DELETE triggers never block.
create or replace function public.enforce_academic_clearance_immutability() returns trigger language plpgsql set search_path=public as $$
declare v_status academic_clearance_status;
begin
  if tg_table_name='academic_clearance_cases' then
    if old.status='approved' and not (tg_op='UPDATE' and new.status='superseded' and (to_jsonb(new)-array['status','lock_version','updated_at'])=(to_jsonb(old)-array['status','lock_version','updated_at'])) then raise exception 'APPROVED_CLEARANCE_IMMUTABLE'; end if;
    if old.status='rejected' then raise exception 'REJECTED_CLEARANCE_IMMUTABLE'; end if;
  else
    select status into v_status from academic_clearance_cases where id=old.case_id;
    if v_status in ('approved','superseded','rejected') then raise exception 'APPROVED_CLEARANCE_EVIDENCE_IMMUTABLE'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

-- Academic affairs returns the case to the target department for rework.
create function public.return_academic_clearance_to_department(p_case_id uuid,p_expected_lock_version bigint,p_rationale text) returns void language plpgsql security definer set search_path=public as $$
declare v_case academic_clearance_cases;
begin
  if not current_user_can_review_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_case from academic_clearance_cases where id=p_case_id for update;
  if v_case.status<>'academic_affairs_review' or v_case.lock_version<>p_expected_lock_version or length(btrim(p_rationale))=0 then raise exception 'ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE'; end if;
  update academic_clearance_cases set status='returned',lock_version=lock_version+1,updated_at=now() where id=p_case_id;
  insert into academic_clearance_approvals(case_id,stage,decision,actor_id,rationale) values(p_case_id,'academic_affairs','returned',auth.uid(),p_rationale);
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'returned_to_department',to_jsonb(v_case),(select to_jsonb(c) from academic_clearance_cases c where c.id=p_case_id));
end $$;

-- Academic affairs rejects the case with a documented rationale. Rejected is
-- terminal; a later clearance attempt for the same request starts as a new
-- case because the partial unique index excludes rejected rows.
create function public.reject_academic_clearance(p_case_id uuid,p_expected_lock_version bigint,p_rationale text) returns void language plpgsql security definer set search_path=public as $$
declare v_case academic_clearance_cases;
begin
  if not current_user_can_review_academic_clearance(p_case_id) then raise exception 'ACADEMIC_CLEARANCE_FORBIDDEN'; end if;
  select * into v_case from academic_clearance_cases where id=p_case_id for update;
  if v_case.status<>'academic_affairs_review' or v_case.lock_version<>p_expected_lock_version or length(btrim(p_rationale))=0 then raise exception 'ACADEMIC_CLEARANCE_STALE_OR_INVALID_STATE'; end if;
  update academic_clearance_cases set status='rejected',lock_version=lock_version+1,updated_at=now() where id=p_case_id;
  insert into academic_clearance_approvals(case_id,stage,decision,actor_id,rationale) values(p_case_id,'academic_affairs','rejected',auth.uid(),p_rationale);
  insert into academic_clearance_audit_log(case_id,actor_id,action,before_state,after_state) values(p_case_id,auth.uid(),'rejected',to_jsonb(v_case),(select to_jsonb(c) from academic_clearance_cases c where c.id=p_case_id));
end $$;

-- Returned cases are active work and count toward the overdue window.
create or replace view public.academic_clearance_reporting as select c.target_department_id,c.status,count(*) case_count,avg(c.accepted_credit_hours) avg_accepted_hours,
 count(*) filter(where c.status in ('draft','department_review','academic_affairs_review','returned') and c.updated_at < now()-interval '14 days') overdue_count from academic_clearance_cases c group by c.target_department_id,c.status;

-- supporting_requirement is a resolved outcome and is reported alongside the
-- other resolved decisions (rejected rows keep their NULL target course).
create or replace view public.academic_clearance_course_outcomes as select s.course_id source_course_id,s.course_code source_course_code,t.course_id target_course_id,t.course_code target_course_code,e.decision,count(*) decision_count from academic_clearance_equivalencies e join academic_clearance_source_courses s on s.id=e.source_course_id and s.case_id=e.case_id left join academic_clearance_target_courses t on t.id=e.target_course_id and t.case_id=e.case_id where e.decision in ('equivalent','partially_equivalent','supporting_requirement','not_equivalent') group by s.course_id,s.course_code,t.course_id,t.course_code,e.decision;

revoke all on function public.return_academic_clearance_to_department(uuid,bigint,text) from public,anon;
revoke all on function public.reject_academic_clearance(uuid,bigint,text) from public,anon;
grant execute on function public.return_academic_clearance_to_department(uuid,bigint,text) to authenticated;
grant execute on function public.reject_academic_clearance(uuid,bigint,text) to authenticated;
commit;
