-- GP independent security audit remediation 02 — disposable PG17 verifier (SOURCE ONLY).
-- Mission: PORTAL-GP-INDEPENDENT-SECURITY-AUDIT-FINDINGS-REMEDIATION-02
-- Requires prior apply in-session:
--   postgres-minimal-schema.sql
--   SET U A1/A2/A3 (+ storage insert fix)
--   L4 eligibility guard
--   identity options + revision notes (optional but recommended)
--   20260811020000_gp_independent_security_audit_remediation_02.sql
-- Ends with ROLLBACK.

begin;
select set_config('gp.verify.skip_storage_object_check', 'on', true);

create temporary table pg_temp.gp_ids (k text primary key, v uuid);
create temporary table pg_temp.gp_counters (k text primary key, n int not null default 0);
insert into pg_temp.gp_counters(k, n) values ('pos', 0), ('neg', 0);

create or replace function pg_temp.set_uid(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
end $$;

create or replace function pg_temp.bump(p_key text) returns void language plpgsql as $$
begin
  update pg_temp.gp_counters set n = n + 1 where k = p_key;
end $$;

create or replace function pg_temp.pos() returns void language sql as $$
  select pg_temp.bump('pos')
$$;

create or replace function pg_temp.ver(p_project_id uuid) returns bigint language sql stable as $$
  select version from public.graduation_projects where id = p_project_id
$$;

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

create or replace function pg_temp.fingerprint(p_project_id uuid) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'state', p.lifecycle_state::text,
    'final_decision', p.final_decision::text,
    'version', p.version,
    'evaluation_round', p.evaluation_round,
    'eval_submitted', (
      select count(*) from public.graduation_project_evaluations e
      where e.project_id = p.id and e.state = 'submitted'
    ),
    'events', (select count(*) from public.graduation_project_events e where e.project_id = p.id)
  )
  from public.graduation_projects p where p.id = p_project_id
$$;

create or replace function pg_temp.expect_fail_zs(
  p_project_id uuid, p_sql text, p_frag text
) returns void language plpgsql as $$
declare before jsonb; after jsonb;
begin
  before := pg_temp.fingerprint(p_project_id);
  perform pg_temp.expect_fail(p_sql, p_frag);
  after := pg_temp.fingerprint(p_project_id);
  if before is distinct from after then
    raise exception 'zero-side-effect denial failed for %', p_frag;
  end if;
  perform pg_temp.bump('neg');
end $$;

create or replace function pg_temp.corr(p_base int, p_step int) returns uuid language sql immutable as $$
  select ('d2000000-0000-0000-0000-' || lpad((p_base + p_step)::text, 12, '0'))::uuid
$$;

create or replace function pg_temp.advance_to_evaluating(
  p_project_id uuid,
  p_leader_uid uuid,
  p_coord_uid uuid,
  p_supervisor_uid uuid,
  p_supervisor_faculty uuid,
  p_c1_uid uuid,
  p_c1_faculty uuid,
  p_c2_uid uuid,
  p_c2_faculty uuid,
  p_corr_base int,
  p_c3_uid uuid default null,
  p_c3_faculty uuid default null
) returns void language plpgsql as $$
declare
  v_file uuid;
  v_prog uuid;
