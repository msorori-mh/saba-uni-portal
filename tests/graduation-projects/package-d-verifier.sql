-- Package D disposable PostgreSQL 17 executable security verifier (SOURCE ONLY).
-- Mission: PORTAL_GRADUATION_PROJECTS_MVP_PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_FIX_01
-- Authority: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md
-- MARKER: TEST_ONLY_GP_MVP_E2E_01
--
-- Requires already applied in the same DB session:
--   tests/graduation-projects/postgres-minimal-schema.sql
--   docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A1-FOUNDATION-01.sql
--     (or supabase SET U A1 equivalent)
--   docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A2-STORAGE-01.sql
--   docs/migration-drafts/GRADUATION-PROJECTS-MVP-PACKAGE-A3-LIFECYCLE-01.sql
--   docs/migration-drafts/GRADUATION-PROJECTS-PACKAGE-D-FIXTURES-AND-CLEANUP.sql
--   For FIX6 BRANCH B (H-01 round integrity + revision notes): also apply
--     supabase/migrations/20260811020000_gp_independent_security_audit_remediation_02.sql
--     (and L4 + identity predecessors when chaining the promoted production line)
--
-- Ends with ROLLBACK. No production apply/deploy.

begin;
select set_config('gp.verify.skip_storage_object_check', 'on', true);

--------------------------------------------------------------------------------
-- Temp state / helpers
--------------------------------------------------------------------------------
create temporary table pg_temp.gp_ids (
  k text primary key,
  v uuid
);

create temporary table pg_temp.gp_counters (
  k text primary key,
  n int not null default 0
);
insert into pg_temp.gp_counters(k, n) values
  ('acl', 0),
  ('pos', 0),
  ('neg', 0);

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

create or replace function pg_temp.bump(p_key text) returns void language plpgsql as $$
begin
  update pg_temp.gp_counters set n = n + 1 where k = p_key;
  if not found then
    raise exception 'unknown counter %', p_key;
  end if;
end $$;

create or replace function pg_temp.fingerprint(p_project_id uuid) returns jsonb
language plpgsql as $$
begin
  return public.export_graduation_project_e2e_fingerprint(p_project_id);
exception when others then
  -- Fallback equivalent shape if export helper unavailable mid-session
  return (
    select jsonb_build_object(
      'project_id', p.id,
      'state', p.lifecycle_state::text,
      'final_decision', p.final_decision::text,
      'version', p.version,
      'assignments', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', a.user_id, 'role', a.role::text, 'is_leader', a.is_leader,
          'active', a.active, 'supervision_status', a.supervision_status::text
        ) order by a.role::text, a.user_id), '[]'::jsonb)
        from public.graduation_project_assignments a where a.project_id = p.id
      ),
      'files', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'file_id', f.id, 'category', f.category::text,
          'upload_status', f.upload_status::text, 'scan_state', f.scan_state::text,
          'is_current', f.is_current
        ) order by f.category::text, f.id), '[]'::jsonb)
        from public.graduation_project_files f where f.project_id = p.id
      ),
      'progress', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'entry_id', pe.id, 'version_no', pe.version_no, 'state', pe.state, 'summary', pe.summary
        ) order by pe.version_no), '[]'::jsonb)
        from public.graduation_project_progress_entries pe where pe.project_id = p.id
      ),
      'evaluations', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'panel_member_id', e.panel_member_id, 'score', e.score, 'notes', e.notes, 'state', e.state
        ) order by e.panel_member_id), '[]'::jsonb)
        from public.graduation_project_evaluations e where e.project_id = p.id
      ),
      'events_count', (select count(*) from public.graduation_project_events ev where ev.project_id = p.id)
    )
    from public.graduation_projects p
    where p.id = p_project_id
  );
end $$;

create or replace function pg_temp.ver(p_project_id uuid) returns bigint language sql stable as $$
  select version from public.graduation_projects where id = p_project_id
$$;

create or replace function pg_temp.expect_fail_zs(
  p_project_id uuid, p_sql text, p_frag text
) returns void language plpgsql as $$
declare
  before jsonb;
  after jsonb;
begin
  before := pg_temp.fingerprint(p_project_id);
  perform pg_temp.expect_fail(p_sql, p_frag);
  after := pg_temp.fingerprint(p_project_id);
  if before is distinct from after then
    raise exception 'zero-side-effect denial failed for fragment %; fingerprint mutated', p_frag;
  end if;
  perform pg_temp.bump('neg');
end $$;

create or replace function pg_temp.pos() returns void language sql as $$
  select pg_temp.bump('pos')
$$;

create or replace function pg_temp.assert_client_acl(p_sig text) returns void language plpgsql as $$
declare
  r record;
  cfg text;
