-- ACADEMIC-COUNCILS-LEGACY-PRODUCTION-TO-C0-C9-RECONCILIATION-LONGRUN-13
-- COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-V2
-- ============================================================================
-- Production READ-ONLY preflight BEFORE reconciliation/C0 apply.
-- (or disposable PG17 with full legacy predecessors).
--
-- MODE: catalog reads + assertions only. No DML.
-- Zero INSERT/UPDATE/DELETE/TRUNCATE/MERGE.
-- Zero CREATE/ALTER/DROP (including temp tables).
-- Zero GRANT/REVOKE.
-- Fail-closed: any unexpected council object/policy/function drift
-- raises EXCEPTION 'HOLD: ...'.
--
-- Supported prestates:
--   LEGACY_SUPPORTED_EXACT -> 8 tables + 5 enums + 16 functions + 23 public
--                             policies + 2 storage policies + fingerprint match
--                             (canonical production prestate).
--   LEGACY_VARIANT_HOLD    -> legacy-like but fingerprint or inventory drift.
--   PARTIAL_NEW_CHAIN      -> some C0+ RPCs/functions or C1+ tables exist.
--   FULL_NEW_CHAIN         -> promoted C0-C9 chain already recorded in ledger.
--   UNKNOWN_UNSAFE         -> anything else (HOLD).
--
-- Predecessor sources (inventory pins):
--   20260703192337_*  MVP create (tables, enums, helpers, policies, indexes)
--   20260703194033_*  MVP harden (ACL tighten; NO FORCE RLS)
--   20260704200326_*  membership-on-date / topic submit helpers (policy refresh)
--   20260705012437_* / 20260708120000_*  topic attachments (optional predecessor)
--   20260705232119_* / 20260710120000_*  schedule helpers
--   20260705023313_* / 20260709120000_*  department council seed (idempotent)
--
-- Post-C9 ACL contract (document only; objects must NOT exist yet):
--   create_council_notification / get_council_notification_recipients /
--   dispatch_council_notification -> EXECUTE service_role only
--     (REVOKED from PUBLIC, anon, authenticated)
--   get_my_council_notifications / acknowledge_council_notification /
--   get_council_report_% / dashboard helpers -> EXECUTE authenticated + service_role
--     (REVOKED from PUBLIC, anon)
-- ============================================================================

\set ON_ERROR_STOP on

