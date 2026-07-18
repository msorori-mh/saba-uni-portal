-- MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01
-- FORWARD DRAFT ONLY. DO NOT APPLY from this branch.
-- Depends on docs/migrations-design/20260714000000_course_materials_mvp.sql.

begin;

create unique index if not exists uq_material_events_actor_idempotency
  on public.course_material_events (actor_user_id, (meta ->> 'idempotency_key'))
  where meta ? 'idempotency_key';

create or replace function public.faculty_mutate_course_material_atomic(
  p_action text,
  p_material_id uuid default null,
  p_section_id uuid default null,
  p_expected_updated_at timestamptz default null,
  p_idempotency_key uuid default null,
  p_patch jsonb default '{}'::jsonb
)
returns table (
  material_id uuid,
  course_section_id uuid,
  study_system text,
  title text,
  status text,
  updated_at timestamptz,
  changed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fp public.faculty_profiles%rowtype;
  v_section public.course_sections%rowtype;
  v_material public.course_materials%rowtype;
  v_prior uuid;
  v_event text;
begin
  if v_uid is null or p_idempotency_key is null then
    raise exception 'AUTHORIZATION_DENIED';
  end if;
  if p_action not in ('create', 'update', 'publish', 'archive') then
    raise exception 'INVALID_ACTION';
  end if;

  select * into strict v_fp
  from public.faculty_profiles fp
  where fp.user_id = v_uid and fp.status = 'active'
  for update;

  select e.course_material_id into v_prior
  from public.course_material_events e
  where e.actor_user_id = v_uid
    and e.meta ->> 'idempotency_key' = p_idempotency_key::text
  limit 1;
  if v_prior is not null then
    select * into strict v_material from public.course_materials where id = v_prior;
    if not exists (
      select 1 from public.course_material_events e
      where e.course_material_id = v_prior
        and e.actor_user_id = v_uid
        and e.meta ->> 'idempotency_key' = p_idempotency_key::text
        and e.meta ->> 'action' = p_action
        and (
          (p_action = 'create' and v_material.course_section_id = p_section_id)
          or (p_action <> 'create' and v_material.id = p_material_id)
        )
    ) then
      raise exception 'IDEMPOTENCY_KEY_REUSE';
    end if;
    return query select v_material.id, v_material.course_section_id,
      v_material.study_system, v_material.title, v_material.status,
      v_material.updated_at, false;
    return;
  end if;

  if p_action = 'create' then
    if p_material_id is not null or p_section_id is null or p_expected_updated_at is not null then
      raise exception 'IMMUTABLE_TARGET_VIOLATION';
    end if;
    select cs.* into strict v_section
    from public.course_sections cs
    join public.course_offerings co on co.id = cs.course_offering_id
    where cs.id = p_section_id
      and cs.faculty_profile_id = v_fp.id
      and cs.status = 'active'
      and co.status = 'active'
      and co.academic_year_id = (select id from public.academic_years where is_current = true limit 1)
      and co.semester_id = (select id from public.semesters where is_current = true limit 1)
      and (select count(*) from public.academic_years where is_current = true) = 1
      and (select count(*) from public.semesters where is_current = true) = 1
      and exists (
        select 1 from public.semesters s
        where s.id = co.semester_id and s.academic_year_id = co.academic_year_id
      )
    for update of cs;

    insert into public.course_materials (
      course_section_id, faculty_profile_id, title, description,
      lecture_number, study_system, status
    ) values (
      v_section.id, v_fp.id, btrim(p_patch ->> 'title'),
      nullif(p_patch ->> 'description', ''),
      case when p_patch ? 'lecture_number' then (p_patch ->> 'lecture_number')::integer end,
      p_patch ->> 'study_system', 'draft'
    ) returning * into v_material;
    v_event := 'created';
  else
    if p_material_id is null or p_section_id is not null then
      raise exception 'IMMUTABLE_TARGET_VIOLATION';
    end if;
    select m.* into strict v_material
    from public.course_materials m
    join public.course_sections cs on cs.id = m.course_section_id
    where m.id = p_material_id
      and m.faculty_profile_id = v_fp.id
      and cs.faculty_profile_id = v_fp.id
    for update of m;

    if p_expected_updated_at is null or v_material.updated_at <> p_expected_updated_at then
      raise exception 'STALE_MATERIAL_VERSION';
    end if;

    if p_action in ('update', 'publish') then
      perform 1
      from public.course_sections cs
      join public.course_offerings co on co.id = cs.course_offering_id
      where cs.id = v_material.course_section_id
        and cs.status = 'active' and co.status = 'active'
        and co.academic_year_id = (select id from public.academic_years where is_current = true limit 1)
        and co.semester_id = (select id from public.semesters where is_current = true limit 1)
        and (select count(*) from public.academic_years where is_current = true) = 1
        and (select count(*) from public.semesters where is_current = true) = 1
        and exists (
          select 1 from public.semesters s
          where s.id = co.semester_id and s.academic_year_id = co.academic_year_id
        );
      if not found then raise exception 'CURRENT_ACTIVE_SECTION_REQUIRED'; end if;
    end if;

    if p_action = 'update' then
      if v_material.status = 'archived' then raise exception 'ARCHIVED_MATERIAL_IMMUTABLE'; end if;
      update public.course_materials set
        title = case when p_patch ? 'title' then btrim(p_patch ->> 'title') else title end,
        description = case when p_patch ? 'description' then p_patch ->> 'description' else description end,
        lecture_number = case when p_patch ? 'lecture_number' then (p_patch ->> 'lecture_number')::integer else lecture_number end,
        study_system = case when p_patch ? 'study_system' then p_patch ->> 'study_system' else study_system end
      where id = v_material.id returning * into v_material;
      v_event := 'updated';
    elsif p_action = 'publish' then
      if v_material.status = 'archived' then raise exception 'ARCHIVED_MATERIAL_IMMUTABLE'; end if;
      if v_material.status = 'published' then
        return query select v_material.id, v_material.course_section_id,
          v_material.study_system, v_material.title, v_material.status,
          v_material.updated_at, false;
        return;
      end if;
      update public.course_materials set status = 'published', published_at = now()
      where id = v_material.id returning * into v_material;
      v_event := 'published';
    else
      if v_material.status = 'archived' then
        return query select v_material.id, v_material.course_section_id,
          v_material.study_system, v_material.title, v_material.status,
          v_material.updated_at, false;
        return;
      end if;
      update public.course_materials set status = 'archived'
      where id = v_material.id returning * into v_material;
      v_event := 'archived';
    end if;
  end if;

  insert into public.course_material_events(course_material_id, actor_user_id, event, meta)
  values (
    v_material.id,
    v_uid,
    v_event,
    jsonb_build_object('idempotency_key', p_idempotency_key, 'action', p_action)
  );

  if p_action = 'publish' then
    insert into public.notifications (
      user_id, title, message, notification_type,
      reference_type, reference_id, is_read
    )
    select distinct
      sp.user_id,
      'مادة تعليمية جديدة',
      'تم نشر: ' || v_material.title,
      'info',
      'course_material',
      v_material.id,
      false
    from public.student_enrollments se
    join public.student_profiles sp on sp.id = se.student_profile_id
    where se.course_section_id = v_material.course_section_id
      and se.enrollment_status = 'enrolled'
      and sp.user_id is not null
      and sp.study_system in ('regular', 'parallel')
      and (v_material.study_system = 'both' or v_material.study_system = sp.study_system);
  end if;

  return query select v_material.id, v_material.course_section_id,
    v_material.study_system, v_material.title, v_material.status,
    v_material.updated_at, true;
end;
$$;

revoke all on function public.faculty_mutate_course_material_atomic(text, uuid, uuid, timestamptz, uuid, jsonb) from public, anon, service_role;
grant execute on function public.faculty_mutate_course_material_atomic(text, uuid, uuid, timestamptz, uuid, jsonb) to authenticated;

commit;
