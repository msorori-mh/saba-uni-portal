-- GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql
-- Mission: PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_D_AUTHORIZATION_E2E_IMPLEMENTATION_01
-- Package: PACKAGE D — AUTHORIZATION, CONTRACT TESTS AND E2E PACKAGE
-- Sole Authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
-- SHA Baseline: 7b67539aeb21bd223287de39d480cb1e6c0332b0
-- Status: SOURCE-ONLY DRAFT — DO NOT APPLY TO PRODUCTION

begin;

-- Safety check: ensure foundation exists before attempting contract definition
do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'graduation_projects'
  ) then
    raise notice 'INFO: Graduation projects core table not yet applied in environment. Package D draft fixtures remain source-only.';
  end if;
end $$;

--------------------------------------------------------------------------------
-- 1. TEST_ONLY FIXTURE MANIFEST DELETION & SAFEGUARD CONSTANTS
--------------------------------------------------------------------------------
-- Marker: TEST_ONLY_GP_MVP_E2E_01
-- All test actors must have profiles tagged with package_marker = 'TEST_ONLY_GP_MVP_E2E_01'
-- Real staff and production users MUST NEVER have this marker.

--------------------------------------------------------------------------------
-- 2. CLEANUP CONTRACT RPC IMPLEMENTATION (SOURCE DRAFT)
--------------------------------------------------------------------------------
create or replace function public.cleanup_graduation_project_test_artifacts(
  p_package_marker text default 'TEST_ONLY_GP_MVP_E2E_01',
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_projects int := 0;
  v_deleted_files int := 0;
  v_deleted_evaluations int := 0;
  v_deleted_events int := 0;
  v_result jsonb;
begin
  -- Safeguard: Never execute on empty or production markers
  if p_package_marker is null or p_package_marker != 'TEST_ONLY_GP_MVP_E2E_01' then
    raise exception 'SECURITY_VIOLATION: Cleanup allowed only for tag TEST_ONLY_GP_MVP_E2E_01';
  end if;

  if p_dry_run then
    select count(distinct project_id) into v_deleted_projects
    from public.graduation_project_assignments
    where assignment_notes like '%' || p_package_marker || '%';

    return jsonb_build_object(
      'dry_run', true,
      'marker', p_package_marker,
      'candidate_projects', v_deleted_projects
    );
  end if;

  -- 1. Remove temporary/failed artifacts tagged with the package marker
  -- Only projects flagged as temporary test artifacts are deleted; evidence projects are preserved.
  with target_projects as (
    select distinct project_id 
    from public.graduation_project_assignments
    where assignment_notes like '%' || p_package_marker || ':TEMP%'
  )
  delete from public.graduation_project_files
  where project_id in (select project_id from target_projects)
  and scan_state != 'clean';
  get diagnostics v_deleted_files = row_count;

  with target_projects as (
    select distinct project_id 
    from public.graduation_project_assignments
    where assignment_notes like '%' || p_package_marker || ':TEMP%'
  )
  delete from public.graduation_project_evaluations
  where discussion_id in (
    select id from public.graduation_project_discussions where project_id in (select project_id from target_projects)
  )
  and state = 'draft';
  get diagnostics v_deleted_evaluations = row_count;

  v_result := jsonb_build_object(
    'dry_run', false,
    'marker', p_package_marker,
    'deleted_files', v_deleted_files,
    'deleted_draft_evaluations', v_deleted_evaluations,
    'status', 'CLEANUP_SUCCESS'
  );

  return v_result;
end;
$$;

revoke all on function public.cleanup_graduation_project_test_artifacts(text, boolean) from public, anon;
grant execute on function public.cleanup_graduation_project_test_artifacts(text, boolean) to authenticated;

--------------------------------------------------------------------------------
-- 3. FINGERPRINT EXPORT CONTRACT RPC
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
  v_project record;
  v_assignments jsonb;
  v_proposal jsonb;
  v_supervisors jsonb;
  v_progress jsonb;
  v_final jsonb;
  v_defense jsonb;
  v_evaluations jsonb;
  v_result jsonb;
begin
  select * into v_project
  from public.graduation_projects
  where id = p_project_id;

  if not found then
    raise exception 'PROJECT_NOT_FOUND: %', p_project_id;
  end if;

  -- Assignments fingerprint
  select jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'role', role,
    'is_leader', is_leader,
    'active', active
  )) into v_assignments
  from public.graduation_project_assignments
  where project_id = p_project_id;

  -- Proposal fingerprint
  select jsonb_build_object(
    'title', title,
    'problem_statement', problem_statement,
    'objectives', objectives,
    'summary', summary,
    'has_attachment', exists (
      select 1 from public.graduation_project_files
      where project_id = p_project_id and file_category = 'proposal' and is_active = true
    )
  ) into v_proposal
  from public.graduation_projects
  where id = p_project_id;

  -- Defense & Committee fingerprint
  select jsonb_build_object(
    'scheduled_at', scheduled_at,
    'venue', venue,
    'committee_count', (
      select count(*) from public.graduation_project_panel_members pm
      join public.graduation_project_discussions d on d.id = pm.discussion_id
      where d.project_id = p_project_id
    )
  ) into v_defense
  from public.graduation_project_discussions
  where project_id = p_project_id;

  -- Evaluations fingerprint
  select jsonb_agg(jsonb_build_object(
    'panel_member_id', panel_member_id,
    'total_score', total_score,
    'state', state
  )) into v_evaluations
  from public.graduation_project_evaluations e
  join public.graduation_project_discussions d on d.id = e.discussion_id
  where d.project_id = p_project_id;

  v_result := jsonb_build_object(
    'project_id', p_project_id,
    'state', v_project.state,
    'final_decision', v_project.final_decision,
    'assignments', v_assignments,
    'proposal', v_proposal,
    'defense', v_defense,
    'evaluations', v_evaluations
  );

  return v_result;
end;
$$;

revoke all on function public.export_graduation_project_e2e_fingerprint(uuid) from public, anon;
grant execute on function public.export_graduation_project_e2e_fingerprint(uuid) to authenticated;

commit;
