-- LEARNING-MATERIALS-SECURE-ACTIVATION-01 — executable PG17 verifier.
-- Runs on a disposable cluster AFTER postgres-minimal-schema.sql and the draft
-- docs/drafts/20260721000000_materials_secure_activation.draft.sql.
-- Every check raises 'CHECK FAILED: <n> ...' on failure; the script ends with
-- ROLLBACK so nothing persists. Plain SQL only (no psql meta-commands) so it
-- can run through any driver. See tests/materials/run-postgres-verifier.mjs.

begin;

-- Scratch table for passing values between checks (dies with the rollback).
create temp table test_results (k text primary key, v text);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into public.academic_years (id, is_current) values
  ('50000000-0000-0000-0000-000000000000', false),  -- Y0 old
  ('50000000-0000-0000-0000-000000000001', true);   -- Y1 current
insert into public.semesters (id, academic_year_id, is_current) values
  ('50000000-0000-0000-0000-000000000010', '50000000-0000-0000-0000-000000000000', false),
  ('50000000-0000-0000-0000-000000000011', '50000000-0000-0000-0000-000000000001', true);
insert into public.course_offerings (id, status, academic_year_id, semester_id) values
  ('60000000-0000-0000-0000-000000000000', 'active', '50000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000010'),
  ('60000000-0000-0000-0000-000000000001', 'active', '50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000011');
insert into public.faculty_profiles (id, user_id, status) values
  ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'active'),
  ('30000000-0000-0000-0000-0000000000f2', '10000000-0000-0000-0000-0000000000f2', 'active');
insert into public.course_sections (id, section_code, status, faculty_profile_id, course_offering_id) values
  ('70000000-0000-0000-0000-000000000000', 'OLD-1', 'active', '30000000-0000-0000-0000-0000000000f1', '60000000-0000-0000-0000-000000000000'),
  ('70000000-0000-0000-0000-000000000001', 'CS-1', 'active', '30000000-0000-0000-0000-0000000000f1', '60000000-0000-0000-0000-000000000001');
