-- LEARNING-MATERIALS-SECURE-ACTIVATION-01
-- FORWARD DRAFT ONLY. NEVER APPLY FROM THIS PR.
--
-- Secure-activation schema objects for the course-materials system:
--   1) week_number linkage on course_materials (complements lecture_number)
--   2) malware-scan lifecycle on course_material_files (scan_state, fail-closed)
--   3) closed RPC write paths required by the atomic cutover procedure
--      (apply_materials_rpc_only_dml_cutover, MATERIALS-ATOMIC-AUTHORIZATION-MUTATION-01):
--        - public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)
--        - public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)
--        - public.record_course_material_download(uuid,uuid)
--   4) service-only scan-transition RPC (future scanner-worker integration point)
--   5) configurable upload-policy settings (narrow-only until decision D-16 lands)
--
-- Explicitly NOT in scope (pending separate approvals):
--   * NO storage bucket creation and NO storage.objects policy changes.
--   * NO migration is applied from this PR; activation stays behind feature flags
--     (faculty_course_materials_enabled / student_course_materials_enabled = false).
--   * Runtime callers are NOT switched to these RPCs here; that is the separately
--     gated caller release referenced by the atomic cutover procedure.
--
-- Apply order: base materials schema (20260714000000_course_materials_mvp) ->
-- atomic metadata draft (20260718000000) -> this draft -> verification ->
-- separately reviewed caller release -> cutover procedure.

begin;

-- ---------------------------------------------------------------------------
-- 0) Shared idempotency index (identical to the atomic draft; IF NOT EXISTS
--    keeps the two drafts composable in either apply order).
-- ---------------------------------------------------------------------------
create unique index if not exists uq_material_events_actor_idempotency
  on public.course_material_events (actor_user_id, (meta ->> 'idempotency_key'))
  where meta ? 'idempotency_key';

-- ---------------------------------------------------------------------------
-- 1) Week linkage (1..20, nullable; existing rows keep NULL).
-- ---------------------------------------------------------------------------
alter table public.course_materials
  add column if not exists week_number integer;
alter table public.course_materials
  drop constraint if exists course_materials_week_number_check;
alter table public.course_materials
  add constraint course_materials_week_number_check
  check (week_number is null or (week_number between 1 and 20));
create index if not exists idx_course_materials_section_week
  on public.course_materials (course_section_id, week_number);

-- ---------------------------------------------------------------------------
-- 2) Malware-scan lifecycle (fail-closed: default 'pending', downloads gated
--    on 'clean'; only the service RPC below may transition state).
-- ---------------------------------------------------------------------------
alter table public.course_material_files
  add column if not exists scan_state text not null default 'pending';
alter table public.course_material_files
  add column if not exists scanned_at timestamptz;
alter table public.course_material_files
  add column if not exists upload_confirmed_at timestamptz;
alter table public.course_material_files
  drop constraint if exists course_material_files_scan_state_check;
alter table public.course_material_files
  add constraint course_material_files_scan_state_check
  check (scan_state in ('pending','clean','infected','failed'));
create index if not exists idx_material_files_material_scan
  on public.course_material_files (course_material_id, scan_state);

-- ---------------------------------------------------------------------------
-- 3) Extend the event vocabulary with 'file_scanned' (audit of scan transitions).
-- ---------------------------------------------------------------------------
alter table public.course_material_events
  drop constraint if exists course_material_events_event_check;
alter table public.course_material_events
  add constraint course_material_events_event_check
  check (event in ('created','file_uploaded','published','updated','archived','downloaded','file_scanned'));

-- ---------------------------------------------------------------------------
-- 4) Configurable upload policy. D-16 (final approved types/limits) is pending,
--    so these settings may only NARROW the compiled-in conservative baseline;
--    the runtime intersects/clamps accordingly and never widens beyond
--    25MB + pdf/doc/docx/ppt/pptx.
-- ---------------------------------------------------------------------------
insert into public.site_settings (setting_key, setting_value, setting_group) values
  ('materials_allowed_mime_types',
   'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
   'course_materials'),
  ('materials_allowed_extensions', 'pdf,doc,docx,ppt,pptx', 'course_materials'),
  ('materials_max_mb', '25', 'course_materials')
