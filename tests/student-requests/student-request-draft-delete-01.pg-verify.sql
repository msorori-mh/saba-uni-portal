-- STUDENT-REQUEST-DRAFT-DELETE-01 — functional verifier (fail-closed).
\set ON_ERROR_STOP on
create or replace function pg_temp.act(p uuid) returns void language sql as
$$ select set_config('request.jwt.claim.sub', coalesce(p::text, ''), false) $$;
create or replace function pg_temp.must_fail(p_sql text, p_like text) returns void
language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm not like '%' || p_like || '%' then
      raise exception 'WRONG_ERROR for [%]: got [%]', p_sql, sqlerrm;
    end if;
    return;
  end;
  raise exception 'EXPECTED_FAILURE_DID_NOT_HAPPEN: %', p_sql;
end $$;

do $$
declare
  u1 uuid := 'a0000000-0000-4000-8000-000000000001';
  u2 uuid := 'a0000000-0000-4000-8000-000000000002';
  s1 uuid := 'e0000000-0000-4000-8000-000000000001';
  s2 uuid := 'e0000000-0000-4000-8000-000000000002';
  d_plain uuid; d_children uuid; d_other uuid; r_submitted uuid; r_history uuid; r_flagged uuid;
begin
  insert into auth.users(id) values (u1), (u2);
  insert into public.student_profiles(id, user_id) values (s1, u1), (s2, u2);
  insert into public.student_requests(student_profile_id, request_type) values (s1, 'excused_absence') returning id into d_plain;
  insert into public.student_requests(student_profile_id, request_type) values (s1, 'enrollment_suspension') returning id into d_children;
  insert into public.b1_draft_mutation_idempotency(idempotency_key, request_id) values ('k1', d_children);
  insert into public.student_request_attachment_uploads(student_request_id) values (d_children);
  insert into public.student_requests(student_profile_id, request_type) values (s2, 'excused_absence') returning id into d_other;
  insert into public.student_requests(student_profile_id, request_type, status, submitted_at)
    values (s1, 'enrollment_certificate', 'submitted', now()) returning id into r_submitted;
  insert into public.student_requests(student_profile_id, request_type) values (s1, 'file_withdrawal') returning id into r_history;
  insert into public.student_request_workflow_events(student_request_id) values (r_history);
  -- status says draft but it was submitted once: must be kept.
  insert into public.student_requests(student_profile_id, request_type, status, submitted_at)
    values (s1, 'final_chance', 'draft', now()) returning id into r_flagged;

  -- The reason the RPC exists: a direct delete is blocked by the child rows.
  perform pg_temp.must_fail(format('delete from public.student_requests where id = %L', d_children), 'foreign key');

  -- Anonymous and foreign callers.
  perform pg_temp.act(null);
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', d_plain), 'SR_DRAFT_DELETE_DENIED');
  perform pg_temp.act(u2);
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', d_plain), 'SR_DRAFT_DELETE_NOT_FOUND');

  -- Owner: non-drafts and drafts with history are refused.
  perform pg_temp.act(u1);
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', r_submitted), 'SR_DRAFT_DELETE_NOT_A_DRAFT');
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', r_flagged), 'SR_DRAFT_DELETE_NOT_A_DRAFT');
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', r_history), 'SR_DRAFT_DELETE_HAS_HISTORY');
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', d_other), 'SR_DRAFT_DELETE_NOT_FOUND');
  perform pg_temp.must_fail(format('select public.delete_my_student_request_draft(%L)', gen_random_uuid()), 'SR_DRAFT_DELETE_NOT_FOUND');

  -- Owner: own drafts are deleted, with their draft-only child rows.
  if not public.delete_my_student_request_draft(d_plain) then raise exception 'plain draft not deleted'; end if;
  if not public.delete_my_student_request_draft(d_children) then raise exception 'draft with children not deleted'; end if;
  perform pg_temp.act(null);
  if exists (select 1 from public.student_requests where id in (d_plain, d_children)) then
    raise exception 'drafts still present';
  end if;
  if exists (select 1 from public.b1_draft_mutation_idempotency)
     or exists (select 1 from public.student_request_attachment_uploads) then
    raise exception 'draft child rows still present';
  end if;
  if (select count(*) from public.student_requests) <> 4 then
    raise exception 'unrelated requests were touched';
  end if;

  if has_function_privilege('anon', 'public.delete_my_student_request_draft(uuid)', 'execute') then
    raise exception 'anon must not execute the RPC';
  end if;
  raise notice 'STUDENT_REQUEST_DRAFT_DELETE_01_VERIFIER: PASS';
end $$;