begin
  if to_regprocedure(p_sig) is null then
    raise exception 'ACL: missing client RPC %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg
  into r
  from pg_proc p
  where p.oid = to_regprocedure(p_sig);

  if not r.prosecdef then
    raise exception 'ACL: % must be SECURITY DEFINER', p_sig;
  end if;
  perform pg_temp.bump('acl');

  cfg := r.cfg;
  if position('search_path' in cfg) = 0
     or position('public' in cfg) = 0
     or position('pg_temp' in cfg) = 0 then
    raise exception 'ACL: % search_path must include public and pg_temp (got %)', p_sig, cfg;
  end if;
  perform pg_temp.bump('acl');

  -- PUBLIC grantee oid = 0 via aclexplode (role name "public" is not valid here)
  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = to_regprocedure(p_sig)
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee = 0
  ) then
    raise exception 'ACL: PUBLIC must not EXECUTE %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  if has_function_privilege('anon', p_sig, 'execute') then
    raise exception 'ACL: anon must not EXECUTE %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  if not has_function_privilege('authenticated', p_sig, 'execute') then
    raise exception 'ACL: authenticated must EXECUTE %', p_sig;
  end if;
  perform pg_temp.bump('acl');
end $$;

create or replace function pg_temp.assert_internal_acl(p_sig text) returns void language plpgsql as $$
declare
  r record;
  cfg text;
begin
  if to_regprocedure(p_sig) is null then
    raise exception 'ACL: missing internal helper %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  select p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '') as cfg
  into r
  from pg_proc p
  where p.oid = to_regprocedure(p_sig);

  if not r.prosecdef then
    raise exception 'ACL: internal % must be SECURITY DEFINER', p_sig;
  end if;
  perform pg_temp.bump('acl');

  cfg := r.cfg;
  if position('search_path' in cfg) = 0
     or position('public' in cfg) = 0
     or position('pg_temp' in cfg) = 0 then
    raise exception 'ACL: internal % search_path must include public and pg_temp (got %)', p_sig, cfg;
  end if;
  perform pg_temp.bump('acl');

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = to_regprocedure(p_sig)
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee = 0
  ) then
    raise exception 'ACL: PUBLIC must not EXECUTE internal %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  if has_function_privilege('anon', p_sig, 'execute') then
    raise exception 'ACL: anon must not EXECUTE internal %', p_sig;
  end if;
  perform pg_temp.bump('acl');

  if has_function_privilege('authenticated', p_sig, 'execute') then
    raise exception 'ACL: authenticated must not EXECUTE internal %', p_sig;
  end if;
  perform pg_temp.bump('acl');
end $$;

-- Abbreviated happy path from draft project → evaluating (assumes team+leader already created).
create or replace function pg_temp.corr(p_base int, p_step int) returns uuid language sql immutable as $$
  select ('d1000000-0000-0000-0000-' || lpad((p_base + p_step)::text, 12, '0'))::uuid
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
  p_corr_base int
) returns void language plpgsql as $$
declare
  v_file uuid;
  v_prog uuid;
  v_sha text := repeat('c', 64);
begin
  -- proposal upsert + file + submit
  perform pg_temp.set_uid(p_leader_uid);
  perform public.upsert_graduation_project_proposal(
    p_project_id, 'GP Branch Proposal', 'Problem', 'Objectives', 'Summary',
    pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 1)
  );
  v_file := (public.create_graduation_project_file_upload_intent(
    p_project_id, 'proposal', 'proposal.pdf', 1024, pg_temp.corr(p_corr_base, 2), v_sha
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
    p_project_id, 'final', 'final.pdf', 2048, pg_temp.corr(p_corr_base, 11), repeat('d', 64)
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
    p_project_id, now() + interval '3 days', 'Hall B',
    pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 16)
  );
  perform public.assign_graduation_project_committee_member(
    p_project_id, p_c1_faculty, p_c1_uid, pg_temp.corr(p_corr_base, 17)
  );
  perform public.assign_graduation_project_committee_member(
    p_project_id, p_c2_faculty, p_c2_uid, pg_temp.corr(p_corr_base, 18)
  );
  perform public.mark_graduation_project_defense_held(
    p_project_id, pg_temp.ver(p_project_id), pg_temp.corr(p_corr_base, 19)
  );

  if (select lifecycle_state::text from public.graduation_projects where id = p_project_id) <> 'evaluating' then
    raise exception 'advance_to_evaluating failed for %', p_project_id;
  end if;
end $$;

--------------------------------------------------------------------------------
-- Seed extra synthetic actors (title-bypass + branch leaders)
--------------------------------------------------------------------------------
insert into auth.users(id) values
  ('10000000-0000-0000-0000-000000000005'), -- leader B
  ('10000000-0000-0000-0000-000000000006'), -- leader C
  ('10000000-0000-0000-0000-000000000007'), -- orphan-team leader
  ('10000000-0000-0000-0000-000000000095'), -- unauthorized staff
  ('10000000-0000-0000-0000-000000000096'), -- unauthorized dean
  ('10000000-0000-0000-0000-000000000097'), -- unauthorized department head
  ('10000000-0000-0000-0000-000000000098')  -- unauthorized registrar
on conflict do nothing;

