-- PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I
-- Creates four isolated TEST_ONLY staff-domain accounts for tender demonstrations.
-- The operator must set app.staff_demo_password_02i in the same transaction.

begin;

do $seed$
declare
  v_marker constant text := 'PORTAL_STAFF_MULTI_ROLE_DEMO_ACCOUNTS_02I';
  v_department constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_password text := current_setting('app.staff_demo_password_02i', true);
  v_now timestamptz := clock_timestamp();
  v_users constant jsonb := jsonb_build_array(
    jsonb_build_object('id','02a90000-0000-4000-8000-000000000001','identity_id','02a90010-0000-4000-8000-000000000001','profile_id','02a90020-0000-4000-8000-000000000001','role_id','02a90030-0000-4000-8000-000000000001','email','test.manager01@staff.usr.edu.ye','employee_number','TEST-STAFF-02I-MGR-001','full_name_ar','مدير مباشر تجريبي - بوابة الكلية','full_name_en','ITCS Test Direct Manager','job_title','مدير مباشر تجريبي','role_type','department_head','service_role','direct_manager','department_scoped',true),
    jsonb_build_object('id','02a90000-0000-4000-8000-000000000002','identity_id','02a90010-0000-4000-8000-000000000002','profile_id','02a90020-0000-4000-8000-000000000002','role_id','02a90030-0000-4000-8000-000000000002','email','test.hr01@staff.usr.edu.ye','employee_number','TEST-STAFF-02I-HR-001','full_name_ar','موارد بشرية تجريبية - بوابة الكلية','full_name_en','ITCS Test Human Resources','job_title','أخصائي موارد بشرية تجريبي','role_type','hr_officer','service_role','hr','department_scoped',true),
    jsonb_build_object('id','02a90000-0000-4000-8000-000000000003','identity_id','02a90010-0000-4000-8000-000000000003','profile_id','02a90020-0000-4000-8000-000000000003','role_id','02a90030-0000-4000-8000-000000000003','email','test.finance01@staff.usr.edu.ye','employee_number','TEST-STAFF-02I-FIN-001','full_name_ar','مالية تجريبية - بوابة الكلية','full_name_en','ITCS Test Finance','job_title','مسؤول مالية تجريبي','role_type','finance_officer','service_role','finance','department_scoped',false),
    jsonb_build_object('id','02a90000-0000-4000-8000-000000000004','identity_id','02a90010-0000-4000-8000-000000000004','profile_id','02a90020-0000-4000-8000-000000000004','role_id','02a90030-0000-4000-8000-000000000004','email','test.admin01@staff.usr.edu.ye','employee_number','TEST-STAFF-02I-ADM-001','full_name_ar','أدمن تجريبي - بوابة الكلية','full_name_en','ITCS Test Administrator','job_title','مدير نظام تجريبي','role_type','admin_staff','service_role','administrator','department_scoped',false)
  );
  v_user jsonb;
