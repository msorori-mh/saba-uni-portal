-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Post-apply READ-ONLY observability checks (catalog + aggregate counts).
-- No DML. No production mutation.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_meetings int := 0;
  v_open_sessions int := 0;
  v_quorum_evals int := 0;
  v_votes int := 0;
  v_minutes int := 0;
  v_decisions int := 0;
  v_notifications int := 0;
  v_audit int := 0;
  v_archived int := 0;
  v_report_funcs int := 0;
BEGIN
  IF to_regclass('public.academic_council_meetings') IS NOT NULL THEN
    SELECT count(*) INTO v_meetings FROM public.academic_council_meetings;
    SELECT count(*) INTO v_archived FROM public.academic_council_meetings WHERE status::text = 'archived';
    BEGIN
      SELECT count(*) INTO v_open_sessions
      FROM public.academic_council_meetings
      WHERE status::text IN ('in_session', 'session_open', 'open');
    EXCEPTION WHEN others THEN
      v_open_sessions := 0;
    END;
  END IF;

  IF to_regclass('public.academic_council_meeting_quorum_evaluations') IS NOT NULL THEN
    SELECT count(*) INTO v_quorum_evals FROM public.academic_council_meeting_quorum_evaluations;
  END IF;

  IF to_regclass('public.academic_council_votes') IS NOT NULL THEN
    SELECT count(*) INTO v_votes FROM public.academic_council_votes;
  END IF;

  IF to_regclass('public.academic_council_minutes') IS NOT NULL THEN
    SELECT count(*) INTO v_minutes FROM public.academic_council_minutes;
  END IF;

  IF to_regclass('public.academic_council_decisions') IS NOT NULL THEN
    SELECT count(*) INTO v_decisions FROM public.academic_council_decisions;
  END IF;

  IF to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    SELECT count(*) INTO v_notifications FROM public.academic_council_notifications;
  END IF;

  IF to_regclass('public.academic_council_audit_events') IS NOT NULL THEN
    SELECT count(*) INTO v_audit FROM public.academic_council_audit_events;
  END IF;

  SELECT count(*) INTO v_report_funcs
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'get_council_report_%';

  RAISE NOTICE 'OBS_MEETING_LIFECYCLE: meetings=% openish=% archived=%', v_meetings, v_open_sessions, v_archived;
  RAISE NOTICE 'OBS_QUORUM: evaluations=%', v_quorum_evals;
  RAISE NOTICE 'OBS_VOTES: rows=%', v_votes;
  RAISE NOTICE 'OBS_MINUTES: rows=%', v_minutes;
  RAISE NOTICE 'OBS_DECISIONS: rows=%', v_decisions;
  RAISE NOTICE 'OBS_NOTIFICATIONS: rows=%', v_notifications;
  RAISE NOTICE 'OBS_AUDIT: rows=%', v_audit;
  RAISE NOTICE 'OBS_ARCHIVE: archived_meetings=%', v_archived;
  RAISE NOTICE 'OBS_REPORTS: get_council_report_* funcs=%', v_report_funcs;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_council_chair_dashboard'
  ) THEN
    RAISE EXCEPTION 'HOLD: observability missing get_council_chair_dashboard (C9 incomplete)';
  END IF;

  RAISE NOTICE 'COUNCILS_OBSERVABILITY_READONLY_PASS';
END $$;

SELECT 'COUNCILS_OBSERVABILITY_READONLY_PASS' AS observability_status;