begin
  perform pg_temp.set_uid(p_leader_uid);
  perform public.upsert_graduation_project_proposal(
    p_project_id, 'Remediation Proposal', 'Problem', 'Objectives', 'Summary',
    pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 1)
  );
  v_file := (public.create_graduation_project_file_upload_intent(
    p_project_id, 'proposal', 'proposal.pdf', 1024, pg_temp.corr(p_corr_base, 2), repeat('a', 64)
  )->>'file_id')::uuid;
  perform public.finalize_graduation_project_file(v_file, pg_temp.corr(p_corr_base, 3));
  perform pg_temp.set_uid(p_coord_uid);
  perform public.mark_graduation_project_file_scan_state(v_file, 'clean', pg_temp.corr(p_corr_base, 4));
  perform pg_temp.set_uid(p_leader_uid);
  perform public.submit_graduation_project_proposal(
    p_project_id, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 5)
  );
  perform pg_temp.set_uid(p_coord_uid);
  perform public.review_graduation_project_proposal(
    p_project_id, 'accept', null, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 6)
  );
  perform public.assign_graduation_project_supervisor(
    p_project_id, p_supervisor_faculty, p_supervisor_uid, pg_temp.corr(p_corr_base, 7)
  );
  perform pg_temp.set_uid(p_supervisor_uid);
  perform public.respond_graduation_project_supervision(
    p_project_id, 'accept', pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 8)
  );
  perform pg_temp.set_uid(p_leader_uid);
  v_prog := public.submit_graduation_project_progress(
    p_project_id, 'Progress OK', null, pg_temp.corr(p_corr_base, 9)
  );
  perform pg_temp.set_uid(p_supervisor_uid);
  perform public.review_graduation_project_progress(
    v_prog, 'approve', null, pg_temp.corr(p_corr_base, 10)
  );
  perform pg_temp.set_uid(p_leader_uid);
  v_file := (public.create_graduation_project_file_upload_intent(
    p_project_id, 'final', 'final.pdf', 2048, pg_temp.corr(p_corr_base, 11), repeat('b', 64)
  )->>'file_id')::uuid;
  perform public.finalize_graduation_project_file(v_file, pg_temp.corr(p_corr_base, 12));
  perform pg_temp.set_uid(p_coord_uid);
  perform public.mark_graduation_project_file_scan_state(v_file, 'clean', pg_temp.corr(p_corr_base, 13));
  perform pg_temp.set_uid(p_leader_uid);
  perform public.submit_graduation_project_final(
    p_project_id, v_file, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 14)
  );
  perform pg_temp.set_uid(p_supervisor_uid);
  perform public.review_graduation_project_final(
    p_project_id, 'ready', null, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 15)
  );
  perform pg_temp.set_uid(p_coord_uid);
  perform public.schedule_graduation_project_defense(
    p_project_id, now() + interval '2 days', 'Hall R2',
    pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 16)
  );
  perform public.assign_graduation_project_committee_member(
    p_project_id, p_c1_faculty, p_c1_uid, pg_temp.corr(p_corr_base, 17)
  );
  perform public.assign_graduation_project_committee_member(
    p_project_id, p_c2_faculty, p_c2_uid, pg_temp.corr(p_corr_base, 18)
  );
  if p_c3_uid is not null and p_c3_faculty is not null then
    perform public.assign_graduation_project_committee_member(
      p_project_id, p_c3_faculty, p_c3_uid, pg_temp.corr(p_corr_base, 19)
    );
  end if;
  perform public.mark_graduation_project_defense_held(
    p_project_id, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 20)
  );
end $$;

-- Coordinator capability
insert into public.graduation_project_department_coordinators(department_id, faculty_profile_id, user_id, assigned_by)
select
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011'
where not exists (
  select 1 from public.graduation_project_department_coordinators c
  where c.department_id = '20000000-0000-0000-0000-000000000001'
    and c.user_id = '10000000-0000-0000-0000-000000000011'
    and c.active
);

--------------------------------------------------------------------------------
-- M-01: program/department mismatch DENY + ZERO MUTATION
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  before_count int;
  after_count int;