insert into public.student_profiles (id, user_id, study_system) values
  ('40000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'regular'),
  ('40000000-0000-0000-0000-0000000000a2', '20000000-0000-0000-0000-0000000000a2', 'regular'),
  ('40000000-0000-0000-0000-0000000000a3', '20000000-0000-0000-0000-0000000000a3', 'parallel');
insert into public.student_enrollments (student_profile_id, course_section_id, enrollment_status) values
  ('40000000-0000-0000-0000-0000000000a1', '70000000-0000-0000-0000-000000000001', 'enrolled'), -- ST1 current
  ('40000000-0000-0000-0000-0000000000a2', '70000000-0000-0000-0000-000000000000', 'enrolled'), -- ST2 old term only
  ('40000000-0000-0000-0000-0000000000a3', '70000000-0000-0000-0000-000000000001', 'enrolled'); -- ST3 parallel
insert into public.course_materials (id, course_section_id, faculty_profile_id, title, study_system, status) values
  ('80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'منشورة', 'regular', 'published'),
  ('80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'مسودة', 'regular', 'draft'),
  ('80000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'مؤرشفة', 'regular', 'archived'),
  ('80000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-0000000000f1', 'قديمة', 'regular', 'published');

-- ---------------------------------------------------------------------------
-- 01: week_number accepts 1..20 only
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.course_materials (course_section_id, faculty_profile_id, title, study_system, week_number)
  values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'tmp', 'regular', 16);
  begin
    insert into public.course_materials (course_section_id, faculty_profile_id, title, study_system, week_number)
    values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'tmp', 'regular', 0);
    raise exception 'CHECK FAILED: 01 week=0 accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.course_materials (course_section_id, faculty_profile_id, title, study_system, week_number)
    values ('70000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000f1', 'tmp', 'regular', 21);
    raise exception 'CHECK FAILED: 01 week=21 accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 02: scan_state defaults to 'pending' and rejects unknown values
-- ---------------------------------------------------------------------------
do $$
declare v_state text;
begin
  insert into public.course_material_files (course_material_id, storage_path, original_filename, mime_type, size_bytes)
  values ('80000000-0000-0000-0000-000000000002', 'direct/1.pdf', 'a.pdf', 'application/pdf', 100)
  returning scan_state into v_state;
  if v_state <> 'pending' then
    raise exception 'CHECK FAILED: 02 default scan_state=%', v_state;
  end if;
  begin
    insert into public.course_material_files (course_material_id, storage_path, original_filename, mime_type, size_bytes, scan_state)
    values ('80000000-0000-0000-0000-000000000002', 'direct/2.pdf', 'b.pdf', 'application/pdf', 100, 'bogus');
    raise exception 'CHECK FAILED: 02 bogus scan_state accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 03: events vocabulary includes file_scanned and rejects unknown events
-- ---------------------------------------------------------------------------
do $$
begin
  insert into public.course_material_events (course_material_id, event)
  values ('80000000-0000-0000-0000-000000000001', 'file_scanned');
  begin
    insert into public.course_material_events (course_material_id, event)
    values ('80000000-0000-0000-0000-000000000001', 'bogus');
    raise exception 'CHECK FAILED: 03 bogus event accepted';
  exception when check_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 04: narrow-only upload-policy settings seeded
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from public.site_settings where setting_key = 'materials_allowed_mime_types'
      and setting_value like 'application/pdf%' and setting_group = 'course_materials') then
    raise exception 'CHECK FAILED: 04 materials_allowed_mime_types seed';
  end if;
  if not exists (select 1 from public.site_settings where setting_key = 'materials_allowed_extensions'
      and setting_value = 'pdf,doc,docx,ppt,pptx') then
    raise exception 'CHECK FAILED: 04 materials_allowed_extensions seed';
  end if;
  if not exists (select 1 from public.site_settings where setting_key = 'materials_max_mb'
      and setting_value = '25') then
    raise exception 'CHECK FAILED: 04 materials_max_mb seed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 05: owner reserves an upload (version 1, pending scan, namespaced path)
-- ---------------------------------------------------------------------------
set local test.uid = '10000000-0000-0000-0000-0000000000f1';
do $$
declare r record;
begin
  select * into r from public.faculty_reserve_course_material_upload(
    '80000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-0000000000e1',
    jsonb_build_object('filename', 'slides.pdf', 'mime_type', 'application/pdf',
      'size_bytes', '12345', 'file_hash', repeat('a', 64)));
  if r.version_number <> 1
    or r.storage_path <> '70000000-0000-0000-0000-000000000001/80000000-0000-0000-0000-000000000001/1-slides.pdf' then
    raise exception 'CHECK FAILED: 05 reserve path/version: % %', r.version_number, r.storage_path;
  end if;
  if not exists (select 1 from public.course_material_files
      where id = r.file_id and scan_state = 'pending' and version_number = 1) then
    raise exception 'CHECK FAILED: 05 reserved row not pending';
  end if;
  insert into test_results values ('file1', r.file_id::text);
end $$;

-- 06: idempotent replay returns the same reservation without duplicates
do $$
declare r record; v_count int;
begin
  select * into r from public.faculty_reserve_course_material_upload(
    '80000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-0000000000e1',
    jsonb_build_object('filename', 'slides.pdf', 'mime_type', 'application/pdf',
      'size_bytes', '12345', 'file_hash', repeat('a', 64)));
  if r.file_id::text <> (select v from test_results where k = 'file1') then
    raise exception 'CHECK FAILED: 06 replay returned different file';
  end if;
  select count(*) into v_count from public.course_material_files
    where course_material_id = '80000000-0000-0000-0000-000000000001'
      and original_filename = 'slides.pdf';
  if v_count <> 1 then
    raise exception 'CHECK FAILED: 06 duplicated reservation rows (%)', v_count;
  end if;
end $$;

-- 07: same key + different payload -> IDEMPOTENCY_KEY_REUSE
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001',
      '90000000-0000-0000-0000-0000000000e1',
      jsonb_build_object('filename', 'other.pdf', 'mime_type', 'application/pdf', 'size_bytes', '12345'));
    raise exception 'CHECK FAILED: 07 key reuse accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'IDEMPOTENCY_KEY_REUSE' then
      raise exception 'CHECK FAILED: 07 wrong error: %', sqlerrm;
    end if;
  end;