DO $$
DECLARE
  v_missing text[];
  v_extra text[];
  v_promoted_in_ledger text[];
  v_fn text;
  v_oid oid;
  v_has_auth boolean;
  v_has_anon boolean;
  v_search text;
  v_flag_note text := 'NO_FLAG_CONTRACT_UI_UNGATED';
  v_attachments_present boolean;
  v_exp_count int;
  v_hit_count int;
  v_state_classification text;
  v_enum_name text;
  v_expected_labels text[];
  -- Production target fingerprint.  Operators may override via
  -- SET councils.fingerprint_expected = '...' for disposable replicas.
  -- In production (supabase_migrations.schema_migrations present) the evidence
  -- file value is authoritative.  In disposable replicas we self-match so the
  -- algorithm is still exercised without requiring the undocumented production
  -- normalization.
  v_fingerprint_expected text;
  v_fingerprint_actual text;
  v_fingerprint_input text;

  -- Promoted C0-C9 migration names (for ledger classification).
  v_promoted_migrations text[] := ARRAY[
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
  ];

  -- Required predecessor tables (MVP create).
  v_required_tables text[] := ARRAY[
    'academic_councils',
    'academic_council_members',
    'academic_council_meetings',
    'academic_council_topics',
    'academic_council_agenda_items',
    'academic_council_minutes',
    'academic_council_decisions'
  ];

  -- Optional predecessor table (attachments migration).
  v_optional_table text := 'academic_council_topic_attachments';

  -- C1+ extension tables that must NOT exist before C0.
  v_forbidden_tables text[] := ARRAY[
    'academic_council_meeting_transition_events',
    'academic_council_quorum_policies',
    'academic_council_votes',
    'academic_council_vote_results',
    'academic_council_audit_events',
    'academic_council_notifications',
    'academic_council_meeting_attendance',
    'academic_council_meeting_attendance_rolls',
    'academic_council_meeting_quorum_evaluations',
    'academic_council_attendance_audit_events',
    'academic_council_minutes_amendments'
  ];

  -- Required membership / schedule helpers (MVP + schedule helpers).
  v_required_helpers text[] := ARRAY[
    'is_council_admin',
    'is_council_member',
    'has_council_role',
    'can_manage_council',
    'can_write_council_agenda',
    'can_schedule_council_meeting'
  ];

  -- Allowlisted public functions with proname LIKE '%council%'
  -- (MVP helpers + triggers + schedule helper + membership-date helpers
  --  + optional attachment helpers from 20260705012437 / 20260708120000).
  v_allowed_council_fns text[] := ARRAY[
    'is_council_admin',
    'is_council_member',
    'has_council_role',
    'can_manage_council',
    'can_write_council_agenda',
    'can_schedule_council_meeting',
    'was_council_member_on',
    'can_submit_council_topic',
    'tg_academic_councils_touch_updated_at',
    'tg_councils_validate_department_binding',
    'tg_minutes_block_locked_edits',
    'council_topic_attachment_count',
    'can_add_council_topic_attachment',
    'can_read_council_topic_attachment',
    'can_upload_council_topic_attachment',
    'tg_enforce_council_topic_attachment'
  ];

  -- C0+ write / notification / report RPCs must be absent (partial apply).
  v_forbidden_fns text[] := ARRAY[
    'council_schedule_meeting',
    'council_transition_meeting',
    'record_council_meeting_attendance',
    'open_council_session',
    'draft_council_minutes',
    'issue_council_decision',
    'archive_council_meeting',
    'create_council_notification',
    'dispatch_council_notification',
    'get_council_notification_recipients',
    'get_my_council_notifications',
    'acknowledge_council_notification'
  ];

  -- Exact MVP policy inventory encoded as "tablename|policyname|cmd".
  -- All policies are TO authenticated only (roles = {authenticated}).
  -- Source: 20260703192337 MVP create (schedule helpers ALTER policy bodies only).
  v_expected_policies text[] := ARRAY[
    'academic_councils|councils_select|SELECT',
    'academic_councils|councils_insert_admin|INSERT',
    'academic_councils|councils_update_admin_or_chair|UPDATE',
    'academic_council_members|council_members_select|SELECT',
    'academic_council_members|council_members_insert|INSERT',
    'academic_council_members|council_members_update|UPDATE',
    'academic_council_meetings|meetings_select|SELECT',
    'academic_council_meetings|meetings_insert|INSERT',
    'academic_council_meetings|meetings_update|UPDATE',
    'academic_council_topics|topics_select|SELECT',
    'academic_council_topics|topics_insert_member|INSERT',
    'academic_council_topics|topics_update_owner_draft|UPDATE',
    'academic_council_agenda_items|agenda_select|SELECT',
    'academic_council_agenda_items|agenda_insert|INSERT',
    'academic_council_agenda_items|agenda_update|UPDATE',
    'academic_council_minutes|minutes_select|SELECT',
    'academic_council_minutes|minutes_insert_secretary|INSERT',
    'academic_council_minutes|minutes_update_before_lock|UPDATE',
    'academic_council_decisions|decisions_select|SELECT',
    'academic_council_decisions|decisions_insert|INSERT',
    'academic_council_decisions|decisions_update|UPDATE'
  ];

  -- Required legacy enums and exact label inventories.
  v_required_enums jsonb := jsonb_build_array(
    jsonb_build_object('name', 'academic_council_type', 'labels', jsonb_build_array('college', 'department')),
    jsonb_build_object('name', 'academic_council_member_role', 'labels', jsonb_build_array('chair', 'vice_chair', 'secretary', 'member', 'viewer')),
    jsonb_build_object('name', 'academic_council_meeting_status', 'labels', jsonb_build_array('scheduled', 'intake_open', 'intake_closed', 'agenda_ready', 'in_session', 'minutes_draft', 'minutes_locked', 'archived', 'cancelled')),
    jsonb_build_object('name', 'academic_council_topic_status', 'labels', jsonb_build_array('draft', 'submitted', 'under_review', 'needs_completion', 'accepted_for_agenda', 'deferred', 'rejected', 'decided', 'closed')),
    jsonb_build_object('name', 'academic_council_decision_status', 'labels', jsonb_build_array('issued', 'assigned', 'in_progress', 'partially_completed', 'completed', 'delayed', 'cancelled'))
  );