insert into public.student_profiles(id, user_id, department_id) values
  ('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000007','20000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.faculty_profiles(id, user_id, department_id) values
  ('40000000-0000-0000-0000-000000000095','10000000-0000-0000-0000-000000000095','20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000096','10000000-0000-0000-0000-000000000096','20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000097','10000000-0000-0000-0000-000000000097','20000000-0000-0000-0000-000000000001'),
  ('40000000-0000-0000-0000-000000000098','10000000-0000-0000-0000-000000000098','20000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- L4 eligibility for Branch B/C leaders when L4 guard is applied in the harness
insert into public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
select sp.id, '22000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000001',
       '50000000-0000-0000-0000-000000000004', 'enrolled'
from public.student_profiles sp
where sp.id in (
  '30000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000006',
  '30000000-0000-0000-0000-000000000007'
)
  and not exists (
    select 1 from public.student_academic_status s where s.student_profile_id = sp.id
  );

-- Department coordinator capability (privileged verifier seed; not a title bypass)
insert into public.graduation_project_department_coordinators(department_id, faculty_profile_id, user_id, assigned_by)
values (
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011'
);

-- Control snapshot for cleanup invariance
insert into pg_temp.gp_ids(k, v)
select 'control_coord_row', id
from public.graduation_project_department_coordinators
where department_id = '20000000-0000-0000-0000-000000000001'
  and user_id = '10000000-0000-0000-0000-000000000011'
  and active
limit 1;

--------------------------------------------------------------------------------
-- FIX1: ACL assertions via real has_function_privilege / pg_proc
--------------------------------------------------------------------------------
do $$
declare
  client text[] := array[
    'public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)',
    'public.add_graduation_project_team_member(uuid,uuid,uuid,uuid)',
    'public.remove_graduation_project_team_member(uuid,uuid,uuid)',
    'public.upsert_graduation_project_proposal(uuid,text,text,text,text,bigint,uuid)',
    'public.submit_graduation_project_proposal(uuid,bigint,uuid)',
    'public.resubmit_graduation_project_proposal(uuid,bigint,uuid)',
    'public.review_graduation_project_proposal(uuid,text,text,bigint,uuid)',
    'public.assign_graduation_project_supervisor(uuid,uuid,uuid,uuid)',
    'public.respond_graduation_project_supervision(uuid,text,bigint,uuid)',
    'public.submit_graduation_project_progress(uuid,text,uuid,uuid)',
    'public.review_graduation_project_progress(uuid,text,text,uuid)',
    'public.submit_graduation_project_final(uuid,uuid,bigint,uuid)',
    'public.review_graduation_project_final(uuid,text,text,bigint,uuid)',
    'public.schedule_graduation_project_defense(uuid,timestamptz,text,bigint,uuid)',
    'public.assign_graduation_project_committee_member(uuid,uuid,uuid,uuid)',
    'public.mark_graduation_project_defense_held(uuid,bigint,uuid)',
    'public.submit_graduation_project_evaluation(uuid,numeric,text,uuid)',
    'public.conclude_graduation_project_result(uuid,text,bigint,uuid)',
    'public.archive_graduation_project(uuid,bigint,uuid)',
    'public.create_graduation_project_file_upload_intent(uuid,text,text,bigint,uuid,text)',
    'public.register_graduation_project_file(uuid,text,text,bigint,uuid,text)',
    'public.finalize_graduation_project_file(uuid,uuid,text)',
    'public.mark_graduation_project_file_scan_state(uuid,text,uuid)',
    'public.create_graduation_project_signed_download(uuid,uuid)',
    'public.list_my_graduation_projects()',
    'public.get_graduation_project_detail(uuid)',
    'public.list_administration_graduation_projects_overview()',
    'public.cleanup_graduation_project_test_artifacts(text,uuid,uuid[],uuid[],boolean)',
    'public.export_graduation_project_e2e_fingerprint(uuid)'
  ];
  internal text[] := array[
    'public.require_graduation_project_assignment(uuid,public.graduation_project_assignment_role[])',
    'public.require_graduation_project_leader(uuid)',
    'public.require_graduation_project_accepted_supervisor(uuid)',
    'public.require_graduation_project_department_coordinator(uuid)',
    'public.gp_take_replay(uuid,uuid,text,jsonb)',
    'public.gp_assert_version(public.graduation_projects,bigint)',
    'public.gp_team_mutator(uuid)'
  ];
  s text;
begin
  foreach s in array client loop
    perform pg_temp.assert_client_acl(s);
  end loop;
  foreach s in array internal loop
    perform pg_temp.assert_internal_acl(s);
  end loop;
end $$;

do $$
declare n_acl int;
begin
  select c.n into n_acl from pg_temp.gp_counters c where c.k = 'acl';
  raise notice 'PACKAGE_D_ACL_ASSERTIONS=%', n_acl;
end $$;

--------------------------------------------------------------------------------
-- FIX2 TEAM + create/deny matrix
--------------------------------------------------------------------------------
-- unauthorized faculty DENY create
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001')$q$,
  'department graduation-project coordinator capability required'
);
select pg_temp.bump('neg');

-- title-bypass actors DENY create
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-0000000000d6')$q$,
  'department graduation-project coordinator capability required'
);
select pg_temp.bump('neg');

