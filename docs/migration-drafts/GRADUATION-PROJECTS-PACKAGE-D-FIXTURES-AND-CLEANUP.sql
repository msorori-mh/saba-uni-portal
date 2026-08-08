-- GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql
-- Mission: PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_FIX_01
-- Package: PACKAGE D — AUTHORIZATION, CONTRACT TESTS AND E2E PACKAGE
-- Sole Authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
-- Status: SOURCE-ONLY DRAFT — DO NOT APPLY TO PRODUCTION
--
-- Cleanup contract (exact IDs only):
--   - mission marker TEST_ONLY_GP_MVP_E2E_01 required
--   - no broad TEST pattern matching / no broad title deletes
--   - delete only allowlisted temporary project/file IDs
--   - preserve archived evidence project id
--   - unrelated synthetic/control rows must remain untouched

begin;

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'graduation_projects'
  ) then
    raise notice 'INFO: Graduation projects core table not yet applied. Package D cleanup remains source-only.';
  end if;
end $$;

--------------------------------------------------------------------------------
-- 1. CLEANUP CONTRACT RPC (exact-ID allowlist)
--------------------------------------------------------------------------------
create or replace function public.cleanup_graduation_project_test_artifacts(
  p_package_marker text default 'TEST_ONLY_GP_MVP_E2E_01',
  p_preserve_project_id uuid default '00000000-0000-4000-c000-000000000001'::uuid,
  p_temp_project_ids uuid[] default '{}'::uuid[],
  p_temp_file_ids uuid[] default '{}'::uuid[],
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_marker constant text := 'TEST_ONLY_GP_MVP_E2E_01';
  v_temp_projects uuid[] := coalesce(p_temp_project_ids, '{}'::uuid[]);
  v_temp_files uuid[] := coalesce(p_temp_file_ids, '{}'::uuid[]);
  v_deleted_projects int := 0;
  v_deleted_files int := 0;
  v_deleted_events int := 0;
  v_deleted_evaluations int := 0;
  v_candidate_projects int := 0;
  v_candidate_files int := 0;
begin
  if p_package_marker is distinct from v_marker then
    raise exception 'SECURITY_VIOLATION: Cleanup allowed only for tag TEST_ONLY_GP_MVP_E2E_01';
  end if;

  if p_preserve_project_id is null then
    raise exception 'SECURITY_VIOLATION: preserve project id required';
  end if;

  if p_preserve_project_id = any (v_temp_projects) then
    raise exception 'SECURITY_VIOLATION: preserve project id must not appear in temp project allowlist';
  end if;

  if exists (
    select 1
    from public.graduation_project_files f
    where f.id = any (v_temp_files)
      and f.project_id = p_preserve_project_id
  ) then
    raise exception 'SECURITY_VIOLATION: temp file allowlist collides with preserved evidence project';
  end if;

  select count(*) into v_candidate_projects
  from public.graduation_projects p
  where p.id = any (v_temp_projects)
    and p.id <> p_preserve_project_id;

  select count(*) into v_candidate_files
  from public.graduation_project_files f
  where f.id = any (v_temp_files)
    and f.project_id <> p_preserve_project_id;

  if p_dry_run then
    return jsonb_build_object(
      'dry_run', true,
      'marker', v_marker,
      'preserve_project_id', p_preserve_project_id,
      'candidate_projects', v_candidate_projects,
      'candidate_files', v_candidate_files,
      'status', 'CLEANUP_DRY_RUN'
    );
  end if;

  -- Bypass append-only event trigger and FK ordering only for allowlisted temp IDs.
  perform set_config('session_replication_role', 'replica', true);

  delete from public.graduation_project_evaluations e
  where e.project_id = any (v_temp_projects)
    and e.project_id <> p_preserve_project_id;
  get diagnostics v_deleted_evaluations = row_count;

  delete from public.graduation_project_panel_members pm
  where pm.project_id = any (v_temp_projects)
    and pm.project_id <> p_preserve_project_id;

  delete from public.graduation_project_discussions d
  where d.project_id = any (v_temp_projects)
    and d.project_id <> p_preserve_project_id;

  delete from public.graduation_project_progress_entries pe
  where pe.project_id = any (v_temp_projects)
    and pe.project_id <> p_preserve_project_id;

  delete from public.graduation_project_approvals ap
  where ap.project_id = any (v_temp_projects)
    and ap.project_id <> p_preserve_project_id;

  delete from public.graduation_project_final_archives fa
  where fa.project_id = any (v_temp_projects)
    and fa.project_id <> p_preserve_project_id;

  delete from public.graduation_project_files f
  where (
      f.id = any (v_temp_files)
      or f.project_id = any (v_temp_projects)
    )
    and f.project_id <> p_preserve_project_id;
  get diagnostics v_deleted_files = row_count;

  delete from public.graduation_project_events e
  where e.project_id = any (v_temp_projects)
    and e.project_id <> p_preserve_project_id;
  get diagnostics v_deleted_events = row_count;

  delete from public.graduation_project_assignments a
  where a.project_id = any (v_temp_projects)
    and a.project_id <> p_preserve_project_id;

  delete from public.graduation_projects p
  where p.id = any (v_temp_projects)
    and p.id <> p_preserve_project_id;
  get diagnostics v_deleted_projects = row_count;

  perform set_config('session_replication_role', 'origin', true);

  if exists (
    select 1 from public.graduation_projects p
    where p.id = any (v_temp_projects)
      and p.id <> p_preserve_project_id
  ) then
    raise exception 'CLEANUP_INCOMPLETE: residual temporary projects remain';
  end if;

  if exists (
    select 1 from public.graduation_project_files f
    where f.id = any (v_temp_files)
      and f.project_id <> p_preserve_project_id
  ) then
    raise exception 'CLEANUP_INCOMPLETE: residual temporary files remain';
  end if;

  return jsonb_build_object(
    'dry_run', false,
    'marker', v_marker,
    'preserve_project_id', p_preserve_project_id,
    'deleted_projects', v_deleted_projects,
    'deleted_files', v_deleted_files,
    'deleted_events', v_deleted_events,
    'deleted_evaluations', v_deleted_evaluations,
    'status', 'CLEANUP_SUCCESS'
  );
end;
$$;

revoke all on function public.cleanup_graduation_project_test_artifacts(text, uuid, uuid[], uuid[], boolean)
  from public, anon;
grant execute on function public.cleanup_graduation_project_test_artifacts(text, uuid, uuid[], uuid[], boolean)
  to authenticated;

--------------------------------------------------------------------------------
-- 2. FINGERPRINT EXPORT CONTRACT RPC
--------------------------------------------------------------------------------
create or replace function public.export_graduation_project_e2e_fingerprint(
  p_project_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project public.graduation_projects;
  v_assignments jsonb;
  v_proposal jsonb;
  v_defense jsonb;
  v_evaluations jsonb;
  v_files jsonb;
  v_progress jsonb;
  v_events_count bigint;
begin
  select * into v_project
  from public.graduation_projects
  where id = p_project_id;

  if not found then
    raise exception 'PROJECT_NOT_FOUND: %', p_project_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'role', role::text,
    'is_leader', is_leader,
    'active', active,
    'supervision_status', supervision_status::text
  ) order by role::text, user_id), '[]'::jsonb)
  into v_assignments
  from public.graduation_project_assignments
  where project_id = p_project_id;

  select jsonb_build_object(
    'title', title,
    'problem_statement', problem_statement,
    'objectives', objectives,
    'summary', summary,
    'lifecycle_state', lifecycle_state::text,
    'final_decision', final_decision::text,
    'version', version
  ) into v_proposal
  from public.graduation_projects
  where id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'file_id', id,
    'category', category::text,
    'upload_status', upload_status::text,
    'scan_state', scan_state::text,
    'is_current', is_current
  ) order by category::text, id), '[]'::jsonb)
  into v_files
  from public.graduation_project_files
  where project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'entry_id', id,
    'version_no', version_no,
    'state', state,
    'summary', summary
  ) order by version_no), '[]'::jsonb)
  into v_progress
  from public.graduation_project_progress_entries
  where project_id = p_project_id;

  select jsonb_build_object(
    'scheduled_at', d.starts_at,
    'venue', d.venue,
    'state', d.state,
    'committee_count', (
      select count(*)::int from public.graduation_project_panel_members pm
      where pm.discussion_id = d.id
    )
  ) into v_defense
  from public.graduation_project_discussions d
  where d.project_id = p_project_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'panel_member_id', e.panel_member_id,
    'score', e.score,
    'notes', e.notes,
    'state', e.state
  ) order by e.panel_member_id), '[]'::jsonb)
  into v_evaluations
  from public.graduation_project_evaluations e
  where e.project_id = p_project_id;

  select count(*) into v_events_count
  from public.graduation_project_events
  where project_id = p_project_id;

  return jsonb_build_object(
    'project_id', p_project_id,
    'state', v_project.lifecycle_state::text,
    'final_decision', v_project.final_decision::text,
    'version', v_project.version,
    'assignments', v_assignments,
    'proposal', v_proposal,
    'files', v_files,
    'progress', v_progress,
    'defense', v_defense,
    'evaluations', v_evaluations,
    'events_count', v_events_count
  );
end;
$$;

revoke all on function public.export_graduation_project_e2e_fingerprint(uuid) from public, anon;
grant execute on function public.export_graduation_project_e2e_fingerprint(uuid) to authenticated;

commit;