BEGIN
  -- -------------------------------------------------------------------------
  -- 0) State classification before detailed assertions.
  -- -------------------------------------------------------------------------
  v_hit_count := 0;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    SELECT count(*)::int
    INTO v_hit_count
    FROM unnest(v_promoted_migrations) AS m(name)
    WHERE EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.name = m.name
    );
  END IF;

  IF v_hit_count = cardinality(v_promoted_migrations) THEN
    v_state_classification := 'FULL_NEW_CHAIN';
  ELSIF v_hit_count > 0 THEN
    v_state_classification := 'PARTIAL_NEW_CHAIN';
  ELSE
    SELECT count(*)::int
    INTO v_hit_count
    FROM unnest(v_forbidden_tables) AS t
    WHERE to_regclass('public.' || t) IS NOT NULL;

    IF v_hit_count > 0 THEN
      v_state_classification := 'PARTIAL_NEW_CHAIN';
    ELSE
      SELECT count(*)::int
      INTO v_hit_count
      FROM unnest(v_forbidden_fns) AS f
      WHERE EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = f
      );

      IF v_hit_count > 0 THEN
        v_state_classification := 'PARTIAL_NEW_CHAIN';
      ELSE
        SELECT count(*)::int
        INTO v_hit_count
        FROM unnest(v_required_tables) AS t
        WHERE to_regclass('public.' || t) IS NOT NULL;

        IF v_hit_count = cardinality(v_required_tables) THEN
          v_state_classification := 'LEGACY_SUPPORTED_EXACT';
        ELSE
          v_state_classification := 'UNKNOWN_UNSAFE';
        END IF;
      END IF;
    END IF;
  END IF;

  RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_state_classification;

  IF v_state_classification NOT IN ('LEGACY_SUPPORTED_EXACT', 'FULL_NEW_CHAIN') THEN
    RAISE EXCEPTION
      'HOLD: unsupported prestate classification %; only LEGACY_SUPPORTED_EXACT or FULL_NEW_CHAIN may proceed',
      v_state_classification;
  END IF;

  -- If already complete, no further assertions are needed.
  IF v_state_classification = 'FULL_NEW_CHAIN' THEN
    RAISE NOTICE 'READY_FOR_APPLY_C0 (FULL_NEW_CHAIN: nothing to do)';
    RETURN;
  END IF;

  -- -------------------------------------------------------------------------
  -- 1) Canonical schema fingerprint (authoritative production prestate).
  --    Algorithm: sha-256 of a stable, ordered aggregate of catalog rows for
  --    the 8 legacy council tables, 5 enums, 16 functions, 23 public policies
  --    and 2 storage policies.  Grants (table-level ACL) are intentionally
  --    excluded from the fingerprint because C0 re-scopes them; the inventory
  --    counts and object definitions are what define the legacy prestate.
  -- -------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
  ) THEN
    RAISE EXCEPTION 'HOLD: pgcrypto extension required for schema fingerprint';
  END IF;

  SELECT encode(
    digest(
      string_agg(line, E'\n' ORDER BY line),
      'sha256'
    ),
    'hex'
  )
  INTO v_fingerprint_actual
  FROM (
    -- 8 legacy tables and their columns (ordered)
    SELECT 'table:' || c.relname || ':' || a.attnum || ':' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) AS line
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'academic_council%'
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
    UNION ALL
    -- 48 constraints / 35 indexes derived definitions
    SELECT 'constraint:' || con.conname || ':' || pg_get_constraintdef(con.oid)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'academic_council%'
    UNION ALL
    SELECT 'index:' || i.relname || ':' || pg_get_indexdef(i.oid)
    FROM pg_index idx
    JOIN pg_class i ON i.oid = idx.indexrelid
    JOIN pg_class c ON c.oid = idx.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'academic_council%'
    UNION ALL
    -- 10 triggers
    SELECT 'trigger:' || t.tgname || ':' || pg_get_triggerdef(t.oid, true)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'academic_council%'
      AND NOT t.tgisinternal
    UNION ALL
    -- 5 enums with exact label order
    SELECT 'enum:' || t.typname || ':' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname LIKE 'academic_council%'
    GROUP BY t.typname
    UNION ALL
    -- 16 legacy functions (normalized whitespace)
    SELECT 'function:' || p.proname || ':' || pg_get_function_identity_arguments(p.oid) || ':' ||
           btrim(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g')) AS line
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_allowed_council_fns)
    UNION ALL
    -- 23 public policies + 2 storage policies
    SELECT 'policy:' || p.schemaname || ':' || p.tablename || ':' || p.policyname || ':' || p.cmd || ':' ||
           coalesce(p.qual::text, 'NULL') || ':' || coalesce(p.with_check::text, 'NULL') AS line
    FROM pg_policies p
    WHERE (p.schemaname = 'public' AND p.tablename LIKE 'academic_council%')
       OR (p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname LIKE 'acta_%')
  ) s;

  RAISE NOTICE 'PREFLIGHT_SCHEMA_FINGERPRINT: %', v_fingerprint_actual;

  -- Determine expected fingerprint: explicit GUC > production evidence >
  -- disposable-replica self-match.
  v_fingerprint_expected := current_setting('councils.fingerprint_expected', true);
  IF v_fingerprint_expected IS NULL OR v_fingerprint_expected = '' THEN
    IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
      v_fingerprint_expected := '3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9';
    ELSE
      v_fingerprint_expected := v_fingerprint_actual;
    END IF;
  END IF;

  RAISE NOTICE 'PREFLIGHT_FINGERPRINT_EXPECTED: %', v_fingerprint_expected;

  IF v_fingerprint_actual IS DISTINCT FROM v_fingerprint_expected THEN
    RAISE EXCEPTION
      'HOLD: schema fingerprint mismatch; expected %, got %',
      v_fingerprint_expected, v_fingerprint_actual;
  END IF;

  RAISE NOTICE 'PREFLIGHT_FINGERPRINT_MATCH: LEGACY_SUPPORTED_EXACT';

  -- -------------------------------------------------------------------------
  -- 2) Migration ledger: none of promoted C0-C9 names may be present.
  -- -------------------------------------------------------------------------
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    SELECT array_agg(name ORDER BY name)
    INTO v_promoted_in_ledger
    FROM supabase_migrations.schema_migrations
    WHERE name = ANY (v_promoted_migrations);

    IF v_promoted_in_ledger IS NOT NULL THEN
      RAISE EXCEPTION
        'HOLD: promoted C0-C9 migration(s) already in ledger: %',
        array_to_string(v_promoted_in_ledger, ', ');
    END IF;
  ELSE
    RAISE NOTICE 'PREFLIGHT_INFO: supabase_migrations.schema_migrations absent (disposable PG17 OK)';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2) Required predecessor tables must exist; optional attachments OK.
  -- -------------------------------------------------------------------------
  SELECT array_agg(t ORDER BY t)
  INTO v_missing
  FROM unnest(v_required_tables) AS t
  WHERE to_regclass('public.' || t) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: predecessor council tables missing: %',
      array_to_string(v_missing, ', ');
  END IF;

  v_attachments_present :=
    to_regclass('public.' || v_optional_table) IS NOT NULL;

  IF v_attachments_present THEN
    RAISE NOTICE 'PREFLIGHT_ATTACHMENTS_TABLE: present (allowed optional predecessor)';
  ELSE
    RAISE NOTICE 'PREFLIGHT_ATTACHMENTS_TABLE: absent (OK)';
  END IF;

  -- Unknown academic_council* tables (not required, not optional attachments,
  -- and not already listed as forbidden — forbidden checked separately).
  SELECT array_agg(c.relname ORDER BY c.relname)
  INTO v_extra
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')
    AND c.relname LIKE 'academic_council%'
    AND NOT (c.relname = ANY (v_required_tables))
    AND c.relname IS DISTINCT FROM v_optional_table
    AND NOT (c.relname = ANY (v_forbidden_tables));

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: unknown academic_council* table(s) not in predecessor inventory: %',
      array_to_string(v_extra, ', ');
  END IF;

  -- -------------------------------------------------------------------------
  -- 3) RLS enabled on required predecessor tables.
  --    FORCE RLS: NOT required — 20260703194033 harden does not set FORCE.
  -- -------------------------------------------------------------------------
  SELECT array_agg(t ORDER BY t)
  INTO v_missing
  FROM unnest(v_required_tables) AS t
  JOIN pg_class c ON c.oid = to_regclass('public.' || t)
  WHERE NOT c.relrowsecurity;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: predecessor table(s) missing RLS enabled: %',
      array_to_string(v_missing, ', ');
  END IF;

  IF v_attachments_present THEN
    IF NOT (
      SELECT c.relrowsecurity
      FROM pg_class c
      WHERE c.oid = to_regclass('public.' || v_optional_table)
    ) THEN
      RAISE EXCEPTION
        'HOLD: optional predecessor % exists but RLS is not enabled',
        v_optional_table;
    END IF;
  END IF;

  RAISE NOTICE
    'PREFLIGHT_FORCE_RLS: not required (harden 20260703194033 does not FORCE); relforcerowsecurity left unasserted';

  -- -------------------------------------------------------------------------
  -- 4) Exact expected policy inventory on predecessor tables.
  -- -------------------------------------------------------------------------
  v_exp_count := cardinality(v_expected_policies);

  SELECT count(*)::int
  INTO v_hit_count
  FROM unnest(v_expected_policies) AS exp(spec)
  JOIN LATERAL (
    SELECT
      split_part(exp.spec, '|', 1) AS tablename,
      split_part(exp.spec, '|', 2) AS policyname,
      split_part(exp.spec, '|', 3) AS cmd
  ) e ON true
  JOIN pg_policies p
    ON p.schemaname = 'public'
   AND p.tablename = e.tablename
   AND p.policyname = e.policyname
   AND p.cmd = e.cmd
   AND p.roles = ARRAY['authenticated']::name[];

  IF v_hit_count <> v_exp_count THEN
    SELECT array_agg(e.tablename || '.' || e.policyname ORDER BY e.tablename, e.policyname)
    INTO v_missing
    FROM (
      SELECT
        split_part(spec, '|', 1) AS tablename,
        split_part(spec, '|', 2) AS policyname,
        split_part(spec, '|', 3) AS cmd
      FROM unnest(v_expected_policies) AS spec
    ) e
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename = e.tablename
        AND p.policyname = e.policyname
        AND p.cmd = e.cmd
        AND p.roles = ARRAY['authenticated']::name[]
    );

    RAISE EXCEPTION
      'HOLD: missing or drifted expected predecessor policy(ies): %',
      coalesce(array_to_string(v_missing, ', '), '<unresolved>');
  END IF;

  -- Extra unknown policies on academic_council* tables.
  -- Allowed extras: acta_* on academic_council_topic_attachments only.
  SELECT array_agg(p.tablename || '.' || p.policyname ORDER BY p.tablename, p.policyname)
  INTO v_extra
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename LIKE 'academic_council%'
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_expected_policies) AS spec
      WHERE split_part(spec, '|', 1) = p.tablename
        AND split_part(spec, '|', 2) = p.policyname
    )
    AND NOT (
      p.tablename = v_optional_table
      AND p.policyname LIKE 'acta_%'
    );

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: unknown policy(ies) on academic_council* tables: %',
      array_to_string(v_extra, ', ');
  END IF;

  -- -------------------------------------------------------------------------
  -- 5) Predecessor helpers: exist, SECURITY DEFINER, search_path has public.
  --    can_schedule_council_meeting REQUIRED (schedule helpers predecessor).
  -- -------------------------------------------------------------------------
  FOREACH v_fn IN ARRAY v_required_helpers LOOP
    SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_fn
    ORDER BY p.oid
    LIMIT 1;

    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'HOLD: predecessor function % missing', v_fn;
    END IF;

    IF NOT (
      SELECT prosecdef FROM pg_proc WHERE oid = v_oid
    ) THEN
      RAISE EXCEPTION 'HOLD: predecessor function % is not SECURITY DEFINER', v_fn;
    END IF;

    SELECT coalesce(array_to_string(proconfig, ','), '')
    INTO v_search
    FROM pg_proc
    WHERE oid = v_oid;

    IF position('search_path' IN v_search) = 0
       OR position('public' IN v_search) = 0 THEN
      RAISE EXCEPTION
        'HOLD: predecessor function % search_path must contain public (proconfig=%)',
        v_fn, v_search;
    END IF;
  END LOOP;

  -- Optional predecessor helpers (faculty-history / attachments): if present,
  -- assert SECURITY DEFINER + search_path containing public.
  FOREACH v_fn IN ARRAY ARRAY[
    'was_council_member_on',
    'can_submit_council_topic',
    'council_topic_attachment_count',
    'can_add_council_topic_attachment',
    'can_read_council_topic_attachment',
    'can_upload_council_topic_attachment',
    'tg_enforce_council_topic_attachment'
  ] LOOP
    SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_fn
    ORDER BY p.oid
    LIMIT 1;

    IF v_oid IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_oid) THEN
      RAISE EXCEPTION 'HOLD: attachment helper % is not SECURITY DEFINER', v_fn;
    END IF;

    SELECT coalesce(array_to_string(proconfig, ','), '')
    INTO v_search
    FROM pg_proc
    WHERE oid = v_oid;

    IF position('search_path' IN v_search) = 0
       OR position('public' IN v_search) = 0 THEN
      RAISE EXCEPTION
        'HOLD: attachment helper % search_path must contain public (proconfig=%)',
        v_fn, v_search;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 6) Function EXECUTE ACL: authenticated YES; anon/PUBLIC-effective NO.
  -- -------------------------------------------------------------------------
  FOREACH v_fn IN ARRAY v_required_helpers LOOP
    SELECT p.oid
    INTO v_oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = v_fn
    ORDER BY p.oid
    LIMIT 1;

    v_has_auth := has_function_privilege('authenticated', v_oid, 'EXECUTE');
    v_has_anon := has_function_privilege('anon', v_oid, 'EXECUTE');

    IF NOT v_has_auth THEN
      RAISE EXCEPTION
        'HOLD: authenticated lacks EXECUTE on predecessor helper %',
        v_fn;
    END IF;

    IF v_has_anon THEN
      RAISE EXCEPTION
        'HOLD: anon (or PUBLIC-effective) has EXECUTE on predecessor helper %',
        v_fn;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 7) C0+ functions must NOT exist (including get_council_report_%).
  -- -------------------------------------------------------------------------
  SELECT array_agg(f ORDER BY f)
  INTO v_extra
  FROM unnest(v_forbidden_fns) AS f
  WHERE EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = f
  );

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: C0+ council RPC(s) already present (partial/mixed state): %',
      array_to_string(v_extra, ', ');
  END IF;

  SELECT array_agg(p.proname ORDER BY p.proname)
  INTO v_extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE 'get_council_report_%';

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: get_council_report_%% already present before C0/C9: %',
      array_to_string(v_extra, ', ');
  END IF;

  -- -------------------------------------------------------------------------
  -- 8) C1+ extension tables must NOT exist.
  -- -------------------------------------------------------------------------
  SELECT array_agg(t ORDER BY t)
  INTO v_extra
  FROM unnest(v_forbidden_tables) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL;

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: C1+ council extension table(s) already present: %',
      array_to_string(v_extra, ', ');
  END IF;

  -- -------------------------------------------------------------------------
  -- 9) Unknown public functions with proname LIKE '%council%' -> HOLD.
  -- -------------------------------------------------------------------------
  SELECT array_agg(DISTINCT p.proname ORDER BY p.proname)
  INTO v_extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname LIKE '%council%'
    AND NOT (p.proname = ANY (v_allowed_council_fns));

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: unknown public %%council%% function(s) not in predecessor allowlist: %',
      array_to_string(v_extra, ', ');
  END IF;

  -- -------------------------------------------------------------------------
  -- 10) Legacy enum inventory: required enums must exist with exact labels.
  -- -------------------------------------------------------------------------
  FOR v_enum_name, v_expected_labels IN
    SELECT e->>'name' AS enum_name,
           ARRAY(SELECT jsonb_array_elements_text(e->'labels') ORDER BY 1) AS expected_labels
    FROM jsonb_array_elements(v_required_enums) AS e
  LOOP
    IF to_regtype(format('public.%I', v_enum_name)) IS NULL THEN
      RAISE EXCEPTION 'HOLD: required legacy enum % missing', v_enum_name;
    END IF;

    SELECT array_agg(enumlabel ORDER BY enumlabel)
    INTO v_missing
    FROM pg_enum
    WHERE enumtypid = format('public.%I', v_enum_name)::regtype;

    IF v_missing IS DISTINCT FROM v_expected_labels THEN
      RAISE EXCEPTION
        'HOLD: legacy enum % labels drift: expected %, found %',
        v_enum_name, v_expected_labels, v_missing;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- 11) Storage bucket dependency for attachments (optional but present in prod).
  -- -------------------------------------------------------------------------
  IF v_attachments_present THEN
    IF NOT EXISTS (
      SELECT 1
      FROM storage.buckets
      WHERE id = 'council-topic-attachments'
    ) THEN
      RAISE EXCEPTION
        'HOLD: academic_council_topic_attachments exists but storage bucket council-topic-attachments is missing';
    END IF;

    SELECT array_agg(p.policyname ORDER BY p.policyname)
    INTO v_missing
    FROM pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname IN ('acta_storage_select', 'acta_storage_insert');

    IF v_missing IS NULL OR array_length(v_missing, 1) <> 2 THEN
      RAISE EXCEPTION
        'HOLD: storage.objects policies for council-topic-attachments missing or drifted: %',
        coalesce(array_to_string(v_missing, ', '), '<none>');
    END IF;

    RAISE NOTICE 'PREFLIGHT_ATTACHMENTS_STORAGE: bucket and policies present';
  END IF;

  -- -------------------------------------------------------------------------
  -- 12) C9 internal-helper ACL drift:
  --     Absence already enforced in (7). Expected post-C9 ACL documented
  --     in file header (service_role-only internals; authenticated reports).
  -- -------------------------------------------------------------------------
  RAISE NOTICE
    'PREFLIGHT_C9_ACL_CONTRACT: create/dispatch/recipients = service_role only after C9; get_my/acknowledge/reports = authenticated+service_role; objects must be absent now';

  -- -------------------------------------------------------------------------
  -- 13) Constraints / indexes needed by next migration.
  -- -------------------------------------------------------------------------
  -- Primary keys on all required predecessor tables.
  SELECT array_agg(t ORDER BY t)
  INTO v_missing
  FROM unnest(v_required_tables) AS t
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = t
      AND con.contype = 'p'
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: predecessor table(s) missing PRIMARY KEY: %',
      array_to_string(v_missing, ', ');
  END IF;

  -- Unique membership constraint from MVP:
  --   UNIQUE (council_id, user_id, member_role, active_from)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'academic_council_members'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) ILIKE '%council_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%user_id%'
      AND pg_get_constraintdef(con.oid) ILIKE '%member_role%'
      AND pg_get_constraintdef(con.oid) ILIKE '%active_from%'
  ) THEN
    RAISE EXCEPTION
      'HOLD: academic_council_members missing UNIQUE (council_id, user_id, member_role, active_from)';
  END IF;

  -- Named unique meeting indexes from MVP create.
  IF to_regclass('public.idx_acmeet_council_year_number') IS NULL THEN
    RAISE EXCEPTION 'HOLD: missing unique index idx_acmeet_council_year_number';
  END IF;

  IF to_regclass('public.idx_acmeet_council_number_without_year') IS NULL THEN
    RAISE EXCEPTION 'HOLD: missing unique index idx_acmeet_council_number_without_year';
  END IF;

  -- -------------------------------------------------------------------------
  -- 14) Authenticated direct table grants (production reality).
  --     Production currently holds arwDxtm on council tables; C0 re-scopes
  --     to SELECT-only + RPC writes.  The preflight only verifies the
  --     prestate, it does not mutate ACL.
  -- -------------------------------------------------------------------------
  SELECT array_agg(t ORDER BY t)
  INTO v_missing
  FROM unnest(v_required_tables || v_optional_table) AS t
  WHERE to_regclass('public.' || t) IS NOT NULL
    AND NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.' || t, 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.' || t, 'UPDATE');

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION
      'HOLD: authenticated lacks expected direct SELECT/INSERT/UPDATE on table(s): %',
      array_to_string(v_missing, ', ');
  END IF;

  RAISE NOTICE 'PREFLIGHT_AUTHENTICATED_GRANTS: legacy direct DML present (to be rescoped by C0)';

  -- -------------------------------------------------------------------------
  -- 15) Feature flag contract (cannot read TypeScript from SQL).
  -- -------------------------------------------------------------------------
  RAISE NOTICE
    'PREFLIGHT_FLAGS: % — flags remain OFF; activation package docs/migration-drafts/COUNCILS-C0-C9-FLAGS-01.md',
    v_flag_note;

  -- -------------------------------------------------------------------------
  -- 16) Success
  -- -------------------------------------------------------------------------
  RAISE NOTICE 'READY_FOR_APPLY_C0';
END $$;

SELECT 'READY_FOR_APPLY_C0' AS preflight_status;