select pg_temp.set_uid('10000000-0000-0000-0000-000000000097');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-0000000000d7')$q$,
  'department graduation-project coordinator capability required'
);
select pg_temp.bump('neg');

select pg_temp.set_uid('10000000-0000-0000-0000-000000000098');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-0000000000d8')$q$,
  'department graduation-project coordinator capability required'
);
select pg_temp.bump('neg');

select pg_temp.set_uid('10000000-0000-0000-0000-000000000095');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-0000000000d5')$q$,
  'department graduation-project coordinator capability required'
);
select pg_temp.bump('neg');

-- coordinator create ALLOW (Branch A evidence project)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('project_a', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001'
));
select pg_temp.pos();

-- FIX4 identical correlation replay → same id, no duplicate event
do $$
declare
  r1 uuid := (select v from pg_temp.gp_ids where k = 'project_a');
  r2 uuid;
  ev1 bigint;
  ev2 bigint;
begin
  select count(*) into ev1 from public.graduation_project_events
  where project_id = r1 and correlation_id = 'd1000000-0000-0000-0000-000000000001';
  r2 := public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001'
  );
  if r1 <> r2 then raise exception 'idempotent create replay returned different id'; end if;
  select count(*) into ev2 from public.graduation_project_events
  where project_id = r1 and correlation_id = 'd1000000-0000-0000-0000-000000000001';
  if ev1 <> ev2 then raise exception 'idempotent create replay duplicated events'; end if;
  perform pg_temp.pos();
end $$;

-- FIX4 changed-payload same correlation DENY
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001')$q$,
  'idempotent replay payload mismatch'
);

-- second active team DENY (same leader)
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-0000000000aa')$q$,
  'student already has an active graduation project team'
);
select pg_temp.bump('neg');

-- unrelated student DENY add member
select pg_temp.set_uid('10000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.add_graduation_project_team_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000010'),
  'exact direct processing assignment required'
);

-- non-leader (member not yet on team) already covered; member after join DENY below
-- leader add member ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v) values ('member_a', public.add_graduation_project_team_member(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'd1000000-0000-0000-0000-000000000002'
));
select pg_temp.pos();

insert into pg_temp.gp_ids(k, v) values ('member_b', public.add_graduation_project_team_member(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  'd1000000-0000-0000-0000-000000000003'
));
select pg_temp.pos();

-- member DENY add another
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.add_graduation_project_team_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    'd1000000-0000-0000-0000-0000000000ab'),
  'exact direct processing assignment required'
);

-- exactly one leader
do $$ begin
  if (select count(*) from public.graduation_project_assignments
      where project_id = (select v from pg_temp.gp_ids where k = 'project_a')
        and active and is_leader) <> 1 then
    raise exception 'expected exactly one leader';
  end if;
  perform pg_temp.pos();
end $$;

--------------------------------------------------------------------------------
-- PROPOSAL path (Branch A) + denials
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.upsert_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'GP MVP Package D Evidence Proposal',
  'Problem statement for verification',
  'Objectives for verification',
  'Summary for verification',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000004'
);
select pg_temp.pos();

-- FIX4 stale version DENY zero mutation
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.upsert_graduation_project_proposal(%L::uuid,'x','y','z','w',0,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    'd1000000-0000-0000-0000-0000000000ac'),
  'project version precondition failed'
);

-- member DENY upsert/submit
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.upsert_graduation_project_proposal(%L::uuid,'Bad','p','o','s',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000ad'),
  'exact team leader assignment required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v)
select 'proposal_file_a', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'proposal', 'proposal.pdf', 1024,
  'd1000000-0000-0000-0000-000000000005', repeat('a', 64)
)->>'file_id')::uuid;
select pg_temp.pos();

select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k = 'proposal_file_a'),
  'd1000000-0000-0000-0000-000000000006'
);
select pg_temp.pos();

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k = 'proposal_file_a'),
  'clean', 'd1000000-0000-0000-0000-000000000007'
);
select pg_temp.pos();

-- member DENY submit
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.submit_graduation_project_proposal(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-000000000008'),
  'exact team leader assignment required'
);

-- leader submit ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.submit_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000009'
);
select pg_temp.pos();

-- wrong/unassigned actors DENY review (admin/dean/head/registrar/staff)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_proposal(%L::uuid,'accept',null,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000ae'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_proposal(%L::uuid,'accept',null,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000af'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000097');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_proposal(%L::uuid,'accept',null,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b0'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000098');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_proposal(%L::uuid,'accept',null,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b1'),
  'exact direct processing assignment required'
);

-- exact coordinator review return ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.review_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'return', 'Please clarify objectives',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000000a'
);
select pg_temp.pos();

-- leader resubmit ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.upsert_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'GP MVP Package D Evidence Proposal',
  'Problem statement for verification',
  'Clarified objectives for verification',
  'Summary for verification',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000000b'
);
select public.resubmit_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000000c'
);
select pg_temp.pos();

-- member DENY resubmit
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.resubmit_graduation_project_proposal(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b2'),
  'exact team leader assignment required'
);

-- coordinator accept
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.review_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'accept', null,
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000000d'
);
select pg_temp.pos();

