-- COURSE-SESSION-EXECUTION-INTERNAL-DATA-PRIVACY-01
-- (formerly "INTERNAL-NOTES-PRIVACY"; scope corrected to all internal execution data)
-- Status: DRAFT — corrected per APPROVED_PRODUCTION_FIX_AND_CLOSE_COURSE_SESSION_EXECUTION_PRIVACY_01.
-- Blocker recorded by: PORTAL-FINAL-WEB-GO-LIVE-AND-E2E-01 (Phase 6 security matrix).
--
-- Defect: public.course_session_executions carries a full table-level SELECT grant
-- to `authenticated`, and RLS policy cdp_exec_select allows every viewer of the
-- section (enrolled students included). Internal execution data — notably
-- `reason` and `notes` — is therefore readable by students through the Data API,
-- even though the authoritative student-facing projection
-- public.cdp_get_section_plan(...) returns reason = NULL and notes = NULL for
-- non-managers. UI hiding is not an authorization boundary.
--
-- Consumer preflight: no browser/mobile client issues a direct PostgREST query
-- against public.course_session_executions (all reads/writes go through the
-- cdp_* SECURITY DEFINER RPCs). The grant below is therefore intentionally the
-- minimal student-safe subset mirroring the RPC projection; faculty/admin
-- internal fields continue to be served only by the authorized RPCs.
--
-- Column classification:
--   STUDENT-SAFE : id, plan_session_id, status, execution_date,
--                  compensation_date, recorded_at
--   INTERNAL     : reason, notes, recorded_by, previous_status,
--                  created_at, updated_at, compensation_recorded_at
--
-- ACL-only, forward-only: no data is modified, no RLS policy is broadened,
-- no bypass is created, service_role access is retained.

BEGIN;

REVOKE SELECT ON public.course_session_executions FROM authenticated;

GRANT SELECT (
  id,
  plan_session_id,
  status,
  execution_date,
  compensation_date,
  recorded_at
) ON public.course_session_executions TO authenticated;

GRANT ALL ON public.course_session_executions TO service_role;

COMMIT;

-- POST-APPLY VERIFY
-- 1) has_column_privilege('authenticated', ..., 'notes'|'reason'|'recorded_by'
--    |'previous_status'|'created_at'|'updated_at'|'compensation_recorded_at','SELECT') = false
-- 2) has_column_privilege('authenticated', ..., 'status'|'execution_date'
--    |'compensation_date'|'recorded_at'|'id'|'plan_session_id','SELECT') = true
-- 3) Student REST read of ?select=notes and ?select=reason must fail (42501);
--    ?select=status must succeed subject to RLS.
-- 4) Faculty lecture-execution screen must still show and save internal notes via RPC.