on conflict (setting_key) do nothing;

-- ---------------------------------------------------------------------------
-- 5) faculty_reserve_course_material_upload(uuid,uuid,jsonb)
--    Atomic authorization + validation + version reservation for one upload.
--    payload: {filename, mime_type, size_bytes, file_hash?}
--    Idempotent on (actor, idempotency_key) with request-fingerprint binding.
-- ---------------------------------------------------------------------------
create or replace function public.faculty_reserve_course_material_upload(
  p_material_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb default '{}'::jsonb
)
returns table(file_id uuid, storage_path text, version_number integer)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fp_id uuid;
  v_year uuid;
  v_semester uuid;
  v_target_section uuid;
  v_offering_id uuid;
  v_material public.course_materials%rowtype;
  v_prior_file uuid;
  v_prior_fingerprint text;
  v_fingerprint text;
  v_filename text;
  v_mime text;
  v_size bigint;
  v_hash text;
  v_ext text;
  v_safe_name text;
  v_version integer;
  v_path text;
  v_file_id uuid;
  -- Conservative baseline (D-16 pending). Settings may narrow at runtime,
  -- never widen beyond this compiled-in floor of the contract.
  c_allowed_mime constant text[] := array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];
  c_allowed_ext constant text[] := array['pdf','doc','docx','ppt','pptx'];
  c_max_bytes constant bigint := 25 * 1024 * 1024;