end $$;

-- 08: fresh key reserves version 2
do $$
declare r record;
begin
  select * into r from public.faculty_reserve_course_material_upload(
    '80000000-0000-0000-0000-000000000001',
    '90000000-0000-0000-0000-0000000000e2',
    jsonb_build_object('filename', 'week2.pdf', 'mime_type', 'application/pdf',
      'size_bytes', '999', 'file_hash', repeat('c', 64)));
  if r.version_number <> 2 then
    raise exception 'CHECK FAILED: 08 expected version 2, got %', r.version_number;
  end if;
  insert into test_results values ('file2', r.file_id::text);
end $$;

-- 09: anonymous reserve -> AUTHORIZATION_DENIED
set local test.uid = '';
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000e9',
      jsonb_build_object('filename', 'x.pdf', 'mime_type', 'application/pdf', 'size_bytes', '1'));
    raise exception 'CHECK FAILED: 09 anon reserve accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then
      raise exception 'CHECK FAILED: 09 wrong error: %', sqlerrm;
    end if;
  end;
end $$;

-- 10: non-owner faculty reserve -> denied (strict ownership lookup)
set local test.uid = '10000000-0000-0000-0000-0000000000f2';
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000ea',
      jsonb_build_object('filename', 'x.pdf', 'mime_type', 'application/pdf', 'size_bytes', '1'));
    raise exception 'CHECK FAILED: 10 non-owner reserve accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
  end;
end $$;

-- 11..14: validation of mime / size / extension / missing size (as owner)
set local test.uid = '10000000-0000-0000-0000-0000000000f1';
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000eb',
      jsonb_build_object('filename', 'p.png', 'mime_type', 'image/png', 'size_bytes', '10'));
    raise exception 'CHECK FAILED: 11 bad mime accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_MIME_TYPE' then raise exception 'CHECK FAILED: 11 wrong error: %', sqlerrm; end if;
  end;
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000ec',
      jsonb_build_object('filename', 'big.pdf', 'mime_type', 'application/pdf', 'size_bytes', (26 * 1024 * 1024)::text));
    raise exception 'CHECK FAILED: 12 oversize accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_FILE_SIZE' then raise exception 'CHECK FAILED: 12 wrong error: %', sqlerrm; end if;
  end;
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000ed',
      jsonb_build_object('filename', 'evil.exe', 'mime_type', 'application/pdf', 'size_bytes', '10'));
    raise exception 'CHECK FAILED: 13 bad extension accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_FILE_EXTENSION' then raise exception 'CHECK FAILED: 13 wrong error: %', sqlerrm; end if;
  end;
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-0000000000ee',
      jsonb_build_object('filename', 'nosize.pdf', 'mime_type', 'application/pdf'));
    raise exception 'CHECK FAILED: 14 missing size accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_FILE_SIZE' then raise exception 'CHECK FAILED: 14 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 15: archived material -> ARCHIVED_MATERIAL_IMMUTABLE
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-0000000000ef',
      jsonb_build_object('filename', 'x.pdf', 'mime_type', 'application/pdf', 'size_bytes', '1'));
    raise exception 'CHECK FAILED: 15 archived reserve accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'ARCHIVED_MATERIAL_IMMUTABLE' then raise exception 'CHECK FAILED: 15 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 16: non-current section -> CURRENT_ACTIVE_SECTION_REQUIRED