--------------------------------------------------------------------------------
-- SUPERVISION
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('supervisor_a', public.assign_graduation_project_supervisor(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000012',
  'd1000000-0000-0000-0000-00000000000e'
));
select pg_temp.pos();

-- duplicate pending/accepted supervisor DENY (unique index invariant)
do $$
begin
  begin
    insert into public.graduation_project_assignments(
      project_id, role, faculty_profile_id, user_id, department_id, supervision_status, assigned_by
    ) values (
      (select v from pg_temp.gp_ids where k = 'project_a'),
      'supervisor',
      '40000000-0000-0000-0000-000000000013',
      '10000000-0000-0000-0000-000000000013',
      '20000000-0000-0000-0000-000000000001',
      'pending',
      '10000000-0000-0000-0000-000000000011'
    );
    raise exception 'duplicate pending supervisor insert should have failed';
  exception when unique_violation then
    perform pg_temp.bump('neg');
  end;
end $$;

-- pending supervisor review DENY; accept ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_final(%L::uuid,'ready',null,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b3'),
  'accepted supervisor assignment required'
);

select public.respond_graduation_project_supervision(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'accept',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000000f'
);
select pg_temp.pos();

do $$ begin
  if (select lifecycle_state::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_a')) <> 'active' then
    raise exception 'expected active after supervisor accept';
  end if;
end $$;

-- unrelated supervisor DENY progress review
select pg_temp.set_uid('10000000-0000-0000-0000-000000000013');
-- need a progress entry first; create via leader then deny unrelated

--------------------------------------------------------------------------------
-- PROGRESS / FINAL
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v) values ('progress1', public.submit_graduation_project_progress(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'Initial progress update', null,
  'd1000000-0000-0000-0000-000000000010'
));
select pg_temp.pos();

-- member DENY progress write
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.submit_graduation_project_progress(%L::uuid,'x',null,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    'd1000000-0000-0000-0000-0000000000b4'),
  'exact team leader assignment required'
);

-- unrelated supervisor DENY review
select pg_temp.set_uid('10000000-0000-0000-0000-000000000013');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.review_graduation_project_progress(%L::uuid,'return','no',%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'progress1'),
    'd1000000-0000-0000-0000-0000000000b5'),
  'accepted supervisor assignment required'
);

-- accepted supervisor return/approve ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_progress(
  (select v from pg_temp.gp_ids where k = 'progress1'),
  'return', 'Add metrics',
  'd1000000-0000-0000-0000-000000000011'
);
select pg_temp.pos();

select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v) values ('progress2', public.submit_graduation_project_progress(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'Corrected progress with metrics', null,
  'd1000000-0000-0000-0000-000000000012'
));
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_progress(
  (select v from pg_temp.gp_ids where k = 'progress2'),
  'approve', null,
  'd1000000-0000-0000-0000-000000000013'
);
select pg_temp.pos();

-- final file + submit + ready
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k, v)
select 'final_file_a', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'final', 'final.pdf', 2048,
  'd1000000-0000-0000-0000-000000000014', repeat('b', 64)
)->>'file_id')::uuid;
select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k = 'final_file_a'),
  'd1000000-0000-0000-0000-000000000015'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k = 'final_file_a'),
  'clean', 'd1000000-0000-0000-0000-000000000016'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.submit_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  (select v from pg_temp.gp_ids where k = 'final_file_a'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000017'
);
select pg_temp.pos();

-- member DENY final submit
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.submit_graduation_project_final(%L::uuid,%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    (select v from pg_temp.gp_ids where k = 'final_file_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b6'),
  'exact team leader assignment required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  'ready', null,
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000018'
);
select pg_temp.pos();

--------------------------------------------------------------------------------
-- DEFENSE — coordinator ALLOW; title/global bypass DENY
--------------------------------------------------------------------------------
-- dean DENY schedule
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.schedule_graduation_project_defense(%L::uuid, now() + interval '7 days', 'Hall X', %s, %L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b7'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000097');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.schedule_graduation_project_defense(%L::uuid, now() + interval '7 days', 'Hall X', %s, %L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b8'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000098');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.schedule_graduation_project_defense(%L::uuid, now() + interval '7 days', 'Hall X', %s, %L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000b9'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000095');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.schedule_graduation_project_defense(%L::uuid, now() + interval '7 days', 'Hall X', %s, %L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000ba'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.schedule_graduation_project_defense(%L::uuid, now() + interval '7 days', 'Hall X', %s, %L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000bb'),
  'exact direct processing assignment required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('defense_a', public.schedule_graduation_project_defense(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  now() + interval '7 days', 'Hall A',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000019'
));
select pg_temp.pos();

-- title bypass DENY committee assign
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.assign_graduation_project_committee_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    '40000000-0000-0000-0000-000000000014',
    '10000000-0000-0000-0000-000000000014',
    'd1000000-0000-0000-0000-0000000000bc'),
  'exact direct processing assignment required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('c1', public.assign_graduation_project_committee_member(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000014',
  'd1000000-0000-0000-0000-00000000001a'
));
insert into pg_temp.gp_ids(k, v) values ('c2', public.assign_graduation_project_committee_member(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  '40000000-0000-0000-0000-000000000015',
  '10000000-0000-0000-0000-000000000015',
  'd1000000-0000-0000-0000-00000000001b'
));
select pg_temp.pos();

