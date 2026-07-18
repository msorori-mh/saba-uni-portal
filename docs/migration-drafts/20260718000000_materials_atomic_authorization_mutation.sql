-- MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01
-- FORWARD DRAFT ONLY. NEVER APPLY FROM THIS PR.
-- Order: base materials schema -> upload reserve/finalize + checked-download audit RPCs
-- -> this metadata RPC/cutover -> verification -> separate runtime caller release.

begin;

create unique index if not exists uq_material_events_actor_idempotency
  on public.course_material_events (actor_user_id, (meta ->> 'idempotency_key'))
  where meta ? 'idempotency_key';

create or replace function public.faculty_mutate_course_material_atomic(
  p_action text,
  p_material_id uuid,
  p_section_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key uuid,
  p_patch jsonb default '{}'::jsonb
)
returns table(material_id uuid, changed boolean, updated_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fp_id uuid;
  v_target_section uuid;
  v_offering_id uuid;
  v_material public.course_materials%rowtype;
  v_prior uuid;
  v_fingerprint text;
  v_prior_fingerprint text;
  v_event text;
  v_year uuid;
  v_semester uuid;
begin
  if v_uid is null or p_idempotency_key is null then raise exception 'AUTHORIZATION_DENIED'; end if;
  if p_action not in ('create','update','publish','archive') then raise exception 'INVALID_ACTION'; end if;
  if (p_action = 'create') <> (p_section_id is not null and p_material_id is null) then
    raise exception 'IMMUTABLE_TARGET_VIOLATION';
  end if;
  if p_action <> 'create' and (p_material_id is null or p_section_id is not null) then
    raise exception 'IMMUTABLE_TARGET_VIOLATION';
  end if;

  v_fingerprint := encode(digest(
    concat_ws('|', p_action, coalesce(p_material_id::text,''), coalesce(p_section_id::text,''),
      coalesce(p_expected_updated_at::text,''), coalesce(p_patch,'{}'::jsonb)::text), 'sha256'), 'hex');

  -- Lost-response retry: the same stable key is accepted only for the exact
  -- canonical action/target/version/payload fingerprint.
  select e.course_material_id, e.meta ->> 'request_fingerprint'
    into v_prior, v_prior_fingerprint
  from public.course_material_events e
  where e.actor_user_id = v_uid and e.meta ->> 'idempotency_key' = p_idempotency_key::text
  limit 1;
  if v_prior is not null then
    if v_prior_fingerprint is distinct from v_fingerprint then raise exception 'IDEMPOTENCY_KEY_REUSE'; end if;
    select * into strict v_material from public.course_materials where id = v_prior;
    return query select v_material.id, false, v_material.updated_at;
    return;
  end if;

  -- Deterministic lock order for every action: faculty -> canonical term tables
  -- -> section -> offering -> material. Table SHARE locks serialize current-term
  -- changes until this transaction commits.
  select fp.id into strict v_fp_id from public.faculty_profiles fp
  where fp.user_id = v_uid and fp.status = 'active' for update;
  lock table public.academic_years in share mode;
  lock table public.semesters in share mode;
  select id into strict v_year from public.academic_years where is_current = true;
  select id into strict v_semester from public.semesters
    where is_current = true and academic_year_id = v_year;

  if p_action = 'create' then
    v_target_section := p_section_id;
  else
    select m.course_section_id into strict v_target_section
    from public.course_materials m where m.id = p_material_id;
  end if;

  select cs.course_offering_id into strict v_offering_id
  from public.course_sections cs
  where cs.id = v_target_section and cs.faculty_profile_id = v_fp_id
  for update;
  perform 1 from public.course_offerings co where co.id = v_offering_id for update;

  if p_action <> 'create' then
    select m.* into strict v_material from public.course_materials m
    where m.id = p_material_id
      and m.course_section_id = v_target_section
      and m.faculty_profile_id = v_fp_id
    for update;
    if p_expected_updated_at is null or v_material.updated_at <> p_expected_updated_at then
      raise exception 'STALE_MATERIAL_VERSION';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'IMMUTABLE_TARGET_VIOLATION';
  end if;

  if p_action in ('create','update','publish') and not exists (
    select 1 from public.course_sections cs join public.course_offerings co on co.id = cs.course_offering_id
    where cs.id = v_target_section and cs.faculty_profile_id = v_fp_id
      and cs.status = 'active' and co.status = 'active'
      and co.academic_year_id = v_year and co.semester_id = v_semester
  ) then raise exception 'CURRENT_ACTIVE_SECTION_REQUIRED'; end if;

  if p_action = 'create' then
    insert into public.course_materials(course_section_id,faculty_profile_id,title,description,lecture_number,study_system,status)
    values(v_target_section,v_fp_id,btrim(p_patch->>'title'),p_patch->>'description',
      case when p_patch?'lecture_number' then (p_patch->>'lecture_number')::integer end,
      p_patch->>'study_system','draft') returning * into v_material;
    v_event := 'created';
  elsif p_action = 'update' then
    if v_material.status = 'archived' then raise exception 'ARCHIVED_MATERIAL_IMMUTABLE'; end if;
    update public.course_materials set
      title=case when p_patch?'title' then btrim(p_patch->>'title') else title end,
      description=case when p_patch?'description' then p_patch->>'description' else description end,
      lecture_number=case when p_patch?'lecture_number' then (p_patch->>'lecture_number')::integer else lecture_number end,
      study_system=case when p_patch?'study_system' then p_patch->>'study_system' else study_system end
    where id=v_material.id returning * into v_material;
    v_event := 'updated';
  elsif p_action = 'publish' then
    if v_material.status = 'archived' then raise exception 'ARCHIVED_MATERIAL_IMMUTABLE'; end if;
    if v_material.status = 'published' then return query select v_material.id,false,v_material.updated_at; return; end if;
    update public.course_materials set status='published',published_at=now()
      where id=v_material.id returning * into v_material;
    v_event := 'published';
  else
    if v_material.status = 'archived' then return query select v_material.id,false,v_material.updated_at; return; end if;
    update public.course_materials set status='archived'
      where id=v_material.id returning * into v_material;
    v_event := 'archived';
  end if;

  insert into public.course_material_events(course_material_id,actor_user_id,event,meta)
  values(v_material.id,v_uid,v_event,jsonb_build_object(
    'idempotency_key',p_idempotency_key,'request_fingerprint',v_fingerprint));
  return query select v_material.id,true,v_material.updated_at;
end $$;

revoke all on function public.faculty_mutate_course_material_atomic(text,uuid,uuid,timestamptz,uuid,jsonb)
  from public, anon, service_role;
grant execute on function public.faculty_mutate_course_material_atomic(text,uuid,uuid,timestamptz,uuid,jsonb)
  to authenticated;

/* INERT CUTOVER REFERENCE — retained below for review only; never executed by
   this definition migration. The callable, separately gated cutover procedure
   following the reference is the only executable cutover path.

-- Fail closed unless every DB/storage-crossing write has an atomic replacement.
do $$ begin
  if to_regprocedure('public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.record_course_material_download(uuid,uuid)') is null then
    raise exception 'UPLOAD_AND_DOWNLOAD_ATOMIC_PATHS_REQUIRED_BEFORE_DML_CUTOVER';
  end if;
end $$;

-- Exact expected base-policy inventory; drift aborts before any ACL change.
do $$ declare v_actual text[]; begin
  select array_agg(tablename||':'||policyname order by tablename,policyname) into v_actual
  from pg_policies where schemaname='public' and tablename in
    ('course_materials','course_material_files','course_material_events');
  if v_actual is distinct from array[
    'course_material_events:faculty_read_own_events',
    'course_material_files:admin_manage_material_files',
    'course_material_files:faculty_manage_own_material_files',
    'course_materials:admin_manage_materials',
    'course_materials:faculty_manage_own_materials']::text[] then
    raise exception 'UNEXPECTED_MATERIAL_POLICY_INVENTORY: %', v_actual;
  end if;
end $$;

do $$ declare v_actual text[]; begin
  select array_agg(table_name||':'||grantee||':'||privilege_type order by table_name,grantee,privilege_type)
    into v_actual
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('course_materials','course_material_files','course_material_events')
    and grantee in ('authenticated','service_role')
    and privilege_type in ('INSERT','UPDATE','DELETE');
  if v_actual is distinct from array[
    'course_material_events:authenticated:INSERT',
    'course_material_events:service_role:DELETE',
    'course_material_events:service_role:INSERT',
    'course_material_events:service_role:UPDATE',
    'course_material_files:authenticated:DELETE',
    'course_material_files:authenticated:INSERT',
    'course_material_files:authenticated:UPDATE',
    'course_material_files:service_role:DELETE',
    'course_material_files:service_role:INSERT',
    'course_material_files:service_role:UPDATE',
    'course_materials:authenticated:DELETE',
    'course_materials:authenticated:INSERT',
    'course_materials:authenticated:UPDATE',
    'course_materials:service_role:DELETE',
    'course_materials:service_role:INSERT',
    'course_materials:service_role:UPDATE']::text[] then
    raise exception 'UNEXPECTED_MATERIAL_GRANT_INVENTORY: %', v_actual;
  end if;
end $$;

drop policy faculty_manage_own_materials on public.course_materials;
drop policy admin_manage_materials on public.course_materials;
drop policy faculty_manage_own_material_files on public.course_material_files;
drop policy admin_manage_material_files on public.course_material_files;
create policy faculty_read_own_materials on public.course_materials for select to authenticated
  using (exists(select 1 from public.faculty_profiles fp where fp.id=faculty_profile_id and fp.user_id=auth.uid()));
create policy faculty_read_own_material_files on public.course_material_files for select to authenticated
  using (exists(select 1 from public.course_materials m join public.faculty_profiles fp on fp.id=m.faculty_profile_id
    where m.id=course_material_id and fp.user_id=auth.uid()));

revoke insert,update,delete on public.course_materials,public.course_material_files from authenticated,service_role;
revoke insert,update,delete on public.course_material_events from authenticated,service_role;

END INERT CUTOVER REFERENCE */

create or replace procedure public.apply_materials_rpc_only_dml_cutover()
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_policies text[];
  v_grants text[];
begin
  if to_regprocedure('public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)') is null
    or to_regprocedure('public.record_course_material_download(uuid,uuid)') is null then
    raise exception 'UPLOAD_AND_DOWNLOAD_ATOMIC_PATHS_REQUIRED_BEFORE_DML_CUTOVER';
  end if;

  select array_agg(tablename||':'||policyname order by tablename,policyname) into v_policies
  from pg_policies where schemaname='public' and tablename in
    ('course_materials','course_material_files','course_material_events');
  if v_policies is distinct from array[
    'course_material_events:faculty_read_own_events',
    'course_material_files:admin_manage_material_files',
    'course_material_files:faculty_manage_own_material_files',
    'course_materials:admin_manage_materials',
    'course_materials:faculty_manage_own_materials']::text[] then
    raise exception 'UNEXPECTED_MATERIAL_POLICY_INVENTORY: %', v_policies;
  end if;

  select array_agg(table_name||':'||grantee||':'||privilege_type order by table_name,grantee,privilege_type)
    into v_grants from information_schema.role_table_grants
  where table_schema='public'
    and table_name in ('course_materials','course_material_files','course_material_events')
    and grantee in ('authenticated','service_role')
    and privilege_type in ('INSERT','UPDATE','DELETE');
  if array_to_string(v_grants, ',') is distinct from
    'course_material_events:authenticated:INSERT,course_material_events:service_role:DELETE,course_material_events:service_role:INSERT,course_material_events:service_role:UPDATE,course_material_files:authenticated:DELETE,course_material_files:authenticated:INSERT,course_material_files:authenticated:UPDATE,course_material_files:service_role:DELETE,course_material_files:service_role:INSERT,course_material_files:service_role:UPDATE,course_materials:authenticated:DELETE,course_materials:authenticated:INSERT,course_materials:authenticated:UPDATE,course_materials:service_role:DELETE,course_materials:service_role:INSERT,course_materials:service_role:UPDATE' then
    raise exception 'UNEXPECTED_MATERIAL_GRANT_INVENTORY: %', v_grants;
  end if;

  execute 'drop policy faculty_manage_own_materials on public.course_materials';
  execute 'drop policy admin_manage_materials on public.course_materials';
  execute 'drop policy faculty_manage_own_material_files on public.course_material_files';
  execute 'drop policy admin_manage_material_files on public.course_material_files';
  execute $policy$create policy faculty_read_own_materials on public.course_materials for select to authenticated
    using (exists(select 1 from public.faculty_profiles fp where fp.id=faculty_profile_id and fp.user_id=auth.uid()))$policy$;
  execute $policy$create policy faculty_read_own_material_files on public.course_material_files for select to authenticated
    using (exists(select 1 from public.course_materials m join public.faculty_profiles fp on fp.id=m.faculty_profile_id
      where m.id=course_material_id and fp.user_id=auth.uid()))$policy$;
  execute 'revoke insert,update,delete on public.course_materials,public.course_material_files from authenticated,service_role';
  execute 'revoke insert,update,delete on public.course_material_events from authenticated,service_role';
end $$;

revoke all on procedure public.apply_materials_rpc_only_dml_cutover() from public,anon,authenticated,service_role;

commit;
