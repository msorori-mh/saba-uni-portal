-- ACADEMIC-COUNCILS-C0 write-surface hardening verifier (disposable PG17).
-- Transactional: begin … rollback. Proves direct-write denial + RPC matrix.

begin;

create or replace function pg_temp.as_user(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end;
$$;

create or replace function pg_temp.reset_role()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function pg_temp.expect_fail(p_label text, p_sql text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
    raise exception '%_UNEXPECTED_SUCCESS', p_label;
  exception
    when insufficient_privilege then null;
    when check_violation then null;
    when unique_violation then null;
    when foreign_key_violation then null;
    when not_null_violation then null;
    when data_exception then null;
    when invalid_authorization_specification then null;
    when sqlstate '42501' then null;
    when sqlstate '28000' then null;
    when sqlstate 'P0001' then null;
  end;
end;
$$;

do $$
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (
    id, name, council_type, department_id, created_by
  ) values
   (
    'c1000000-0000-0000-0000-000000000001',
    'Council A',
    'college',
    null,
    'a1000000-0000-0000-0000-000000000001'
  ),
   (
    'c1000000-0000-0000-0000-000000000002',
    'Council B',
    'college',
    null,
    'a1000000-0000-0000-0000-000000000001'
  );

  insert into public.academic_council_members (
    id, council_id, user_id, member_role, is_active, created_by
  ) values
   ('11000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000011', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000012', 'c1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000012', 'chair', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000013', 'secretary', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000014', 'member', true, 'a1000000-0000-0000-0000-000000000001'),
   ('11000000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000015', 'viewer', true, 'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at, status, created_by
  ) values (
    '14000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    1,
    'Meeting 1',
    now() + interval '7 days',
    'scheduled',
    'a1000000-0000-0000-0000-000000000011'
  );

  insert into public.academic_council_topics (
    id, council_id, title, body, status, submitted_by, submitted_at
  ) values
   (
    '12000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    'Submitted topic',
    'body',
    'submitted',
    'a1000000-0000-0000-0000-000000000014',
    now()
  ),
   (
    '12000000-0000-0000-0000-000000000002',
    'c1000000-0000-0000-0000-000000000001',
    'Draft topic',
    'draft body',
    'draft',
    'a1000000-0000-0000-0000-000000000014',
    null
  ),
   (
    '12000000-0000-0000-0000-000000000003',
    'c1000000-0000-0000-0000-000000000001',
    'Accepted topic',
    'accepted body',
    'accepted_for_agenda',
    'a1000000-0000-0000-0000-000000000014',
    now()
  );

  insert into public.academic_council_agenda_items (
    id, meeting_id, title, order_index, created_by
  ) values (
    '13000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Manual item',
    1,
    'a1000000-0000-0000-0000-000000000011'
  );
end $$;

create temporary table c0_counts as
select
  (select count(*) from public.academic_councils) as councils,
  (select count(*) from public.academic_council_members) as members,
  (select count(*) from public.academic_council_meetings) as meetings,
  (select count(*) from public.academic_council_topics) as topics,
  (select count(*) from public.academic_council_agenda_items) as agenda,
  (select count(*) from public.academic_council_minutes) as minutes,
  (select count(*) from public.academic_council_decisions) as decisions,
  (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
     from public.academic_council_topics) as topics_fp,
  (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
     from public.academic_council_meetings) as meetings_fp,
  (select md5(string_agg(id::text || order_index::text || is_approved::text, ',' order by id))
     from public.academic_council_agenda_items) as agenda_fp,
  (select md5(string_agg(id::text || is_active::text || member_role::text, ',' order by id))
     from public.academic_council_members) as members_fp;

create or replace function pg_temp.assert_zero_mutation(p_label text)
returns void
language plpgsql
as $$
declare
  v_now record;
  v_base record;
begin
  select * into v_base from c0_counts;
  select
    (select count(*) from public.academic_councils) as councils,
    (select count(*) from public.academic_council_members) as members,
    (select count(*) from public.academic_council_meetings) as meetings,
    (select count(*) from public.academic_council_topics) as topics,
    (select count(*) from public.academic_council_agenda_items) as agenda,
    (select count(*) from public.academic_council_minutes) as minutes,
    (select count(*) from public.academic_council_decisions) as decisions,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_topics) as topics_fp,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_meetings) as meetings_fp,
    (select md5(string_agg(id::text || order_index::text || is_approved::text, ',' order by id))
       from public.academic_council_agenda_items) as agenda_fp,
    (select md5(string_agg(id::text || is_active::text || member_role::text, ',' order by id))
       from public.academic_council_members) as members_fp
  into v_now;

  if v_now is distinct from v_base then
    raise exception '%_MUTATION_LEAK', p_label;
  end if;
end;
$$;

do $$
declare
  actors uuid[] := array[
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'a1000000-0000-0000-0000-000000000003'::uuid,
    'a1000000-0000-0000-0000-000000000011'::uuid,
    'a1000000-0000-0000-0000-000000000012'::uuid,
    'a1000000-0000-0000-0000-000000000013'::uuid,
    'a1000000-0000-0000-0000-000000000014'::uuid,
    'a1000000-0000-0000-0000-000000000015'::uuid,
    'a1000000-0000-0000-0000-000000000016'::uuid,
    'a1000000-0000-0000-0000-000000000017'::uuid
  ];
  u uuid;
begin
  foreach u in array actors loop
    perform pg_temp.as_user(u);
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_TOPICS',
      $q$insert into public.academic_council_topics(council_id,title,body,submitted_by,status)
         values ('c1000000-0000-0000-0000-000000000001','x','y',auth.uid(),'submitted')$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_UPDATE_TOPICS',
      $q$update public.academic_council_topics set title = 'hacked' where id = '12000000-0000-0000-0000-000000000001'$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_MEETINGS',
      $q$insert into public.academic_council_meetings(council_id,meeting_number,title,scheduled_at,created_by)
         values ('c1000000-0000-0000-0000-000000000001',99,'x',now(),auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_UPDATE_MEETINGS',
      $q$update public.academic_council_meetings set title = 'hacked' where id = '14000000-0000-0000-0000-000000000001'$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_AGENDA',
      $q$insert into public.academic_council_agenda_items(meeting_id,title,order_index,created_by)
         values ('14000000-0000-0000-0000-000000000001','x',50,auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_UPDATE_AGENDA',
      $q$update public.academic_council_agenda_items set title = 'hacked' where id = '13000000-0000-0000-0000-000000000001'$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_MEMBERS',
      $q$insert into public.academic_council_members(council_id,user_id,member_role,created_by)
         values ('c1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000016','member',auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_MINUTES',
      $q$insert into public.academic_council_minutes(meeting_id,body,drafted_by)
         values ('14000000-0000-0000-0000-000000000001','x',auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_DECISIONS',
      $q$insert into public.academic_council_decisions(meeting_id,decision_number,title,body,created_by)
         values ('14000000-0000-0000-0000-000000000001',1,'x','y',auth.uid())$q$
    );
    perform pg_temp.expect_fail(
      'DIRECT_INSERT_COUNCILS',
      $q$insert into public.academic_councils(name,council_type,created_by)
         values ('hack','college',auth.uid())$q$
    );
  end loop;

  perform pg_temp.as_anon();
  perform pg_temp.expect_fail(
    'ANON_INSERT_TOPICS',
    $q$insert into public.academic_council_topics(council_id,title,body,submitted_by,status)
       values ('c1000000-0000-0000-0000-000000000001','x','y','a1000000-0000-0000-0000-000000000014','submitted')$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('DIRECT_WRITE_MATRIX');
  raise notice 'DIRECT_WRITE_DENIED_ZERO_MUTATION';
end $$;

do $$
declare
  v jsonb;
  v_topic uuid;
  v_item uuid;
  v_member uuid;
  adminish uuid;
  non_officer uuid;
begin
  foreach adminish in array array[
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'a1000000-0000-0000-0000-000000000003'::uuid
  ] loop
    perform pg_temp.as_user(adminish);
    perform pg_temp.expect_fail(
      'ADMINISH_REVIEW',
      $q$select public.council_review_topic(
           '12000000-0000-0000-0000-000000000001',
           'accepted_for_agenda'::public.academic_council_topic_status,
           'nope', null)$q$
    );
    perform pg_temp.expect_fail(
      'ADMINISH_AGENDA',
      $q$select public.council_add_manual_agenda_item(
           '14000000-0000-0000-0000-000000000001', 'nope', null, null)$q$
    );
    perform pg_temp.expect_fail(
      'ADMINISH_FINALIZE',
      $q$select public.council_finalize_meeting_agenda('14000000-0000-0000-0000-000000000001')$q$
    );
    perform pg_temp.expect_fail(
      'ADMINISH_SCHEDULE',
      $q$select public.council_schedule_meeting(
           'c1000000-0000-0000-0000-000000000001', 'nope', now() + interval '1 day',
           null, null, null, null)$q$
    );
  end loop;
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('ADMIN_BYPASS_REMOVED');

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000012');
  perform pg_temp.expect_fail(
    'OTHER_CHAIR_REVIEW',
    $q$select public.council_review_topic(
         '12000000-0000-0000-0000-000000000001',
         'accepted_for_agenda'::public.academic_council_topic_status,
         'nope', null)$q$
  );
  perform pg_temp.expect_fail(
    'OTHER_CHAIR_FINALIZE',
    $q$select public.council_finalize_meeting_agenda('14000000-0000-0000-0000-000000000001')$q$
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'SECRETARY_FINALIZE',
    $q$select public.council_finalize_meeting_agenda('14000000-0000-0000-0000-000000000001')$q$
  );
  perform pg_temp.expect_fail(
    'SECRETARY_SCHEDULE',
    $q$select public.council_schedule_meeting(
         'c1000000-0000-0000-0000-000000000001', 'nope', now() + interval '2 day',
         null, null, null, null)$q$
  );

  foreach non_officer in array array[
    'a1000000-0000-0000-0000-000000000014'::uuid,
    'a1000000-0000-0000-0000-000000000015'::uuid,
    'a1000000-0000-0000-0000-000000000016'::uuid,
    'a1000000-0000-0000-0000-000000000017'::uuid
  ] loop
    perform pg_temp.as_user(non_officer);
    perform pg_temp.expect_fail(
      'NON_OFFICER_REVIEW',
      $q$select public.council_review_topic(
           '12000000-0000-0000-0000-000000000001',
           'accepted_for_agenda'::public.academic_council_topic_status,
           'nope', null)$q$
    );
    perform pg_temp.expect_fail(
      'NON_OFFICER_AGENDA',
      $q$select public.council_add_manual_agenda_item(
           '14000000-0000-0000-0000-000000000001', 'nope', null, null)$q$
    );
  end loop;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000015');
  perform pg_temp.expect_fail(
    'VIEWER_SUBMIT',
    $q$select public.council_submit_topic(
         'c1000000-0000-0000-0000-000000000001', 'viewer topic', 'body', null)$q$
  );

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  perform pg_temp.expect_fail(
    'OWNER_DRAFT_ON_SUBMITTED',
    $q$select public.council_update_own_topic_draft(
         '12000000-0000-0000-0000-000000000001', 'hack title', 'hack body', null)$q$
  );

  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('NEGATIVE_RPC_MATRIX');
  raise notice 'NEGATIVE_MATRIX_ZERO_MUTATION';

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  v := public.council_submit_topic(
    'c1000000-0000-0000-0000-000000000001', 'member topic', 'member body', null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'MEMBER_SUBMIT_FAILED';
  end if;

  v := public.council_update_own_topic_draft(
    '12000000-0000-0000-0000-000000000002', 'draft updated', 'body updated', 'cat'
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'OWNER_DRAFT_UPDATE_FAILED';
  end if;
  if exists (
    select 1 from public.academic_council_topics
    where id = '12000000-0000-0000-0000-000000000002'
      and (status <> 'draft'
           or submitted_by <> 'a1000000-0000-0000-0000-000000000014'
           or council_id <> 'c1000000-0000-0000-0000-000000000001')
  ) then
    raise exception 'OWNER_DRAFT_IMMUTABLE_FIELDS_BROKEN';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.council_review_topic(
    '12000000-0000-0000-0000-000000000001',
    'accepted_for_agenda'::public.academic_council_topic_status,
    'ok',
    '14000000-0000-0000-0000-000000000001'
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'SECRETARY_REVIEW_FAILED';
  end if;

  v := public.council_add_topic_to_agenda(
    '14000000-0000-0000-0000-000000000001',
    '12000000-0000-0000-0000-000000000003',
    null,
    null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'SECRETARY_ADD_TOPIC_AGENDA_FAILED';
  end if;
  v_item := (v->>'agenda_item_id')::uuid;

  v := public.council_update_agenda_item(v_item, 'updated agenda title', null, null, null);
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'SECRETARY_UPDATE_AGENDA_FAILED';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_schedule_meeting(
    'c1000000-0000-0000-0000-000000000001',
    'Chair scheduled',
    now() + interval '14 days',
    'Hall',
    null,
    null,
    null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'CHAIR_SCHEDULE_FAILED';
  end if;

  v := public.council_finalize_meeting_agenda('14000000-0000-0000-0000-000000000001');
  if coalesce((v->>'ok')::boolean, false) is not true
     or (v->>'status') is distinct from 'agenda_ready' then
    raise exception 'CHAIR_FINALIZE_FAILED';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000002');
  v := public.council_link_membership(
    'c1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000018',
    'member'::public.academic_council_member_role
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'ADMIN_MEMBERSHIP_PROVISION_FAILED';
  end if;
  v_member := (v->>'membership_id')::uuid;
  v := public.council_deactivate_membership(v_member);
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'ADMIN_MEMBERSHIP_DEACTIVATE_FAILED';
  end if;

  perform pg_temp.reset_role();
  raise notice 'RPC_CONTRACT_POSITIVE_NEGATIVE_PASS';
  raise notice 'ADMIN_BYPASS_VERDICT_REMOVED';
  raise notice 'TOPIC_OWNER_ALLOWLIST_PASS';
  raise notice 'ACADEMIC_COUNCILS_C0_WRITE_SURFACE_HARDENING_VERIFIER_PASS';
end $$;

rollback;
