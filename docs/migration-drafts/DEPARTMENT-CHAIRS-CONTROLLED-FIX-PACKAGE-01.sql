-- DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01
-- FORWARD-ONLY DRAFT. NEVER APPLIED BY THIS PR.
-- Source: docs/DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01-REPORT.md
-- Approved identities: CS Dr Osama Abduljalil; IT Dr Khaled Albrahi;
-- IS Dr Ramzi Aljabri. No delete/backfill/employee creation is permitted.

begin;

do $$
declare
  v_cs_department constant uuid := '11111111-1111-4111-8111-111111111111';
  v_it_department constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_is_department constant uuid := '22222222-2222-4222-8222-222222222222';
  v_osama_user constant uuid := '97acbe02-c59c-409c-8d51-7d4ef72e6db7';
  v_osama_faculty constant uuid := 'd08a8509-4c04-472e-885f-053a80be12ec';
  v_khaled_user constant uuid := 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e';
  v_khaled_faculty constant uuid := '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
  v_ramzi_user constant uuid := 'f602b62c-194b-4591-8e9c-956e5cbb347d';
  v_ramzi_faculty constant uuid := 'c1fe6084-e594-482e-a178-ac8eaffed376';
  v_wrong_osama_it_assignment constant uuid := '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f';
  v_khaled_it_assignment constant uuid := '912bdb96-3fb9-494c-8caa-7778c7d0d402';
  v_ramzi_is_assignment constant uuid := '4d0f434e-57ab-40b2-8a6f-5f27f330db97';
  v_unit_id uuid;
  v_role_id uuid;
  v_new_cs_assignment uuid;
  v_count integer;
  v_rows integer;
  v_khaled_profile_before jsonb;
  v_ramzi_profile_before jsonb;
  v_khaled_assignment_before jsonb;
  v_ramzi_assignment_before jsonb;
