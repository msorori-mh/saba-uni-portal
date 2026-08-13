-- COURSE-SESSION-EXECUTION-INTERNAL-NOTES-PRIVACY-01
-- Status: DRAFT — NOT APPLIED TO PRODUCTION.
-- Blocker recorded by: PORTAL-FINAL-WEB-GO-LIVE-AND-E2E-01 (Phase 6 security matrix).
--
-- Defect: public.course_session_executions.notes ("ملاحظات داخلية — لا تظهر للطالب")
-- is readable by any enrolled student through the Data API, because the table
-- carries a full table-level SELECT grant to `authenticated` and the RLS policy
-- cdp_exec_select allows every viewer of the section (students included).
-- The UI hides the column, but UI hiding is not an authorization boundary.
--
-- Fix: column-level SELECT grant that excludes `notes`. Faculty/admin surfaces
-- read the notes through SECURITY DEFINER RPCs, which are unaffected by this
-- change. Forward-only; no data is modified.

BEGIN;

REVOKE SELECT ON public.course_session_executions FROM authenticated;

GRANT SELECT (
  id,
  plan_session_id,
  status,
  execution_date,
  reason,
  compensation_date,
  recorded_by,
  recorded_at,
  created_at,
  updated_at,
  compensation_recorded_at,
  previous_status
) ON public.course_session_executions TO authenticated;

GRANT ALL ON public.course_session_executions TO service_role;

COMMIT;

-- POST-APPLY VERIFY
-- 1) select has_column_privilege('authenticated','public.course_session_executions','notes','SELECT'); -- expect false
-- 2) select has_column_privilege('authenticated','public.course_session_executions','status','SELECT'); -- expect true
-- 3) Student REST read of ?select=notes must fail (42501); ?select=status must succeed.
-- 4) Faculty lecture-execution screen must still show and save internal notes.
