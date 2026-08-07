-- GP student Level-4-only eligibility guard verifier (SOURCE ONLY).
-- Disposable PG17. Ends with ROLLBACK. No production connection.
-- Requires: postgres-minimal-schema + A1 + A2 + A3 + L4 eligibility draft.

begin;
select set_config('gp.verify.skip_storage_object_check', 'on', true);

create temporary table pg_temp.gp_l4_ids (
  k text primary key,
  v uuid
);

create or replace function pg_temp.set_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

create or replace function pg_temp.expect_fail(p_sql text, p_frag text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_frag in sqlerrm) = 0 then
      raise exception 'expected failure containing %, got %', p_frag, sqlerrm;
    end if;
    return;
  end;
  raise exception 'expected failure containing % but statement succeeded', p_frag;
end $$;

create or replace function pg_temp.count_projects() returns bigint language sql as $$
  select count(*) from public.graduation_projects
$$;

create or replace function pg_temp.count_assignments() returns bigint language sql as $$
  select count(*) from public.graduation_project_assignments
$$;

create or replace function pg_temp.count_events() returns bigint language sql as $$
  select count(*) from public.graduation_project_events
$$;

-- Predicate unit checks
do $$ begin
  if not public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000001') then
    raise exception 'LEVEL4_POSITIVE_PREDICATE_FAILED';
  end if;
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000011') then
    raise exception 'LEVEL1_NEGATIVE_PREDICATE_FAILED';
  end if;
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000012') then
    raise exception 'LEVEL2_NEGATIVE_PREDICATE_FAILED';
  end if;
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000013') then
    raise exception 'LEVEL3_NEGATIVE_PREDICATE_FAILED';
  end if;
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000014') then
    raise exception 'UNKNOWN_LEVEL_NEGATIVE_PREDICATE_FAILED';
  end if;
  if public.student_is_current_fourth_academic_level(null) then
    raise exception 'NULL_PROFILE_NEGATIVE_PREDICATE_FAILED';
  end if;
end $$;

-- Seed coordinator
insert into public.graduation_project_department_coordinators(department_id, faculty_profile_id, user_id, assigned_by)
values (
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011'
);

-- LEVEL1/2/3/UNKNOWN leader create = DENY + zero side effects
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  before_p bigint := pg_temp.count_projects();
  before_a bigint := pg_temp.count_assignments();
  before_e bigint := pg_temp.count_events();
begin
  perform pg_temp.expect_fail(
    $q$select public.create_graduation_project_team(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000011',
      '10000000-0000-0000-0000-000000000021',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000011')$q$,
    'fourth-level student eligibility required'
  );
  perform pg_temp.expect_fail(
    $q$select public.create_graduation_project_team(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000012',
      '10000000-0000-0000-0000-000000000022',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000012')$q$,
    'fourth-level student eligibility required'
  );
  perform pg_temp.expect_fail(
    $q$select public.create_graduation_project_team(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000013',
      '10000000-0000-0000-0000-000000000023',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000013')$q$,
    'fourth-level student eligibility required'
  );
  perform pg_temp.expect_fail(
    $q$select public.create_graduation_project_team(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000014',
      '10000000-0000-0000-0000-000000000024',
      '21000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      'b1000000-0000-0000-0000-000000000014')$q$,
    'fourth-level student eligibility required'
  );
  if pg_temp.count_projects() <> before_p
     or pg_temp.count_assignments() <> before_a
     or pg_temp.count_events() <> before_e then
    raise exception 'ZERO_SIDE_EFFECT_DENIAL_CREATE_FAILED';
  end if;
end $$;

-- LEVEL4_POSITIVE: L4 leader creates team
insert into pg_temp.gp_l4_ids(k,v) values ('project', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000001'
));

-- L4 leader + L4 member = allow
select public.add_graduation_project_team_member(
  (select v from pg_temp.gp_l4_ids where k='project'),
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'b1000000-0000-0000-0000-000000000002'
);

-- L4 leader + L3 member = DENY + zero side effects
do $$
declare
  before_a bigint := pg_temp.count_assignments();
  before_e bigint := pg_temp.count_events();
  pid uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='project');
begin
  perform pg_temp.expect_fail(
    format(
      $q$select public.add_graduation_project_team_member(%L::uuid, '30000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000023', 'b1000000-0000-0000-0000-000000000003')$q$,
      pid
    ),
    'fourth-level student eligibility required'
  );
  if pg_temp.count_assignments() <> before_a or pg_temp.count_events() <> before_e then
    raise exception 'ZERO_SIDE_EFFECT_DENIAL_ADD_MEMBER_FAILED';
  end if;
end $$;

-- L4 student list/detail positive
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
do $$
declare
  payload jsonb;
  pid uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='project');
begin
  payload := public.list_my_graduation_projects();
  if jsonb_array_length(payload) < 1 then raise exception 'LEVEL4_POSITIVE_LIST_FAILED'; end if;
  payload := public.get_graduation_project_detail(pid);
  if payload->>'project_id' is distinct from pid::text then raise exception 'LEVEL4_POSITIVE_DETAIL_FAILED'; end if;
end $$;

-- Proposal upsert positive (leader write RPC)
select public.upsert_graduation_project_proposal(
  (select v from pg_temp.gp_l4_ids where k='project'),
  'عنوان مشروع تجريبي للمستوى الرابع',
  'مشكلة',
  'أهداف',
  'ملخص',
  1,
  'b1000000-0000-0000-0000-000000000010'
);

-- Unrelated L4 student cannot read project
select pg_temp.set_uid('10000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail(
  format(
    $q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_l4_ids where k='project')
  ),
  'exact direct processing assignment required'
);

