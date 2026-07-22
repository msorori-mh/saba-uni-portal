-- ============================================================================
-- DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK-BY-FORWARD
-- Track B: DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-AND-D01-REFRESH-01
--
-- FORWARD-ONLY DRAFT. NEVER APPLIED BY THIS PR.
-- Rollback-by-forward-correction for DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02:
-- restores the EXACT pre-fix state (including the known Osama-IT defect) using
-- UPDATE statements only. No row is ever deleted; all assignment history is
-- preserved. Intended ONLY for the case where the semantic fix executed and an
-- authorized decision requires restoring the prior state pending re-analysis.
--
-- Forward actions (inverse of the fix, in inverse order):
--   1. deactivate the Osama-CS chair row the fix (re)activated/created
--      (is_active=false, ends_at=now() — row kept as history);
--   2. move Osama's faculty profile back CS -> IT (evidence-gated);
--   3. reactivate the original wrong Osama-IT row (is_active=true, ends_at=null).
-- Post-state assertions: IT has exactly the known defect pair {Khaled, wrong
-- Osama} active; CS has zero active Osama chairs; IS untouched; Khaled/Ramzi
-- rows byte-identical.
--
-- Protected identities: same whitelist as the fix package (Osama/Khaled/Ramzi
-- profiles + assignments; records SR-20260713-2DE64041, SR-20260715-FEDCB3E1,
-- SR-20260716-26BAD4C8, USR-2026-000001, USR-2026-000002 are never referenced).
--
-- Required session settings (fail-closed gates):
--   set app.department_chairs_semantic_fix_ticket     = 'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK';
--   set app.department_chairs_semantic_fix_actor      = '<system_admin auth.users uuid>';
--   set app.department_chairs_semantic_fix_actor_role = 'system_admin';
--   set app.department_chairs_semantic_fix_evidence   = 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006';
-- ============================================================================

begin;

do $$
declare
  v_cs constant uuid := '11111111-1111-4111-8111-111111111111';
  v_it constant uuid := 'ce485c67-5f7c-498d-b120-4b1130a86ae8';
  v_is constant uuid := '22222222-2222-4222-8222-222222222222';
  v_osama_fp constant uuid := 'd08a8509-4c04-472e-885f-053a80be12ec';
  v_khaled_fp constant uuid := '6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
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
  v_khaled_profile jsonb;
  v_ramzi_profile jsonb;
  v_khaled_assignment jsonb;
  v_ramzi_assignment jsonb;