-- title bypass DENY mark held
select pg_temp.set_uid('10000000-0000-0000-0000-000000000098');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.mark_graduation_project_defense_held(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000bd'),
  'exact direct processing assignment required'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_defense_held(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-00000000001c'
);
select pg_temp.pos();

--------------------------------------------------------------------------------
-- EVALUATION
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
insert into pg_temp.gp_ids(k, v) values ('e1', public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  80, 'Solid work',
  'd1000000-0000-0000-0000-00000000001d'
));
select pg_temp.pos();

-- submitted evaluation immutable / duplicate DENY
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.submit_graduation_project_evaluation(%L::uuid,90,'overwrite',%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    'd1000000-0000-0000-0000-0000000000be'),
  'evaluation already submitted'
);

-- peer cannot overwrite other committee score (own panel only → DENY as committee panel assignment for wrong actor is N/A;
-- committee2 submits own; attempting to mutate peer row denied via duplicate/own-panel)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
insert into pg_temp.gp_ids(k, v) values ('e2', public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  90, 'Excellent',
  'd1000000-0000-0000-0000-00000000001e'
));
select pg_temp.pos();

-- peer evaluation read DENY (detail must not leak peer notes)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
do $$
declare d jsonb;
begin
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_a'));
  if d->'own_evaluation'->>'notes' is distinct from 'Solid work' then
    raise exception 'own evaluation missing';
  end if;
  if d ? 'evaluations' then
    raise exception 'peer evaluations leaked';
  end if;
  if (d->>'own_evaluation') like '%Excellent%' then
    raise exception 'peer evaluations leaked';
  end if;
  if (d->'own_evaluation'->>'score')::numeric is distinct from 80::numeric then
    raise exception 'own score mismatch';
  end if;
  perform pg_temp.pos();
end $$;

-- committee2 detail also must not see peer
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
do $$
declare d jsonb;
begin
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k = 'project_a'));
  if d->'own_evaluation'->>'notes' is distinct from 'Excellent' then
    raise exception 'own evaluation missing for c2';
  end if;
  if d ? 'evaluations' or (d->>'own_evaluation') like '%Solid work%' then
    raise exception 'peer evaluations leaked';
  end if;
  perform pg_temp.pos();
end $$;

--------------------------------------------------------------------------------
-- RESULT / ARCHIVE denials before ready + Branch A conclude/archive
--------------------------------------------------------------------------------
-- archive while decision null DENY
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.archive_graduation_project(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000bf'),
  'project not archive-ready'
);

-- admin/dean/head/registrar/staff DENY conclude
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c0'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c1'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000097');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c2'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000098');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c3'),
  'exact direct processing assignment required'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000095');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c4'),
  'exact direct processing assignment required'
);

-- exact coordinator conclude passed ALLOW
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  pid uuid := (select v from pg_temp.gp_ids where k = 'project_a');
  v_exp bigint := pg_temp.ver(pid);
  before jsonb;
  after jsonb;
  r uuid;
begin
  perform public.conclude_graduation_project_result(
    pid, 'passed', v_exp, 'd1000000-0000-0000-0000-00000000001f'
  );
  perform pg_temp.pos();

  -- FIX4 identical conclude replay (same correlation + identical original payload)
  before := pg_temp.fingerprint(pid);
  r := public.conclude_graduation_project_result(
    pid, 'passed', v_exp, 'd1000000-0000-0000-0000-00000000001f'
  );
  if r is distinct from pid then raise exception 'conclude replay id mismatch'; end if;
  after := pg_temp.fingerprint(pid);
  if before is distinct from after then
    raise exception 'conclude identical replay mutated fingerprint';
  end if;
  perform pg_temp.pos();

  -- FIX4 changed-payload replay DENY
  begin
    perform public.conclude_graduation_project_result(
      pid, 'failed', v_exp, 'd1000000-0000-0000-0000-00000000001f'
    );
    raise exception 'expected changed-payload conclude replay failure';
  exception when others then
    if position('idempotent replay payload mismatch' in sqlerrm) = 0 then
      raise exception 'expected idempotent replay payload mismatch, got %', sqlerrm;
    end if;
  end;
  after := pg_temp.fingerprint(pid);
  if before is distinct from after then
    raise exception 'changed-payload conclude denial mutated fingerprint';
  end if;
  perform pg_temp.bump('neg');
end $$;

-- title bypass DENY archive
select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.archive_graduation_project(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c5'),
  'exact direct processing assignment required'
);

-- coordinator archive ALLOW (Branch A evidence)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('archive_a', public.archive_graduation_project(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
  'd1000000-0000-0000-0000-000000000020'
));
select pg_temp.pos();

