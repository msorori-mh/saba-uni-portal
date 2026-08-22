-- PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G
-- Production-safe, idempotent TEST_ONLY showcase data. No users are created.
-- Apply with a privileged database operator after 02A-02F are present.

do $seed$
declare
  v_marker constant text := 'PORTAL_STAFF_SELF_SERVICE_DEMO_DATA_02G';
  v_department uuid;
  v_employee_user uuid;
  v_employee_profile uuid;
  v_manager_user uuid;
  v_hr_user uuid;
  v_finance_user uuid;
  v_admin_user uuid;
begin
  select id into strict v_department
  from public.departments
  where name_en = 'Information Technology Department' or name_ar = 'قسم تكنولوجيا المعلومات'
  order by (name_en = 'Information Technology Department') desc
  limit 1;

  select u.id, sp.id into strict v_employee_user, v_employee_profile
  from auth.users u join public.staff_profiles sp on sp.user_id = u.id
  where lower(u.email) = 'test.employee01@staff.usr.edu.ye' and sp.status = 'active';

  select id into strict v_manager_user from auth.users where lower(email) = 'demo.academic.affairs@testonly.invalid';
  select id into strict v_hr_user from auth.users where lower(email) = 'demo.student.affairs@testonly.invalid';
  select id into strict v_finance_user from auth.users where lower(email) = 'demo.finance@testonly.invalid';
  select id into strict v_admin_user from auth.users where lower(email) = 'demo.admin@testonly.invalid';

  if exists (
    select 1 from public.staff_profiles
    where id = v_employee_profile and department_id is not null and department_id <> v_department
  ) then
    raise exception '02G fail-closed: the test employee already belongs to another department';
  end if;

  perform set_config('app.bypass_staff_lock','1',true);
  update public.staff_profiles
  set department_id = v_department, updated_at = clock_timestamp()
  where id = v_employee_profile and department_id is null;
  perform set_config('app.bypass_staff_lock','0',true);

  insert into public.staff_profile_departments (staff_profile_id, department_id)
  values (v_employee_profile, v_department)
  on conflict (staff_profile_id, department_id) do nothing;

  insert into public.staff_service_role_assignments
    (id, user_id, role, department_id, active, valid_from, granted_by)
  values
    ('02a70001-0000-4000-8000-000000000001', v_manager_user, 'direct_manager', v_department, true, current_date, v_admin_user),
    ('02a70001-0000-4000-8000-000000000002', v_hr_user, 'hr', v_department, true, current_date, v_admin_user),
    ('02a70001-0000-4000-8000-000000000003', v_finance_user, 'finance', null, true, current_date, v_admin_user),
    ('02a70001-0000-4000-8000-000000000004', v_admin_user, 'administrator', null, true, current_date, v_admin_user)
  on conflict (id) do update set
    user_id = excluded.user_id, role = excluded.role, department_id = excluded.department_id,
    active = true, valid_from = excluded.valid_from, valid_until = null,
    granted_by = excluded.granted_by, updated_at = clock_timestamp();

  insert into public.staff_leave_balances
    (id, staff_profile_id, leave_type, balance_year, entitled_days, carried_days, consumed_days, reserved_days)
  values
    ('02a70002-0000-4000-8000-000000000001', v_employee_profile, 'annual', extract(year from current_date)::int, 30, 5, 8, 3),
    ('02a70002-0000-4000-8000-000000000002', v_employee_profile, 'sick', extract(year from current_date)::int, 15, 0, 2, 0)
  on conflict (staff_profile_id, leave_type, balance_year) do update set
    entitled_days = excluded.entitled_days, carried_days = excluded.carried_days,
    consumed_days = excluded.consumed_days, reserved_days = excluded.reserved_days,
    updated_at = clock_timestamp();

  insert into public.staff_service_requests
    (id, request_no, staff_profile_id, department_id, service_type, status, current_step,
     payload, decision_reason, submitted_at, decided_at, idempotency_key)
  values
    ('02a70010-0000-4000-8000-000000000001','TEST_ONLY_02G-LEAVE-APPROVED',v_employee_profile,v_department,'leave','approved',2,
     jsonb_build_object('demo_marker',v_marker,'leaveType','annual','startsOn',(current_date-20)::text,'endsOn',(current_date-18)::text,'durationDays',3,'note','إجازة سنوية تجريبية معتمدة','profile_department_seeded_by_02g',true),
     'تم اعتماد الإجازة وفق الرصيد المتاح',clock_timestamp()-interval '22 days',clock_timestamp()-interval '21 days','02a70010-0000-4000-8000-000000000101'),
    ('02a70010-0000-4000-8000-000000000002','TEST_ONLY_02G-PERMISSION-REJECTED',v_employee_profile,v_department,'permission','rejected',1,
     jsonb_build_object('demo_marker',v_marker,'permissionDate',(current_date-12)::text,'startsAt','10:00','endsAt','12:00','reason','موعد شخصي تجريبي'),
     'تعارض الوقت مع اجتماع إداري إلزامي',clock_timestamp()-interval '14 days',clock_timestamp()-interval '13 days','02a70010-0000-4000-8000-000000000102'),
    ('02a70010-0000-4000-8000-000000000003','TEST_ONLY_02G-LEAVE-IN-REVIEW',v_employee_profile,v_department,'leave','in_review',2,
     jsonb_build_object('demo_marker',v_marker,'leaveType','annual','startsOn',(current_date+7)::text,'endsOn',(current_date+9)::text,'durationDays',3,'note','طلب قيد مراجعة الموارد البشرية'),
     null,clock_timestamp()-interval '2 days',null,'02a70010-0000-4000-8000-000000000103'),
    ('02a70010-0000-4000-8000-000000000004','TEST_ONLY_02G-CUSTODY-SUBMITTED',v_employee_profile,v_department,'custody_return','submitted',1,
     jsonb_build_object('demo_marker',v_marker,'assetTag','TEST_ONLY_02G-ASSET-001','note','إرجاع جهاز محمول تجريبي'),
     null,clock_timestamp()-interval '1 day',null,'02a70010-0000-4000-8000-000000000104'),
    ('02a70010-0000-4000-8000-000000000005','TEST_ONLY_02G-EMPLOYMENT-CERT',v_employee_profile,v_department,'employment_certificate','approved',1,
     jsonb_build_object('demo_marker',v_marker,'purpose','التقديم لجهة رسمية','destination','جهة تجريبية'),
     'تم إصدار الإفادة',clock_timestamp()-interval '10 days',clock_timestamp()-interval '9 days','02a70010-0000-4000-8000-000000000105'),
    ('02a70010-0000-4000-8000-000000000006','TEST_ONLY_02G-EXPERIENCE-CERT',v_employee_profile,v_department,'experience_certificate','approved',1,
     jsonb_build_object('demo_marker',v_marker,'purpose','توثيق الخبرة المهنية','destination','جهة تجريبية'),
     'تم إصدار الشهادة',clock_timestamp()-interval '8 days',clock_timestamp()-interval '7 days','02a70010-0000-4000-8000-000000000106')
  on conflict (id) do update set
    request_no=excluded.request_no, staff_profile_id=excluded.staff_profile_id, department_id=excluded.department_id,
    service_type=excluded.service_type, status=excluded.status, current_step=excluded.current_step,
    payload=excluded.payload, decision_reason=excluded.decision_reason, submitted_at=excluded.submitted_at,
    decided_at=excluded.decided_at, updated_at=clock_timestamp();

  insert into public.staff_service_approval_steps
    (id,request_id,step_order,required_role,assignee_user_id,status,decided_by,decision_reason,decided_at)
  values
    ('02a70011-0000-4000-8000-000000000001','02a70010-0000-4000-8000-000000000001',1,'direct_manager',v_manager_user,'approved',v_manager_user,'موصى بالموافقة',clock_timestamp()-interval '21 days 12 hours'),
    ('02a70011-0000-4000-8000-000000000002','02a70010-0000-4000-8000-000000000001',2,'hr',v_hr_user,'approved',v_hr_user,'الرصيد متاح',clock_timestamp()-interval '21 days'),
    ('02a70011-0000-4000-8000-000000000003','02a70010-0000-4000-8000-000000000002',1,'direct_manager',v_manager_user,'rejected',v_manager_user,'تعارض مع اجتماع إلزامي',clock_timestamp()-interval '13 days'),
    ('02a70011-0000-4000-8000-000000000004','02a70010-0000-4000-8000-000000000003',1,'direct_manager',v_manager_user,'approved',v_manager_user,'موصى بالموافقة',clock_timestamp()-interval '1 day'),
    ('02a70011-0000-4000-8000-000000000005','02a70010-0000-4000-8000-000000000003',2,'hr',v_hr_user,'pending',null,null,null),
    ('02a70011-0000-4000-8000-000000000006','02a70010-0000-4000-8000-000000000004',1,'direct_manager',v_manager_user,'pending',null,null,null),
    ('02a70011-0000-4000-8000-000000000007','02a70010-0000-4000-8000-000000000005',1,'hr',v_hr_user,'approved',v_hr_user,'تم التحقق من الملف',clock_timestamp()-interval '9 days'),
    ('02a70011-0000-4000-8000-000000000008','02a70010-0000-4000-8000-000000000006',1,'hr',v_hr_user,'approved',v_hr_user,'تم التحقق من الخبرة',clock_timestamp()-interval '7 days')
  on conflict (id) do update set
    assignee_user_id=excluded.assignee_user_id,status=excluded.status,decided_by=excluded.decided_by,
    decision_reason=excluded.decision_reason,decided_at=excluded.decided_at;

  -- Approval steps provide the reversible demo timeline. Immutable audit/event
  -- tables are intentionally not seeded, so cleanup never attempts to rewrite history.

  insert into public.staff_payroll_statements
    (id,staff_profile_id,period_start,period_end,currency_code,basic_salary,allowances_total,deductions_total,source_system,source_reference,pdf_object_path,published_at)
  values
    ('02a70020-0000-4000-8000-000000000001',v_employee_profile,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month'-interval '1 day')::date,'YER',185000,42000,17500,'TEST_ONLY_02G_FINANCE','TEST_ONLY_02G-PAY-01',null,clock_timestamp()-interval '1 day'),
    ('02a70020-0000-4000-8000-000000000002',v_employee_profile,(date_trunc('month',current_date)-interval '1 month')::date,(date_trunc('month',current_date)-interval '1 day')::date,'YER',185000,40000,16000,'TEST_ONLY_02G_FINANCE','TEST_ONLY_02G-PAY-02',null,clock_timestamp()-interval '31 days'),
    ('02a70020-0000-4000-8000-000000000003',v_employee_profile,(date_trunc('month',current_date)-interval '2 months')::date,(date_trunc('month',current_date)-interval '1 month 1 day')::date,'YER',180000,39000,15500,'TEST_ONLY_02G_FINANCE','TEST_ONLY_02G-PAY-03',null,clock_timestamp()-interval '61 days')
  on conflict (id) do update set
    period_start=excluded.period_start,period_end=excluded.period_end,basic_salary=excluded.basic_salary,
    allowances_total=excluded.allowances_total,deductions_total=excluded.deductions_total,
    source_system=excluded.source_system,source_reference=excluded.source_reference,pdf_object_path=null,
    published_at=excluded.published_at,updated_at=clock_timestamp();

  insert into public.staff_payroll_components
    (id,statement_id,component_type,component_code,label_ar,amount,display_order)
  values
    ('02a70021-0000-4000-8000-000000000001','02a70020-0000-4000-8000-000000000001','allowance','TEST_ONLY_02G_TRANSPORT','بدل مواصلات',18000,1),
    ('02a70021-0000-4000-8000-000000000002','02a70020-0000-4000-8000-000000000001','allowance','TEST_ONLY_02G_NATURE','بدل طبيعة عمل',24000,2),
    ('02a70021-0000-4000-8000-000000000003','02a70020-0000-4000-8000-000000000001','deduction','TEST_ONLY_02G_PENSION','استقطاع تقاعد',12000,3),
    ('02a70021-0000-4000-8000-000000000004','02a70020-0000-4000-8000-000000000001','deduction','TEST_ONLY_02G_OTHER','استقطاع آخر',5500,4),
    ('02a70021-0000-4000-8000-000000000005','02a70020-0000-4000-8000-000000000002','allowance','TEST_ONLY_02G_TRANSPORT','بدل مواصلات',18000,1),
    ('02a70021-0000-4000-8000-000000000006','02a70020-0000-4000-8000-000000000002','allowance','TEST_ONLY_02G_NATURE','بدل طبيعة عمل',22000,2),
    ('02a70021-0000-4000-8000-000000000007','02a70020-0000-4000-8000-000000000002','deduction','TEST_ONLY_02G_PENSION','استقطاع تقاعد',12000,3),
    ('02a70021-0000-4000-8000-000000000008','02a70020-0000-4000-8000-000000000002','deduction','TEST_ONLY_02G_OTHER','استقطاع آخر',4000,4),
    ('02a70021-0000-4000-8000-000000000009','02a70020-0000-4000-8000-000000000003','allowance','TEST_ONLY_02G_TRANSPORT','بدل مواصلات',17000,1),
    ('02a70021-0000-4000-8000-000000000010','02a70020-0000-4000-8000-000000000003','allowance','TEST_ONLY_02G_NATURE','بدل طبيعة عمل',22000,2),
    ('02a70021-0000-4000-8000-000000000011','02a70020-0000-4000-8000-000000000003','deduction','TEST_ONLY_02G_PENSION','استقطاع تقاعد',11500,3),
    ('02a70021-0000-4000-8000-000000000012','02a70020-0000-4000-8000-000000000003','deduction','TEST_ONLY_02G_OTHER','استقطاع آخر',4000,4)
  on conflict (id) do update set amount=excluded.amount,label_ar=excluded.label_ar,display_order=excluded.display_order;

  insert into public.staff_career_history
    (id,staff_profile_id,event_type,effective_on,grade,job_title,decision_reference,notes,source_system)
  values
    ('02a70030-0000-4000-8000-000000000001',v_employee_profile,'appointment',current_date-interval '6 years','الدرجة الخامسة','مساعد إداري','TEST_ONLY_02G-DEC-001','تعيين تجريبي','TEST_ONLY_02G_HR'),
    ('02a70030-0000-4000-8000-000000000002',v_employee_profile,'grade_change',current_date-interval '4 years','الدرجة الرابعة','مساعد إداري أول','TEST_ONLY_02G-DEC-002','تسوية درجة تجريبية','TEST_ONLY_02G_HR'),
    ('02a70030-0000-4000-8000-000000000003',v_employee_profile,'title_change',current_date-interval '2 years','الدرجة الرابعة','موظف خدمات إدارية','TEST_ONLY_02G-DEC-003','تغيير مسمى تجريبي','TEST_ONLY_02G_HR'),
    ('02a70030-0000-4000-8000-000000000004',v_employee_profile,'promotion',current_date-interval '6 months','الدرجة الثالثة','موظف خدمات إدارية أول','TEST_ONLY_02G-DEC-004','ترقية تجريبية','TEST_ONLY_02G_HR')
  on conflict (id) do update set grade=excluded.grade,job_title=excluded.job_title,notes=excluded.notes;

  insert into public.staff_correspondence
    (id,reference_no,title,body,sender_department_id,importance,archive_category,published_by,published_at)
  values
    ('02a70040-0000-4000-8000-000000000001','TEST_ONLY_02G-CIRC-001','تعميم تنظيم الدوام','بيانات تجريبية: الالتزام بمواعيد الدوام الرسمي.',v_department,'important','تعـاميم إدارية',v_hr_user,clock_timestamp()-interval '5 days'),
    ('02a70040-0000-4000-8000-000000000002','TEST_ONLY_02G-CIRC-002','تنبيه تحديث بيانات الموظفين','بيانات تجريبية: يرجى مراجعة الملف الوظيفي ووسائل التواصل.',v_department,'normal','الموارد البشرية',v_hr_user,clock_timestamp()-interval '3 days'),
    ('02a70040-0000-4000-8000-000000000003','TEST_ONLY_02G-CIRC-003','صيانة الأنظمة الداخلية','بيانات تجريبية: نافذة صيانة عاجلة لخدمات البوابة.',v_department,'urgent','تقنية المعلومات',v_admin_user,clock_timestamp()-interval '1 day')
  on conflict (id) do update set title=excluded.title,body=excluded.body,importance=excluded.importance,published_at=excluded.published_at;

  insert into public.staff_correspondence_recipients
    (id,correspondence_id,recipient_user_id,received_at,read_at,acknowledged_at)
  values
    ('02a70041-0000-4000-8000-000000000001','02a70040-0000-4000-8000-000000000001',v_employee_user,clock_timestamp()-interval '5 days',clock_timestamp()-interval '4 days',clock_timestamp()-interval '4 days'),
    ('02a70041-0000-4000-8000-000000000002','02a70040-0000-4000-8000-000000000002',v_employee_user,clock_timestamp()-interval '3 days',clock_timestamp()-interval '2 days',null),
    ('02a70041-0000-4000-8000-000000000003','02a70040-0000-4000-8000-000000000003',v_employee_user,clock_timestamp()-interval '1 day',null,null)
  on conflict (id) do update set received_at=excluded.received_at,read_at=excluded.read_at,acknowledged_at=excluded.acknowledged_at;

  insert into public.staff_custody_assignments
    (id,staff_profile_id,asset_name,asset_tag,serial_number,condition,delivered_on,source_system,source_reference)
  values
    ('02a70050-0000-4000-8000-000000000001',v_employee_profile,'حاسوب محمول تجريبي','TEST_ONLY_02G-ASSET-001','TEST-02G-LT-001','good',current_date-interval '400 days','TEST_ONLY_02G_ASSETS','TEST_ONLY_02G-CUSTODY-001'),
    ('02a70050-0000-4000-8000-000000000002',v_employee_profile,'شاشة عرض تجريبية','TEST_ONLY_02G-ASSET-002','TEST-02G-MN-002','needs_maintenance',current_date-interval '250 days','TEST_ONLY_02G_ASSETS','TEST_ONLY_02G-CUSTODY-002')
  on conflict (id) do update set condition=excluded.condition,returned_on=null,updated_at=clock_timestamp();

  insert into public.staff_attendance_days
    (id,staff_profile_id,attendance_date,check_in_at,check_out_at,worked_minutes,late_minutes,overtime_minutes,day_state,source_system)
  select ('02a70060-0000-4000-8000-'||lpad(gs::text,12,'0'))::uuid, v_employee_profile,
         current_date-gs,
         (current_date-gs)+time '08:00'+case when gs in (2,7) then interval '25 minutes' else interval '0 minutes' end,
         (current_date-gs)+time '16:00',
         case when gs=5 then 0 else 480-case when gs in (2,7) then 25 else 0 end end,
         case when gs in (2,7) then 25 else 0 end,
         case when gs=3 then 60 else 0 end,
         case when gs=5 then 'leave' when gs in (2,7) then 'late' else 'present' end,
         'TEST_ONLY_02G_ATTENDANCE'
  from generate_series(1,10) gs
  on conflict (id) do update set
    attendance_date=excluded.attendance_date,check_in_at=excluded.check_in_at,check_out_at=excluded.check_out_at,
    worked_minutes=excluded.worked_minutes,late_minutes=excluded.late_minutes,overtime_minutes=excluded.overtime_minutes,
    day_state=excluded.day_state,source_system=excluded.source_system;

  insert into public.staff_performance_cycles (id,cycle_year,title_ar,opens_on,closes_on,status)
  values ('02a70070-0000-4000-8000-000000000001',extract(year from current_date)::int,'TEST_ONLY_02G — تقييم الأداء السنوي',date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year'-interval '1 day')::date,'open')
  on conflict (id) do update set title_ar=excluded.title_ar,status='open';

  insert into public.staff_performance_evaluations
    (id,cycle_id,staff_profile_id,evaluator_user_id,overall_rating,rating_band,goals,strengths,improvements,status,finalized_at,acknowledged_at,employee_comment)
  values ('02a70071-0000-4000-8000-000000000001','02a70070-0000-4000-8000-000000000001',v_employee_profile,v_manager_user,88,'very_good','تحسين زمن إنجاز المعاملات','الدقة والتعاون','تطوير مهارات التقارير','finalized',clock_timestamp()-interval '15 days',clock_timestamp()-interval '14 days','اطلعت على التقييم — بيانات عرض')
  on conflict (id) do update set overall_rating=excluded.overall_rating,rating_band=excluded.rating_band,status=excluded.status,finalized_at=excluded.finalized_at,acknowledged_at=excluded.acknowledged_at;

  insert into public.staff_overtime_claims
    (id,claim_no,staff_profile_id,department_id,claim_kind,starts_on,ends_on,total_hours,reason,status,manager_decided_by,manager_decided_at,manager_reason,hr_decided_by,hr_decided_at,hr_reason,idempotency_key)
  values ('02a70080-0000-4000-8000-000000000001','TEST_ONLY_02G-OT-001',v_employee_profile,v_department,'overtime',current_date-interval '10 days',current_date-interval '8 days',8,'تجهيز بيانات المناقصة التجريبية','hr_approved',v_manager_user,clock_timestamp()-interval '7 days','موصى بالصرف',v_hr_user,clock_timestamp()-interval '6 days','مستوفٍ للضوابط','02a70080-0000-4000-8000-000000000101')
  on conflict (id) do update set status=excluded.status,total_hours=excluded.total_hours,updated_at=clock_timestamp();

  insert into public.staff_overtime_financial_impact (claim_id,currency_code,hourly_rate,gross_amount)
  values ('02a70080-0000-4000-8000-000000000001','YER',1800,14400)
  on conflict (claim_id) do update set hourly_rate=excluded.hourly_rate,gross_amount=excluded.gross_amount,updated_at=clock_timestamp();

  insert into public.staff_training_courses (id,code,title_ar,provider,starts_on,ends_on,total_hours,active)
  values ('02a70090-0000-4000-8000-000000000001','TEST_ONLY_02G-TRAIN-001','الأمن السيبراني للموظفين','مركز التدريب التجريبي',current_date-interval '45 days',current_date-interval '40 days',20,true)
  on conflict (id) do update set title_ar=excluded.title_ar,active=true;

  insert into public.staff_training_enrollments
    (id,course_id,staff_profile_id,status,decided_by,decided_at,completed_at)
  values ('02a70091-0000-4000-8000-000000000001','02a70090-0000-4000-8000-000000000001',v_employee_profile,'completed',v_hr_user,clock_timestamp()-interval '50 days',clock_timestamp()-interval '39 days')
  on conflict (id) do update set status='completed',decided_by=excluded.decided_by,decided_at=excluded.decided_at,completed_at=excluded.completed_at;

  insert into public.staff_promotion_cases
    (id,case_no,staff_profile_id,case_kind,current_grade,proposed_grade,status,effective_on,notes,opened_by,idempotency_key)
  values ('02a70100-0000-4000-8000-000000000001','TEST_ONLY_02G-PROMO-001',v_employee_profile,'promotion','الدرجة الثالثة','الدرجة الثانية','approved',current_date+interval '30 days','ترقية تجريبية معتمدة',v_hr_user,'02a70100-0000-4000-8000-000000000101')
  on conflict (id) do update set status=excluded.status,proposed_grade=excluded.proposed_grade,updated_at=clock_timestamp();

  insert into public.staff_promotion_financial_impact (case_id,currency_code,current_basic,proposed_basic,retroactive_amount)
  values ('02a70100-0000-4000-8000-000000000001','YER',185000,205000,40000)
  on conflict (case_id) do update set proposed_basic=excluded.proposed_basic,retroactive_amount=excluded.retroactive_amount,updated_at=clock_timestamp();

  insert into public.staff_clearance_cases
    (id,case_no,staff_profile_id,department_id,reason,status,opened_by,idempotency_key)
  values ('02a70110-0000-4000-8000-000000000001','TEST_ONLY_02G-CLEAR-001',v_employee_profile,v_department,'نقل داخلي تجريبي','in_progress',v_hr_user,'02a70110-0000-4000-8000-000000000101')
  on conflict (id) do update set status='in_progress',completed_at=null,completed_by=null,updated_at=clock_timestamp();

  insert into public.staff_clearance_checkpoints
    (id,case_id,checkpoint_kind,required_role,status,decided_by,decided_at,decision_reason)
  values
    ('02a70111-0000-4000-8000-000000000001','02a70110-0000-4000-8000-000000000001','direct_manager','direct_manager','cleared',v_manager_user,clock_timestamp()-interval '2 days','لا توجد التزامات'),
    ('02a70111-0000-4000-8000-000000000002','02a70110-0000-4000-8000-000000000001','finance','finance','cleared',v_finance_user,clock_timestamp()-interval '1 day','لا توجد مستحقات معلقة'),
    ('02a70111-0000-4000-8000-000000000003','02a70110-0000-4000-8000-000000000001','it_custody','administrator','blocked',v_admin_user,clock_timestamp(),'توجد عهدتان نشطتان'),
    ('02a70111-0000-4000-8000-000000000004','02a70110-0000-4000-8000-000000000001','hr','hr','pending',null,null,null)
  on conflict (id) do update set status=excluded.status,decided_by=excluded.decided_by,decided_at=excluded.decided_at,decision_reason=excluded.decision_reason;

  insert into public.staff_hr_read_snapshots
    (id,staff_profile_id,external_record_id,employment_status,grade,job_title,qualification,source_updated_at)
  values ('02a70120-0000-4000-8000-000000000001',v_employee_profile,'TEST_ONLY_02G/HR/EMP-001','active','الدرجة الثالثة','موظف خدمات إدارية أول','بكالوريوس نظم معلومات',clock_timestamp()-interval '2 hours')
  on conflict (id) do update set employment_status=excluded.employment_status,grade=excluded.grade,job_title=excluded.job_title,qualification=excluded.qualification,source_updated_at=excluded.source_updated_at,synced_at=clock_timestamp();

  insert into public.staff_finance_read_snapshots
    (id,staff_profile_id,external_record_id,period_start,period_end,statement_status,source_updated_at)
  values
    ('02a70121-0000-4000-8000-000000000001',v_employee_profile,'TEST_ONLY_02G/FIN/PAY-001',date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month'-interval '1 day')::date,'published',clock_timestamp()-interval '2 hours'),
    ('02a70121-0000-4000-8000-000000000002',v_employee_profile,'TEST_ONLY_02G/FIN/PAY-002',(date_trunc('month',current_date)-interval '1 month')::date,(date_trunc('month',current_date)-interval '1 day')::date,'published',clock_timestamp()-interval '32 days'),
    ('02a70121-0000-4000-8000-000000000003',v_employee_profile,'TEST_ONLY_02G/FIN/PAY-003',(date_trunc('month',current_date)-interval '2 months')::date,(date_trunc('month',current_date)-interval '1 month 1 day')::date,'published',clock_timestamp()-interval '62 days')
  on conflict (id) do update set period_start=excluded.period_start,period_end=excluded.period_end,statement_status=excluded.statement_status,source_updated_at=excluded.source_updated_at,synced_at=clock_timestamp();

  insert into public.staff_issued_documents
    (id,reference_no,document_type,staff_profile_id,request_id,language_code,purpose,destination,notes,verification_token_digest,status,issued_by,issued_at,object_path)
  values
    ('02a70130-0000-4000-8000-000000000001','TEST_ONLY_02G-DOC-001','employment_statement',v_employee_profile,'02a70010-0000-4000-8000-000000000005','ar','التقديم لجهة رسمية','جهة تجريبية','بيانات تجريبية للعرض',encode(digest('TEST_ONLY_02G-DOC-001','sha256'),'hex'),'issued',v_hr_user,clock_timestamp()-interval '9 days',null),
    ('02a70130-0000-4000-8000-000000000002','TEST_ONLY_02G-DOC-002','experience_certificate',v_employee_profile,'02a70010-0000-4000-8000-000000000006','ar','توثيق الخبرة المهنية','جهة تجريبية','بيانات تجريبية للعرض',encode(digest('TEST_ONLY_02G-DOC-002','sha256'),'hex'),'issued',v_hr_user,clock_timestamp()-interval '7 days',null)
  on conflict (id) do update set purpose=excluded.purpose,destination=excluded.destination,notes=excluded.notes,status='issued',object_path=null,updated_at=clock_timestamp();

  insert into public.staff_service_notifications_outbox
    (recipient_user_id,request_id,channel,template_key,payload,status,attempt_count,available_at,sent_at,idempotency_key)
  values
    (v_employee_user,'02a70010-0000-4000-8000-000000000001','in_app','TEST_ONLY_02G_REQUEST_APPROVED',jsonb_build_object('demo_marker',v_marker,'title','تم اعتماد طلب الإجازة'),'sent',1,clock_timestamp()-interval '21 days',clock_timestamp()-interval '21 days','02a70140-0000-4000-8000-000000000001'),
    (v_employee_user,'02a70010-0000-4000-8000-000000000002','email','TEST_ONLY_02G_REQUEST_REJECTED',jsonb_build_object('demo_marker',v_marker,'title','تم رفض طلب المغادرة','reason','تعارض مع اجتماع إلزامي'),'sent',1,clock_timestamp()-interval '13 days',clock_timestamp()-interval '13 days','02a70140-0000-4000-8000-000000000002'),
    (v_employee_user,'02a70010-0000-4000-8000-000000000003','in_app','TEST_ONLY_02G_REQUEST_IN_REVIEW',jsonb_build_object('demo_marker',v_marker,'title','طلبك لدى الموارد البشرية'),'pending',0,clock_timestamp(),null,'02a70140-0000-4000-8000-000000000003')
  on conflict (recipient_user_id,channel,template_key,idempotency_key) do update set
    payload=excluded.payload,status=excluded.status,attempt_count=excluded.attempt_count,
    available_at=excluded.available_at,sent_at=excluded.sent_at,last_error=null;
end
$seed$;

-- Deterministic verification summary; all figures are TEST_ONLY_02G scope.
select
  (select count(*) from public.staff_service_role_assignments where id::text like '02a70001-%') as roles,
  (select count(*) from public.staff_service_requests where request_no like 'TEST_ONLY_02G-%') as requests,
  (select count(*) from public.staff_payroll_statements where source_system='TEST_ONLY_02G_FINANCE') as payroll_statements,
  (select count(*) from public.staff_correspondence where reference_no like 'TEST_ONLY_02G-%') as correspondence,
  (select count(*) from public.staff_custody_assignments where asset_tag like 'TEST_ONLY_02G-%') as custody,
  (select count(*) from public.staff_attendance_days where source_system='TEST_ONLY_02G_ATTENDANCE') as attendance_days,
  (select count(*) from public.staff_hr_read_snapshots where external_record_id like 'TEST_ONLY_02G/%') as hr_snapshots,
  (select count(*) from public.staff_finance_read_snapshots where external_record_id like 'TEST_ONLY_02G/%') as finance_snapshots;