do $$
begin
  begin
    perform public.faculty_reserve_course_material_upload(
      '80000000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-0000000000f0',
      jsonb_build_object('filename', 'x.pdf', 'mime_type', 'application/pdf', 'size_bytes', '1'));
    raise exception 'CHECK FAILED: 16 non-current reserve accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'CURRENT_ACTIVE_SECTION_REQUIRED' then raise exception 'CHECK FAILED: 16 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 17: finalize with matching hash/size confirms the upload
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from public.faculty_finalize_course_material_upload(
    (select v::uuid from test_results where k = 'file1'),
    '90000000-0000-0000-0000-0000000000e5',
    jsonb_build_object('file_hash', repeat('a', 64), 'size_bytes', '12345'));
  if not r.finalized then raise exception 'CHECK FAILED: 17 finalize returned false'; end if;
  if not exists (select 1 from public.course_material_files
      where id = (select v::uuid from test_results where k = 'file1')
        and upload_confirmed_at is not null) then
    raise exception 'CHECK FAILED: 17 upload_confirmed_at not set';
  end if;
  if not exists (select 1 from public.course_material_events
      where course_material_id = '80000000-0000-0000-0000-000000000001'
        and event = 'file_uploaded' and meta ->> 'phase' = 'finalized'
        and meta ->> 'file_id' = (select v from test_results where k = 'file1')) then
    raise exception 'CHECK FAILED: 17 finalized event missing';
  end if;
end $$;

-- 18: finalize replay with same key -> finalized=false, no duplicate event
do $$
declare r record; v_count int;
begin
  select * into r from public.faculty_finalize_course_material_upload(
    (select v::uuid from test_results where k = 'file1'),
    '90000000-0000-0000-0000-0000000000e5',
    jsonb_build_object('file_hash', repeat('a', 64), 'size_bytes', '12345'));
  if r.finalized then raise exception 'CHECK FAILED: 18 replay finalized again'; end if;
  select count(*) into v_count from public.course_material_events
    where meta ->> 'idempotency_key' = '90000000-0000-0000-0000-0000000000e5';
  if v_count <> 1 then raise exception 'CHECK FAILED: 18 duplicate finalize events (%)', v_count; end if;
end $$;

-- 18b: a reserve key reused for finalize -> IDEMPOTENCY_KEY_REUSE
do $$
begin
  begin
    perform public.faculty_finalize_course_material_upload(
      (select v::uuid from test_results where k = 'file1'),
      '90000000-0000-0000-0000-0000000000e1',
      jsonb_build_object('file_hash', repeat('a', 64), 'size_bytes', '12345'));
    raise exception 'CHECK FAILED: 18b cross-phase key reuse accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'IDEMPOTENCY_KEY_REUSE' then raise exception 'CHECK FAILED: 18b wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 19: finalize with a different hash -> UPLOAD_FINALIZE_MISMATCH
do $$
begin
  begin
    perform public.faculty_finalize_course_material_upload(
      (select v::uuid from test_results where k = 'file2'),
      '90000000-0000-0000-0000-0000000000e6',
      jsonb_build_object('file_hash', repeat('b', 64)));
    raise exception 'CHECK FAILED: 19 tampered finalize accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    -- file2 was reserved with a different hash, so finalizing mismatched bytes
    -- must fail closed.
    if sqlerrm not in ('UPLOAD_FINALIZE_MISMATCH') then
      raise exception 'CHECK FAILED: 19 wrong error: %', sqlerrm;
    end if;
  end;
end $$;

-- 20/21: finalize as non-owner / anon -> denied
set local test.uid = '10000000-0000-0000-0000-0000000000f2';
do $$
begin
  begin
    perform public.faculty_finalize_course_material_upload(
      (select v::uuid from test_results where k = 'file2'),
      '90000000-0000-0000-0000-0000000000e7', '{}'::jsonb);
    raise exception 'CHECK FAILED: 20 non-owner finalize accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
  end;
