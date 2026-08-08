-- ACADEMIC-COUNCILS-C0-C9-PRODUCTION-READINESS-PACKAGE-LONGRUN-09
-- Production READ-ONLY preflight before C0 apply.
-- No DML, no RPC mutation, no production write.
-- Expect: READY_FOR_APPLY_C0 or exact HOLD exception.

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_missing text[];
  v_c0_funcs text[];
  v_promoted_in_ledger text[];
  v_bucket text;
  v_flag_note text := 'NO_FLAG_CONTRACT_UI_UNGATED';
  v_council_tables text[] := ARRAY[
    'academic_councils',
    'academic_council_members',
    'academic_council_meetings',
    'academic_council_topics',
    'academic_council_agenda_items',
    'academic_council_minutes',
    'academic_council_decisions'
  ];
  v_c0_plus text[] := ARRAY[
    'council_schedule_meeting',
    'council_transition_meeting',
    'record_council_meeting_attendance',
    'open_council_session',
    'draft_council_minutes',
    'issue_council_decision',
    'archive_council_meeting',
    'create_council_notification'
  ];
BEGIN
  -- 1) Migration ledger: none of the promoted C0–C9 migrations may already be recorded.
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    SELECT array_agg(name ORDER BY name)
    INTO v_promoted_in_ledger
    FROM supabase_migrations.schema_migrations
    WHERE name IN (
      '20260808120000_councils_c0_write_surface_hardening_01',
      '20260808121000_councils_c1_meeting_state_machine_01',
      '20260808122000_councils_c2_topic_intake_review_01',
      '20260808130000_councils_c3_attendance_quorum_01',
      '20260808140000_councils_c4_session_voting_01',
      '20260808150000_councils_c5_minutes_lifecycle_01',
      '20260808160000_councils_c6_decisions_followup_01',
      '20260808170000_councils_c7_audit_archive_01',
      '20260808171000_councils_c0_c8_final_security_closure_01',
      '20260808180000_councils_c9_notifications_reporting_01'
    );
    IF v_promoted_in_ledger IS NOT NULL THEN
      RAISE EXCEPTION 'HOLD: promoted C0-C9 migration(s) already in ledger: %', array_to_string(v_promoted_in_ledger, ', ');
    END IF;
  ELSE
    RAISE NOTICE 'PREFLIGHT_INFO: supabase_migrations.schema_migrations absent (disposable PG17 OK)';
  END IF;

  -- 2) Council predecessor schema must exist (MVP create+harden chain).
  SELECT array_agg(t)
  INTO v_missing
  FROM unnest(v_council_tables) t
  WHERE to_regclass('public.' || t) IS NULL;
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: predecessor council tables missing: %', array_to_string(v_missing, ', ');
  END IF;

  -- 3) Helper membership functions from MVP.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_council_role'
  ) THEN
    RAISE EXCEPTION 'HOLD: predecessor function has_council_role missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_council_admin'
  ) THEN
    RAISE EXCEPTION 'HOLD: predecessor function is_council_admin missing';
  END IF;

  -- 4) C0+ objects must NOT already exist (mixed/partial apply detection).
  SELECT array_agg(f)
  INTO v_c0_funcs
  FROM unnest(v_c0_plus) f
  WHERE EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );
  IF v_c0_funcs IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C0+ council RPCs already present (partial/mixed state): %', array_to_string(v_c0_funcs, ', ');
  END IF;

  IF to_regclass('public.academic_council_meeting_transition_events') IS NOT NULL
     OR to_regclass('public.academic_council_quorum_policies') IS NOT NULL
     OR to_regclass('public.academic_council_votes') IS NOT NULL
     OR to_regclass('public.academic_council_audit_events') IS NOT NULL
     OR to_regclass('public.academic_council_notifications') IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: C1+ council extension tables already present; resolve mixed state before C0';
  END IF;

  -- 5) Roles / membership inventory (read-only advisory counts).
  IF to_regclass('public.academic_council_members') IS NOT NULL THEN
    RAISE NOTICE 'PREFLIGHT_MEMBERSHIP_ROWS: %', (SELECT count(*) FROM public.academic_council_members);
    RAISE NOTICE 'PREFLIGHT_ACTIVE_MEMBERSHIPS: %', (
      SELECT count(*) FROM public.academic_council_members WHERE is_active
    );
  END IF;

  -- 6) Current policies on predecessor tables (inventory).
  RAISE NOTICE 'PREFLIGHT_COUNCIL_POLICY_COUNT: %', (
    SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'academic_council%'
  );

  -- 7) Feature flag contract (source-level; DB cannot read portal-features.ts).
  RAISE NOTICE 'PREFLIGHT_FLAGS: % — activation package docs/migration-drafts/COUNCILS-C0-C9-FLAGS-01.md remains OFF', v_flag_note;

  -- 8) Storage / attachments predecessor (if topic attachments bucket/table exist).
  IF to_regclass('public.academic_council_topic_attachments') IS NOT NULL THEN
    RAISE NOTICE 'PREFLIGHT_ATTACHMENTS_TABLE: present';
  ELSE
    RAISE NOTICE 'PREFLIGHT_ATTACHMENTS_TABLE: absent (OK if attachments migration not in this environment)';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    SELECT id INTO v_bucket FROM storage.buckets WHERE id ILIKE '%council%' LIMIT 1;
    IF v_bucket IS NOT NULL THEN
      RAISE NOTICE 'PREFLIGHT_STORAGE_BUCKET: %', v_bucket;
    ELSE
      RAISE NOTICE 'PREFLIGHT_STORAGE_BUCKET: none matching council*';
    END IF;
  ELSE
    RAISE NOTICE 'PREFLIGHT_STORAGE: storage.buckets absent (disposable PG17 OK)';
  END IF;

  -- 9) Notification dependency (C9 will extend notifications.type check).
  IF to_regclass('public.notifications') IS NOT NULL THEN
    RAISE NOTICE 'PREFLIGHT_NOTIFICATIONS_TABLE: present';
  ELSE
    RAISE NOTICE 'PREFLIGHT_NOTIFICATIONS_TABLE: absent — C9 apply will require notifications predecessor or fail-closed';
  END IF;

  -- 10) Report dependency: no C9 report RPCs yet.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'get_council_report_%'
  ) THEN
    RAISE EXCEPTION 'HOLD: get_council_report_* already present before C9';
  END IF;

  RAISE NOTICE 'READY_FOR_APPLY_C0';
END $$;

SELECT 'READY_FOR_APPLY_C0' AS preflight_status;