begin
  if v_uid is null or p_idempotency_key is null or p_material_id is null then
    raise exception 'AUTHORIZATION_DENIED';
  end if;

  v_filename := btrim(coalesce(p_payload ->> 'filename', ''));
  v_mime := lower(btrim(coalesce(p_payload ->> 'mime_type', '')));
  v_size := case
    when coalesce(p_payload ->> 'size_bytes', '') ~ '^[0-9]+$'
      then (p_payload ->> 'size_bytes')::bigint
  end;
  v_hash := nullif(lower(btrim(coalesce(p_payload ->> 'file_hash', ''))), '');

  v_fingerprint := encode(extensions.digest(convert_to(
    concat_ws('|', p_material_id::text, v_filename, v_mime,
      coalesce(v_size::text, ''), coalesce(v_hash, '')),
    'UTF8'), 'sha256'), 'hex');

  -- Lost-response retry: same stable key, only for the identical payload.
  select (e.meta ->> 'file_id')::uuid, e.meta ->> 'request_fingerprint'
    into v_prior_file, v_prior_fingerprint
  from public.course_material_events e
  where e.actor_user_id = v_uid
    and e.meta ->> 'idempotency_key' = p_idempotency_key::text
  limit 1;

  -- Deterministic lock order: faculty -> canonical term tables (SHARE) ->
  -- section -> offering -> material (matches the atomic metadata RPC).
  select fp.id into strict v_fp_id
  from public.faculty_profiles fp
  where fp.user_id = v_uid and fp.status = 'active'
  for update;
  lock table public.academic_years in share mode;
  lock table public.semesters in share mode;
  select id into strict v_year from public.academic_years where is_current = true;
  select id into strict v_semester from public.semesters
    where is_current = true and academic_year_id = v_year;

  select m.course_section_id into strict v_target_section
  from public.course_materials m where m.id = p_material_id;

  select cs.course_offering_id into strict v_offering_id
  from public.course_sections cs
  where cs.id = v_target_section and cs.faculty_profile_id = v_fp_id
  for update;
  perform 1 from public.course_offerings co where co.id = v_offering_id for update;

  select m.* into strict v_material
  from public.course_materials m
  where m.id = p_material_id
    and m.course_section_id = v_target_section
    and m.faculty_profile_id = v_fp_id
  for update;

  -- Upload reservation mutates content, so it requires a current active section
  -- (same bar as create/update/publish in the atomic metadata RPC).
  if not exists (
    select 1
    from public.course_sections cs
    join public.course_offerings co on co.id = cs.course_offering_id
    where cs.id = v_target_section
      and cs.faculty_profile_id = v_fp_id
      and cs.status = 'active'
      and co.status = 'active'
      and co.academic_year_id = v_year
      and co.semester_id = v_semester
  ) then
    raise exception 'CURRENT_ACTIVE_SECTION_REQUIRED';
  end if;

  -- Replay path: revalidated under locks above; returns the same reservation.
  if v_prior_file is not null then
    if v_prior_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSE';
    end if;
    select f.id, f.storage_path, f.version_number
      into strict v_file_id, v_path, v_version
    from public.course_material_files f
    where f.id = v_prior_file and f.course_material_id = v_material.id
    for update;
    return query select v_file_id, v_path, v_version;
    return;
  end if;

  if v_material.status = 'archived' then
    raise exception 'ARCHIVED_MATERIAL_IMMUTABLE';
  end if;

  -- Validation (conservative baseline; the runtime layer narrows via settings).
  if v_filename = '' or length(v_filename) > 200 then
    raise exception 'INVALID_FILE_NAME';
  end if;
  if not (v_mime = any(c_allowed_mime)) then
    raise exception 'INVALID_MIME_TYPE';
  end if;
  v_ext := lower(substring(v_filename from '\.([^.]+)$'));
  if v_ext is null or not (v_ext = any(c_allowed_ext)) then
    raise exception 'INVALID_FILE_EXTENSION';
  end if;
  if v_size is null or v_size <= 0 or v_size > c_max_bytes then
    raise exception 'INVALID_FILE_SIZE';
  end if;
  if v_hash is not null and v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_FILE_HASH';
  end if;

  -- Next version under the material lock; unique (course_material_id, storage_path).
  select coalesce(max(f.version_number), 0) + 1 into v_version
  from public.course_material_files f
  where f.course_material_id = v_material.id;
  -- Storage-path safety: strip separators/control chars; namespace by section/material/version.
  v_safe_name := left(regexp_replace(v_filename, '[\\/[:cntrl:]]+', '_', 'g'), 120);
  v_path := v_material.course_section_id::text || '/' || v_material.id::text
    || '/' || v_version::text || '-' || v_safe_name;

  insert into public.course_material_files(
    course_material_id, storage_path, original_filename, mime_type,
    size_bytes, file_hash, version_number, scan_state
  ) values (
    v_material.id, v_path, v_filename, v_mime, v_size, v_hash, v_version, 'pending'
  )
  returning id into v_file_id;

  insert into public.course_material_events(course_material_id, actor_user_id, event, meta)
  values (
    v_material.id, v_uid, 'file_uploaded',
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_fingerprint', v_fingerprint,
      'file_id', v_file_id,
      'version_number', v_version,
      'phase', 'reserved'
    )
  );

  return query select v_file_id, v_path, v_version;
end $$;

revoke all on function public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)
  from public, anon, service_role;
grant execute on function public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6) faculty_finalize_course_material_upload(uuid,uuid,jsonb)
--    Confirms a reserved upload; binds the finalized bytes to the reservation
--    (hash/size tamper check). SQL cannot observe the storage object itself;
--    the service-role storage write happens between reserve and finalize
--    (same documented boundary as the atomic draft).
--    payload: {file_hash?, size_bytes?}
-- ---------------------------------------------------------------------------
create or replace function public.faculty_finalize_course_material_upload(
  p_file_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb default '{}'::jsonb
)
returns table(file_id uuid, finalized boolean)
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_fp_id uuid;
  v_file public.course_material_files%rowtype;
  v_material public.course_materials%rowtype;
  v_prior uuid;
  v_prior_fingerprint text;
  v_prior_phase text;
  v_fingerprint text;
  v_hash text;
  v_size bigint;