begin
  select count(*) into before_count from public.graduation_projects;
  begin
    perform public.create_graduation_project_team(
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000004',
      '10000000-0000-0000-0000-000000000004',
      '21000000-0000-0000-0000-000000000002', -- program belongs to department B
      '22000000-0000-0000-0000-000000000001',
      '23000000-0000-0000-0000-000000000001',
      'd2000000-0000-0000-0000-000000000001'
    );
    raise exception 'M-01 expected program department mismatch denial';
  exception when others then
    if position('program department mismatch' in sqlerrm) = 0 then
      raise exception 'M-01 expected program department mismatch, got %', sqlerrm;
    end if;
  end;
  select count(*) into after_count from public.graduation_projects;
  if after_count <> before_count then
    raise exception 'M-01 zero mutation failed';
  end if;
  perform pg_temp.bump('neg');
  raise notice 'M01_PROGRAM_DEPARTMENT_NEGATIVE_PASS';
end $$;

--------------------------------------------------------------------------------
-- Create project for H-01 / M-02 / M-03 / H-03 / L-01
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('project_h01', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000010'
));
select pg_temp.pos();

-- Add ordinary member
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.add_graduation_project_team_member(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'd2000000-0000-0000-0000-000000000011'
);
select pg_temp.pos();

--------------------------------------------------------------------------------
-- L-01: ordinary member leader RPC DENY; viewer_is_leader parity
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  format($q$select public.add_graduation_project_team_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    '30000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000003',
    'd2000000-0000-0000-0000-000000000012'),
  'exact direct processing assignment required'
);
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  format($q$select public.upsert_graduation_project_proposal(%L::uuid,'Bad','p','o','s',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
    'd2000000-0000-0000-0000-000000000013'),
  'exact team leader assignment required'
);

do $$
declare
  d_leader jsonb;
  d_member jsonb;
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
  d_leader := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  if coalesce((d_leader->>'viewer_is_leader')::boolean, false) is not true then
    raise exception 'L-01 leader viewer_is_leader expected true';
  end if;

  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
  d_member := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  if coalesce((d_member->>'viewer_is_leader')::boolean, false) is not false then
    raise exception 'L-01 member viewer_is_leader expected false';
  end if;
  -- team still contains a leader row; must not imply viewer is leader
  if not exists (
    select 1 from jsonb_array_elements(d_member->'team') t
    where (t->>'is_leader')::boolean = true
  ) then
    raise exception 'L-01 fixture expected a leader teammate row';
  end if;
  perform pg_temp.pos();
  raise notice 'L01_LEADER_ROLE_UI_BACKEND_PARITY_PASS';
end $$;

--------------------------------------------------------------------------------
-- Advance to evaluating (committee=2)
--------------------------------------------------------------------------------
select pg_temp.advance_to_evaluating(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  '10000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000012',
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000014',
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000015',
  '40000000-0000-0000-0000-000000000015',
  100
);

--------------------------------------------------------------------------------
-- M-02: committee count matrix committee=2, eval=0/1/2 (no join inflation)
--------------------------------------------------------------------------------
do $$
declare
  d jsonb;
  submitted int;
  required int;
  committee int;
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  submitted := coalesce((d->'evaluation_aggregate'->>'submitted_count')::int, -1);
  required := coalesce((d->'evaluation_aggregate'->>'required_count')::int, -1);
  committee := coalesce((d->'defense'->>'committee_count')::int, -1);
  if committee <> 2 or required <> 2 or submitted <> 0 then
    raise exception 'M-02 expected committee=2 required=2 submitted=0 got c=% r=% s=%', committee, required, submitted;
  end if;

  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
  perform public.submit_graduation_project_evaluation(
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    70, 'r1-a', 'd2000000-0000-0000-0000-000000000101'
  );
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  submitted := coalesce((d->'evaluation_aggregate'->>'submitted_count')::int, -1);
  if submitted <> 1 then
    raise exception 'M-02 expected submitted=1 after first eval, got %', submitted;
  end if;

  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
  perform public.submit_graduation_project_evaluation(
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    75, 'r1-b', 'd2000000-0000-0000-0000-000000000102'
  );
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  submitted := coalesce((d->'evaluation_aggregate'->>'submitted_count')::int, -1);
  required := coalesce((d->'evaluation_aggregate'->>'required_count')::int, -1);
  if submitted <> 2 or required <> 2 then
    raise exception 'M-02 expected submitted=2 required=2, got s=% r=%', submitted, required;
  end if;
  perform pg_temp.pos();
  raise notice 'M02_COMMITTEE_COUNT_MATRIX_PASS';
