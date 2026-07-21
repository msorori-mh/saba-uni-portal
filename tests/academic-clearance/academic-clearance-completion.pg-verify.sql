-- ACADEMIC-CLEARANCE-COMPLETION-01 PostgreSQL 17 verifier (source-only).
-- Execution order:
--   tests/academic-clearance/academic-clearance.pg-setup.sql
--   -> docs/migration-drafts/DEPARTMENT-TRANSFER-ACADEMIC-CLEARANCE-FOUNDATION-01.sql
--   -> docs/drafts/ACADEMIC-CLEARANCE-COMPLETION-01.sql
--   -> this file.
-- Seeds are on-conflict guarded, so the file is safe to run after the
-- foundation verifier in the same database; the scenario flow itself runs
-- once per fresh database.
\set ON_ERROR_STOP on

-- Seven clearance statuses including 'returned'; seven decisions including 'supporting_requirement'.
do $$begin
  if (select count(*) from unnest(enum_range(null::public.academic_clearance_status)) v(x))<>7 then raise exception 'expected seven clearance statuses'; end if;
  if not exists(select 1 from unnest(enum_range(null::public.academic_clearance_status)) v(x) where v.x='returned') then raise exception 'returned status missing'; end if;
  if (select count(*) from unnest(enum_range(null::public.course_equivalency_decision)) v(x))<>7 then raise exception 'expected seven comparison decisions'; end if;
  if not exists(select 1 from unnest(enum_range(null::public.course_equivalency_decision)) v(x) where v.x='supporting_requirement') then raise exception 'supporting_requirement missing'; end if;
end$$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into academic_clearance_authority_config(id,academic_affairs_unit_code,academic_affairs_role_code,approved_course_result_status,is_approved,approved_by,approved_at)
  values(true,'synthetic_academic_office','synthetic_reviewer','synthetic_passed',true,'10000000-0000-4000-8000-000000000003',now())
  on conflict (id) do nothing;
insert into student_requests values('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','transfer','in_review') on conflict (id) do nothing;
insert into student_request_workflow_steps values('c1000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','active','10000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001') on conflict (id) do nothing;
insert into transfer_request_details values('80000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002') on conflict (request_id) do nothing;
insert into academic_clearance_cases(id,student_request_id,student_profile_id,source_department_id,target_department_id,target_study_plan_id,status,source_snapshot_at,target_snapshot_at,remaining_credit_hours)
  values('e0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','draft',now(),now(),6)
  on conflict (id) do nothing;
-- A second passed official result chain for the supporting_requirement decision.
insert into courses values('60000000-0000-4000-8000-000000000003',2) on conflict (id) do nothing;
insert into course_offerings values('90000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003') on conflict (id) do nothing;
insert into course_sections values('91000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003') on conflict (id) do nothing;
insert into student_enrollments values('92000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001') on conflict (id) do nothing;
insert into grade_components values('93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000003') on conflict (id) do nothing;
insert into student_grades values('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000003','approved',now()) on conflict (id) do nothing;
insert into student_course_grade_summary
  select '92000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','synthetic_passed'
  where not exists(
    select 1 from student_course_grade_summary
    where enrollment_id='92000000-0000-4000-8000-000000000003'
      and course_id='60000000-0000-4000-8000-000000000003');
insert into academic_clearance_source_courses(id,case_id,student_grade_id,course_id,course_code,course_name,credit_hours,passed,snapshot)
  values('e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','SRC1','Source 1',3,true,'{"official_result_reference":"R1"}')
  on conflict (id) do nothing;
insert into academic_clearance_source_courses(id,case_id,student_grade_id,course_id,course_code,course_name,credit_hours,passed,snapshot)
  values('e1000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000003','SRC2','Source 2',2,true,'{"official_result_reference":"R2"}')
  on conflict (id) do nothing;
insert into academic_clearance_target_courses(id,case_id,study_plan_course_id,course_id,course_code,course_name,credit_hours,level_id,is_required,snapshot)
  values('e2000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','TGT','Target',3,'40000000-0000-4000-8000-000000000002',true,'{}')
  on conflict (id) do nothing;

-- The chair cannot reject; the reviewer cannot act before submission.
do $$begin
  begin perform reject_academic_clearance('e0000000-0000-4000-8000-000000000001',1,'chair attempt'); raise exception 'expected chair denial'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_FORBIDDEN%' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
do $$begin
  begin perform return_academic_clearance_to_department('e0000000-0000-4000-8000-000000000001',1,'too early'); raise exception 'expected early reviewer denial'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_FORBIDDEN%' then raise; end if; end;
end$$;

-- Happy path to academic affairs review, including a supporting requirement.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',1,'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','equivalent',3,'matched');
select save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',2,'e1000000-0000-4000-8000-000000000002',null,'supporting_requirement',2,'supporting credit');
do $$begin
  begin perform save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',3,'e1000000-0000-4000-8000-000000000002',null,'supporting_requirement',0,'zero hours'); raise exception 'expected supporting credit bound'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_CREDIT_EXCEEDS_BOUND%' then raise; end if; end;
  begin perform save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',3,'e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','supporting_requirement',2,'mapped target'); raise exception 'expected supporting target coupling denial'; exception when check_violation then null; end;
end$$;
select submit_academic_clearance_for_review('e0000000-0000-4000-8000-000000000001',3,'chair approved comparison');

