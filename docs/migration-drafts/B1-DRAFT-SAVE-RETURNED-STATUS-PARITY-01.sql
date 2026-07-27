-- B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01
-- SOURCE ONLY — NOT APPLIED. Requires an independent production approval.
--
-- Purpose: allow the owning student to edit a request after it was returned.
-- save_b1_request_draft_for_student currently accepts status = 'draft' only,
-- while the UI and submit path already support returned requests.
--
-- Forward-only. Allowed statuses become exactly:
--   draft | returned | returned_for_completion
-- Every other status (submitted, in_review, completed, rejected, cancelled,
-- archived, ...) keeps the existing opaque deny (B1_DRAFT_ACCESS_DENIED).
-- Ownership, allowlist, stale-version and idempotency behaviour are unchanged.

begin;

do $$
declare
  v_def text;
  v_old constant text := $old$  if v_r.status is distinct from 'draft' then$old$;
  v_new constant text := $new$  if v_r.status is null or v_r.status not in ('draft','returned','returned_for_completion') then$new$;
  v_occurrences integer;
begin
  if to_regprocedure('public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)') is null then
    raise exception 'PREREQ_MISSING: save_b1_request_draft_for_student';
  end if;

  v_def := pg_get_functiondef(
    'public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text)'::regprocedure);

  if position(v_new in v_def) > 0 then
    raise notice 'ALREADY_APPLIED: returned-status parity present';
    return;
  end if;

  v_occurrences := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_occurrences <> 1 then
    raise exception 'AMBIGUOUS_STATUS_GATE: expected exactly 1 occurrence, found %', v_occurrences;
  end if;

  execute replace(v_def, v_old, v_new);
end $$;

-- Grants are unchanged by CREATE OR REPLACE; re-assert the expected surface.
revoke all on function public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text) from public;
grant execute on function public.save_b1_request_draft_for_student(uuid,jsonb,timestamptz,text) to authenticated;

commit;