begin
  if current_setting('app.department_chairs_controlled_fix_ticket', true)
       is distinct from 'DEPARTMENT-CHAIRS-CONTROLLED-FIX-PACKAGE-01' then
    raise exception 'CONTROLLED_FIX_TICKET_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-chairs-controlled-fix-package-01', 0));
  lock table public.faculty_profiles in share row exclusive mode;
  lock table public.request_processing_assignments in share row exclusive mode;

  -- Fail closed on department/report anchor drift.
  select count(*) into v_count from public.departments
  where id in (v_cs_department,v_it_department,v_is_department);
  if v_count <> 3 then raise exception 'DEPARTMENT_ANCHOR_DRIFT: %',v_count; end if;

  select id into strict v_unit_id from public.request_processing_units
  where code='department' and is_active=true;
  select id into strict v_role_id from public.request_processing_roles
  where unit_id=v_unit_id and code='department_head' and is_active=true;

  -- Exact identity/profile anchors from the read-only report.
  perform 1 from public.faculty_profiles
  where id=v_osama_faculty and user_id=v_osama_user and status='active'
    and department_id=v_it_department for update;
  if not found then raise exception 'OSAMA_PROFILE_DRIFT'; end if;
  perform 1 from public.faculty_profiles
  where id=v_khaled_faculty and user_id=v_khaled_user and status='active'
    and department_id=v_it_department for update;
  if not found then raise exception 'KHALED_PROFILE_DRIFT'; end if;
  perform 1 from public.faculty_profiles
  where id=v_ramzi_faculty and user_id=v_ramzi_user and status='active'
    and department_id=v_is_department for update;
  if not found then raise exception 'RAMZI_PROFILE_DRIFT'; end if;

  select to_jsonb(fp) into strict v_khaled_profile_before
    from public.faculty_profiles fp where fp.id=v_khaled_faculty;
  select to_jsonb(fp) into strict v_ramzi_profile_before
    from public.faculty_profiles fp where fp.id=v_ramzi_faculty;
  select to_jsonb(a) into strict v_khaled_assignment_before
    from public.request_processing_assignments a where a.id=v_khaled_it_assignment;
  select to_jsonb(a) into strict v_ramzi_assignment_before
    from public.request_processing_assignments a where a.id=v_ramzi_is_assignment;

  -- The three report-anchored assignment rows must have exact expected shapes.
  perform 1 from public.request_processing_assignments a
  where a.id=v_wrong_osama_it_assignment and a.unit_id=v_unit_id and a.role_id=v_role_id
    and a.assignment_type='faculty_profile' and a.faculty_profile_id=v_osama_faculty
    and a.user_id is null and a.staff_profile_id is null and a.position_assignment_id is null
    and a.department_id=v_it_department and a.is_active=true
    and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
  for update;
  if not found then raise exception 'WRONG_OSAMA_IT_ASSIGNMENT_DRIFT'; end if;
  perform 1 from public.request_processing_assignments a
  where a.id=v_khaled_it_assignment and a.unit_id=v_unit_id and a.role_id=v_role_id
    and a.assignment_type='faculty_profile' and a.faculty_profile_id=v_khaled_faculty
    and a.user_id is null and a.staff_profile_id is null and a.position_assignment_id is null
    and a.department_id=v_it_department and a.is_active=true
    and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
  for update;
  if not found then raise exception 'KHALED_IT_ASSIGNMENT_DRIFT'; end if;
  perform 1 from public.request_processing_assignments a
  where a.id=v_ramzi_is_assignment and a.unit_id=v_unit_id and a.role_id=v_role_id
    and a.assignment_type='faculty_profile' and a.faculty_profile_id=v_ramzi_faculty
    and a.user_id is null and a.staff_profile_id is null and a.position_assignment_id is null
    and a.department_id=v_is_department and a.is_active=true
    and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
  for update;
  if not found then raise exception 'RAMZI_IS_ASSIGNMENT_DRIFT'; end if;

  -- Pre-state invariants: CS=0; IT=2 exact approved+wrong rows; IS=1 exact approved row.
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_cs_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>0 then raise exception 'CS_ACTIVE_CHAIR_PRECONDITION_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_it_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>2 then raise exception 'IT_ACTIVE_CHAIR_PRECONDITION_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_is_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>1 then raise exception 'IS_ACTIVE_CHAIR_PRECONDITION_%',v_count; end if;

  update public.request_processing_assignments
  set is_active=false,ends_at=coalesce(ends_at,now()),updated_at=now()
  where id=v_wrong_osama_it_assignment and is_active=true;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'WRONG_ASSIGNMENT_DISABLE_ROWCOUNT_%',v_rows; end if;

  update public.faculty_profiles set department_id=v_cs_department,updated_at=now()
  where id=v_osama_faculty and department_id=v_it_department;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'OSAMA_PROFILE_MOVE_ROWCOUNT_%',v_rows; end if;

  insert into public.request_processing_assignments(
    unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active,starts_at
  ) values(v_unit_id,v_role_id,'faculty_profile',v_osama_faculty,v_cs_department,true,now())
  returning id into v_new_cs_assignment;

  -- Post-state: exactly one effective chair in each supported department.
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_cs_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>1 then raise exception 'CS_POST_TOTAL_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_it_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>1 then raise exception 'IT_POST_TOTAL_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_is_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_count<>1 then raise exception 'IS_POST_TOTAL_%',v_count; end if;

  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_cs_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
    and a.faculty_profile_id=v_osama_faculty and a.id=v_new_cs_assignment;
  if v_count<>1 then raise exception 'CS_POSTCONDITION_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_it_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
    and a.faculty_profile_id=v_khaled_faculty and a.id=v_khaled_it_assignment;
  if v_count<>1 then raise exception 'IT_POSTCONDITION_%',v_count; end if;
  select count(*) into v_count from public.request_processing_assignments a
  where a.unit_id=v_unit_id and a.role_id=v_role_id and a.department_id=v_is_department
    and a.is_active and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
    and a.faculty_profile_id=v_ramzi_faculty and a.id=v_ramzi_is_assignment;
  if v_count<>1 then raise exception 'IS_POSTCONDITION_%',v_count; end if;

  if (select department_id from public.faculty_profiles where id=v_osama_faculty)<>v_cs_department
    or (select is_active from public.request_processing_assignments where id=v_wrong_osama_it_assignment) then
    raise exception 'OSAMA_POSTCONDITION_FAILED';
  end if;
  if (select to_jsonb(fp) from public.faculty_profiles fp where fp.id=v_khaled_faculty)
       is distinct from v_khaled_profile_before
    or (select to_jsonb(fp) from public.faculty_profiles fp where fp.id=v_ramzi_faculty)
       is distinct from v_ramzi_profile_before
    or (select to_jsonb(a) from public.request_processing_assignments a where a.id=v_khaled_it_assignment)
       is distinct from v_khaled_assignment_before
    or (select to_jsonb(a) from public.request_processing_assignments a where a.id=v_ramzi_is_assignment)
       is distinct from v_ramzi_assignment_before then
    raise exception 'KHALED_OR_RAMZI_CHANGED';
  end if;
end $$;

commit;

-- ROLLBACK-BY-FORWARD-CORRECTION (NOT EXECUTED, requires a new approval/package):
-- 1. Resolve exactly one active CS assignment for Osama with the same unit/role/profile/CS tuple.
-- 2. Disable that resolved row without DELETE; require row_count=1.
-- 3. Move Osama's exact faculty profile CS -> IT only if the exact approved correction target says so.
-- 4. Reactivate only report anchor 7ab0b14f-... after verifying its full inactive IT tuple.
-- 5. Re-run zero/one/multiple invariants and preserve Khaled/Ramzi JSON snapshots.
-- Never infer or hard-code the generated CS assignment id; resolve it fail-closed from the exact tuple.