-- Return to department: the seventh status, with documented provenance.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select return_academic_clearance_to_department('e0000000-0000-4000-8000-000000000001',4,'evidence incomplete');
do $$begin
  if (select status from academic_clearance_cases where id='e0000000-0000-4000-8000-000000000001')<>'returned' then raise exception 'return transition failed'; end if;
  if not exists(select 1 from academic_clearance_approvals where case_id='e0000000-0000-4000-8000-000000000001' and stage='academic_affairs' and decision='returned') then raise exception 'return approval missing'; end if;
  if not exists(select 1 from academic_clearance_audit_log where case_id='e0000000-0000-4000-8000-000000000001' and action='returned_to_department') then raise exception 'return audit missing'; end if;
  begin update student_requests set status='approved' where id='80000000-0000-4000-8000-000000000002'; raise exception 'expected transfer block while returned'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_REQUIRED%' then raise; end if; end;
  begin perform approve_academic_clearance('e0000000-0000-4000-8000-000000000001',5,'premature'); raise exception 'expected approve denial on returned'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_FORBIDDEN%' then raise; end if; end;
end$$;

-- The chair reworks the returned case and resubmits.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
select save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',5,'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','equivalent',3,'matched after rework');
do $$begin if (select status from academic_clearance_cases where id='e0000000-0000-4000-8000-000000000001')<>'department_review' then raise exception 'returned case not editable'; end if; end$$;
select submit_academic_clearance_for_review('e0000000-0000-4000-8000-000000000001',6,'resubmitted after rework');

-- Reject: terminal, immutable, documented; transfer stays blocked.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select reject_academic_clearance('e0000000-0000-4000-8000-000000000001',7,'not eligible for transfer');
do $$begin
  if (select status from academic_clearance_cases where id='e0000000-0000-4000-8000-000000000001')<>'rejected' then raise exception 'reject transition failed'; end if;
  if not exists(select 1 from academic_clearance_approvals where case_id='e0000000-0000-4000-8000-000000000001' and stage='academic_affairs' and decision='rejected') then raise exception 'reject approval missing'; end if;
  if not exists(select 1 from academic_clearance_audit_log where case_id='e0000000-0000-4000-8000-000000000001' and action='rejected') then raise exception 'reject audit missing'; end if;
  begin update academic_clearance_cases set remaining_credit_hours=0 where id='e0000000-0000-4000-8000-000000000001'; raise exception 'expected rejected immutable'; exception when others then if sqlerrm not like '%REJECTED_CLEARANCE_IMMUTABLE%' then raise; end if; end;
  begin update academic_clearance_equivalencies set rationale='tamper' where case_id='e0000000-0000-4000-8000-000000000001'; raise exception 'expected rejected evidence immutable'; exception when others then if sqlerrm not like '%APPROVED_CLEARANCE_EVIDENCE_IMMUTABLE%' then raise; end if; end;
  begin update student_requests set status='approved' where id='80000000-0000-4000-8000-000000000002'; raise exception 'expected transfer block while rejected'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_REQUIRED%' then raise; end if; end;
end$$;

-- The reviewer keeps read access to the rejected case; the chair does not.
set role authenticated;
do $$begin
  if (select count(*) from academic_clearance_cases where id='e0000000-0000-4000-8000-000000000001')<>1 then raise exception 'reviewer lost rejected read access'; end if;
end$$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
set role authenticated;
do $$begin
  if (select count(*) from academic_clearance_cases where id='e0000000-0000-4000-8000-000000000001')<>0 then raise exception 'chair retained rejected read access'; end if;
end$$;
reset role;

-- Terminal means terminal: the chair can no longer edit the rejected case.
do $$begin
  begin perform save_academic_clearance_equivalency('e0000000-0000-4000-8000-000000000001',8,'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','equivalent',3,'post-reject edit'); raise exception 'expected post-reject edit denial'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_FORBIDDEN%' then raise; end if; end;
end$$;

-- A new clearance attempt for the same request starts as a fresh draft case.
insert into academic_clearance_cases(id,student_request_id,student_profile_id,source_department_id,target_department_id,target_study_plan_id,status,source_snapshot_at,target_snapshot_at,remaining_credit_hours)
  values('e0000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','draft',now(),now(),6)
  on conflict (id) do nothing;

-- Reporting counts returned work; outcomes count supporting requirements.
do $$begin
  if not exists(select 1 from pg_views where schemaname='public' and viewname='academic_clearance_reporting' and definition like '%''returned''%') then raise exception 'reporting view missing returned status'; end if;
  if not exists(select 1 from pg_views where schemaname='public' and viewname='academic_clearance_course_outcomes' and definition like '%''supporting_requirement''%') then raise exception 'outcomes view missing supporting requirement'; end if;
end$$;

-- ACL posture: reject/return are authenticated-only RPCs.
do $$begin
  if not has_function_privilege('authenticated','public.reject_academic_clearance(uuid,bigint,text)','EXECUTE') then raise exception 'reject ACL failed'; end if;
  if not has_function_privilege('authenticated','public.return_academic_clearance_to_department(uuid,bigint,text)','EXECUTE') then raise exception 'return ACL failed'; end if;
  if has_function_privilege('anon','public.reject_academic_clearance(uuid,bigint,text)','EXECUTE') then raise exception 'reject anon ACL failed'; end if;
  if has_function_privilege('anon','public.return_academic_clearance_to_department(uuid,bigint,text)','EXECUTE') then raise exception 'return anon ACL failed'; end if;
end$$;
