-- DRAFT MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL FROM THE OWNER
-- Package: STUDENT-REQUEST-DRAFT-DELETE-01
--
-- Owner request (2026-10-07): a student may delete his own request drafts.
--
-- RLS already allows it (policy sr_delete_self: owner + status = 'draft'), but
-- a direct DELETE fails for most drafts because two child tables reference the
-- request without ON DELETE CASCADE (draft idempotency keys, attachment upload
-- rows). This RPC removes those draft-only rows and the request in one
-- transaction, and refuses anything that is not an untouched draft of the
-- caller. Submitted, returned, cancelled or processed requests are never
-- deletable here.
begin;

do $$ begin
  if to_regclass('public.student_requests') is null
     or to_regclass('public.student_profiles') is null then
    raise exception 'SR_DRAFT_DELETE_FOUNDATION_MISSING';
  end if;
end $$;

create or replace function public.delete_my_student_request_draft(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.student_requests;
begin
  if auth.uid() is null then
    raise exception 'SR_DRAFT_DELETE_DENIED' using errcode = '42501';
  end if;

  select sr.* into r
  from public.student_requests sr
  join public.student_profiles sp on sp.id = sr.student_profile_id
  where sr.id = p_request_id and sp.user_id = auth.uid()
  for update of sr;
  -- Unknown and foreign requests are indistinguishable to the caller.
  if r.id is null then
    raise exception 'SR_DRAFT_DELETE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if r.status <> 'draft' or r.submitted_at is not null then
    raise exception 'SR_DRAFT_DELETE_NOT_A_DRAFT' using errcode = '23514';
  end if;

  -- A draft never has runtime, events or documents. If it does, it was
  -- processed at some point and must be kept.
  if exists (select 1 from public.student_request_workflow_steps s where s.student_request_id = r.id)
     or exists (select 1 from public.student_request_workflow_events e where e.student_request_id = r.id)
     or exists (select 1 from public.official_documents d where d.student_request_id = r.id) then
    raise exception 'SR_DRAFT_DELETE_HAS_HISTORY' using errcode = '23514';
  end if;

  if to_regclass('public.b1_draft_mutation_idempotency') is not null then
    delete from public.b1_draft_mutation_idempotency i where i.request_id = r.id;
  end if;
  if to_regclass('public.student_request_attachment_uploads') is not null then
    delete from public.student_request_attachment_uploads a where a.student_request_id = r.id;
  end if;

  delete from public.student_requests sr where sr.id = r.id and sr.status = 'draft';
  return true;
end $$;

revoke all on function public.delete_my_student_request_draft(uuid) from public, anon;
grant execute on function public.delete_my_student_request_draft(uuid) to authenticated;

commit;
