\set ON_ERROR_STOP on
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
insert into academic_clearance_cases(id,student_request_id,student_profile_id,source_department_id,target_department_id,target_study_plan_id,status,source_snapshot_at,target_snapshot_at,remaining_credit_hours) values('d0000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001','academic_affairs_review',now(),now(),6);
do $$begin if current_user_can_review_academic_clearance('d0000000-0000-4000-8000-000000000001') then raise exception 'unapproved mapping allowed'; end if; end$$;
insert into academic_clearance_authority_config(id,academic_affairs_unit_code,academic_affairs_role_code,approved_course_result_status,is_approved,approved_by,approved_at) values(true,'synthetic_academic_office','synthetic_reviewer','synthetic_passed',true,'10000000-0000-4000-8000-000000000003',now());
insert into academic_clearance_source_courses(id,case_id,student_grade_id,course_id,course_code,course_name,credit_hours,passed,snapshot) values('d1000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','SRC','Source',3,true,'{"official_result_reference":"R1"}');
insert into academic_clearance_target_courses(id,case_id,study_plan_course_id,course_id,course_code,course_name,credit_hours,level_id,is_required,snapshot) values('d2000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','TGT','Target',3,'40000000-0000-4000-8000-000000000002',true,'{}');
insert into academic_clearance_equivalencies(case_id,source_course_id,target_course_id,decision,accepted_credit_hours,rationale,decided_by) values('d0000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','equivalent',3,'matched','10000000-0000-4000-8000-000000000001');
do $$begin
 begin perform approve_academic_clearance('d0000000-0000-4000-8000-000000000001',1,'x'); raise exception 'expected wrong actor denial'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_FORBIDDEN%' then raise; end if; end;
 begin update student_requests set status='approved' where id='80000000-0000-4000-8000-000000000001'; raise exception 'expected transfer block'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_REQUIRED%' then raise; end if; end;
 begin update academic_clearance_equivalencies set accepted_credit_hours=4; raise exception 'expected credit cap'; exception when others then if sqlerrm not like '%ACADEMIC_CLEARANCE_CREDIT_EXCEEDS_BOUND%' then raise; end if; end;
end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',false);
select approve_academic_clearance('d0000000-0000-4000-8000-000000000001',1,'academic approval');
do $$begin
 if (select status from academic_clearance_cases where id='d0000000-0000-4000-8000-000000000001')<>'approved' then raise exception 'approval failed'; end if;
 begin update academic_clearance_equivalencies set rationale='tamper'; raise exception 'expected immutable'; exception when others then if sqlerrm not like '%APPROVED_CLEARANCE_EVIDENCE_IMMUTABLE%' then raise; end if; end;
end$$;
select correct_academic_clearance('d0000000-0000-4000-8000-000000000001',2,'documented correction');
do $$begin if not exists(select 1 from academic_clearance_cases where supersedes_case_id='d0000000-0000-4000-8000-000000000001' and status='draft') then raise exception 'correction provenance missing'; end if; end$$;
do $$begin
 if has_table_privilege('authenticated','academic_clearance_cases','INSERT') or not (select relrowsecurity from pg_class where oid='academic_clearance_cases'::regclass) then raise exception 'RLS/ACL failed'; end if;
end$$;