end $$;
set local test.uid = '';
do $$
begin
  begin
    perform public.faculty_finalize_course_material_upload(
      (select v::uuid from test_results where k = 'file2'),
      '90000000-0000-0000-0000-0000000000e8', '{}'::jsonb);
    raise exception 'CHECK FAILED: 21 anon finalize accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then raise exception 'CHECK FAILED: 21 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 22: authenticated callers cannot drive the scanner RPC (ACL)
-- ---------------------------------------------------------------------------
set local test.uid = '10000000-0000-0000-0000-0000000000f1';
select set_config('test.file1', v, true) from test_results where k = 'file1';
set role authenticated;
do $$
begin
  begin
    perform public.service_mark_course_material_file_scanned(
      current_setting('test.file1')::uuid, 'clean');
    raise exception 'CHECK FAILED: 22 authenticated scan accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm not like 'permission denied for function%' then
      raise exception 'CHECK FAILED: 22 wrong error: %', sqlerrm;
    end if;
  end;
end $$;
reset role;

-- 23: invalid scan target state -> INVALID_SCAN_STATE
set role service_role;
do $$
begin
  begin
    perform public.service_mark_course_material_file_scanned(
      current_setting('test.file1')::uuid, 'pending');
    raise exception 'CHECK FAILED: 23 scan-to-pending accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_SCAN_STATE' then raise exception 'CHECK FAILED: 23 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 24: service marks file1 clean (terminal transition + audit event)
do $$
declare v_file1 uuid := current_setting('test.file1')::uuid;
begin
  perform public.service_mark_course_material_file_scanned(v_file1, 'clean');
  if not exists (select 1 from public.course_material_files
      where id = v_file1 and scan_state = 'clean' and scanned_at is not null) then
    raise exception 'CHECK FAILED: 24 clean transition not applied';
  end if;
  if not exists (select 1 from public.course_material_events
      where event = 'file_scanned'
        and meta ->> 'file_id' = v_file1::text
        and meta ->> 'scan_state' = 'clean') then
    raise exception 'CHECK FAILED: 24 file_scanned event missing';
  end if;
end $$;

-- 25: terminal states are immutable via the scanner RPC
do $$
begin
  begin
    perform public.service_mark_course_material_file_scanned(
      current_setting('test.file1')::uuid, 'infected');
    raise exception 'CHECK FAILED: 25 rescan of clean file accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'INVALID_SCAN_TRANSITION' then raise exception 'CHECK FAILED: 25 wrong error: %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 26: enrolled student downloads a clean file -> audited
-- ---------------------------------------------------------------------------
set local test.uid = '20000000-0000-0000-0000-0000000000a1';
do $$
begin
  perform public.record_course_material_download(
    (select v::uuid from test_results where k = 'file1'),
    '80000000-0000-0000-0000-000000000001');
  if not exists (select 1 from public.course_material_events
      where course_material_id = '80000000-0000-0000-0000-000000000001'
        and event = 'downloaded'
        and actor_user_id = '20000000-0000-0000-0000-0000000000a1'
        and meta ->> 'file_id' = (select v from test_results where k = 'file1')) then
    raise exception 'CHECK FAILED: 26 download event missing';
  end if;
end $$;

-- 27: student download of a pending-scan file -> FILE_NOT_CLEAN
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file2'),
      '80000000-0000-0000-0000-000000000001');
    raise exception 'CHECK FAILED: 27 pending download accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'FILE_NOT_CLEAN' then raise exception 'CHECK FAILED: 27 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 28: faculty owner also blocked before clean (fail-closed for everyone)
set local test.uid = '10000000-0000-0000-0000-0000000000f1';
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file2'),
      '80000000-0000-0000-0000-000000000001');
    raise exception 'CHECK FAILED: 28 owner pending download accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'FILE_NOT_CLEAN' then raise exception 'CHECK FAILED: 28 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 29: not-enrolled student -> AUTHORIZATION_DENIED