-- Lower-level students denied on list/detail even if forged client claims L4 (backend ignores client level)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000021');
select pg_temp.expect_fail($q$select public.list_my_graduation_projects()$q$, 'fourth-level student eligibility required');
select pg_temp.set_uid('10000000-0000-0000-0000-000000000022');
select pg_temp.expect_fail($q$select public.list_my_graduation_projects()$q$, 'fourth-level student eligibility required');
select pg_temp.set_uid('10000000-0000-0000-0000-000000000023');
select pg_temp.expect_fail($q$select public.list_my_graduation_projects()$q$, 'fourth-level student eligibility required');
select pg_temp.set_uid('10000000-0000-0000-0000-000000000024');
select pg_temp.expect_fail($q$select public.list_my_graduation_projects()$q$, 'fourth-level student eligibility required');

-- File upload intent denied for non-leader / lower-level (no assignment + eligibility)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000023');
select pg_temp.expect_fail(
  format(
    $q$select public.create_graduation_project_file_upload_intent(%L::uuid, 'proposal', 'x.pdf', 1024, 'b1000000-0000-0000-0000-000000000020')$q$,
    (select v from pg_temp.gp_l4_ids where k='project')
  ),
  'exact team leader assignment required'
);

-- Historical assignment while no longer L4: keep evidence, deny student-facing access
-- Simulate by inserting an active student assignment for L3 on a separate archived-like project path:
-- Use a second L4 team then demote leader status for a synthetic historical member.
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_l4_ids(k,v) values ('project_hist', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000030'
));

-- Privileged verifier seed: attach L3 as historical student member bypassing RPC (simulates pre-guard data)
insert into public.graduation_project_assignments(
  project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by
) values (
  (select v from pg_temp.gp_l4_ids where k='project_hist'),
  'student',
  '30000000-0000-0000-0000-000000000013',
  '10000000-0000-0000-0000-000000000023',
  '20000000-0000-0000-0000-000000000001',
  false,
  '10000000-0000-0000-0000-000000000011'
);

-- Mark project archived via direct update to prove student route still denied without mutating evidence incorrectly
update public.graduation_projects
set lifecycle_state = 'archived', archived_at = now(), final_decision = 'passed'
where id = (select v from pg_temp.gp_l4_ids where k='project_hist');

select pg_temp.set_uid('10000000-0000-0000-0000-000000000023');
select pg_temp.expect_fail($q$select public.list_my_graduation_projects()$q$, 'fourth-level student eligibility required');
select pg_temp.expect_fail(
  format(
    $q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_l4_ids where k='project_hist')
  ),
  'fourth-level student eligibility required'
);

-- Evidence retained
do $$ begin
  if not exists (
    select 1 from public.graduation_project_assignments
    where project_id = (select v from pg_temp.gp_l4_ids where k='project_hist')
      and student_profile_id = '30000000-0000-0000-0000-000000000013'
      and active
  ) then
    raise exception 'HISTORICAL_EVIDENCE_DESTROYED';
  end if;
  if not exists (
    select 1 from public.graduation_projects
    where id = (select v from pg_temp.gp_l4_ids where k='project_hist')
      and lifecycle_state = 'archived'
  ) then
    raise exception 'ARCHIVED_IMMUTABILITY_CHANGED';
  end if;
end $$;

-- Coordinator behavior unchanged: can still detail archived project
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  payload jsonb;
  pid uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='project_hist');
begin
  payload := public.get_graduation_project_detail(pid);
  if payload->>'lifecycle_state' is distinct from 'archived' then
    raise exception 'STAFF_BEHAVIOR_CHANGED_DETAIL';
  end if;
end $$;

-- Admin-like unauthorized faculty still denied (no new bypass)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail(
  format(
    $q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_l4_ids where k='project')
  ),
  'exact direct processing assignment required'
);
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);

-- Storage path-only: non-L4 cannot upload merely by knowing object path (policy predicate stays assignment-bound)
do $$
declare
  allowed boolean;
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000023');
  select public.can_upload_graduation_project_object(
    'graduation-projects/' || (select v from pg_temp.gp_l4_ids where k='project')::text || '/proposal/forged.pdf'
  ) into allowed;
  if coalesce(allowed, true) then
    raise exception 'STORAGE_PATH_ONLY_BYPASS';
  end if;
end $$;

do $$ begin
  raise notice 'GP_STUDENT_LEVEL4_ONLY_ELIGIBILITY_GUARD_VERIFIER_PASS';
end $$;

rollback;
