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

-- Ambiguity / uniqueness: tied L4/L4, tied L4/L3, null level, orphan level
do $$
declare
  ts timestamptz := timestamptz '2026-08-01 12:00:00+00';
begin
  delete from public.student_academic_status
  where student_profile_id = '30000000-0000-0000-0000-000000000004';

  -- Duplicate L4/L4 top rows (identical updated_at/created_at) must deny
  insert into public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) values
    ('51000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled', ts, ts),
    ('51000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled', ts, ts);
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'DUPLICATE_L4_L4_TOP_ROWS_DENY_FAILED';
  end if;
  delete from public.student_academic_status
  where id in ('51000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002');

  -- Conflicting L4/L3 top rows with identical timestamps must deny
  insert into public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) values
    ('51000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled', ts, ts),
    ('51000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','enrolled', ts, ts);
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'CONFLICTING_L4_L3_TOP_ROWS_DENY_FAILED';
  end if;
  delete from public.student_academic_status
  where id in ('51000000-0000-0000-0000-000000000003','51000000-0000-0000-0000-000000000004');

  -- created_at vs updated_at order conflict: newer updated_at wins even if older created_at
  insert into public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) values
    ('51000000-0000-0000-0000-000000000005','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000003','enrolled',
      timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-08-02 12:00:00+00'),
    ('51000000-0000-0000-0000-000000000006','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled',
      timestamptz '2026-08-01 12:00:00+00', timestamptz '2026-08-03 12:00:00+00');
  if not public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'CREATED_UPDATED_ORDER_CONFLICT_L4_POSITIVE_FAILED';
  end if;
  -- Flip: newer updated_at is L3 → deny
  update public.student_academic_status
    set level_id = '50000000-0000-0000-0000-000000000003'
    where id = '51000000-0000-0000-0000-000000000006';
  update public.student_academic_status
    set level_id = '50000000-0000-0000-0000-000000000004'
    where id = '51000000-0000-0000-0000-000000000005';
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'CREATED_UPDATED_ORDER_CONFLICT_DENY_FAILED';
  end if;
  delete from public.student_academic_status
  where id in ('51000000-0000-0000-0000-000000000005','51000000-0000-0000-0000-000000000006');

  -- Null level_id deny
  insert into public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) values
    ('51000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001', null,'enrolled', ts, ts);
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'NULL_LEVEL_DENY_FAILED';
  end if;
  delete from public.student_academic_status where id = '51000000-0000-0000-0000-000000000007';

  -- Orphan academic level deny (temporarily relax FK for the disposable probe)
  alter table public.student_academic_status drop constraint if exists student_academic_status_level_id_fkey;
  insert into public.student_academic_status(
    id, student_profile_id, academic_year_id, semester_id, level_id, enrollment_status, created_at, updated_at
  ) values
    ('51000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000009999','enrolled', ts, ts);
  if public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'ORPHAN_LEVEL_DENY_FAILED';
  end if;
  delete from public.student_academic_status where id = '51000000-0000-0000-0000-000000000008';
  alter table public.student_academic_status
    add constraint student_academic_status_level_id_fkey
    foreign key (level_id) references public.academic_levels(id);

  -- Restore unique L4 for student 004
  insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
  values ('30000000-0000-0000-0000-000000000004','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled');
  if not public.student_is_current_fourth_academic_level('30000000-0000-0000-0000-000000000004') then
    raise exception 'AMBIGUOUS_STATUS_RESTORE_L4_FAILED';
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

-- =============================================================================
-- Dual-role cross-project isolation
-- L3 student on project A + coordinator on project B:
--   staff B must never unlock student A
-- =============================================================================
-- End historical active student assignment for L3 so they can be reattached on project A
update public.graduation_project_assignments
set active = false, ended_at = now()
where user_id = '10000000-0000-0000-0000-000000000023'
  and role = 'student'
  and active;

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_l4_ids(k,v) values ('project_b', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000004',
  '10000000-0000-0000-0000-000000000004',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'b1000000-0000-0000-0000-000000000040'
));

-- Dual-role actor: L3 student user also holds faculty+coordinator on project B
insert into public.faculty_profiles(id, user_id, department_id) values
  ('40000000-0000-0000-0000-000000000023','10000000-0000-0000-0000-000000000023','20000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.graduation_project_assignments(
  project_id, role, faculty_profile_id, user_id, department_id, assigned_by
) values (
  (select v from pg_temp.gp_l4_ids where k='project_b'),
  'coordinator',
  '40000000-0000-0000-0000-000000000023',
  '10000000-0000-0000-0000-000000000023',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011'
);

-- Attach same L3 user as historical student on project A (project)
insert into public.graduation_project_assignments(
  project_id, role, student_profile_id, user_id, department_id, is_leader, assigned_by
) values (
  (select v from pg_temp.gp_l4_ids where k='project'),
  'student',
  '30000000-0000-0000-0000-000000000013',
  '10000000-0000-0000-0000-000000000023',
  '20000000-0000-0000-0000-000000000001',
  false,
  '10000000-0000-0000-0000-000000000011'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000023');
do $$
declare
  payload jsonb;
  pid_a uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='project');
  pid_b uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='project_b');
  found_a boolean := false;
  found_b boolean := false;
  elem jsonb;
