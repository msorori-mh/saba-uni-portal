-- Disposable PG17 verifier for PORTAL_GP_MVP_STORAGE_INSERT_POLICY_FORWARD_FIX_01.
-- Applies after: minimal schema + A1 + A2 + A3 + new remediation migration.
-- Ends with ROLLBACK; no persistent changes.

begin;

-- Enable the same RLS enforcement shape as Supabase storage.objects.
alter table storage.objects enable row level security;

-- Authenticated needs schema usage and INSERT on storage.objects; the policy
-- (not a table grant) decides which rows are allowed. No GP table grants.
grant usage on schema public, storage to authenticated;
grant insert on storage.objects to authenticated;

-- Verifier helpers ----------------------------------------------------------------
create or replace function pg_temp.expect_rls_deny(
  p_user uuid,
  p_sql text
) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set role authenticated;
  execute p_sql;
  set role postgres;
  raise exception 'expected RLS deny but statement succeeded: %', p_sql;
exception when others then
  set role postgres;
  if sqlstate not in ('42501','23503','23514') then
    raise exception 'expected RLS deny SQLSTATE, got % (% - %)', sqlstate, sqlerrm, p_sql;
  end if;
end $$;

-- Seed a project, an active leader assignment, and one pending file --------------
do $$
declare
  v_project uuid := '50000000-0000-0000-0000-000000000001';
  v_assignment uuid := '51000000-0000-0000-0000-000000000001';
  v_file uuid := '52000000-0000-0000-0000-000000000001';
  v_leader uuid := '10000000-0000-0000-0000-000000000001';
begin
  insert into public.graduation_projects(id, department_id, lifecycle_state)
  values (v_project, '20000000-0000-0000-0000-000000000001', 'draft');

  insert into public.graduation_project_assignments(
    id, project_id, role, student_profile_id, user_id, department_id, is_leader, active, assigned_by
  ) values (
    v_assignment, v_project, 'student',
    '30000000-0000-0000-0000-000000000001',
    v_leader,
    '20000000-0000-0000-0000-000000000001',
    true, true, v_leader
  );

  insert into public.graduation_project_files(
    id, project_id, category, object_key, original_name, media_type, byte_size, sha256,
    upload_status, scan_state, is_current, uploaded_by_assignment_id
  ) values (
    v_file, v_project, 'proposal',
    'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf',
    'test.pdf', 'application/pdf', 1024, repeat('a', 64),
    'pending', 'pending', false, v_assignment
  );
end $$;

-- A. authenticated still has NO direct SELECT on GP tables ------------------------
do $$
declare
  v_tables text[] := array[
    'public.graduation_project_files',
    'public.graduation_project_assignments'
  ];
  v_tbl text;
begin
  foreach v_tbl in array v_tables loop
    if has_table_privilege('authenticated', v_tbl, 'SELECT') then
      raise exception 'authenticated must not have SELECT on %', v_tbl;
    end if;
  end loop;
  raise notice 'A_GP_TABLE_SELECT_DENIED';
end $$;

-- D. Predicate ACL: authenticated execute only; PUBLIC/anon denied ---------------
do $$
begin
  if not has_function_privilege('authenticated', 'public.can_upload_graduation_project_object(text)', 'EXECUTE') then
    raise exception 'authenticated must execute can_upload_graduation_project_object';
  end if;
  if has_function_privilege('anon', 'public.can_upload_graduation_project_object(text)', 'EXECUTE') then
    raise exception 'anon must not execute can_upload_graduation_project_object';
  end if;
  if has_function_privilege('public', 'public.can_upload_graduation_project_object(text)', 'EXECUTE') then
    raise exception 'PUBLIC must not execute can_upload_graduation_project_object';
  end if;
  raise notice 'D_PREDICATE_ACL_OK';
end $$;

-- E. No broad table grants introduced -------------------------------------------
do $$
declare
  v_tables text[] := array[
    'public.graduation_project_files',
    'public.graduation_project_assignments',
    'public.graduation_projects',
    'public.graduation_project_department_coordinators',
    'public.graduation_project_events'
  ];
  v_privs text[] := array['SELECT','INSERT','UPDATE','DELETE'];
  v_tbl text; v_priv text;