begin
  if v_password is null or length(v_password) < 8 then
    raise exception '02I fail-closed: app.staff_demo_password_02i is missing or too short';
  end if;

  if to_regclass('auth.users') is null
     or to_regclass('auth.identities') is null
     or to_regclass('public.staff_profiles') is null
     or to_regclass('public.staff_profile_departments') is null
     or to_regclass('public.staff_service_role_assignments') is null
     or to_regclass('public.user_roles') is null then
    raise exception '02I fail-closed: required identity or staff tables are missing';
  end if;

  if to_regprocedure('crypt(text,text)') is null or to_regprocedure('gen_salt(text)') is null then
    raise exception '02I fail-closed: pgcrypto password functions are unavailable';
  end if;

  if not exists (select 1 from public.departments where id=v_department and is_active) then
    raise exception '02I fail-closed: target IT department is missing or inactive';
  end if;

  for v_user in select value from jsonb_array_elements(v_users)
  loop
    if exists (
      select 1 from auth.users u
      where (u.id=(v_user->>'id')::uuid or lower(u.email)=lower(v_user->>'email'))
        and not (
          u.id=(v_user->>'id')::uuid
          and lower(u.email)=lower(v_user->>'email')
          and u.raw_user_meta_data @> jsonb_build_object('test_only',true,'purpose',v_marker)
        )
    ) then
      raise exception '02I fail-closed: auth collision for %', v_user->>'email';
    end if;

    if exists (
      select 1 from auth.identities i
      where (i.id=(v_user->>'identity_id')::uuid
             or (i.provider='email' and i.provider_id=v_user->>'id'))
        and not (
          i.id=(v_user->>'identity_id')::uuid
          and i.user_id=(v_user->>'id')::uuid
          and i.provider='email'
          and i.provider_id=v_user->>'id'
          and i.identity_data @> jsonb_build_object('test_only',true,'purpose',v_marker)
        )
    ) then
      raise exception '02I fail-closed: identity collision for %', v_user->>'email';
    end if;

    if exists (
      select 1 from public.staff_profiles p
      where p.id=(v_user->>'profile_id')::uuid
         or p.user_id=(v_user->>'id')::uuid
         or p.employee_number=v_user->>'employee_number'
    ) and not exists (
      select 1 from public.staff_profiles p
      where p.id=(v_user->>'profile_id')::uuid
        and p.user_id=(v_user->>'id')::uuid
        and p.employee_number=v_user->>'employee_number'
        and lower(p.email)=lower(v_user->>'email')
    ) then
      raise exception '02I fail-closed: staff profile collision for %', v_user->>'email';
    end if;

    if exists (
      select 1 from public.staff_service_role_assignments r
      where r.id=(v_user->>'role_id')::uuid
        and (r.user_id is distinct from (v_user->>'id')::uuid or r.role is distinct from v_user->>'service_role')
    ) then
      raise exception '02I fail-closed: service role collision for %', v_user->>'email';
    end if;
  end loop;

  for v_user in select value from jsonb_array_elements(v_users)
  loop
    insert into auth.users (
      instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
      confirmation_token,recovery_token,email_change_token_new,email_change,
      raw_app_meta_data,raw_user_meta_data,is_super_admin,created_at,updated_at,
      phone_change,phone_change_token,email_change_token_current,
      email_change_confirm_status,reauthentication_token,is_sso_user,is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000'::uuid,
      (v_user->>'id')::uuid,'authenticated','authenticated',lower(v_user->>'email'),
      crypt(v_password,gen_salt('bf')),v_now,
      '','','','',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name',v_user->>'full_name_ar','purpose',v_marker,'test_only',true),
      false,v_now,v_now,'','','',0,'',false,false
    )
    on conflict (id) do update set
      encrypted_password=excluded.encrypted_password,
      email_confirmed_at=coalesce(auth.users.email_confirmed_at,excluded.email_confirmed_at),
      raw_app_meta_data=excluded.raw_app_meta_data,
      raw_user_meta_data=excluded.raw_user_meta_data,
      updated_at=excluded.updated_at,
      deleted_at=null,
      banned_until=null;

    insert into auth.identities (
      id,provider_id,user_id,identity_data,provider,created_at,updated_at
    ) values (
      (v_user->>'identity_id')::uuid,
      v_user->>'id',
      (v_user->>'id')::uuid,
      jsonb_build_object(
        'sub',v_user->>'id','email',lower(v_user->>'email'),
        'email_verified',true,'phone_verified',false,
        'purpose',v_marker,'test_only',true
      ),
      'email',v_now,v_now
    )
    on conflict (provider_id,provider) do update set
      identity_data=excluded.identity_data,
      updated_at=excluded.updated_at;

    insert into public.staff_profiles (
      id,user_id,employee_number,full_name_ar,full_name_en,department_id,
      job_title,role_type,status,must_change_password,department_scope,email,
      created_at,updated_at
    ) values (
      (v_user->>'profile_id')::uuid,(v_user->>'id')::uuid,v_user->>'employee_number',
      v_user->>'full_name_ar',v_user->>'full_name_en',v_department,
      v_user->>'job_title',v_user->>'role_type','active',false,'specific',
      lower(v_user->>'email'),v_now,v_now
    )
    on conflict (id) do update set
      full_name_ar=excluded.full_name_ar,
      full_name_en=excluded.full_name_en,
      department_id=excluded.department_id,
      job_title=excluded.job_title,
      role_type=excluded.role_type,
      status='active',
      must_change_password=false,
      department_scope='specific',
      email=excluded.email,
      updated_at=excluded.updated_at;

    insert into public.staff_profile_departments (staff_profile_id,department_id)
    values ((v_user->>'profile_id')::uuid,v_department)
    on conflict (staff_profile_id,department_id) do nothing;

  end loop;

  -- All four principals exist before role rows reference the demo administrator.
  for v_user in select value from jsonb_array_elements(v_users)
  loop
    insert into public.staff_service_role_assignments (
      id,user_id,role,department_id,active,valid_from,valid_until,granted_by,created_at,updated_at
    ) values (
      (v_user->>'role_id')::uuid,(v_user->>'id')::uuid,v_user->>'service_role',
      case when (v_user->>'department_scoped')::boolean then v_department else null end,
      true,current_date,null,'02a90000-0000-4000-8000-000000000004'::uuid,v_now,v_now
    )
    on conflict (id) do update set
      active=true,
      valid_until=null,
      granted_by=excluded.granted_by,
      department_id=excluded.department_id,
      updated_at=excluded.updated_at;
  end loop;

  insert into public.user_roles (id,user_id,role,created_at)
  values (
    '02a90040-0000-4000-8000-000000000004'::uuid,
    '02a90000-0000-4000-8000-000000000004'::uuid,
    'admin',v_now
  )
  on conflict (user_id,role) do nothing;

  if (select count(*) from auth.users where raw_user_meta_data @> jsonb_build_object('test_only',true,'purpose',v_marker)) <> 4
     or (select count(*) from public.staff_profiles where employee_number like 'TEST-STAFF-02I-%') <> 4
     or (select count(*) from public.staff_service_role_assignments where id::text like '02a90030-%') <> 4
     or (select count(*) from public.staff_profile_departments where staff_profile_id::text like '02a90020-%' and department_id=v_department) <> 4
     or not exists (
       select 1 from public.user_roles
       where user_id='02a90000-0000-4000-8000-000000000004'::uuid and role='admin'
     ) then
    raise exception '02I fail-closed: post-insert verification failed';
  end if;
end
$seed$;

select set_config('app.staff_demo_password_02i','',true);

commit;