begin
  if current_setting('app.department_chairs_semantic_fix_ticket',true)
       is distinct from 'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK' then
    raise exception 'SEMANTIC_FIX_ROLLBACK_TICKET_REQUIRED';
  end if;
  begin
    v_actor := current_setting('app.department_chairs_semantic_fix_actor',true)::uuid;
  exception when others then
    raise exception 'SEMANTIC_FIX_ACTOR_UUID_REQUIRED';
  end;
  if v_actor is null then raise exception 'SEMANTIC_FIX_ACTOR_UUID_REQUIRED'; end if;
  v_actor_role := current_setting('app.department_chairs_semantic_fix_actor_role',true);
  if v_actor_role is distinct from 'system_admin' then
    raise exception 'SEMANTIC_FIX_EXPLICIT_SYSTEM_ADMIN_ROLE_REQUIRED';
  end if;
  if current_setting('app.department_chairs_semantic_fix_evidence',true)
       is distinct from 'DEPARTMENT-CHAIRS-IDENTITY-RESOLUTION-READONLY-01:CS=F2025006' then
    raise exception 'SEMANTIC_FIX_EVIDENCE_REQUIRED';
  end if;
  if not exists (
    select 1 from auth.users u join public.user_roles ur on ur.user_id=u.id
    where u.id=v_actor and (u.banned_until is null or u.banned_until<=now())
      and ur.role::text=v_actor_role
  ) then
    raise exception 'SEMANTIC_FIX_ACTOR_NOT_ACTIVE_AUTHORIZED_SYSTEM_ADMIN';
  end if;
  if to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') is null then
    raise exception 'LOG_AUDIT_7_ARG_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('department-chairs-semantic-fix-package-02-rollback',0));
  lock table public.faculty_profiles in share row exclusive mode;
  lock table public.request_processing_assignments in share row exclusive mode;

  select id into strict v_unit from public.request_processing_units where code='department' and is_active;
  select id into strict v_role from public.request_processing_roles
    where unit_id=v_unit and code='department_head' and is_active;

  -- pre-state: the fix must have been applied (Osama in CS, wrong row inactive)
  perform 1 from public.faculty_profiles where id=v_osama_fp and department_id=v_cs
    and employee_number='F2025006' and status='active' for update;
  if not found then raise exception 'ROLLBACK_PRESTATE_OSAMA_NOT_IN_CS'; end if;
  perform 1 from public.request_processing_assignments where id=v_wrong
    and department_id=v_it and faculty_profile_id=v_osama_fp and not is_active for update;
  if not found then raise exception 'ROLLBACK_PRESTATE_WRONG_ROW_NOT_INACTIVE'; end if;

  select to_jsonb(fp) into strict v_khaled_profile from public.faculty_profiles fp where id=v_khaled_fp;
  select to_jsonb(fp) into strict v_ramzi_profile from public.faculty_profiles fp where id=v_ramzi_fp;
  select to_jsonb(a) into strict v_khaled_assignment from public.request_processing_assignments a where id=v_khaled_a;
  select to_jsonb(a) into strict v_ramzi_assignment from public.request_processing_assignments a where id=v_ramzi_a;

  -- exactly one active Osama-CS chair row may exist (the fix output); stop otherwise
  select count(*) into v_count from public.request_processing_assignments
    where unit_id=v_unit and role_id=v_role and assignment_type='faculty_profile'
      and faculty_profile_id=v_osama_fp and department_id=v_cs and is_active;
  if v_count>1 then raise exception 'ROLLBACK_CS_DUPLICATE_STOP_%',v_count; end if;

  -- 1) deactivate the Osama-CS chair row (history preserved)
  if v_count=1 then
    select id into strict v_cs_assignment from public.request_processing_assignments
      where unit_id=v_unit and role_id=v_role and assignment_type='faculty_profile'
        and faculty_profile_id=v_osama_fp and department_id=v_cs and is_active;
    update public.request_processing_assignments set is_active=false,
      ends_at=coalesce(ends_at,now()),updated_at=now()
      where id=v_cs_assignment and is_active;
    get diagnostics v_rows=row_count;
    if v_rows<>1 then raise exception 'ROLLBACK_CS_DISABLE_ROWCOUNT_%',v_rows; end if;
  end if;

  -- 2) evidence-gated profile move back CS -> IT
  update public.faculty_profiles set department_id=v_it,updated_at=now()
    where id=v_osama_fp and department_id=v_cs;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'ROLLBACK_PROFILE_MOVE_ROWCOUNT_%',v_rows; end if;

  -- 3) reactivate the original wrong Osama-IT row (restores pre-fix defect)
  update public.request_processing_assignments set is_active=true,ends_at=null,updated_at=now()
    where id=v_wrong and not is_active;
  get diagnostics v_rows=row_count;
  if v_rows<>1 then raise exception 'ROLLBACK_WRONG_REACTIVATE_ROWCOUNT_%',v_rows; end if;

  -- post-state: IT = exactly the known defect pair; CS = zero active Osama chairs
  select count(*) into v_rows from public.request_processing_assignments a
    where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
      and a.department_id=v_it and a.is_active
      and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now());
  if v_rows<>2 then raise exception 'ROLLBACK_POST_IT_CARDINALITY_%',v_rows; end if;
  if exists (select 1 from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.department_id=v_it and a.is_active
        and (a.starts_at is null or a.starts_at<=now()) and (a.ends_at is null or a.ends_at>now())
        and a.id not in (v_khaled_a,v_wrong)) then
    raise exception 'ROLLBACK_POST_IT_UNKNOWN_MEMBER';
  end if;
  if exists (select 1 from public.request_processing_assignments a
      where a.unit_id=v_unit and a.role_id=v_role and a.assignment_type='faculty_profile'
        and a.faculty_profile_id=v_osama_fp and a.department_id=v_cs and a.is_active) then
    raise exception 'ROLLBACK_POST_CS_STILL_ACTIVE';
  end if;

  -- Khaled/Ramzi byte-identical (protected chairs)
  if (select to_jsonb(fp) from public.faculty_profiles fp where id=v_khaled_fp) is distinct from v_khaled_profile
    or (select to_jsonb(fp) from public.faculty_profiles fp where id=v_ramzi_fp) is distinct from v_ramzi_profile
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_khaled_a) is distinct from v_khaled_assignment
    or (select to_jsonb(a) from public.request_processing_assignments a where id=v_ramzi_a) is distinct from v_ramzi_assignment then
    raise exception 'KHALED_OR_RAMZI_CHANGED';
  end if;

  perform public.log_audit(
    'request_processing_assignment'::text,v_osama_fp::uuid,
    'department_chair_semantic_fix_rollback_by_forward'::text,null::jsonb,
    jsonb_build_object('faculty_profile_id',v_osama_fp,'department_id',v_it)::jsonb,
    'DEPARTMENT-CHAIRS-SEMANTIC-FIX-PACKAGE-02-ROLLBACK'::text,v_actor::uuid);
end $$;

commit;