begin
  foreach v_tbl in array v_tables loop
    foreach v_priv in array v_privs loop
      if has_table_privilege('authenticated', v_tbl, v_priv) then
        raise exception 'authenticated has unexpected % on %', v_priv, v_tbl;
      end if;
    end loop;
  end loop;
  raise notice 'E_NO_BROAD_TABLE_GRANTS';
end $$;

-- B. Positive: matching pending file + owning active assignment → INSERT ALLOW --
do $$
declare
  v_leader uuid := '10000000-0000-0000-0000-000000000001';
begin
  perform set_config('request.jwt.claim.sub', v_leader::text, true);
  set role authenticated;
  insert into storage.objects(bucket_id, name, metadata)
  values (
    'graduation-projects',
    'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf',
    '{}'::jsonb
  );
  set role postgres;
  raise notice 'B_POSITIVE_STORAGE_INSERT_ALLOWED';
end $$;

-- C. Deny cases -----------------------------------------------------------------

-- C1. Wrong user (no assignment)
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000004'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C1_WRONG_USER_DENIED'; end $$;

-- C2. Inactive assignment (active = false, ended_at set)
update public.graduation_project_assignments
set active = false, ended_at = now()
where id = '51000000-0000-0000-0000-000000000001';

select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C2_INACTIVE_ASSIGNMENT_DENIED'; end $$;

-- C3. Schema invariant + ended-state denial.
-- The A1 assignment_interval constraint only permits:
--   (active=true AND ended_at IS NULL)
--   OR
--   (active=false AND ended_at IS NOT NULL AND ended_at >= assigned_at)
-- Therefore active=true + ended_at IS NOT NULL is an INVALID DATABASE STATE.
-- The predicate's extra a.ended_at is null check is defense-in-depth:
-- under valid A1 rows, active=true already implies ended_at IS NULL.
-- This section proves:
--   - the database rejects the invalid active+ended state
--   - the valid ended state (active=false, ended_at not null) is denied upload.

-- C3a. A1 prevents the invalid active+ended state.
do $$
begin
  -- Attempt the invalid state: active=true while ended_at is already set.
  -- The PL/pgSQL exception block provides an implicit savepoint, so the
  -- failed invalid-state attempt is rolled back without aborting the verifier.
  update public.graduation_project_assignments
  set active = true
  where id = '51000000-0000-0000-0000-000000000001';
  -- If the update succeeds, the invariant is broken.
  raise exception 'assignment_interval allowed active=true with ended_at not null';
exception when check_violation then
  raise notice 'C3_ASSIGNMENT_INTERVAL_PREVENTS_ACTIVE_ENDED_STATE';
end $$;

-- C3b. Valid ended assignment state still denied.
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C3_ENDED_ASSIGNMENT_DENIED'; end $$;

-- Restore active assignment and create a non-pending file for the next case
update public.graduation_project_assignments
set active = true, ended_at = null
where id = '51000000-0000-0000-0000-000000000001';

insert into public.graduation_project_files(
  id, project_id, category, object_key, original_name, media_type, byte_size, sha256,
  upload_status, scan_state, is_current, uploaded_by_assignment_id
) values (
  '52000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001',
  'proposal',
  'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/uploaded.pdf',
  'uploaded.pdf', 'application/pdf', 1024, repeat('b', 64),
  'uploaded', 'pending', false, '51000000-0000-0000-0000-000000000001'
);

-- C4. Non-pending file
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/uploaded.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C4_NON_PENDING_FILE_DENIED'; end $$;

-- C5. Unknown object key
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/unknown.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C5_UNKNOWN_OBJECT_KEY_DENIED'; end $$;

-- C6. Wrong bucket (same key, wrong bucket_id)
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('other-bucket', 'graduation-projects/50000000-0000-0000-0000-000000000001/proposal/test.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C6_WRONG_BUCKET_DENIED'; end $$;

-- C7. Path traversal
select pg_temp.expect_rls_deny(
  '10000000-0000-0000-0000-000000000001'::uuid,
  $sql$insert into storage.objects(bucket_id, name, metadata) values
    ('graduation-projects', 'graduation-projects/../evil.pdf', '{}'::jsonb)$sql$
);
do $$ begin raise notice 'C7_PATH_TRAVERSAL_DENIED'; end $$;

-- Final pass marker -------------------------------------------------------------
do $$ begin raise notice 'GP_MVP_STORAGE_INSERT_REMEDIATION_VERIFIER_PASS'; end $$;

rollback;