begin
  if v_uid is null or p_idempotency_key is null or p_file_id is null then
    raise exception 'AUTHORIZATION_DENIED';
  end if;

  v_hash := nullif(lower(btrim(coalesce(p_payload ->> 'file_hash', ''))), '');
  v_size := case
    when coalesce(p_payload ->> 'size_bytes', '') ~ '^[0-9]+$'
      then (p_payload ->> 'size_bytes')::bigint
  end;

  v_fingerprint := encode(extensions.digest(convert_to(
    concat_ws('|', p_file_id::text, coalesce(v_hash, ''), coalesce(v_size::text, '')),
    'UTF8'), 'sha256'), 'hex');

  -- Any prior event with this key binds it: a key used by another phase or a
  -- different payload/file is a reuse violation (the unique index is the backstop).
  select (e.meta ->> 'file_id')::uuid, e.meta ->> 'request_fingerprint', e.meta ->> 'phase'
    into v_prior, v_prior_fingerprint, v_prior_phase
  from public.course_material_events e
  where e.actor_user_id = v_uid
    and e.meta ->> 'idempotency_key' = p_idempotency_key::text
  limit 1;

  select fp.id into strict v_fp_id
  from public.faculty_profiles fp
  where fp.user_id = v_uid and fp.status = 'active'
  for update;

  -- Lock order: faculty -> material -> file.
  select m.* into strict v_material
  from public.course_materials m
  join public.course_material_files f0 on f0.course_material_id = m.id
  where f0.id = p_file_id and m.faculty_profile_id = v_fp_id
  for update of m;

  select f.* into strict v_file
  from public.course_material_files f
  where f.id = p_file_id and f.course_material_id = v_material.id
  for update;

  if v_prior is not null then
    if v_prior_phase is distinct from 'finalized'
      or v_prior_fingerprint is distinct from v_fingerprint
      or v_prior <> v_file.id then
      raise exception 'IDEMPOTENCY_KEY_REUSE';
    end if;
    return query select v_file.id, false;
    return;
  end if;

  if v_material.status = 'archived' then
    raise exception 'ARCHIVED_MATERIAL_IMMUTABLE';
  end if;

  -- Tamper binding: the finalized bytes must match the reservation.
  if v_hash is not null and v_file.file_hash is not null and v_hash <> v_file.file_hash then
    raise exception 'UPLOAD_FINALIZE_MISMATCH';
  end if;
  if v_size is not null and v_size <> v_file.size_bytes then
    raise exception 'UPLOAD_FINALIZE_MISMATCH';
  end if;

  if v_file.upload_confirmed_at is not null then
    -- Already finalized (retried with a fresh key): no duplicate event.
    return query select v_file.id, false;
    return;
  end if;

  update public.course_material_files
  set upload_confirmed_at = now()
  where id = v_file.id;

  insert into public.course_material_events(course_material_id, actor_user_id, event, meta)
  values (
    v_material.id, v_uid, 'file_uploaded',
    jsonb_build_object(
      'idempotency_key', p_idempotency_key,
      'request_fingerprint', v_fingerprint,
      'file_id', v_file.id,
      'version_number', v_file.version_number,
      'phase', 'finalized'
    )
  );

  return query select v_file.id, true;
end $$;

revoke all on function public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)
  from public, anon, service_role;
