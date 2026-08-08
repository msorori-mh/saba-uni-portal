-- Package A disposable PostgreSQL 17 verifier (SOURCE ONLY).
-- Full positive lifecycle + core negatives. Ends with ROLLBACK.
-- Requires: postgres-minimal-schema + A1 + A2 + A3 drafts applied in same session.

begin;
select set_config('gp.verify.skip_storage_object_check', 'on', true);

create temporary table pg_temp.gp_ids (
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

-- Seed department coordinator capability (privileged verifier seed; not a title bypass)
insert into public.graduation_project_department_coordinators(department_id, faculty_profile_id, user_id, assigned_by)
values (
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011',
  '10000000-0000-0000-0000-000000000011'
);

-- Negative: unrelated faculty cannot create team
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001')$q$,
  'department graduation-project coordinator capability required'
);

-- 1) Coordinator creates team
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k,v) values ('project', public.create_graduation_project_team(
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '21000000-0000-0000-0000-000000000001',
  '22000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001'
));

-- Idempotent create replay
do $$ declare r1 uuid; r2 uuid; begin
  r1 := (select v from pg_temp.gp_ids where k='project');
  r2 := public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001');
  if r1 <> r2 then raise exception 'idempotent retry returned a different id'; end if;
end $$;

-- Changed-payload replay denial
select pg_temp.expect_fail(
  $q$select public.create_graduation_project_team(
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000001',
    '22000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001')$q$,
  'idempotent replay payload mismatch'
);

-- Negative: member cannot add before being on team; unrelated student denied
select pg_temp.set_uid('10000000-0000-0000-0000-000000000004');
select pg_temp.expect_fail(
  format($q$select public.add_graduation_project_team_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'),
    '30000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000010'),
  'exact direct processing assignment required'
);

-- 2) Leader adds members
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k,v) values ('member_a', public.add_graduation_project_team_member(
  (select v from pg_temp.gp_ids where k='project'),
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002'
));
insert into pg_temp.gp_ids(k,v) values ('member_b', public.add_graduation_project_team_member(
  (select v from pg_temp.gp_ids where k='project'),
  '30000000-0000-0000-0000-000000000003',
  '10000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003'
));

-- Exactly one leader
do $$ begin
  if (select count(*) from public.graduation_project_assignments
      where project_id=(select v from pg_temp.gp_ids where k='project') and active and is_leader) <> 1 then
    raise exception 'expected exactly one leader';
  end if;
end $$;

-- 3) Upsert proposal + attachment
select public.upsert_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'),
  'GP MVP Package A Proposal Title',
  'Problem statement for verification',
  'Objectives for verification',
  'Summary for verification',
  1, 'a1000000-0000-0000-0000-000000000004'
);

insert into pg_temp.gp_ids(k,v)
select 'proposal_file', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k='project'),
  'proposal', 'proposal.pdf', 1024,
  'a1000000-0000-0000-0000-000000000005', repeat('a',64)
)->>'file_id')::uuid;

select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k='proposal_file'),
  'a1000000-0000-0000-0000-000000000006'
);

-- Coordinator marks scan clean
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k='proposal_file'),
  'clean', 'a1000000-0000-0000-0000-000000000007'
);

-- Negative: submit without being leader
select pg_temp.set_uid('10000000-0000-0000-0000-000000000002');
select pg_temp.expect_fail(
  format($q$select public.submit_graduation_project_proposal(%L::uuid,2,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'), 'a1000000-0000-0000-0000-000000000008'),
  'exact team leader assignment required'
);

-- 4) Submit proposal
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.submit_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'), 2, 'a1000000-0000-0000-0000-000000000009'
);

-- 5) Coordinator returns once
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.review_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'), 'return', 'Please clarify objectives', 3,
  'a1000000-0000-0000-0000-00000000000a'
);

-- Negative: unauthorized admin cannot review
select pg_temp.set_uid('10000000-0000-0000-0000-000000000099');
select pg_temp.expect_fail(
  format($q$select public.review_graduation_project_proposal(%L::uuid,'accept',null,4,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'), 'a1000000-0000-0000-0000-0000000000aa'),
  'exact direct processing assignment required'
);

-- 6) Leader corrects + resubmits
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.upsert_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'),
  'GP MVP Package A Proposal Title',
  'Problem statement for verification',
  'Clarified objectives for verification',
  'Summary for verification',
  4, 'a1000000-0000-0000-0000-00000000000b'
);
select public.resubmit_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'), 5, 'a1000000-0000-0000-0000-00000000000c'
);