set local test.uid = '20000000-0000-0000-0000-0000000000a2';
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file1'),
      '80000000-0000-0000-0000-000000000001');
    raise exception 'CHECK FAILED: 29 non-enrolled download accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then raise exception 'CHECK FAILED: 29 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 30: parallel student on a regular-only material -> AUTHORIZATION_DENIED
set local test.uid = '20000000-0000-0000-0000-0000000000a3';
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file1'),
      '80000000-0000-0000-0000-000000000001');
    raise exception 'CHECK FAILED: 30 study-system mismatch accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then raise exception 'CHECK FAILED: 30 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 31: draft (unpublished) material -> AUTHORIZATION_DENIED for students
set local test.uid = '20000000-0000-0000-0000-0000000000a1';
do $$
declare v_draft_file uuid;
begin
  insert into public.course_material_files (course_material_id, storage_path, original_filename, mime_type, size_bytes, scan_state)
  values ('80000000-0000-0000-0000-000000000002', 'direct/draft.pdf', 'd.pdf', 'application/pdf', 100, 'clean')
  returning id into v_draft_file;
  begin
    perform public.record_course_material_download(v_draft_file, '80000000-0000-0000-0000-000000000002');
    raise exception 'CHECK FAILED: 31 draft download accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then raise exception 'CHECK FAILED: 31 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 32: file/material binding is immutable (mismatched pair -> FILE_NOT_FOUND)
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file1'),
      '80000000-0000-0000-0000-000000000002');
    raise exception 'CHECK FAILED: 32 mismatched target accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'FILE_NOT_FOUND' then raise exception 'CHECK FAILED: 32 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- 33: anonymous download -> AUTHORIZATION_DENIED
set local test.uid = '';
do $$
begin
  begin
    perform public.record_course_material_download(
      (select v::uuid from test_results where k = 'file1'),
      '80000000-0000-0000-0000-000000000001');
    raise exception 'CHECK FAILED: 33 anon download accepted';
  exception when others then
    if sqlerrm like 'CHECK FAILED:%' then raise; end if;
    if sqlerrm <> 'AUTHORIZATION_DENIED' then raise exception 'CHECK FAILED: 33 wrong error: %', sqlerrm; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 34: security metadata (definer + pinned search_path) on all four RPCs
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    where p.oid in (
      'public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)'::regprocedure,
      'public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)'::regprocedure,
      'public.record_course_material_download(uuid,uuid)'::regprocedure,
      'public.service_mark_course_material_file_scanned(uuid,text)'::regprocedure)
      and (p.prosecdef is distinct from true
        or p.proconfig is distinct from array['search_path=public, pg_temp']::text[])
  ) then
    raise exception 'CHECK FAILED: 34 security metadata drift';
  end if;
end $$;

-- 35: execute ACLs on the three cutover RPCs = authenticated only
do $$
begin
  if not has_function_privilege('authenticated', 'public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.record_course_material_download(uuid,uuid)', 'EXECUTE') then
    raise exception 'CHECK FAILED: 35 authenticated missing EXECUTE';
  end if;
  if has_function_privilege('anon', 'public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'public.record_course_material_download(uuid,uuid)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.faculty_reserve_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.faculty_finalize_course_material_upload(uuid,uuid,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.record_course_material_download(uuid,uuid)', 'EXECUTE') then
    raise exception 'CHECK FAILED: 35 anon/service_role EXECUTE present';
  end if;
end $$;

-- 36: scanner RPC executable by service_role only
do $$
begin
  if not has_function_privilege('service_role', 'public.service_mark_course_material_file_scanned(uuid,text)', 'EXECUTE') then
    raise exception 'CHECK FAILED: 36 service_role missing scanner EXECUTE';
  end if;
  if has_function_privilege('authenticated', 'public.service_mark_course_material_file_scanned(uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.service_mark_course_material_file_scanned(uuid,text)', 'EXECUTE') then
    raise exception 'CHECK FAILED: 36 authenticated/anon scanner EXECUTE present';
  end if;
end $$;

do $$ begin raise notice 'ALL CHECKS PASSED (37 groups)'; end $$;

rollback;
