-- DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01
-- FORWARD-ONLY DRAFT. NEVER APPLIED BY THIS PR.
-- faculty_profiles.employee_number is the canonical schema field for the
-- approved administrative academic numbers. No email is used or logged.

begin;

do $$
declare
  v_cs constant uuid := '11111111-1111-4111-8111-111111111111';
  v_it constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_is constant uuid := '22222222-2222-4222-8222-222222222222';
  v_osama_user constant uuid := '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  v_osama_fp constant uuid := 'd08a8509-4c04-472e-885f-053a80be12ec';
  v_khaled_user constant uuid := 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  v_khaled_fp constant uuid := '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
  v_ramzi_user constant uuid := 'f602b62c-194b-4591-8e9c-956e5cbb347d';
  v_ramzi_fp constant uuid := 'c1fe6084-e594-482e-a178-ac8eaffed376';
  v_wrong constant uuid := '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f';
  v_khaled_a constant uuid := '912bdb96-3fb9-494c-8caa-7778c7d0d402';
  v_ramzi_a constant uuid := '4d0f434e-57ab-40b2-8a6f-5f27f330db97';
  v_actor uuid;
  v_actor_role text;
  v_unit uuid;
  v_role uuid;
  v_cs_assignment uuid;
  v_count integer;
  v_rows integer;
  v_final boolean;
  v_khaled_profile jsonb;
  v_ramzi_profile jsonb;
  v_khaled_assignment jsonb;
  v_ramzi_assignment jsonb;