end $$;

--------------------------------------------------------------------------------
-- H-03: identity_options backend scope
--------------------------------------------------------------------------------
do $$
declare
  d jsonb;
  students jsonb;
  supers jsonb;
  committee jsonb;
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  students := coalesce(d->'identity_options'->'students', '[]'::jsonb);
  supers := coalesce(d->'identity_options'->'supervisors', '[]'::jsonb);
  committee := coalesce(d->'identity_options'->'committee', '[]'::jsonb);
  if students is null or supers is null or committee is null then
    raise exception 'H-03 identity_options missing';
  end if;
  -- Active students already on a GP team must be excluded
  if exists (
    select 1 from jsonb_array_elements(students) s
    where (s->>'user_id') in (
      '10000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000002'
    )
  ) then
    raise exception 'H-03 active GP students leaked into identity_options.students';
  end if;
  if jsonb_typeof(supers) <> 'array' or jsonb_typeof(committee) <> 'array' then
    raise exception 'H-03 supervisor/committee options malformed';
  end if;
  perform pg_temp.pos();
  raise notice 'H03_IDENTITY_OPTIONS_SCOPE_PASS';
end $$;

--------------------------------------------------------------------------------
-- H-01: revisions_required stale evaluation reuse DENY
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  'revisions_required',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
  'd2000000-0000-0000-0000-000000000110',
  'Revise chapter 3'
);
select pg_temp.pos();

-- Archive before valid current-round final decision DENY
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  format($q$select public.archive_graduation_project(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
    'd2000000-0000-0000-0000-000000000111'),
  'project not archive-ready'
);

-- OLD_EVALUATIONS_CANNOT_AUTHORIZE_NEW_FINAL_DECISION
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
    'd2000000-0000-0000-0000-000000000112'),
  'all committee evaluations required'
);
do $$ begin
  raise notice 'STALE_EVALUATION_DIRECT_RPC_NEGATIVE_PASS';
end $$;

-- Corrected final + readiness
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v)
select 'final_rev', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  'final', 'final-rev.pdf', 2048,
  'd2000000-0000-0000-0000-000000000120', repeat('c', 64)
)->>'file_id')::uuid;
select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k = 'final_rev'),
  'd2000000-0000-0000-0000-000000000121'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k = 'final_rev'),
  'clean', 'd2000000-0000-0000-0000-000000000122'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.submit_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  (select v from pg_temp.gp_ids where k = 'final_rev'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
  'd2000000-0000-0000-0000-000000000123'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  'ready', null,
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
  'd2000000-0000-0000-0000-000000000124'
);

-- Still DENY without fresh round evaluations
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_h01'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
    'd2000000-0000-0000-0000-000000000125'),
  'all committee evaluations required'
);

