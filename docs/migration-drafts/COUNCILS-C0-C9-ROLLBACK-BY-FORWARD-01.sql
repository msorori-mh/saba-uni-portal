-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Rollback-by-forward decision support (READ-ONLY classifier).
-- No DROP TABLE, no truncate, no destructive reset.
-- Classifies safe HOLD / mixed state after a mid-chain stop.
-- Any forward remediation SQL is a SEPARATE governed artifact.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_c0 boolean := false;
  v_c1 boolean := false;
  v_c2 boolean := false;
  v_c3 boolean := false;
  v_c4 boolean := false;
  v_c5 boolean := false;
  v_c6 boolean := false;
  v_c7 boolean := false;
  v_c8 boolean := false;
  v_c9 boolean := false;
  v_has_ledger boolean := false;
  v_votes_table boolean;
  v_notifications boolean;
  v_decision_fsm boolean;
  v_last text;
BEGIN
  v_has_ledger := to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;

  IF v_has_ledger THEN
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808120000_councils_c0_write_surface_hardening_01') INTO v_c0;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808121000_councils_c1_meeting_state_machine_01') INTO v_c1;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808122000_councils_c2_topic_intake_review_01') INTO v_c2;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808130000_councils_c3_attendance_quorum_01') INTO v_c3;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808140000_councils_c4_session_voting_01') INTO v_c4;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808150000_councils_c5_minutes_lifecycle_01') INTO v_c5;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808160000_councils_c6_decisions_followup_01') INTO v_c6;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808170000_councils_c7_audit_archive_01') INTO v_c7;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808171000_councils_c0_c8_final_security_closure_01') INTO v_c8;
    SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE name = '20260808180000_councils_c9_notifications_reporting_01') INTO v_c9;
  END IF;

  -- Object probes (tolerate missing ledger in disposable PG17 by using objects).
  IF NOT v_has_ledger THEN
    v_c0 := EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'council_schedule_meeting'
    );
    v_c1 := to_regclass('public.academic_council_meeting_transition_events') IS NOT NULL;
    v_c2 := EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'council_resubmit_topic'
    );
    v_c3 := to_regclass('public.academic_council_quorum_policies') IS NOT NULL;
    v_c4 := to_regclass('public.academic_council_votes') IS NOT NULL;
    v_c5 := to_regclass('public.academic_council_minutes_amendments') IS NOT NULL;
    v_c6 := EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'issue_council_decision'
    );
    v_c7 := to_regclass('public.academic_council_audit_events') IS NOT NULL;
    v_c8 := EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'council_decision_transition_is_legal'
    );
    v_c9 := to_regclass('public.academic_council_notifications') IS NOT NULL;
  END IF;

  v_votes_table := to_regclass('public.academic_council_votes') IS NOT NULL;
  v_notifications := to_regclass('public.academic_council_notifications') IS NOT NULL;
  v_decision_fsm := EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'council_decision_transition_is_legal'
  );

  -- Mixed-state: later object without earlier ledger/object chain.
  IF v_notifications AND NOT v_c8 THEN
    RAISE EXCEPTION 'HOLD_MIXED_PARTIAL_STATE: C9 notifications present without C8 security closure evidence. DO NOT DROP. Open forward remediation.';
  END IF;
  IF v_votes_table AND NOT v_c3 THEN
    RAISE EXCEPTION 'HOLD_MIXED_PARTIAL_STATE: votes present without C3 attendance evidence. DO NOT DROP.';
  END IF;
  IF v_c9 AND NOT (v_c0 AND v_c1 AND v_c2 AND v_c3 AND v_c4 AND v_c5 AND v_c6 AND v_c7 AND v_c8) THEN
    RAISE EXCEPTION 'HOLD_MIXED_PARTIAL_STATE: C9 marked applied without full C0-C8 predecessors. DO NOT DROP.';
  END IF;

  IF v_c9 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: full C0-C9 chain present. Flags remain OFF. No rollback needed.';
    RETURN;
  END IF;

  IF v_c8 THEN
    v_last := 'SAFE_HOLD_BEFORE_C9';
    RAISE NOTICE 'RECOVERY_STATE_SAFE: % — resume with C9 apply-one only. No DROP. Flags OFF.', v_last;
    RETURN;
  END IF;

  IF v_c7 THEN
    -- Prefer object truth for closure even if ledger lagging.
    IF v_decision_fsm THEN
      RAISE EXCEPTION 'HOLD_MIXED_PARTIAL_STATE: C8 objects present but C8 ledger false/absent. Inspect before re-apply.';
    END IF;
    v_last := 'SAFE_HOLD_AFTER_C7_BEFORE_C8';
    RAISE NOTICE 'RECOVERY_STATE_SAFE: % — resume with C8 security closure. Do not run production vote/decision load. Flags OFF.', v_last;
    RETURN;
  END IF;

  IF v_c6 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C6 — resume C7. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c5 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C5 — resume C6. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c4 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C4 — resume C5. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c3 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C3 — resume C4. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c2 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C2 — resume C3. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c1 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C1 — resume C2. No DROP. Flags OFF.';
    RETURN;
  END IF;
  IF v_c0 THEN
    RAISE NOTICE 'RECOVERY_STATE_SAFE: SAFE_HOLD_AFTER_C0 — resume C1. No DROP. Flags OFF.';
    RETURN;
  END IF;

  RAISE NOTICE 'RECOVERY_STATE_SAFE: no promoted C0-C9 steps detected — preflight then C0.';
END $$;

SELECT 'COUNCILS_ROLLBACK_BY_FORWARD_CLASSIFIER_COMPLETE' AS rollback_by_forward_status;
