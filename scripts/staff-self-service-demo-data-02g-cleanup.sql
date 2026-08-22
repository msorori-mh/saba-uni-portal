-- PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G cleanup
-- Deletes only deterministic TEST_ONLY_02G records. No users, profiles, or departments are deleted.

begin;

delete from public.staff_service_notifications_outbox where template_key like 'TEST_ONLY_02G_%';
delete from public.staff_issued_documents where reference_no like 'TEST_ONLY_02G-%';
delete from public.staff_clearance_checkpoints where id::text like '02a70111-%';
delete from public.staff_clearance_cases where case_no like 'TEST_ONLY_02G-%';
delete from public.staff_promotion_financial_impact where case_id::text like '02a70100-%';
delete from public.staff_promotion_cases where case_no like 'TEST_ONLY_02G-%';
delete from public.staff_training_enrollments where id::text like '02a70091-%';
delete from public.staff_training_courses where code like 'TEST_ONLY_02G-%';
delete from public.staff_overtime_financial_impact where claim_id::text like '02a70080-%';
delete from public.staff_overtime_claims where claim_no like 'TEST_ONLY_02G-%';
delete from public.staff_performance_evaluations where id::text like '02a70071-%';
delete from public.staff_performance_cycles where title_ar like 'TEST_ONLY_02G%';
delete from public.staff_attendance_days where source_system = 'TEST_ONLY_02G_ATTENDANCE';
delete from public.staff_custody_assignments where asset_tag like 'TEST_ONLY_02G-%';
delete from public.staff_correspondence_recipients where id::text like '02a70041-%';
delete from public.staff_correspondence where reference_no like 'TEST_ONLY_02G-%';
delete from public.staff_career_history where source_system = 'TEST_ONLY_02G_HR';
delete from public.staff_payroll_components where component_code like 'TEST_ONLY_02G_%';
delete from public.staff_payroll_statements where source_system = 'TEST_ONLY_02G_FINANCE';
delete from public.staff_finance_read_snapshots where external_record_id like 'TEST_ONLY_02G/%';
delete from public.staff_hr_read_snapshots where external_record_id like 'TEST_ONLY_02G/%';
delete from public.staff_leave_balances where id::text like '02a70002-%';
delete from public.staff_service_approval_steps where id::text like '02a70011-%';

-- The approved leave request records that 02G was allowed to fill a previously-null department.
update public.staff_profiles sp
set department_id = null, updated_at = clock_timestamp()
where sp.user_id = (select id from auth.users where lower(email)='test.employee01@staff.usr.edu.ye')
  and exists (
    select 1 from public.staff_service_requests r
    where r.id='02a70010-0000-4000-8000-000000000001'
      and r.staff_profile_id=sp.id
      and r.payload @> '{"demo_marker":"PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G","profile_department_seeded_by_02g":true}'::jsonb
  );

delete from public.staff_service_requests where request_no like 'TEST_ONLY_02G-%';
delete from public.staff_service_role_assignments where id::text like '02a70001-%';

commit;