-- Fresh round N+1 evaluations → passed → archive
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  88, 'r2-a', 'd2000000-0000-0000-0000-000000000126'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  90, 'r2-b', 'd2000000-0000-0000-0000-000000000127'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  'passed',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
  'd2000000-0000-0000-0000-000000000128'
);
select public.archive_graduation_project(
  (select v from pg_temp.gp_ids where k = 'project_h01'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_h01')),
  'd2000000-0000-0000-0000-000000000129'
);
select pg_temp.pos();

--------------------------------------------------------------------------------
-- M-03: archived detail projection for authorized actor; unauthorized DENY
--------------------------------------------------------------------------------
do $$
declare
  d jsonb;
  arch jsonb;
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
  arch := d->'archive';
  if arch is null or arch = 'null'::jsonb then
    raise exception 'M-03 archive projection missing for authorized actor';
  end if;
  if arch ? 'object_key' or arch ? 'snapshot' then
    raise exception 'M-03 archive leaked private storage/snapshot fields';
  end if;
  if arch->>'final_file_id' is null or arch->>'archived_at' is null then
    raise exception 'M-03 archive missing required safe fields';
  end if;

  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000004');
  begin
    perform public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_h01'));
    raise exception 'M-03 unauthorized detail should deny';
  exception when others then
    if position('exact direct processing assignment required' in sqlerrm) = 0
       and position('graduation project access denied' in sqlerrm) = 0
       and position('fourth' in lower(sqlerrm)) = 0 then
      raise exception 'M-03 unexpected unauthorized error: %', sqlerrm;
    end if;
  end;
  perform pg_temp.bump('neg');
  perform pg_temp.pos();
  raise notice 'ARCHIVE_DETAIL_PASS';
end $$;

--------------------------------------------------------------------------------
-- M-02 extended: committee=3 matrix on a fresh project
--------------------------------------------------------------------------------
insert into auth.users(id) values ('10000000-0000-0000-0000-000000000016') on conflict do nothing;
insert into public.faculty_profiles(id, user_id, department_id, status, full_name_ar)
values (
  '40000000-0000-0000-0000-000000000016',
  '10000000-0000-0000-0000-000000000016',
  '20000000-0000-0000-0000-000000000001',
  'active',
  'Committee Three'
) on conflict do nothing;

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('project_c3', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000200'
));

select pg_temp.advance_to_evaluating(
  (select v from pg_temp.gp_ids where k = 'project_c3'),
  '10000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000012',
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000014',
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000015',
  '40000000-0000-0000-0000-000000000015',
  300,
  '10000000-0000-0000-0000-000000000016',
  '40000000-0000-0000-0000-000000000016'
);

do $$
declare
  d jsonb;
  submitted int;
  required int;
  committee int;
  i int;
  uids uuid[] := array[
    '10000000-0000-0000-0000-000000000014'::uuid,
    '10000000-0000-0000-0000-000000000015'::uuid,
    '10000000-0000-0000-0000-000000000016'::uuid
  ];
begin
  perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_c3'));
  committee := coalesce((d->'defense'->>'committee_count')::int, -1);
  required := coalesce((d->'evaluation_aggregate'->>'required_count')::int, -1);
  submitted := coalesce((d->'evaluation_aggregate'->>'submitted_count')::int, -1);
  if committee <> 3 or required <> 3 or submitted <> 0 then
    raise exception 'M-02 committee=3 baseline failed c=% r=% s=%', committee, required, submitted;
  end if;

  for i in 1..3 loop
    perform pg_temp.set_uid(uids[i]);
    perform public.submit_graduation_project_evaluation(
      (select v from pg_temp.gp_ids where k = 'project_c3'),
      80 + i, 'c3', ('d2000000-0000-0000-0000-0000000002' || lpad(i::text, 2, '0'))::uuid
    );
    perform pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
    d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_c3'));
    submitted := coalesce((d->'evaluation_aggregate'->>'submitted_count')::int, -1);
    required := coalesce((d->'evaluation_aggregate'->>'required_count')::int, -1);
    if submitted <> i or required <> 3 then
      raise exception 'M-02 committee=3 after % evals got s=% r=%', i, submitted, required;
    end if;
  end loop;
  perform pg_temp.pos();
  raise notice 'M02_COMMITTEE3_COUNT_MATRIX_PASS';
end $$;

do $$
declare
  pos int;
  neg int;
begin
  select n into pos from pg_temp.gp_counters where k = 'pos';
  select n into neg from pg_temp.gp_counters where k = 'neg';
  if pos < 3 or neg < 3 then
    raise exception 'remediation verifier counters too low pos=% neg=%', pos, neg;
  end if;
  raise notice 'GP_INDEPENDENT_SECURITY_AUDIT_REMEDIATION_02_VERIFIER_PASS';
end $$;

rollback;
