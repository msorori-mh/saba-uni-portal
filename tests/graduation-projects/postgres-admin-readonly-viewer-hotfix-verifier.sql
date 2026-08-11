-- PORTAL-GP-ADMIN-READONLY-VIEWER-PRODUCTION-HOTFIX-01
-- Disposable PG17 before/after verifier. Ends with ROLLBACK. No production use.
--
-- Assumes already applied in this database:
--   postgres-minimal-schema.sql
--   A1 foundation + A2 storage + A3 lifecycle (production migrations)
--   authz stub: app_role / user_roles / has_any_role (see harness)
--   NEW migration 20260811041600_de9e9a8e-741e-4415-9741-fd8a2e53d22d.sql
--
-- BEFORE proof is executed by the harness before applying the hotfix migration.

begin;

create temporary table pg_temp.gp_hotfix_ids (
  k text primary key,
  v uuid
);

create or replace function pg_temp.set_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

create or replace function pg_temp.expect_fail(p_sql text, p_frag text) returns void language plpgsql as $$
declare
  ok boolean := false;
  err text;
begin
  begin
    execute p_sql;
    ok := true;
  exception when others then
    err := sqlerrm;
    if position(lower(p_frag) in lower(err)) = 0 then
      raise exception 'expected fragment % in %, got %', p_frag, p_sql, err;
    end if;
    return;
  end;
  if ok then
    raise exception 'expected failure for %', p_sql;
  end if;
end $$;

-- Synthetic administration viewer (no GP coordinator row)
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000080')
on conflict do nothing;
insert into public.user_roles(user_id, role)
values ('10000000-0000-0000-0000-000000000080', 'admin'::public.app_role)
on conflict do nothing;

insert into auth.users(id) values ('10000000-0000-0000-0000-000000000081')
on conflict do nothing;
insert into public.user_roles(user_id, role)
values ('10000000-0000-0000-0000-000000000081', 'system_admin'::public.app_role)
on conflict do nothing;

insert into auth.users(id) values ('10000000-0000-0000-0000-000000000082')
on conflict do nothing;
insert into public.user_roles(user_id, role)
values ('10000000-0000-0000-0000-000000000082', 'dean'::public.app_role)
on conflict do nothing;

insert into auth.users(id) values ('10000000-0000-0000-0000-000000000084')
on conflict do nothing;
insert into public.user_roles(user_id, role)
values ('10000000-0000-0000-0000-000000000084', 'registrar'::public.app_role)
on conflict do nothing;

-- Faculty-only identity without viewer role (must DENY overview)
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000083')
on conflict do nothing;

-- Seed one overview project (no mutation authority granted by this insert)
insert into public.graduation_projects(
  id, department_id, program_id, academic_year_id, semester_id, title, lifecycle_state
) values (
  '51000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'HOTFIX overview project',
  'draft'
) on conflict (id) do nothing;

insert into pg_temp.gp_hotfix_ids(k, v)
values ('project', '51000000-0000-0000-0000-000000000001')
on conflict (k) do update set v = excluded.v;

--------------------------------------------------------------------------------
-- POST: approved admin viewers can read overview without coordinator assignment
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000080');
do $$
declare
  o jsonb;
  n int;
begin
  if exists (
    select 1 from public.graduation_project_department_coordinators c
    where c.user_id = '10000000-0000-0000-0000-000000000080' and c.active
  ) then
    raise exception 'admin viewer unexpectedly has coordinator assignment';
  end if;

  o := public.list_administration_graduation_projects_overview();
  if o is null or jsonb_typeof(o) <> 'array' then
    raise exception 'admin overview did not return array';
  end if;
  n := jsonb_array_length(o);
  if n < 1 then
    raise exception 'admin overview returned empty array';
  end if;
  if o->0 ? 'problem_statement' or o->0 ? 'objectives' or o->0 ? 'summary' then
    raise exception 'ADMIN_OVERVIEW_PII_EXPANSION detected';
  end if;
  if not (o->0 ? 'project_id' and o->0 ? 'lifecycle_state') then
    raise exception 'overview missing required fields';
  end if;
  raise notice 'PG17_AFTER_ADMIN_OVERVIEW_PASS rows=%', n;
end $$;

select pg_temp.set_uid('10000000-0000-0000-0000-000000000081');
do $$
declare o jsonb;
begin
  o := public.list_administration_graduation_projects_overview();
  if jsonb_typeof(o) <> 'array' then raise exception 'system_admin overview failed'; end if;
end $$;

select pg_temp.set_uid('10000000-0000-0000-0000-000000000082');
do $$
declare o jsonb;
begin
  o := public.list_administration_graduation_projects_overview();
  if jsonb_typeof(o) <> 'array' then raise exception 'dean overview failed'; end if;
end $$;

select pg_temp.set_uid('10000000-0000-0000-0000-000000000084');
do $$
declare o jsonb;
begin
  o := public.list_administration_graduation_projects_overview();
  if jsonb_typeof(o) <> 'array' then raise exception 'registrar overview failed'; end if;
end $$;

--------------------------------------------------------------------------------
-- POST: coordinator still allowed (department-scoped)
--------------------------------------------------------------------------------
-- Ensure coordinator fixture from minimal schema can hold dept coordinator row.
insert into public.graduation_project_department_coordinators(
  department_id, faculty_profile_id, user_id, active, assigned_by
)
select
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  true,
  '10000000-0000-0000-0000-000000000011'