do $$ begin
  if (select lifecycle_state::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_a')) <> 'archived' then
    raise exception 'Branch A expected archived';
  end if;
end $$;

-- archived project immutable
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.assign_graduation_project_supervisor(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    '40000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000013',
    'd1000000-0000-0000-0000-0000000000c6'),
  'supervisor assignment state denied'
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c7'),
  'archived project is immutable'
);

do $$ begin raise notice 'PACKAGE_D_BRANCH_A_PASS'; end $$;

--------------------------------------------------------------------------------
-- READ: unrelated / administration overview
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail(
  format($q$select public.get_graduation_project_detail(%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a')),
  'exact direct processing assignment required'
);
select pg_temp.bump('neg');

-- unauthorized DENY administration overview
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);
select pg_temp.bump('neg');

select pg_temp.set_uid('10000000-0000-0000-0000-000000000096');
select pg_temp.expect_fail(
  $q$select public.list_administration_graduation_projects_overview()$q$,
  'administration graduation-project viewer capability required'
);
select pg_temp.bump('neg');

-- coordinator may call list_administration (read-only overview)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare o jsonb;
begin
  o := public.list_administration_graduation_projects_overview();
  if o is null then raise exception 'administration overview null'; end if;
  if jsonb_typeof(o) <> 'array' then raise exception 'administration overview not array'; end if;
  perform pg_temp.pos();
end $$;

-- leader cannot mutate via overview (read-only call is fine; mutation still denied)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_a'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'failed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_a'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_a')),
    'd1000000-0000-0000-0000-0000000000c8'),
  'exact direct processing assignment required'
);

--------------------------------------------------------------------------------
-- FIX6 BRANCH B: revisions_required → corrected final → ready → passed → archived
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('project_b', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000005',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000101'
));
select pg_temp.pos();

select pg_temp.advance_to_evaluating(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  '10000000-0000-0000-0000-000000000005',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000012',
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000014',
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000015',
  '40000000-0000-0000-0000-000000000015',
  1100
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  70, 'Needs revision notes',
  'd1000000-0000-0000-0000-0000000001d1'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  75, 'Also revise',
  'd1000000-0000-0000-0000-0000000001d2'
);
select pg_temp.pos();

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  'revisions_required',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
  'd1000000-0000-0000-0000-0000000001d3',
  'Must revise the methodology chapter'
);
select pg_temp.pos();

-- archive after revisions_required DENY
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  format($q$select public.archive_graduation_project(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_b'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
    'd1000000-0000-0000-0000-0000000001d4'),
  'project not archive-ready'
);

-- H-01: stale round-N evaluations cannot authorize a new final decision
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_b'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
    'd1000000-0000-0000-0000-0000000001dc'),
  'all committee evaluations required'
);

-- corrected final → ready
select pg_temp.set_uid('10000000-0000-0000-0000-000000000005');
insert into pg_temp.gp_ids(k, v)
select 'final_file_b', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  'final', 'final-rev.pdf', 2048,
  'd1000000-0000-0000-0000-0000000001d5', repeat('e', 64)
)->>'file_id')::uuid;
select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k = 'final_file_b'),
  'd1000000-0000-0000-0000-0000000001d6'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k = 'final_file_b'),
  'clean', 'd1000000-0000-0000-0000-0000000001d7'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000005');
select public.submit_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  (select v from pg_temp.gp_ids where k = 'final_file_b'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
  'd1000000-0000-0000-0000-0000000001d8'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_final(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  'ready', null,
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
  'd1000000-0000-0000-0000-0000000001d9'
);

-- H-01: still DENY final decision until fresh round N+1 evaluations exist
select pg_temp.expect_fail_zs(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  format($q$select public.conclude_graduation_project_result(%L::uuid,'passed',%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k = 'project_b'),
    pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
    'd1000000-0000-0000-0000-0000000001dd'),
  'all committee evaluations required'
);

-- Fresh authorized evaluation evidence for round N+1
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  88, 'Round 2 ok',
  'd1000000-0000-0000-0000-0000000001de'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  90, 'Round 2 ok',
  'd1000000-0000-0000-0000-0000000001df'
);
select pg_temp.pos();

select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  'passed',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
  'd1000000-0000-0000-0000-0000000001da'
);
select public.archive_graduation_project(
  (select v from pg_temp.gp_ids where k = 'project_b'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_b')),
  'd1000000-0000-0000-0000-0000000001db'
);
select pg_temp.pos();

do $$ begin
  if (select lifecycle_state::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_b')) <> 'archived' then
    raise exception 'Branch B expected archived';
  end if;
  if (select final_decision::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_b')) <> 'passed' then
    raise exception 'Branch B expected passed after revisions';
  end if;
  raise notice 'PACKAGE_D_BRANCH_B_PASS';
end $$;

--------------------------------------------------------------------------------
-- FIX6 BRANCH C: failed → archived
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('project_c', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000006',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000201'
));
select pg_temp.pos();

select pg_temp.advance_to_evaluating(
  (select v from pg_temp.gp_ids where k = 'project_c'),
  '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000012',
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000014',
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000015',
  '40000000-0000-0000-0000-000000000015',
  2100
);

select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_c'),
  40, 'Insufficient',
  'd1000000-0000-0000-0000-0000000002d1'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
select public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k = 'project_c'),
  45, 'Fail',
  'd1000000-0000-0000-0000-0000000002d2'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k = 'project_c'),
  'failed',
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_c')),
  'd1000000-0000-0000-0000-0000000002d3'
);
select public.archive_graduation_project(
  (select v from pg_temp.gp_ids where k = 'project_c'),
  pg_temp.ver((select v from pg_temp.gp_ids where k = 'project_c')),
  'd1000000-0000-0000-0000-0000000002d4'
);
select pg_temp.pos();