grant execute on function public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 7) record_course_material_download(uuid,uuid)
--    Checked-download audit: writes the immutable 'downloaded' access event.
--    Fail-closed gates (in order): target binding -> authorization -> scan gate.
--    Authorization = exact faculty owner OR student with exact current-term
--    active enrollment + study-system match on a published material
--    (no cohort fallback, mirroring the runtime fail-closed audience).
-- ---------------------------------------------------------------------------
create or replace function public.record_course_material_download(
  p_file_id uuid,
  p_material_id uuid
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_file public.course_material_files%rowtype;
  v_material public.course_materials%rowtype;
  v_is_owner boolean;
  v_student public.student_profiles%rowtype;
  v_year uuid;
  v_semester uuid;
begin
  if v_uid is null or p_file_id is null or p_material_id is null then
    raise exception 'AUTHORIZATION_DENIED';
  end if;

  -- Immutable target binding: the file must belong to the stated material.
  select f.* into v_file
  from public.course_material_files f
  where f.id = p_file_id and f.course_material_id = p_material_id;
  if not found then
    raise exception 'FILE_NOT_FOUND';
  end if;

  select m.* into strict v_material
  from public.course_materials m
  where m.id = p_material_id;

  select exists (
    select 1 from public.faculty_profiles fp
    where fp.user_id = v_uid and fp.id = v_material.faculty_profile_id
  ) into v_is_owner;

  if not v_is_owner then
    select sp.* into v_student
    from public.student_profiles sp
    where sp.user_id = v_uid;
    if not found then
      raise exception 'AUTHORIZATION_DENIED';
    end if;
    if v_material.status <> 'published'
      or coalesce(v_student.study_system, '') not in ('regular','parallel')
      or (v_material.study_system <> 'both' and v_material.study_system <> v_student.study_system)
    then
      raise exception 'AUTHORIZATION_DENIED';
    end if;

    select id into v_year from public.academic_years where is_current = true;
    select id into v_semester from public.semesters
      where is_current = true and academic_year_id = v_year;
    if v_year is null or v_semester is null then
      raise exception 'AUTHORIZATION_DENIED';
    end if;

    -- Exact current-term active enrollment only (fail-closed audience).
    if not exists (
      select 1
      from public.student_enrollments se
      join public.course_sections cs on cs.id = se.course_section_id
      join public.course_offerings co on co.id = cs.course_offering_id
      where se.student_profile_id = v_student.id
        and se.course_section_id = v_material.course_section_id
        and se.enrollment_status = 'enrolled'
        and cs.status = 'active'
        and co.status = 'active'
        and co.academic_year_id = v_year
        and co.semester_id = v_semester
    ) then
      raise exception 'AUTHORIZATION_DENIED';
    end if;
  end if;

  -- Fail-closed scan gate: no access before scan_state = 'clean' (everyone).
  if v_file.scan_state <> 'clean' then
    raise exception 'FILE_NOT_CLEAN';
  end if;

  insert into public.course_material_events(course_material_id, actor_user_id, event, meta)
  values (
    v_material.id, v_uid, 'downloaded',
    jsonb_build_object('file_id', v_file.id)
  );
end $$;

revoke all on function public.record_course_material_download(uuid,uuid)
  from public, anon, service_role;
grant execute on function public.record_course_material_download(uuid,uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 8) service_mark_course_material_file_scanned(uuid,text)
--    Scanner-worker integration point. Terminal transitions only
--    (pending -> clean|infected|failed); a re-scan requires a new version.
--    NOT callable by authenticated/anon; service_role only.
-- ---------------------------------------------------------------------------
create or replace function public.service_mark_course_material_file_scanned(
  p_file_id uuid,
  p_scan_state text
)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_file public.course_material_files%rowtype;
begin
  if p_file_id is null or p_scan_state not in ('clean','infected','failed') then
    raise exception 'INVALID_SCAN_STATE';
  end if;

  select f.* into strict v_file
  from public.course_material_files f
  where f.id = p_file_id
  for update;

  if v_file.scan_state <> 'pending' then
    raise exception 'INVALID_SCAN_TRANSITION';
  end if;

  update public.course_material_files
  set scan_state = p_scan_state, scanned_at = now()
  where id = v_file.id;

  insert into public.course_material_events(course_material_id, actor_user_id, event, meta)
  values (
    v_file.course_material_id, null, 'file_scanned',
    jsonb_build_object('file_id', v_file.id, 'scan_state', p_scan_state)
  );
end $$;

revoke all on function public.service_mark_course_material_file_scanned(uuid,text)
  from public, anon, authenticated;
grant execute on function public.service_mark_course_material_file_scanned(uuid,text)
  to service_role;

commit;