where not exists (
  select 1
  from public.graduation_project_department_coordinators c
  where c.user_id = '10000000-0000-0000-0000-000000000011'
    and c.department_id = '20000000-0000-0000-0000-000000000001'
    and c.active
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare o jsonb;
begin
  o := public.list_administration_graduation_projects_overview();
  if jsonb_typeof(o) <> 'array' then raise exception 'coordinator overview failed'; end if;
  raise notice 'PG17_AFTER_COORDINATOR_OVERVIEW_PASS';
end $$;

--------------------------------------------------------------------------------
-- POST negatives: unauthorized identities DENY overview
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001'); -- student/leader
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000083'); -- faculty without role
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000012'); -- supervisor-only
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000014'); -- committee-only
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);

-- anonymous
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'graduation project access denied'
);

--------------------------------------------------------------------------------
-- POST: admin viewer cannot mutate via coordinator/team RPCs (DENY + ZERO MUTATION)
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000080');

do $$
declare
  pid uuid := (select v from pg_temp.gp_hotfix_ids where k = 'project');
  before_state text;
  before_version bigint;
  before_team int;
  after_state text;
  after_version bigint;
  after_team int;
begin
  select lifecycle_state::text, version
  into before_state, before_version
  from public.graduation_projects
  where id = pid;

  select count(*)::int into before_team
  from public.graduation_project_assignments
  where project_id = pid and ended_at is null;

  begin
    perform public.review_graduation_project_proposal(pid, 'accept', null, 1, 'd1000000-0000-0000-0000-00000000a001');
    raise exception 'ADMIN_VIEWER unexpectedly reviewed proposal';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'review denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.assign_graduation_project_supervisor(
      pid,
      '40000000-0000-0000-0000-000000000012',
      '10000000-0000-0000-0000-000000000012',
      'd1000000-0000-0000-0000-00000000a002'
    );
    raise exception 'ADMIN_VIEWER unexpectedly assigned supervisor';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'assign supervisor denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.schedule_graduation_project_defense(
      pid, now() + interval '1 day', 'hall', 1, 'd1000000-0000-0000-0000-00000000a003'
    );
    raise exception 'ADMIN_VIEWER unexpectedly scheduled defense';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'schedule denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.assign_graduation_project_committee_member(
      pid,
      '40000000-0000-0000-0000-000000000014',
      '10000000-0000-0000-0000-000000000014',
      'd1000000-0000-0000-0000-00000000a004'
    );
    raise exception 'ADMIN_VIEWER unexpectedly assigned committee';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'committee denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.mark_graduation_project_defense_held(pid, 1, 'd1000000-0000-0000-0000-00000000a007');
    raise exception 'ADMIN_VIEWER unexpectedly marked defense held';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'mark held denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.conclude_graduation_project_result(pid, 'failed', 1, 'd1000000-0000-0000-0000-00000000a005');
    raise exception 'ADMIN_VIEWER unexpectedly concluded result';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'conclude denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.archive_graduation_project(pid, 1, 'd1000000-0000-0000-0000-00000000a006');
    raise exception 'ADMIN_VIEWER unexpectedly archived project';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0 then
      raise exception 'archive denial unexpected: %', sqlerrm;
    end if;
  end;

  begin
    perform public.add_graduation_project_team_member(
      pid,
      '30000000-0000-0000-0000-000000000002',
      '10000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-00000000a008'
    );
    raise exception 'ADMIN_VIEWER unexpectedly mutated team';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0
       and position('leader assignment required' in sqlerrm) = 0
       and position('project creation assignment required' in sqlerrm) = 0
       and position('member mutation denied' in sqlerrm) = 0
    then
      raise exception 'team mutate denial unexpected: %', sqlerrm;
    end if;
  end;

  select lifecycle_state::text, version
  into after_state, after_version
  from public.graduation_projects
  where id = pid;

  select count(*)::int into after_team
  from public.graduation_project_assignments
  where project_id = pid and ended_at is null;

  if after_state is distinct from before_state
     or after_version is distinct from before_version
     or after_team is distinct from before_team
  then
    raise exception 'ZERO_MUTATION failed state=%->% version=%->% team=%->%',
      before_state, after_state, before_version, after_version, before_team, after_team;
  end if;

  raise notice 'ADMIN_VIEWER_OPERATIONAL_MUTATIONS=DENY_ZERO_MUTATION';
end $$;

-- Prove require_graduation_project_assignment source unchanged (still coordinator-gated)
do $$
declare
  src text;
begin
  select pg_get_functiondef('public.require_graduation_project_assignment(uuid,public.graduation_project_assignment_role[])'::regprocedure)
  into src;
  if src is null or position('exact direct processing assignment required' in src) = 0 then
    raise exception 'DIRECT_ASSIGNMENT_GUARDS changed unexpectedly';
  end if;
  raise notice 'DIRECT_ASSIGNMENT_GUARDS=UNCHANGED';
end $$;

do $$ begin
  raise notice 'GP_ADMIN_READONLY_VIEWER_HOTFIX_VERIFIER_PASS';
  raise notice 'ADMIN_VIEWER_CAN_REVIEW_PROPOSAL=NO';
  raise notice 'ADMIN_VIEWER_CAN_ASSIGN_SUPERVISOR=NO';
  raise notice 'ADMIN_VIEWER_CAN_SCHEDULE_DEFENSE=NO';
  raise notice 'ADMIN_VIEWER_CAN_ASSIGN_COMMITTEE=NO';
  raise notice 'ADMIN_VIEWER_CAN_MARK_DEFENSE_HELD=NO';
  raise notice 'ADMIN_VIEWER_CAN_CONCLUDE_RESULT=NO';
  raise notice 'ADMIN_VIEWER_CAN_ARCHIVE=NO';
  raise notice 'ADMIN_VIEWER_CAN_MUTATE_TEAM=NO';
  raise notice 'ADMIN_OVERVIEW_PII_EXPANSION=NO';
end $$;

rollback;