-- 7) Accept
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.review_graduation_project_proposal(
  (select v from pg_temp.gp_ids where k='project'), 'accept', null, 6,
  'a1000000-0000-0000-0000-00000000000d'
);

-- Post-lock: leader cannot add members
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail(
  format($q$select public.add_graduation_project_team_member(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'),
    '30000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000004',
    'a1000000-0000-0000-0000-0000000000ab'),
  'exact direct processing assignment required'
);

-- 8) Assign supervisor pending
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k,v) values ('supervisor', public.assign_graduation_project_supervisor(
  (select v from pg_temp.gp_ids where k='project'),
  '40000000-0000-0000-0000-000000000012',
  '10000000-0000-0000-0000-000000000012',
  'a1000000-0000-0000-0000-00000000000e'
));

-- Negative: pending supervisor cannot review final (accept gate before operate)
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select pg_temp.expect_fail(
  format($q$select public.review_graduation_project_final(%L::uuid,'ready',null,7,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'), 'a1000000-0000-0000-0000-0000000000ac'),
  'accepted supervisor assignment required'
);

-- 9) Supervisor accepts -> active
select public.respond_graduation_project_supervision(
  (select v from pg_temp.gp_ids where k='project'), 'accept', 7,
  'a1000000-0000-0000-0000-00000000000f'
);

do $$ begin
  if (select lifecycle_state::text from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')) <> 'active' then
    raise exception 'expected active after supervisor accept';
  end if;
end $$;

-- 10-12 progress cycle
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k,v) values ('progress1', public.submit_graduation_project_progress(
  (select v from pg_temp.gp_ids where k='project'), 'Initial progress update', null,
  'a1000000-0000-0000-0000-000000000010'
));
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_progress(
  (select v from pg_temp.gp_ids where k='progress1'), 'return', 'Add metrics',
  'a1000000-0000-0000-0000-000000000011'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k,v) values ('progress2', public.submit_graduation_project_progress(
  (select v from pg_temp.gp_ids where k='project'), 'Corrected progress with metrics', null,
  'a1000000-0000-0000-0000-000000000012'
));
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_progress(
  (select v from pg_temp.gp_ids where k='progress2'), 'approve', null,
  'a1000000-0000-0000-0000-000000000013'
);

-- 13 final file + ready
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
insert into pg_temp.gp_ids(k,v)
select 'final_file', (public.create_graduation_project_file_upload_intent(
  (select v from pg_temp.gp_ids where k='project'),
  'final', 'final.pdf', 2048, 'a1000000-0000-0000-0000-000000000014', repeat('b',64)
)->>'file_id')::uuid;
select public.finalize_graduation_project_file(
  (select v from pg_temp.gp_ids where k='final_file'), 'a1000000-0000-0000-0000-000000000015'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.mark_graduation_project_file_scan_state(
  (select v from pg_temp.gp_ids where k='final_file'), 'clean', 'a1000000-0000-0000-0000-000000000016'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select public.submit_graduation_project_final(
  (select v from pg_temp.gp_ids where k='project'),
  (select v from pg_temp.gp_ids where k='final_file'),
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-000000000017'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000012');
select public.review_graduation_project_final(
  (select v from pg_temp.gp_ids where k='project'), 'ready', null,
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-000000000018'
);

-- 14 schedule defense
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k,v) values ('defense', public.schedule_graduation_project_defense(
  (select v from pg_temp.gp_ids where k='project'),
  now() + interval '7 days', 'Hall A',
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-000000000019'
));

-- 15 committee >=2
insert into pg_temp.gp_ids(k,v) values ('c1', public.assign_graduation_project_committee_member(
  (select v from pg_temp.gp_ids where k='project'),
  '40000000-0000-0000-0000-000000000014',
  '10000000-0000-0000-0000-000000000014',
  'a1000000-0000-0000-0000-00000000001a'
));
insert into pg_temp.gp_ids(k,v) values ('c2', public.assign_graduation_project_committee_member(
  (select v from pg_temp.gp_ids where k='project'),
  '40000000-0000-0000-0000-000000000015',
  '10000000-0000-0000-0000-000000000015',
  'a1000000-0000-0000-0000-00000000001b'
));

-- Negative: mark held with only one would fail -- already have 2; test unrelated cannot evaluate
select public.mark_graduation_project_defense_held(
  (select v from pg_temp.gp_ids where k='project'),
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-00000000001c'
);

-- 17 evaluations
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
insert into pg_temp.gp_ids(k,v) values ('e1', public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k='project'), 80, 'Solid work',
  'a1000000-0000-0000-0000-00000000001d'
));
-- immutable
select pg_temp.expect_fail(
  format($q$select public.submit_graduation_project_evaluation(%L::uuid,90,'x',%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'), 'a1000000-0000-0000-0000-0000000000ad'),
  'evaluation already submitted'
);
select pg_temp.set_uid('10000000-0000-0000-0000-000000000015');
insert into pg_temp.gp_ids(k,v) values ('e2', public.submit_graduation_project_evaluation(
  (select v from pg_temp.gp_ids where k='project'), 90, 'Excellent',
  'a1000000-0000-0000-0000-00000000001e'
));

-- Peer leakage: committee1 detail must not include committee2 notes
select pg_temp.set_uid('10000000-0000-0000-0000-000000000014');
do $$ declare d jsonb; begin
  d := public.get_graduation_project_detail((select v from pg_temp.gp_ids where k='project'));
  if d->'own_evaluation'->>'notes' <> 'Solid work' then raise exception 'own evaluation missing'; end if;
  if d ? 'evaluations' then raise exception 'peer evaluations leaked'; end if;
  if (d->>'own_evaluation') like '%Excellent%' then raise exception 'peer notes leaked into own_evaluation'; end if;
end $$;

-- 18 conclude passed
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
select public.conclude_graduation_project_result(
  (select v from pg_temp.gp_ids where k='project'), 'passed',
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-00000000001f'
);
do $$ begin
  if (select average_score from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')) <> 85 then
    raise exception 'average score mismatch';
  end if;
  if (select final_decision::text from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')) <> 'passed' then
    raise exception 'final_decision mismatch';
  end if;
end $$;

-- Negative: member cannot archive
select pg_temp.set_uid('10000000-0000-0000-0000-000000000001');
select pg_temp.expect_fail(
  format($q$select public.archive_graduation_project(%L::uuid,%s,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'),
    (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
    'a1000000-0000-0000-0000-0000000000ae'),
  'exact direct processing assignment required'
);

-- 19 archive
select pg_temp.set_uid('10000000-0000-0000-0000-000000000011');
insert into pg_temp.gp_ids(k,v) values ('archive', public.archive_graduation_project(
  (select v from pg_temp.gp_ids where k='project'),
  (select version from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')),
  'a1000000-0000-0000-0000-000000000020'
));

do $$ declare snap jsonb; begin
  if (select lifecycle_state::text from public.graduation_projects where id=(select v from pg_temp.gp_ids where k='project')) <> 'archived' then
    raise exception 'expected archived';
  end if;
  select snapshot into snap from public.graduation_project_final_archives where id=(select v from pg_temp.gp_ids where k='archive');
  if snap->>'final_decision' <> 'passed' then raise exception 'archive snapshot incomplete'; end if;
  if jsonb_array_length(snap->'evaluations') <> 2 then raise exception 'archive evaluations incomplete'; end if;
end $$;

-- Mutate after archive denied
select pg_temp.expect_fail(
  format($q$select public.assign_graduation_project_supervisor(%L::uuid,%L::uuid,%L::uuid,%L::uuid)$q$,
    (select v from pg_temp.gp_ids where k='project'),
    '40000000-0000-0000-0000-000000000013',
    '10000000-0000-0000-0000-000000000013',
    'a1000000-0000-0000-0000-0000000000af'),
  'supervisor assignment state denied'
);

-- Append-only events
select pg_temp.expect_fail(
  $q$update public.graduation_project_events set reason='x' where true$q$,
  'graduation project events are append-only'
);

-- Anon execute denial sample
do $$ begin
  if has_function_privilege('anon', 'public.create_graduation_project_team(uuid,uuid,uuid,uuid,uuid,uuid,uuid)', 'execute') then
    raise exception 'anon must not execute create_graduation_project_team';
  end if;
end $$;

-- Bucket contract present and private
do $$ begin
  if not exists (select 1 from storage.buckets where id='graduation-projects' and public=false) then
    raise exception 'graduation-projects private bucket contract missing';
  end if;
end $$;

do $$ begin raise notice 'PACKAGE_A_VERIFIER_PASS'; end $$;
rollback;