begin
  if current_setting('app.department_chairs_controlled_fix_ticket',true)
       is distinct from 'DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01' then
    raise exception 'CONTROLLED_FIX_TICKET_REQUIRED';
  end if;
  begin
    v_actor := current_setting('app.department_chairs_controlled_fix_actor',true)::uuid;
  exception when others then
    raise exception 'CONTROLLED_FIX_ACTOR_UUID_REQUIRED';
  end;
  if v_actor is null then raise exception 'CONTROLLED_FIX_ACTOR_UUID_REQUIRED'; end if;
  v_actor_role := current_setting('app.department_chairs_controlled_fix_actor_role',true);
  if v_actor_role is distinct from 'system_admin' then
    raise exception 'CONTROLLED_FIX_EXPLICIT_SYSTEM_ADMIN_ROLE_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id
    where u.id=v_actor and (u.banned_until is null or u.banned_until<=now())
      and ur.role::text=v_actor_role
  ) then
    raise exception 'CONTROLLED_FIX_ACTOR_NOT_ACTIVE_AUTHORIZED_SYSTEM_ADMIN';
  end if;
  if to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') is null then
    raise exception 'LOG_AUDIT_7_ARG_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-chairs-controlled-fix-package-01',0));
  lock table public.faculty_profiles in share row exclusive mode;
  lock table public.request_processing_assignments in share row exclusive mode;

  select count(*) into v_count from public.departments where id in (v_cs,v_it,v_is);
  if v_count<>3 then raise exception 'DEPARTMENT_ANCHOR_DRIFT_%',v_count; end if;
  select id into strict v_unit from public.request_processing_units where code='department' and is_active;
  select id into strict v_role from public.request_processing_roles
    where unit_id=v_unit and code='department_head' and is_active;

  -- Exact accounts plus exact profile identity/name/administrative-number anchors.
  if (select count(*) from auth.users where id in (v_osama_user,v_khaled_user,v_ramzi_user))<>3 then
    raise exception 'AUTH_ACCOUNT_ANCHOR_DRIFT';
  end if;
  perform 1 from public.faculty_profiles where id=v_osama_fp and user_id=v_osama_user
    and full_name_ar='د. اسامه عبدالجليل احمد سيف' and employee_number='F2025006'
    and status='active' and department_id in (v_it,v_cs) for update;
  if not found then raise exception 'OSAMA_PROFILE_IDENTITY_DRIFT'; end if;
  perform 1 from public.faculty_profiles where id=v_khaled_fp and user_id=v_khaled_user
    and full_name_ar='د. خالد قاسم محمد البراحي' and employee_number='F2025005'
    and status='active' and department_id=v_it for update;
  if not found then raise exception 'KHALED_PROFILE_IDENTITY_DRIFT'; end if;
  perform 1 from public.faculty_profiles where id=v_ramzi_fp and user_id=v_ramzi_user
    and full_name_ar='د. رمزي حميد الجابري' and employee_number='F2025004'
    and status='active' and department_id=v_is for update;
  if not found then raise exception 'RAMZI_PROFILE_IDENTITY_DRIFT'; end if;

  select to_jsonb(fp) into strict v_khaled_profile from public.faculty_profiles fp where id=v_khaled_fp;
  select to_jsonb(fp) into strict v_ramzi_profile from public.faculty_profiles fp where id=v_ramzi_fp;
  select to_jsonb(a) into strict v_khaled_assignment from public.request_processing_assignments a where id=v_khaled_a;
  select to_jsonb(a) into strict v_ramzi_assignment from public.request_processing_assignments a where id=v_ramzi_a;

  perform 1 from public.request_processing_assignments where id=v_khaled_a and unit_id=v_unit
    and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_khaled_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_it and is_active for update;
  if not found then raise exception 'KHALED_ASSIGNMENT_DRIFT'; end if;
  perform 1 from public.request_processing_assignments where id=v_ramzi_a and unit_id=v_unit
    and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_ramzi_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_is and is_active for update;
  if not found then raise exception 'RAMZI_ASSIGNMENT_DRIFT'; end if;

  select fp.department_id=v_cs and not a.is_active into v_final
  from public.faculty_profiles fp cross join public.request_processing_assignments a
  where fp.id=v_osama_fp and a.id=v_wrong;

  if not coalesce(v_final,false) then
    perform 1 from public.request_processing_assignments where id=v_wrong and unit_id=v_unit
      and role_id=v_role and assignment_type='faculty_profile' and faculty_profile_id=v_osama_fp
      and user_id is null and staff_profile_id is null and position_assignment_id is null
      and department_id=v_it and is_active for update;
    if not found then raise exception 'WRONG_OSAMA_IT_ASSIGNMENT_DRIFT'; end if;
    if (select department_id from public.faculty_profiles where id=v_osama_fp)<>v_it then
      raise exception 'OSAMA_PROFILE_PRESTATE_DRIFT';
    end if;

    update public.request_processing_assignments set is_active=false,
      ends_at=coalesce(ends_at,now()),updated_at=now() where id=v_wrong and is_active;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'WRONG_ASSIGNMENT_DISABLE_ROWCOUNT_%',v_rows; end if;
    update public.faculty_profiles set department_id=v_cs,updated_at=now()
      where id=v_osama_fp and department_id=v_it;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'OSAMA_PROFILE_MOVE_ROWCOUNT_%',v_rows; end if;
  end if;

  -- Reuse exactly one matching inactive CS row, insert only when zero, abort when >1.
  select count(*) into v_count
  from public.request_processing_assignments where unit_id=v_unit and role_id=v_role
    and assignment_type='faculty_profile' and faculty_profile_id=v_osama_fp
    and user_id is null and staff_profile_id is null and position_assignment_id is null
    and department_id=v_cs and not is_active;
  if v_count>1 then raise exception 'OSAMA_CS_INACTIVE_DUPLICATES_%',v_count; end if;
  if v_count=1 then
    select id into strict v_cs_assignment from public.request_processing_assignments
    where unit_id=v_unit and role_id=v_role and assignment_type='faculty_profile'
      and faculty_profile_id=v_osama_fp and user_id is null and staff_profile_id is null
      and position_assignment_id is null and department_id=v_cs and not is_active;
  end if;

  if not exists(select 1 from public.request_processing_assignments where unit_id=v_unit
      and role_id=v_role and faculty_profile_id=v_osama_fp and department_id=v_cs and is_active
      and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) then
    if v_count=1 then
      update public.request_processing_assignments set is_active=true,starts_at=now(),ends_at=null,updated_at=now()
        where id=v_cs_assignment and not is_active;
    else
      insert into public.request_processing_assignments
        (unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active,starts_at)
      values(v_unit,v_role,'faculty_profile',v_osama_fp,v_cs,true,now()) returning id into v_cs_assignment;
    end if;
  end if;

  foreach v_count in array array[1,2,3] loop
    select count(*) into v_rows from public.request_processing_assignments
      where unit_id=v_unit and role_id=v_role and department_id=case v_count when 1 then v_cs when 2 then v_it else v_is end
      and is_active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now());
    if v_rows<>1 then raise exception 'CHAIR_POST_TOTAL_DEPARTMENT_%_COUNT_%',v_count,v_rows; end if;
  end loop;
  if (select to_jsonb(fp) from public.faculty_profiles fp where id=v_khaled_fp) is distinct from v_khaled_profile
    or (select to_jsonb(fp) from public.faculty_profiles fp where id=v_ramzi_fp) is distinct from v_ramzi_profile
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_khaled_a) is distinct from v_khaled_assignment
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_ramzi_a) is distinct from v_ramzi_assignment then
    raise exception 'KHALED_OR_RAMZI_CHANGED';
  end if;

  perform public.log_audit(
    'request_processing_assignment'::text,v_osama_fp::uuid,
    'department_chair_controlled_fix_verified'::text,null::jsonb,
    jsonb_build_object('faculty_profile_id',v_osama_fp,'department_id',v_cs)::jsonb,
    'DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01'::text,v_actor::uuid);
end $$;

commit;

-- ROLLBACK-BY-FORWARD-CORRECTION only; never DELETE or mutate position_assignments.
