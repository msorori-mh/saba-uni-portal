-- ACADEMIC-COUNCILS-C2 topic intake/review verifier (disposable PG17).
-- Transactional: begin … rollback.

begin;

create or replace function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
  execute 'set local role authenticated';
end;
$$;

create or replace function pg_temp.reset_role()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

create or replace function pg_temp.expect_fail(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception '%_UNEXPECTED_SUCCESS', p_label;
  exception
    when insufficient_privilege then null;
    when check_violation then null;
    when sqlstate '42501' then null;
    when sqlstate '28000' then null;
    when sqlstate 'P0001' then null;
  end;
end;
$$;

do $$
begin
  perform pg_temp.reset_role();

  insert into public.academic_councils (id, name, council_type, created_by) values
    ('c1000000-0000-0000-0000-000000000001', 'Council A', 'college', 'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_members
    (id, council_id, user_id, member_role, is_active, active_from, created_by)
  values
    ('e1000000-0000-0000-0000-000000000011', 'c1000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000011', 'chair', true, current_date,
     'a1000000-0000-0000-0000-000000000001'),
    ('e1000000-0000-0000-0000-000000000013', 'c1000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000013', 'secretary', true, current_date,
     'a1000000-0000-0000-0000-000000000001'),
    ('e1000000-0000-0000-0000-000000000014', 'c1000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000014', 'member', true, current_date,
     'a1000000-0000-0000-0000-000000000001'),
    ('e1000000-0000-0000-0000-000000000015', 'c1000000-0000-0000-0000-000000000001',
     'a1000000-0000-0000-0000-000000000015', 'viewer', true, current_date,
     'a1000000-0000-0000-0000-000000000001');

  insert into public.academic_council_meetings (
    id, council_id, meeting_number, title, scheduled_at,
    intake_opens_at, intake_closes_at, status, created_by
  ) values (
    '14000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001',
    1, 'Intake Meeting', now() + interval '1 day',
    now() - interval '1 hour', now() + interval '1 day',
    'intake_open', 'a1000000-0000-0000-0000-000000000011'
  );
end $$;

create temporary table c2_counts as
select
  (select count(*) from public.academic_council_topics) as topics,
  (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
     from public.academic_council_topics) as topics_fp;

create or replace function pg_temp.snapshot_counts()
returns void language plpgsql as $$
begin
  perform pg_temp.reset_role();
  delete from c2_counts;
  insert into c2_counts
  select
    (select count(*) from public.academic_council_topics) as topics,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_topics) as topics_fp;
end;
$$;

create or replace function pg_temp.assert_zero_mutation(p_label text)
returns void language plpgsql as $$
declare
  v_now record;
  v_base record;
begin
  perform pg_temp.reset_role();
  select * into v_base from c2_counts;
  select
    (select count(*) from public.academic_council_topics) as topics,
    (select md5(string_agg(id::text || status::text || coalesce(title,''), ',' order by id))
       from public.academic_council_topics) as topics_fp
  into v_now;
  if v_now is distinct from v_base then
    raise exception '%_MUTATION_LEAK', p_label;
  end if;
end;
$$;

-- Viewer cannot submit
do $$
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000015');
  perform pg_temp.expect_fail(
    'VIEWER_INTAKE',
    $q$select public.council_submit_topic(
         'c1000000-0000-0000-0000-000000000001',
         '14000000-0000-0000-0000-000000000001',
         'Viewer topic title here',
         'body',
         null)$q$
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('VIEWER_INTAKE_DENIED');
  raise notice 'VIEWER_INTAKE_DENIED';
end $$;

-- Admin/dean cannot submit without membership
do $$
declare denied uuid;
begin
  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  foreach denied in array array[
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'a1000000-0000-0000-0000-000000000003'::uuid
  ] loop
    perform pg_temp.as_user(denied);
    perform pg_temp.expect_fail(
      'ADMINISH_INTAKE',
      $q$select public.council_submit_topic(
           'c1000000-0000-0000-0000-000000000001',
           '14000000-0000-0000-0000-000000000001',
           'Adminish topic title xx',
           'body',
           null)$q$
    );
  end loop;
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('ADMINISH_INTAKE_DENIED');
  raise notice 'ADMINISH_INTAKE_DENIED';
end $$;

-- Member submit + secretary prepare + secretary final DENY + chair accept
do $$
declare
  v jsonb;
  v_topic uuid;
begin
  perform pg_temp.reset_role();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  v := public.council_submit_topic(
    'c1000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Member topic for review flow',
    'topic body',
    null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'MEMBER_SUBMIT_FAILED';
  end if;
  v_topic := (v->>'topic_id')::uuid;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.council_review_topic(
    v_topic,
    'under_review'::public.academic_council_topic_status,
    'taking review',
    'submitted'::public.academic_council_topic_status
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'SECRETARY_PREPARE_FAILED';
  end if;

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  perform pg_temp.expect_fail(
    'SECRETARY_FINAL',
    format(
      $q$select public.council_review_topic(
           %L::uuid,
           'accepted_for_agenda'::public.academic_council_topic_status,
           'nope',
           'under_review'::public.academic_council_topic_status)$q$,
      v_topic
    )
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('SECRETARY_FINAL_DENIED');
  raise notice 'SECRETARY_FINAL_DENIED';

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_review_topic(
    v_topic,
    'accepted_for_agenda'::public.academic_council_topic_status,
    'accepted',
    'under_review'::public.academic_council_topic_status
  );
  if (v->>'status') is distinct from 'accepted_for_agenda' then
    raise exception 'CHAIR_ACCEPT_FAILED';
  end if;
  raise notice 'CHAIR_ACCEPT_PASS';
end $$;

-- Stale expected status + return for completion + resubmit
do $$
declare
  v jsonb;
  v_topic uuid;
begin
  perform pg_temp.reset_role();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  v := public.council_submit_topic(
    'c1000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Second topic for completion loop',
    'body',
    null
  );
  v_topic := (v->>'topic_id')::uuid;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_review_topic(
    v_topic,
    'under_review'::public.academic_council_topic_status,
    null,
    'submitted'::public.academic_council_topic_status
  );

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'STALE_REVIEW',
    format(
      $q$select public.council_review_topic(
           %L::uuid,
           'needs_completion'::public.academic_council_topic_status,
           'stale',
           'submitted'::public.academic_council_topic_status)$q$,
      v_topic
    )
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('STALE_REVIEW_DENIED');
  raise notice 'STALE_REVIEW_DENIED';

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000013');
  v := public.council_review_topic(
    v_topic,
    'needs_completion'::public.academic_council_topic_status,
    'please complete section 2',
    'under_review'::public.academic_council_topic_status
  );
  if (v->>'status') is distinct from 'needs_completion' then
    raise exception 'NEEDS_COMPLETION_FAILED';
  end if;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  perform public.council_update_own_topic_draft(v_topic, 'Second topic completed', 'updated body', null);
  v := public.council_resubmit_topic(v_topic);
  if (v->>'status') is distinct from 'submitted' then
    raise exception 'RESUBMIT_FAILED';
  end if;
  raise notice 'COMPLETION_LOOP_PASS';
end $$;

-- Agenda selectable only accepted_for_agenda
do $$
declare
  v jsonb;
  v_accepted uuid;
  v_submitted uuid;
begin
  select id into v_accepted
  from public.academic_council_topics
  where status = 'accepted_for_agenda'
  limit 1;

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000014');
  v := public.council_submit_topic(
    'c1000000-0000-0000-0000-000000000001',
    '14000000-0000-0000-0000-000000000001',
    'Submitted only not for agenda',
    'body',
    null
  );
  v_submitted := (v->>'topic_id')::uuid;

  -- Close intake via chair transition so agenda write state allows add.
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform public.council_transition_meeting(
    '14000000-0000-0000-0000-000000000001',
    'intake_open'::public.academic_council_meeting_status,
    'intake_closed'::public.academic_council_meeting_status,
    '{}'::jsonb
  );

  perform pg_temp.reset_role();
  perform pg_temp.snapshot_counts();
  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  perform pg_temp.expect_fail(
    'SUBMITTED_TO_AGENDA',
    format(
      $q$select public.council_add_topic_to_agenda(%L::uuid, %L::uuid, 1, null)$q$,
      '14000000-0000-0000-0000-000000000001',
      v_submitted
    )
  );
  perform pg_temp.reset_role();
  perform pg_temp.assert_zero_mutation('SUBMITTED_AGENDA_DENIED');
  raise notice 'SUBMITTED_AGENDA_DENIED';

  perform pg_temp.as_user('a1000000-0000-0000-0000-000000000011');
  v := public.council_add_topic_to_agenda(
    '14000000-0000-0000-0000-000000000001',
    v_accepted,
    1,
    null
  );
  if coalesce((v->>'ok')::boolean, false) is not true then
    raise exception 'ACCEPTED_AGENDA_ADD_FAILED';
  end if;
  raise notice 'ACCEPTED_AGENDA_PASS';
end $$;

do $$
begin
  raise notice 'ACADEMIC_COUNCILS_C2_TOPIC_INTAKE_REVIEW_VERIFIER_PASS';
end $$;

rollback;