begin
  -- Detail on student project A must deny (L3)
  perform pg_temp.expect_fail(
    format($q$select public.get_graduation_project_detail(%L::uuid)$q$, pid_a),
    'fourth-level student eligibility required'
  );
  -- Detail on staff project B must allow
  payload := public.get_graduation_project_detail(pid_b);
  if payload->>'project_id' is distinct from pid_b::text then
    raise exception 'DUAL_ROLE_STAFF_PROJECT_B_DETAIL_FAILED';
  end if;
  -- List must include B and exclude A
  payload := public.list_my_graduation_projects();
  for elem in select * from jsonb_array_elements(payload)
  loop
    if elem->>'project_id' = pid_a::text then found_a := true; end if;
    if elem->>'project_id' = pid_b::text then found_b := true; end if;
  end loop;
  if found_a then raise exception 'DUAL_ROLE_CROSS_PROJECT_LEAK_A_IN_LIST'; end if;
  if not found_b then raise exception 'DUAL_ROLE_STAFF_PROJECT_B_LIST_FAILED'; end if;
end $$;

-- =============================================================================
-- Signed download: auth before replay; actor-bound correlation
-- =============================================================================
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
-- Seed a clean current proposal file owned by leader assignment
insert into pg_temp.gp_l4_ids(k,v)
select 'leader_asg', a.id
from public.graduation_project_assignments a
where a.project_id = (select v from pg_temp.gp_l4_ids where k='project')
  and a.user_id = '10000000-0000-0000-0000-000000000001'
  and a.role = 'student' and a.is_leader and a.active
limit 1;

insert into public.graduation_project_files(
  id, project_id, category, object_key, original_name, byte_size, media_type,
  uploaded_by_assignment_id, upload_status, scan_state, is_current
) values (
  '70000000-0000-0000-0000-000000000001',
  (select v from pg_temp.gp_l4_ids where k='project'),
  'proposal',
  'graduation-projects/' || (select v from pg_temp.gp_l4_ids where k='project')::text || '/proposal/l4.pdf',
  'l4.pdf',
  1024,
  'application/pdf',
  (select v from pg_temp.gp_l4_ids where k='leader_asg'),
  'active',
  'clean',
  true
);

insert into pg_temp.gp_l4_ids(k,v) values ('file_dl', '70000000-0000-0000-0000-000000000001');

-- Positive L4 download + replay
do $$
declare
  payload jsonb;
  payload2 jsonb;
  fid uuid := (select i.v from pg_temp.gp_l4_ids i where i.k='file_dl');
begin
  payload := public.create_graduation_project_signed_download(fid, 'b1000000-0000-0000-0000-000000000050');
  if payload->>'storage_bucket' is distinct from 'graduation-projects' then
    raise exception 'SIGNED_DOWNLOAD_L4_POSITIVE_FAILED';
  end if;
  payload2 := public.create_graduation_project_signed_download(fid, 'b1000000-0000-0000-0000-000000000050');
  if payload2 is distinct from payload then
    raise exception 'SIGNED_DOWNLOAD_L4_REPLAY_POSITIVE_FAILED';
  end if;
end $$;

-- Cross-user correlation replay negative
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail(
  format(
    $q$select public.create_graduation_project_signed_download(%L::uuid, 'b1000000-0000-0000-0000-000000000050')$q$,
    (select v from pg_temp.gp_l4_ids where k='file_dl')
  ),
  'idempotent replay actor mismatch'
);

-- Demotion replay negative
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
update public.student_academic_status
set level_id = '50000000-0000-0000-0000-000000000003', updated_at = now()
where student_profile_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.expect_fail(
  format(
    $q$select public.create_graduation_project_signed_download(%L::uuid, 'b1000000-0000-0000-0000-000000000050')$q$,
    (select v from pg_temp.gp_l4_ids where k='file_dl')
  ),
  'fourth-level student eligibility required'
);
-- Restore L4
update public.student_academic_status
set level_id = '50000000-0000-0000-0000-000000000004', updated_at = now()
where student_profile_id = '30000000-0000-0000-0000-000000000001';

-- Ended-assignment replay negative
update public.graduation_project_assignments
set active = false, ended_at = now()
where id = (select v from pg_temp.gp_l4_ids where k='leader_asg');
select pg_temp.expect_fail(
  format(
    $q$select public.create_graduation_project_signed_download(%L::uuid, 'b1000000-0000-0000-0000-000000000050')$q$,
    (select v from pg_temp.gp_l4_ids where k='file_dl')
  ),
  'exact project assignment required'
);
-- Restore assignment
update public.graduation_project_assignments
set active = true, ended_at = null
where id = (select v from pg_temp.gp_l4_ids where k='leader_asg');