do $$ begin
  if (select lifecycle_state::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_c')) <> 'archived' then
    raise exception 'Branch C expected archived';
  end if;
  if (select final_decision::text from public.graduation_projects
      where id = (select v from pg_temp.gp_ids where k = 'project_c')) <> 'failed' then
    raise exception 'Branch C expected failed';
  end if;
  raise notice 'PACKAGE_D_BRANCH_C_PASS';
end $$;

--------------------------------------------------------------------------------
-- FIX5 CLEANUP: orphan temp + allowlisted IDs; preserve Branch A evidence
--------------------------------------------------------------------------------
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k, v) values ('orphan_project', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000007',
  '10000000-0000-0000-0000-000000000007',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000301'
));

select pg_temp.set_uid('10000000-0000-0000-0000-000000000007');
insert into pg_temp.gp_ids(k, v)
select 'orphan_file', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k = 'orphan_project'),
  'proposal', 'orphan-pending.pdf', 512,
  'd1000000-0000-0000-0000-000000000302', repeat('f', 64)
)->>'file_id')::uuid;

-- pending file remains (no finalize) — intentional orphan artifact

-- cleanup source must not use LIKE '%TEST%'
do $chk$
declare src text;
begin
  select pg_get_functiondef('public.cleanup_graduation_project_test_artifacts(text,uuid,uuid[],uuid[],boolean)'::regprocedure)
    into src;
  if position($frag$LIKE '%TEST%'$frag$ in src) > 0 then
    raise exception 'cleanup SQL source must not use LIKE %%TEST%%';
  end if;
end $chk$;

-- Call REAL cleanup with exact allowlisted temp IDs only (preserve project_a)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
do $$
declare
  v_result jsonb;
  v_preserve uuid := (select v from pg_temp.gp_ids where k = 'project_a');
  v_temps uuid[] := array[
    (select v from pg_temp.gp_ids where k = 'orphan_project'),
    (select v from pg_temp.gp_ids where k = 'project_b'),
    (select v from pg_temp.gp_ids where k = 'project_c')
  ];
  v_files uuid[] := array[
    (select v from pg_temp.gp_ids where k = 'orphan_file')
  ];
  v_coord_before uuid := (select v from pg_temp.gp_ids where k = 'control_coord_row');
  v_coord_after uuid;
  v_coord_active boolean;
begin
  v_result := public.cleanup_graduation_project_test_artifacts(
    'TEST_ONLY_GP_MVP_E2E_01',
    v_preserve,
    v_temps,
    v_files,
    false
  );
  if v_result->>'status' is distinct from 'CLEANUP_SUCCESS' then
    raise exception 'cleanup status unexpected: %', v_result;
  end if;

  if exists (
    select 1 from public.graduation_projects p where p.id = any (v_temps)
  ) then
    raise exception 'CLEANUP residual temporary projects remain';
  end if;

  if exists (
    select 1 from public.graduation_project_files f where f.id = any (v_files)
  ) then
    raise exception 'CLEANUP residual temporary files remain';
  end if;

  if not exists (
    select 1 from public.graduation_projects p
    where p.id = v_preserve and p.lifecycle_state = 'archived'
  ) then
    raise exception 'CLEANUP destroyed preserved Branch A evidence';
  end if;

  select id, active into v_coord_after, v_coord_active
  from public.graduation_project_department_coordinators
  where id = v_coord_before;

  if v_coord_after is distinct from v_coord_before or v_coord_active is not true then
    raise exception 'CLEANUP mutated control coordinator row';
  end if;

  raise notice 'PACKAGE_D_CLEANUP_PASS';
end $$;

--------------------------------------------------------------------------------
-- Final counters / pass marker
--------------------------------------------------------------------------------
do $$
declare
  n_acl int;
  n_pos int;
  n_neg int;
begin
  select c.n into n_acl from pg_temp.gp_counters c where c.k = 'acl';
  select c.n into n_pos from pg_temp.gp_counters c where c.k = 'pos';
  select c.n into n_neg from pg_temp.gp_counters c where c.k = 'neg';
  raise notice 'PACKAGE_D_ACL_ASSERTIONS=%', n_acl;
  raise notice 'PACKAGE_D_POSITIVE_RPC_CASES=%', n_pos;
  raise notice 'PACKAGE_D_NEGATIVE_RPC_CASES=%', n_neg;
  raise notice 'PACKAGE_D_EXECUTABLE_SECURITY_VERIFIER_PASS';
end $$;

rollback;