-- Unknown-level replay negative
delete from public.student_academic_status
where student_profile_id = '30000000-0000-0000-0000-000000000001';
select pg_temp.expect_fail(
  format(
    $q$select public.create_graduation_project_signed_download(%L::uuid, 'b1000000-0000-0000-0000-000000000050')$q$,
    (select v from pg_temp.gp_l4_ids where k='file_dl')
  ),
  'fourth-level student eligibility required'
);
insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
values ('30000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled');

-- =============================================================================
-- Storage INSERT L4 recheck (intent then demotion / missing / ended / staff)
-- =============================================================================
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
do $$
declare
  intent jsonb;
  key text;
  allowed boolean;
  fid uuid;
begin
  intent := public.create_graduation_project_file_upload_intent(
    (select v from pg_temp.gp_l4_ids where k='project'),
    'proposal',
    'pending-l4.pdf',
    2048,
    'b1000000-0000-0000-0000-000000000060'
  );
  key := intent->>'storage_object_path';
  if key is null or key = '' then
    key := intent->>'object_key';
  end if;
  if key is null then
    select f.object_key into key
    from public.graduation_project_files f
    where f.project_id = (select v from pg_temp.gp_l4_ids where k='project')
      and f.upload_status = 'pending'
    order by f.created_at desc limit 1;
  end if;
  insert into pg_temp.gp_l4_ids(k,v)
  select 'pending_file', f.id
  from public.graduation_project_files f
  where f.object_key = key
  limit 1;

  -- Current L4 positive
  select public.can_upload_graduation_project_object(key) into allowed;
  if not coalesce(allowed, false) then
    raise exception 'STORAGE_INSERT_L4_POSITIVE_FAILED';
  end if;

  -- Demotion deny
  update public.student_academic_status
  set level_id = '50000000-0000-0000-0000-000000000001', updated_at = now()
  where student_profile_id = '30000000-0000-0000-0000-000000000001';
  select public.can_upload_graduation_project_object(key) into allowed;
  if coalesce(allowed, true) then
    raise exception 'STORAGE_INSERT_DEMOTION_DENY_FAILED';
  end if;

  -- Missing status deny
  delete from public.student_academic_status
  where student_profile_id = '30000000-0000-0000-0000-000000000001';
  select public.can_upload_graduation_project_object(key) into allowed;
  if coalesce(allowed, true) then
    raise exception 'STORAGE_INSERT_MISSING_STATUS_DENY_FAILED';
  end if;
  insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
  values ('30000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','23000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000004','enrolled');

  -- Ended assignment deny
  update public.graduation_project_assignments
  set active = false, ended_at = now()
  where id = (select v from pg_temp.gp_l4_ids where k='leader_asg');
  select public.can_upload_graduation_project_object(key) into allowed;
  if coalesce(allowed, true) then
    raise exception 'STORAGE_INSERT_ENDED_ASSIGNMENT_DENY_FAILED';
  end if;
  update public.graduation_project_assignments
  set active = true, ended_at = null
  where id = (select v from pg_temp.gp_l4_ids where k='leader_asg');

  -- Forged path deny
  select public.can_upload_graduation_project_object(
    'graduation-projects/' || (select v from pg_temp.gp_l4_ids where k='project')::text || '/proposal/forged-no-row.pdf'
  ) into allowed;
  if coalesce(allowed, true) then
    raise exception 'STORAGE_INSERT_FORGED_PATH_DENY_FAILED';
  end if;
end $$;

-- Authorized staff positive: coordinator-uploaded pending file remains uploadable without L4 gate
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  coord_asg uuid;
  key text := 'graduation-projects/' || (select v from pg_temp.gp_l4_ids where k='project_b')::text || '/proposal/staff.pdf';
  allowed boolean;
begin
  select a.id into coord_asg
  from public.graduation_project_assignments a
  where a.project_id = (select v from pg_temp.gp_l4_ids where k='project_b')
    and a.user_id = '10000000-0000-0000-0000-000000000011'
    and a.role = 'coordinator' and a.active
  limit 1;
  insert into public.graduation_project_files(
    project_id, category, object_key, original_name, byte_size, media_type,
    uploaded_by_assignment_id, upload_status, scan_state, is_current
  ) values (
    (select v from pg_temp.gp_l4_ids where k='project_b'),
    'proposal', key, 'staff.pdf', 1024, 'application/pdf',
    coord_asg, 'pending', 'pending', false
  );
  select public.can_upload_graduation_project_object(key) into allowed;
  if not coalesce(allowed, false) then
    raise exception 'STORAGE_INSERT_STAFF_POSITIVE_FAILED';
  end if;
end $$;

-- Supervisor / committee unchanged: unauthorized without assignment still denied
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select pg_temp.expect_fail(
  format(
    $q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_l4_ids where k='project')
  ),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
select pg_temp.expect_fail(
  format(
    $q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_l4_ids where k='project')
  ),
  'exact direct processing assignment required'
);

do $$ begin
  raise notice 'GP_STUDENT_LEVEL4_ONLY_ELIGIBILITY_GUARD_VERIFIER_PASS';
end $$;

rollback;
