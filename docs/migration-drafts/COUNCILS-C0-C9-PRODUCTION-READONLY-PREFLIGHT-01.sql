-- COUNCILS-C0-C9-PRODUCTION-READONLY-PREFLIGHT-01
-- stdin-safe, read-only classifier. FULL_NEW_CHAIN is an alias only:
-- FULL_NEW_CHAIN=FULL_NEW_CHAIN_VERIFIED (ledger + schema + security proof).
-- No DML, DDL, GRANT, or REVOKE is permitted in this file.
-- Legacy inventory/fingerprint failure is the LEGACY_VARIANT_HOLD path.
-- v_expected_policies is retained as the historical legacy-policy contract name.
--
-- Ledger identity contract (Supabase/Lovable):
--   primary = migration version
--   secondary = normalized name (short OR version||'_'||short; exact only)
-- Logical steps C0..C9 are derived from exact accepted identities.
-- C1 may be ORIGINAL (one row) OR APPROVED SPLIT (two exact rows).
-- C2 may be CANONICAL (one row) OR pinned historical LOVABLE_MANAGED_ALIAS.
-- C3 may be CANONICAL (one row) OR pinned historical LOVABLE_MANAGED_ALIAS.
-- C4 may be CANONICAL (one row) OR pinned historical LOVABLE_MANAGED_ALIAS.
-- C5..C9: CANONICAL only until independently proven managed aliases exist.
-- No fuzzy UUID matching: alias names are exact pinned production values only.
\set ON_ERROR_STOP on

DO $$
DECLARE
  -- Canonical composite identities retained for notices / historical assertions.
  v_promoted text[] := ARRAY[
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
  v_logical_labels text[] := ARRAY[
    'C0','C1','C2','C3','C4','C5','C6','C7','C8','C9'
  ];
  -- Per-logical-step versions/short names. Index 2 (C1) is resolved via lineage.
  v_step_versions text[] := ARRAY[
    '20260808120000',
    '20260808121000',
    '20260808122000',
    '20260808130000',
    '20260808140000',
    '20260808150000',
    '20260808160000',
    '20260808170000',
    '20260808171000',
    '20260808180000'
  ];
  v_step_short_names text[] := ARRAY[
    'councils_c0_write_surface_hardening_01',
    'councils_c1_meeting_state_machine_01',
    'councils_c2_topic_intake_review_01',
    'councils_c3_attendance_quorum_01',
    'councils_c4_session_voting_01',
    'councils_c5_minutes_lifecycle_01',
    'councils_c6_decisions_followup_01',
    'councils_c7_audit_archive_01',
    'councils_c0_c8_final_security_closure_01',
    'councils_c9_notifications_reporting_01'
  ];
  v_c1_split_a_version text := '20260810003111';
  v_c1_split_a_short text := '01d86704-d31c-42e9-9efa-aa5fe4d6a8c9';
  v_c1_split_b_version text := '20260810003305';
  v_c1_split_b_short text := 'c75271d6-2ef1-407a-96f5-66aaf2386afe';
  -- Pinned historical Lovable managed aliases (production forensic identities).
  v_c2_alias_version text := '20260810010400';
  v_c2_alias_short text := '4e2c4b05-5ff0-4b23-9084-18d8b1b29c86';
  v_c3_alias_version text := '20260810011456';
  v_c3_alias_short text := '430aac8f-1f38-4e9d-99aa-022ea2680fc4';
  v_c4_alias_version text := '20260810012715';
  v_c4_alias_short text := '72757e0e-3b8b-46fa-b252-8e1c8b594d3e';
  v_markers text[] := ARRAY[
    'council_schedule_meeting',
    'academic_council_meeting_transition_events',
    'council_resubmit_topic',
    'academic_council_meeting_attendance',
    'academic_council_votes',
    'academic_council_minutes_amendments',
    'issue_council_decision',
    'academic_council_audit_events',
    'council_decision_transition_is_legal',
    'academic_council_notifications'
  ];
  v_legacy_tables text[] := ARRAY[
    'academic_councils','academic_council_members','academic_council_meetings',
    'academic_council_topics','academic_council_agenda_items',
    'academic_council_minutes','academic_council_decisions'
  ];
  v_optional_table text := 'academic_council_topic_attachments';
  v_extension_tables text[] := ARRAY[
    'academic_council_meeting_transition_events','academic_council_quorum_policies',
    'academic_council_meeting_attendance_rolls','academic_council_meeting_attendance',
    'academic_council_meeting_quorum_evaluations','academic_council_attendance_audit_events',
    'academic_council_votes','academic_council_vote_results',
    'academic_council_minutes_amendments','academic_council_audit_events',
    'academic_council_notifications'
  ];
  v_full_tables text[];
  v_legacy_functions text[] := ARRAY[
    'is_council_admin','is_council_member','has_council_role','can_manage_council',
    'can_write_council_agenda','can_schedule_council_meeting','was_council_member_on',
    'can_submit_council_topic','tg_academic_councils_touch_updated_at',
    'tg_councils_validate_department_binding','tg_minutes_block_locked_edits',
    'council_topic_attachment_count','can_add_council_topic_attachment',
    'can_read_council_topic_attachment','can_upload_council_topic_attachment',
    'tg_enforce_council_topic_attachment'
  ];
  v_legacy_helpers text[] := ARRAY[
    'is_council_admin','is_council_member','has_council_role','can_manage_council',
    'can_write_council_agenda','can_schedule_council_meeting'
  ];
  -- Historical contract name retained for source-package assertions.
  v_expected_policies text[] := ARRAY[
    'academic_councils|councils_select|SELECT','academic_councils|councils_insert_admin|INSERT',
    'academic_councils|councils_update_admin_or_chair|UPDATE',
    'academic_council_members|council_members_select|SELECT','academic_council_members|council_members_insert|INSERT',
    'academic_council_members|council_members_update|UPDATE',
    'academic_council_meetings|meetings_select|SELECT','academic_council_meetings|meetings_insert|INSERT',
    'academic_council_meetings|meetings_update|UPDATE',
    'academic_council_topics|topics_select|SELECT','academic_council_topics|topics_insert_member|INSERT',
    'academic_council_topics|topics_update_owner_draft|UPDATE',
    'academic_council_agenda_items|agenda_select|SELECT','academic_council_agenda_items|agenda_insert|INSERT',
    'academic_council_agenda_items|agenda_update|UPDATE',
    'academic_council_minutes|minutes_select|SELECT','academic_council_minutes|minutes_insert_secretary|INSERT',
    'academic_council_minutes|minutes_update_before_lock|UPDATE',
    'academic_council_decisions|decisions_select|SELECT','academic_council_decisions|decisions_insert|INSERT',
    'academic_council_decisions|decisions_update|UPDATE'
  ];
  v_full_secdef_functions text[] := ARRAY[
    'can_write_council_agenda','can_schedule_council_meeting','can_manage_council',
    'council_require_auth_uid','council_deny','council_link_membership',
    'council_deactivate_membership','council_schedule_meeting',
    'council_update_meeting_metadata','council_submit_topic',
    'council_update_own_topic_draft','council_review_topic',
    'council_add_topic_to_agenda','council_add_manual_agenda_item',
    'council_update_agenda_item','council_reorder_agenda_items',
    'council_finalize_meeting_agenda','council_meeting_transition_is_legal',
    'council_transition_meeting','can_submit_to_council_meeting_intake',
    'can_review_council_topic_prepare','can_review_council_topic_final',
    'council_resubmit_topic','record_council_meeting_attendance',
    'evaluate_council_meeting_quorum','council_approve_quorum_policy',
    'open_council_session','start_agenda_item_discussion','open_agenda_item_vote',
    'cast_council_vote','close_agenda_item_vote','calculate_agenda_item_result',
    'resolve_agenda_item','close_council_session','draft_council_minutes',
    'submit_council_minutes_for_review','approve_and_lock_council_minutes',
    'issue_council_decision','update_council_decision_followup',
    'complete_council_decision','archive_council_meeting','get_council_archive_summary',
    'get_council_decision_followup_dashboard','get_council_overdue_decisions',
    'get_council_attendance_quorum_summary','get_council_vote_result',
    'get_council_historical_minutes','get_council_meeting_metrics',
    'create_council_notification','dispatch_council_notification',
    'get_council_notification_recipients','get_my_council_notifications',
    'acknowledge_council_notification','get_council_report_meetings_by_period',
    'get_council_chair_dashboard','get_council_secretary_dashboard',
    'get_council_member_workspace','get_council_responsible_decisions'
  ];
  v_full_search_only text[] := ARRAY[
    'council_topic_transition_is_legal','council_decision_transition_is_legal'
  ];
  v_full_policies text[] := ARRAY[
    'meeting_transition_events_select','ac_quorum_policies_select',
    'ac_attendance_rolls_select','ac_meeting_attendance_select',
    'ac_quorum_evaluations_select','ac_attendance_audit_select','ac_votes_select',
    'ac_vote_results_select','ac_minutes_amendments_select','ac_audit_events_select',
    'ac_notifications_select_own','ac_notifications_update_own_read'
  ];
  v_full_types text[] := ARRAY[
    'academic_council_attendance_state','academic_council_quorum_threshold_kind',
    'academic_council_quorum_policy_status','academic_council_attendance_roll_status',
    'academic_council_vote_value','academic_council_agenda_item_session_status',
    'academic_council_minutes_status'
  ];
  v_full_indexes text[] := ARRAY[
    'idx_council_meeting_transition_events_meeting','idx_acdec_agenda_item',
    'idx_acdec_minutes','idx_acdec_canonical_num'
  ];
  v_c8_triggers text[] := ARRAY[
    'trg_ac_archived_decisions_guard','trg_ac_archived_agenda_guard',
    'trg_ac_archived_votes_guard','trg_ac_archived_vote_results_guard',
    'trg_ac_archived_minutes_guard'
  ];
  v_internal_only text[] := ARRAY[
    'create_council_notification(uuid,text,uuid,uuid,text,uuid,text,text,jsonb)',
    'dispatch_council_notification(text,uuid,uuid,text,uuid,jsonb)',
    'get_council_notification_recipients(uuid,text,jsonb)'
  ];
  v_public_actor_safe text[] := ARRAY[
    'get_my_council_notifications(integer)','acknowledge_council_notification(uuid)'
  ];
  v_ledger_state text := 'LEDGER_NONE';
  v_schema_state text := 'SCHEMA_UNKNOWN';
  v_final text;
  v_production_ledger boolean := to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;
  v_ledger_hits int := 0;
  v_ledger_prefix int := 0;
  v_schema_prefix int := 0;
  v_marker_present boolean[];
  v_any_later boolean := false;
  v_council_table_count int := 0;
  v_legacy_table_count int := 0;
  v_missing text[];
  v_extra text[];
  v_fn text;
  v_oid oid;
  v_search text[];
  v_actual text;
  v_expected text;
  v_setting text;
  v_attachments_present boolean;
  v_enum text;
  v_labels text[];
  v_logical_satisfied boolean[] := ARRAY[false,false,false,false,false,false,false,false,false,false];
  v_c1_lineage text := 'ABSENT';
  v_c1_orig_hit int := 0;
  v_c1_split_a_hit int := 0;
  v_c1_split_b_hit int := 0;
  v_id_hit int := 0;
  v_step_i int;
  v_known_version text;
  v_known_short text;
  v_known_composite text;
  v_poison_version text;
  v_poison_name text;
  v_c0_identity text := 'ABSENT';
  v_c1_split_a_identity text := 'ABSENT';
  v_c1_split_b_identity text := 'ABSENT';
  v_c2_lineage text := 'ABSENT';
  v_c3_lineage text := 'ABSENT';
  v_c4_lineage text := 'ABSENT';
  v_c5_lineage text := 'ABSENT';
  v_c6_lineage text := 'ABSENT';
  v_c7_lineage text := 'ABSENT';
  v_c8_lineage text := 'ABSENT';
  v_c9_lineage text := 'ABSENT';
  v_c2_identity text := 'ABSENT';
  v_c3_identity text := 'ABSENT';
  v_c4_identity text := 'ABSENT';
  v_c2_canon_hit int := 0;
  v_c2_alias_hit int := 0;
  v_c3_canon_hit int := 0;
  v_c3_alias_hit int := 0;
  v_c4_canon_hit int := 0;
  v_c4_alias_hit int := 0;
BEGIN
  RAISE NOTICE 'PREFLIGHT_LEDGER_STORAGE_FORMAT: VERSION_PLUS_NORMALIZED_NAME';

  -- Phase A: logical ledger classification (version + normalized exact name).
  -- Never match on name alone, LIKE, or ordering inference.
  IF v_production_ledger THEN
    -- Poison rows: known version with non-accepted name, or known name with wrong version.
    SELECT sm.version, sm.name INTO v_poison_version, v_poison_name
    FROM supabase_migrations.schema_migrations sm
    WHERE
      (
        sm.version = ANY (
          v_step_versions || ARRAY[
            v_c1_split_a_version,
            v_c1_split_b_version,
            v_c2_alias_version,
            v_c3_alias_version,
            v_c4_alias_version
          ]
        )
        AND NOT (
          (
            sm.version = v_step_versions[1]
            AND (sm.name = v_step_short_names[1] OR sm.name = v_promoted[1])
          )
          OR (
            sm.version = v_step_versions[2]
            AND (sm.name = v_step_short_names[2] OR sm.name = v_promoted[2])
          )
          OR (
            sm.version = v_step_versions[3]
            AND (sm.name = v_step_short_names[3] OR sm.name = v_promoted[3])
          )
          OR (
            sm.version = v_step_versions[4]
            AND (sm.name = v_step_short_names[4] OR sm.name = v_promoted[4])
          )
          OR (
            sm.version = v_step_versions[5]
            AND (sm.name = v_step_short_names[5] OR sm.name = v_promoted[5])
          )
          OR (
            sm.version = v_step_versions[6]
            AND (sm.name = v_step_short_names[6] OR sm.name = v_promoted[6])
          )
          OR (
            sm.version = v_step_versions[7]
            AND (sm.name = v_step_short_names[7] OR sm.name = v_promoted[7])
          )
          OR (
            sm.version = v_step_versions[8]
            AND (sm.name = v_step_short_names[8] OR sm.name = v_promoted[8])
          )
          OR (
            sm.version = v_step_versions[9]
            AND (sm.name = v_step_short_names[9] OR sm.name = v_promoted[9])
          )
          OR (
            sm.version = v_step_versions[10]
            AND (sm.name = v_step_short_names[10] OR sm.name = v_promoted[10])
          )
          OR (
            sm.version = v_c1_split_a_version
            AND (
              sm.name = v_c1_split_a_short
              OR sm.name = v_c1_split_a_version || '_' || v_c1_split_a_short
            )
          )
          OR (
            sm.version = v_c1_split_b_version
            AND (
              sm.name = v_c1_split_b_short
              OR sm.name = v_c1_split_b_version || '_' || v_c1_split_b_short
            )
          )
          OR (
            sm.version = v_c2_alias_version
            AND (
              sm.name = v_c2_alias_short
              OR sm.name = v_c2_alias_version || '_' || v_c2_alias_short
            )
          )
          OR (
            sm.version = v_c3_alias_version
            AND (
              sm.name = v_c3_alias_short
              OR sm.name = v_c3_alias_version || '_' || v_c3_alias_short
            )
          )
          OR (
            sm.version = v_c4_alias_version
            AND (
              sm.name = v_c4_alias_short
              OR sm.name = v_c4_alias_version || '_' || v_c4_alias_short
            )
          )
        )
      )
      OR (
        (
          sm.name = ANY (v_step_short_names || v_promoted || ARRAY[
            v_c1_split_a_short,
            v_c1_split_b_short,
            v_c1_split_a_version || '_' || v_c1_split_a_short,
            v_c1_split_b_version || '_' || v_c1_split_b_short,
            v_c2_alias_short,
            v_c2_alias_version || '_' || v_c2_alias_short,
            v_c3_alias_short,
            v_c3_alias_version || '_' || v_c3_alias_short,
            v_c4_alias_short,
            v_c4_alias_version || '_' || v_c4_alias_short
          ])
        )
        AND NOT (
          (
            sm.version = v_step_versions[1]
            AND (sm.name = v_step_short_names[1] OR sm.name = v_promoted[1])
          )
          OR (
            sm.version = v_step_versions[2]
            AND (sm.name = v_step_short_names[2] OR sm.name = v_promoted[2])
          )
          OR (
            sm.version = v_step_versions[3]
            AND (sm.name = v_step_short_names[3] OR sm.name = v_promoted[3])
          )
          OR (
            sm.version = v_step_versions[4]
            AND (sm.name = v_step_short_names[4] OR sm.name = v_promoted[4])
          )
          OR (
            sm.version = v_step_versions[5]
            AND (sm.name = v_step_short_names[5] OR sm.name = v_promoted[5])
          )
          OR (
            sm.version = v_step_versions[6]
            AND (sm.name = v_step_short_names[6] OR sm.name = v_promoted[6])
          )
          OR (
            sm.version = v_step_versions[7]
            AND (sm.name = v_step_short_names[7] OR sm.name = v_promoted[7])
          )
          OR (
            sm.version = v_step_versions[8]
            AND (sm.name = v_step_short_names[8] OR sm.name = v_promoted[8])
          )
          OR (
            sm.version = v_step_versions[9]
            AND (sm.name = v_step_short_names[9] OR sm.name = v_promoted[9])
          )
          OR (
            sm.version = v_step_versions[10]
            AND (sm.name = v_step_short_names[10] OR sm.name = v_promoted[10])
          )
          OR (
            sm.version = v_c1_split_a_version
            AND (
              sm.name = v_c1_split_a_short
              OR sm.name = v_c1_split_a_version || '_' || v_c1_split_a_short
            )
          )
          OR (
            sm.version = v_c1_split_b_version
            AND (
              sm.name = v_c1_split_b_short
              OR sm.name = v_c1_split_b_version || '_' || v_c1_split_b_short
            )
          )
          OR (
            sm.version = v_c2_alias_version
            AND (
              sm.name = v_c2_alias_short
              OR sm.name = v_c2_alias_version || '_' || v_c2_alias_short
            )
          )
          OR (
            sm.version = v_c3_alias_version
            AND (
              sm.name = v_c3_alias_short
              OR sm.name = v_c3_alias_version || '_' || v_c3_alias_short
            )
          )
          OR (
            sm.version = v_c4_alias_version
            AND (
              sm.name = v_c4_alias_short
              OR sm.name = v_c4_alias_version || '_' || v_c4_alias_short
            )
          )
        )
      )
    LIMIT 1;
    IF v_poison_version IS NOT NULL THEN
      v_ledger_state := 'LEDGER_UNKNOWN';
      RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
      RAISE EXCEPTION
        'HOLD: HOLD_LEDGER_IDENTITY_MISMATCH version=% name=%',
        v_poison_version, v_poison_name;
    END IF;

    -- Exact identity hits for non-C1/C2/C3/C4 steps and C0 notice.
    -- C1/C2/C3/C4 each have explicit multi-identity lineage contracts below.
    FOR v_step_i IN 1..10 LOOP
      IF v_step_i IN (2, 3, 4, 5) THEN
        CONTINUE; -- C1 / C2 / C3 / C4 resolved below
      END IF;
      v_known_version := v_step_versions[v_step_i];
      v_known_short := v_step_short_names[v_step_i];
      v_known_composite := v_promoted[v_step_i];
      SELECT count(*)::int INTO v_id_hit
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_known_version
        AND (sm.name = v_known_short OR sm.name = v_known_composite);
      IF v_id_hit > 1 THEN
        v_ledger_state := 'LEDGER_UNKNOWN';
        RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
        RAISE EXCEPTION 'HOLD: HOLD_DUPLICATE_PROMOTED_LEDGER_ENTRY logical=%', v_logical_labels[v_step_i];
      END IF;
      v_logical_satisfied[v_step_i] := (v_id_hit = 1);
      IF v_step_i = 1 AND v_id_hit = 1 THEN
        SELECT 'version=' || sm.version || ';name=' || sm.name
          INTO v_c0_identity
        FROM supabase_migrations.schema_migrations sm
        WHERE sm.version = v_known_version
          AND (sm.name = v_known_short OR sm.name = v_known_composite)
        LIMIT 1;
      END IF;
    END LOOP;

    -- C1 ORIGINAL vs APPROVED SPLIT lineage (exactly one representation).
    SELECT count(*)::int INTO v_c1_orig_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_step_versions[2]
      AND (sm.name = v_step_short_names[2] OR sm.name = v_promoted[2]);
    SELECT count(*)::int INTO v_c1_split_a_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_c1_split_a_version
      AND (
        sm.name = v_c1_split_a_short
        OR sm.name = v_c1_split_a_version || '_' || v_c1_split_a_short
      );
    SELECT count(*)::int INTO v_c1_split_b_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_c1_split_b_version
      AND (
        sm.name = v_c1_split_b_short
        OR sm.name = v_c1_split_b_version || '_' || v_c1_split_b_short
      );

    IF v_c1_orig_hit > 1 OR v_c1_split_a_hit > 1 OR v_c1_split_b_hit > 1 THEN
      v_ledger_state := 'LEDGER_UNKNOWN';
      RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
      RAISE EXCEPTION 'HOLD: HOLD_DUPLICATE_PROMOTED_LEDGER_ENTRY logical=C1';
    END IF;

    IF v_c1_split_a_hit = 1 THEN
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c1_split_a_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_c1_split_a_version
        AND (
          sm.name = v_c1_split_a_short
          OR sm.name = v_c1_split_a_version || '_' || v_c1_split_a_short
        )
      LIMIT 1;
    END IF;
    IF v_c1_split_b_hit = 1 THEN
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c1_split_b_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_c1_split_b_version
        AND (
          sm.name = v_c1_split_b_short
          OR sm.name = v_c1_split_b_version || '_' || v_c1_split_b_short
        )
      LIMIT 1;
    END IF;

    IF v_c1_orig_hit = 1 AND (v_c1_split_a_hit = 1 OR v_c1_split_b_hit = 1) THEN
      v_c1_lineage := 'AMBIGUOUS';
      RAISE NOTICE 'PREFLIGHT_C1_LINEAGE: %', v_c1_lineage;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_A: %', v_c1_split_a_identity;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_B: %', v_c1_split_b_identity;
      RAISE EXCEPTION 'HOLD: HOLD_C1_LINEAGE_AMBIGUOUS original and split C1 coexist';
    ELSIF v_c1_split_a_hit = 1 AND v_c1_split_b_hit = 0 THEN
      v_c1_lineage := 'SPLIT_INCOMPLETE';
      RAISE NOTICE 'PREFLIGHT_C1_LINEAGE: %', v_c1_lineage;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_A: %', v_c1_split_a_identity;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_B: %', v_c1_split_b_identity;
      RAISE EXCEPTION 'HOLD: HOLD_C1_SPLIT_INCOMPLETE missing split part B';
    ELSIF v_c1_split_b_hit = 1 AND v_c1_split_a_hit = 0 THEN
      v_c1_lineage := 'SPLIT_INCOMPLETE';
      RAISE NOTICE 'PREFLIGHT_C1_LINEAGE: %', v_c1_lineage;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_A: %', v_c1_split_a_identity;
      RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_B: %', v_c1_split_b_identity;
      RAISE EXCEPTION 'HOLD: HOLD_C1_SPLIT_INCOMPLETE missing split part A';
    ELSIF v_c1_orig_hit = 1 THEN
      v_c1_lineage := 'ORIGINAL';
      v_logical_satisfied[2] := true;
    ELSIF v_c1_split_a_hit = 1 AND v_c1_split_b_hit = 1 THEN
      v_c1_lineage := 'SPLIT_COMPLETE';
      v_logical_satisfied[2] := true;
    ELSE
      v_c1_lineage := 'ABSENT';
      v_logical_satisfied[2] := false;
    END IF;

    RAISE NOTICE 'PREFLIGHT_C0_LEDGER_IDENTITY: %', v_c0_identity;
    RAISE NOTICE 'PREFLIGHT_C1_LINEAGE: %', v_c1_lineage;
    RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_A: %', v_c1_split_a_identity;
    RAISE NOTICE 'PREFLIGHT_C1_SPLIT_PART_B: %', v_c1_split_b_identity;

    -- C2 CANONICAL vs pinned LOVABLE_MANAGED_ALIAS (exactly one representation).
    SELECT count(*)::int INTO v_c2_canon_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_step_versions[3]
      AND (sm.name = v_step_short_names[3] OR sm.name = v_promoted[3]);
    SELECT count(*)::int INTO v_c2_alias_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_c2_alias_version
      AND (
        sm.name = v_c2_alias_short
        OR sm.name = v_c2_alias_version || '_' || v_c2_alias_short
      );
    IF v_c2_canon_hit > 1 OR v_c2_alias_hit > 1 THEN
      v_ledger_state := 'LEDGER_UNKNOWN';
      RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
      RAISE EXCEPTION 'HOLD: HOLD_DUPLICATE_PROMOTED_LEDGER_ENTRY logical=C2';
    END IF;
    IF v_c2_canon_hit = 1 AND v_c2_alias_hit = 1 THEN
      v_c2_lineage := 'DUPLICATE_LINEAGE';
      RAISE NOTICE 'PREFLIGHT_C2_LINEAGE: %', v_c2_lineage;
      RAISE EXCEPTION 'HOLD: HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE logical=C2 canonical and Lovable alias coexist';
    ELSIF v_c2_canon_hit = 1 THEN
      v_c2_lineage := 'CANONICAL';
      v_logical_satisfied[3] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c2_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_step_versions[3]
        AND (sm.name = v_step_short_names[3] OR sm.name = v_promoted[3])
      LIMIT 1;
    ELSIF v_c2_alias_hit = 1 THEN
      v_c2_lineage := 'LOVABLE_MANAGED_ALIAS';
      v_logical_satisfied[3] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c2_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_c2_alias_version
        AND (
          sm.name = v_c2_alias_short
          OR sm.name = v_c2_alias_version || '_' || v_c2_alias_short
        )
      LIMIT 1;
    ELSE
      v_c2_lineage := 'ABSENT';
      v_logical_satisfied[3] := false;
    END IF;
    RAISE NOTICE 'PREFLIGHT_C2_LINEAGE: %', v_c2_lineage;
    RAISE NOTICE 'PREFLIGHT_C2_LEDGER_IDENTITY: %', v_c2_identity;

    -- C3 CANONICAL vs pinned LOVABLE_MANAGED_ALIAS (exactly one representation).
    SELECT count(*)::int INTO v_c3_canon_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_step_versions[4]
      AND (sm.name = v_step_short_names[4] OR sm.name = v_promoted[4]);
    SELECT count(*)::int INTO v_c3_alias_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_c3_alias_version
      AND (
        sm.name = v_c3_alias_short
        OR sm.name = v_c3_alias_version || '_' || v_c3_alias_short
      );
    IF v_c3_canon_hit > 1 OR v_c3_alias_hit > 1 THEN
      v_ledger_state := 'LEDGER_UNKNOWN';
      RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
      RAISE EXCEPTION 'HOLD: HOLD_DUPLICATE_PROMOTED_LEDGER_ENTRY logical=C3';
    END IF;
    IF v_c3_canon_hit = 1 AND v_c3_alias_hit = 1 THEN
      v_c3_lineage := 'DUPLICATE_LINEAGE';
      RAISE NOTICE 'PREFLIGHT_C3_LINEAGE: %', v_c3_lineage;
      RAISE EXCEPTION 'HOLD: HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE logical=C3 canonical and Lovable alias coexist';
    ELSIF v_c3_canon_hit = 1 THEN
      v_c3_lineage := 'CANONICAL';
      v_logical_satisfied[4] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c3_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_step_versions[4]
        AND (sm.name = v_step_short_names[4] OR sm.name = v_promoted[4])
      LIMIT 1;
    ELSIF v_c3_alias_hit = 1 THEN
      v_c3_lineage := 'LOVABLE_MANAGED_ALIAS';
      v_logical_satisfied[4] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c3_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_c3_alias_version
        AND (
          sm.name = v_c3_alias_short
          OR sm.name = v_c3_alias_version || '_' || v_c3_alias_short
        )
      LIMIT 1;
    ELSE
      v_c3_lineage := 'ABSENT';
      v_logical_satisfied[4] := false;
    END IF;
    RAISE NOTICE 'PREFLIGHT_C3_LINEAGE: %', v_c3_lineage;
    RAISE NOTICE 'PREFLIGHT_C3_LEDGER_IDENTITY: %', v_c3_identity;

    -- C4 CANONICAL vs pinned LOVABLE_MANAGED_ALIAS (exactly one representation).
    SELECT count(*)::int INTO v_c4_canon_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_step_versions[5]
      AND (sm.name = v_step_short_names[5] OR sm.name = v_promoted[5]);
    SELECT count(*)::int INTO v_c4_alias_hit
    FROM supabase_migrations.schema_migrations sm
    WHERE sm.version = v_c4_alias_version
      AND (
        sm.name = v_c4_alias_short
        OR sm.name = v_c4_alias_version || '_' || v_c4_alias_short
      );
    IF v_c4_canon_hit > 1 OR v_c4_alias_hit > 1 THEN
      v_ledger_state := 'LEDGER_UNKNOWN';
      RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
      RAISE EXCEPTION 'HOLD: HOLD_DUPLICATE_PROMOTED_LEDGER_ENTRY logical=C4';
    END IF;
    IF v_c4_canon_hit = 1 AND v_c4_alias_hit = 1 THEN
      v_c4_lineage := 'DUPLICATE_LINEAGE';
      RAISE NOTICE 'PREFLIGHT_C4_LINEAGE: %', v_c4_lineage;
      RAISE EXCEPTION 'HOLD: HOLD_LOGICAL_STEP_DUPLICATE_LINEAGE logical=C4 canonical and Lovable alias coexist';
    ELSIF v_c4_canon_hit = 1 THEN
      v_c4_lineage := 'CANONICAL';
      v_logical_satisfied[5] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c4_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_step_versions[5]
        AND (sm.name = v_step_short_names[5] OR sm.name = v_promoted[5])
      LIMIT 1;
    ELSIF v_c4_alias_hit = 1 THEN
      v_c4_lineage := 'LOVABLE_MANAGED_ALIAS';
      v_logical_satisfied[5] := true;
      SELECT 'version=' || sm.version || ';name=' || sm.name
        INTO v_c4_identity
      FROM supabase_migrations.schema_migrations sm
      WHERE sm.version = v_c4_alias_version
        AND (
          sm.name = v_c4_alias_short
          OR sm.name = v_c4_alias_version || '_' || v_c4_alias_short
        )
      LIMIT 1;
    ELSE
      v_c4_lineage := 'ABSENT';
      v_logical_satisfied[5] := false;
    END IF;
    RAISE NOTICE 'PREFLIGHT_C4_LINEAGE: %', v_c4_lineage;
    RAISE NOTICE 'PREFLIGHT_C4_LEDGER_IDENTITY: %', v_c4_identity;

    -- C5..C9 lineage notices (CANONICAL or ABSENT; no managed aliases proven).
    IF v_logical_satisfied[6] THEN v_c5_lineage := 'CANONICAL'; ELSE v_c5_lineage := 'ABSENT'; END IF;
    IF v_logical_satisfied[7] THEN v_c6_lineage := 'CANONICAL'; ELSE v_c6_lineage := 'ABSENT'; END IF;
    IF v_logical_satisfied[8] THEN v_c7_lineage := 'CANONICAL'; ELSE v_c7_lineage := 'ABSENT'; END IF;
    IF v_logical_satisfied[9] THEN v_c8_lineage := 'CANONICAL'; ELSE v_c8_lineage := 'ABSENT'; END IF;
    IF v_logical_satisfied[10] THEN v_c9_lineage := 'CANONICAL'; ELSE v_c9_lineage := 'ABSENT'; END IF;
    RAISE NOTICE 'PREFLIGHT_C5_LINEAGE: %', v_c5_lineage;
    RAISE NOTICE 'PREFLIGHT_C6_LINEAGE: %', v_c6_lineage;
    RAISE NOTICE 'PREFLIGHT_C7_LINEAGE: %', v_c7_lineage;
    RAISE NOTICE 'PREFLIGHT_C8_LINEAGE: %', v_c8_lineage;
    RAISE NOTICE 'PREFLIGHT_C9_LINEAGE: %', v_c9_lineage;

    -- Contiguous LOGICAL prefix from C0..C9 (not raw row count).
    v_ledger_hits := 0;
    FOR v_step_i IN 1..10 LOOP
      IF v_logical_satisfied[v_step_i] THEN
        v_ledger_hits := v_ledger_hits + 1;
      END IF;
    END LOOP;

    v_ledger_prefix := 0;
    FOR v_step_i IN 1..10 LOOP
      IF v_logical_satisfied[v_step_i] THEN
        v_ledger_prefix := v_step_i;
      ELSIF EXISTS (
        SELECT 1 FROM unnest(v_logical_satisfied[v_step_i+1:10]) s WHERE s
      ) THEN
        v_ledger_state := 'LEDGER_NONCONTIGUOUS';
        RAISE NOTICE 'PREFLIGHT_LOGICAL_LEDGER_PREFIX: %', v_ledger_prefix;
        RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;
        RAISE EXCEPTION 'HOLD: HOLD_NONCONTIGUOUS_LEDGER logical C0-C9 entries contain gaps';
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_ledger_prefix = 10 THEN
      v_ledger_state := 'LEDGER_FULL';
    ELSIF v_ledger_prefix > 0 THEN
      v_ledger_state := 'LEDGER_CONTIGUOUS_PREFIX';
      RAISE NOTICE 'PREFLIGHT_LAST_APPLIED: %', v_promoted[v_ledger_prefix];
      RAISE NOTICE 'PREFLIGHT_NEXT_EXPECTED: %', v_promoted[v_ledger_prefix + 1];
      RAISE NOTICE 'PREFLIGHT_LAST_APPLIED_LOGICAL: %', v_logical_labels[v_ledger_prefix];
      RAISE NOTICE 'PREFLIGHT_NEXT_EXPECTED_LOGICAL: %', v_logical_labels[v_ledger_prefix + 1];
    ELSE
      v_ledger_state := 'LEDGER_NONE';
    END IF;
  END IF;
  RAISE NOTICE 'PREFLIGHT_LOGICAL_LEDGER_PREFIX: %', v_ledger_prefix;
  RAISE NOTICE 'PREFLIGHT_LEDGER_STATE: %', v_ledger_state;

  -- Phase B: each marker is a function for odd C steps and a table for even
  -- extension steps. A later marker without every predecessor is unsafe.
  v_marker_present := ARRAY[
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_markers[1]),
    to_regclass('public.' || v_markers[2]) IS NOT NULL,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_markers[3]),
    to_regclass('public.' || v_markers[4]) IS NOT NULL,
    to_regclass('public.' || v_markers[5]) IS NOT NULL,
    to_regclass('public.' || v_markers[6]) IS NOT NULL,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_markers[7]),
    to_regclass('public.' || v_markers[8]) IS NOT NULL,
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_markers[9]),
    to_regclass('public.' || v_markers[10]) IS NOT NULL
  ];
  FOR i IN 1..10 LOOP
    IF v_marker_present[i] THEN
      v_schema_prefix := i;
    ELSIF EXISTS (SELECT 1 FROM unnest(v_marker_present[i+1:10]) p WHERE p) THEN
      v_any_later := true;
      EXIT;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  SELECT count(*)::int INTO v_council_table_count
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'academic_council%';
  SELECT count(*)::int INTO v_legacy_table_count
  FROM unnest(v_legacy_tables) t WHERE to_regclass('public.' || t) IS NOT NULL;
  IF v_any_later THEN
    v_schema_state := 'SCHEMA_UNKNOWN';
  ELSIF v_schema_prefix = 10 THEN
    v_schema_state := 'SCHEMA_FULL_EXACT';
  ELSIF v_schema_prefix > 0 THEN
    v_schema_state := 'SCHEMA_PARTIAL_EXACT';
  ELSIF v_council_table_count = 0 THEN
    v_schema_state := 'SCHEMA_NONE';
  ELSIF v_legacy_table_count = 7 THEN
    v_schema_state := 'SCHEMA_LEGACY_EXACT';
  ELSE
    v_schema_state := 'SCHEMA_UNKNOWN';
  END IF;
  RAISE NOTICE 'PREFLIGHT_SCHEMA_PREFIX: %', v_schema_prefix;
  RAISE NOTICE 'PREFLIGHT_SCHEMA_STATE: %', v_schema_state;

  -- Phase C: cross-product derivation never treats a ledger alone as proof.
  IF v_ledger_state = 'LEDGER_FULL' AND v_schema_state <> 'SCHEMA_FULL_EXACT' THEN
    v_final := 'HOLD_FULL_LEDGER_SCHEMA_MISMATCH';
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    RAISE EXCEPTION 'HOLD: HOLD_FULL_LEDGER_SCHEMA_MISMATCH ledger=%, schema=%', v_ledger_state, v_schema_state;
  ELSIF v_schema_state = 'SCHEMA_FULL_EXACT' AND v_ledger_state <> 'LEDGER_FULL' THEN
    v_final := 'HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER';
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    RAISE EXCEPTION 'HOLD: HOLD_FULL_SCHEMA_INCOMPLETE_LEDGER schema is complete but ledger=%', v_ledger_state;
  ELSIF v_ledger_state = 'LEDGER_CONTIGUOUS_PREFIX' THEN
    IF v_schema_state <> 'SCHEMA_PARTIAL_EXACT' OR v_ledger_prefix <> v_schema_prefix THEN
      v_final := 'HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH';
      RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
      RAISE EXCEPTION 'HOLD: HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH ledger prefix %, schema prefix %', v_ledger_prefix, v_schema_prefix;
    END IF;
    IF NOT v_marker_present[v_ledger_prefix] OR v_marker_present[v_ledger_prefix + 1] THEN
      RAISE EXCEPTION 'HOLD: HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH marker boundary is not exact';
    END IF;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_legacy_tables) t
    WHERE to_regclass('public.' || t) IS NULL;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'HOLD: HOLD_LEDGER_SCHEMA_PREFIX_MISMATCH legacy base tables missing: %', array_to_string(v_missing, ', ');
    END IF;
    v_final := 'PARTIAL_NEW_CHAIN_EXACT_PREFIX';
  ELSIF v_ledger_state = 'LEDGER_NONE' AND v_schema_state = 'SCHEMA_LEGACY_EXACT' THEN
    v_final := 'LEGACY_SUPPORTED_EXACT';
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    -- Continue only for the canonical legacy proof below.
  ELSIF v_ledger_state = 'LEDGER_FULL' AND v_schema_state = 'SCHEMA_FULL_EXACT' THEN
    v_final := 'FULL_NEW_CHAIN_VERIFIED';
    -- Continue only for the complete full-chain security proof below.
  ELSE
    v_final := 'UNKNOWN_UNSAFE';
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    RAISE EXCEPTION 'HOLD: UNKNOWN_UNSAFE ledger=%, schema=%', v_ledger_state, v_schema_state;
  END IF;

  -- Phase D: production-only forbidden configuration guards must execute before
  -- any successful terminal return (FULL_NEW_CHAIN_VERIFIED, LEGACY_SUPPORTED_EXACT,
  -- or PARTIAL_NEW_CHAIN_EXACT_PREFIX). These override settings are only legal in
  -- disposable local-test contexts where the migration ledger relation is absent.
  IF v_production_ledger THEN
    IF coalesce(current_setting('councils.fingerprint_expected', true), '') <> '' THEN
      RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN';
      RAISE EXCEPTION 'HOLD: HOLD_PRODUCTION_FINGERPRINT_OVERRIDE_FORBIDDEN';
    END IF;
    IF coalesce(current_setting('councils.local_test_fingerprint_mode', true), '') <> '' THEN
      RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN';
      RAISE EXCEPTION 'HOLD: HOLD_PRODUCTION_LOCAL_TEST_FINGERPRINT_MODE_FORBIDDEN';
    END IF;
  END IF;

  IF v_final = 'PARTIAL_NEW_CHAIN_EXACT_PREFIX' THEN
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    RAISE NOTICE 'PARTIAL_LAST_APPLIED: %', v_promoted[v_ledger_prefix];
    RAISE NOTICE 'PARTIAL_NEXT_EXPECTED: %', v_promoted[v_ledger_prefix + 1];
    RAISE NOTICE 'PREFLIGHT_LAST_APPLIED_LOGICAL: %', v_logical_labels[v_ledger_prefix];
    RAISE NOTICE 'PREFLIGHT_NEXT_EXPECTED_LOGICAL: %', v_logical_labels[v_ledger_prefix + 1];
    RAISE NOTICE 'PREFLIGHT_LOGICAL_LEDGER_PREFIX: %', v_ledger_prefix;
    RAISE NOTICE 'PREFLIGHT_SCHEMA_PREFIX: %', v_schema_prefix;
    RAISE NOTICE 'PARTIAL_NEW_CHAIN_EXACT_PREFIX';
    PERFORM set_config('councils.preflight_terminal', 'PARTIAL_NEW_CHAIN_EXACT_PREFIX', false);
    RETURN;
  END IF;

  IF v_final = 'FULL_NEW_CHAIN_VERIFIED' THEN
    -- Full proof duplicates the substantive contracts of POST-VERIFIER-C0..C9.
    v_full_tables := v_legacy_tables || v_extension_tables;
    v_attachments_present := to_regclass('public.' || v_optional_table) IS NOT NULL;
    IF v_attachments_present THEN v_full_tables := v_full_tables || v_optional_table; END IF;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_full_tables) t
    WHERE to_regclass('public.' || t) IS NULL;
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain table(s) missing: %', array_to_string(v_missing, ', '); END IF;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_full_types) t
    WHERE to_regtype('public.' || t) IS NULL;
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain type(s) missing: %', array_to_string(v_missing, ', '); END IF;
    SELECT array_agg(i ORDER BY i) INTO v_missing FROM unnest(v_full_indexes) i
    WHERE NOT EXISTS (SELECT 1 FROM pg_indexes x WHERE x.schemaname='public' AND x.indexname=i);
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain index(es) missing: %', array_to_string(v_missing, ', '); END IF;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_full_tables) t
    JOIN pg_class c ON c.oid=to_regclass('public.' || t) WHERE NOT c.relrowsecurity;
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain RLS missing: %', array_to_string(v_missing, ', '); END IF;
    SELECT array_agg(f ORDER BY f) INTO v_missing FROM unnest(v_full_secdef_functions || v_full_search_only) f
    WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f);
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain function(s) missing: %', array_to_string(v_missing, ', '); END IF;
    FOREACH v_fn IN ARRAY v_full_secdef_functions LOOP
      SELECT p.oid,p.proconfig INTO v_oid,v_search FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_fn ORDER BY p.oid LIMIT 1;
      IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid)
         OR NOT (coalesce(v_search,ARRAY[]::text[]) @> ARRAY['search_path=public, pg_temp']) THEN
        RAISE EXCEPTION 'HOLD: full-chain SECURITY DEFINER/search_path contract failed: %', v_fn;
      END IF;
    END LOOP;
    FOREACH v_fn IN ARRAY v_full_search_only LOOP
      SELECT p.proconfig INTO v_search FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=v_fn ORDER BY p.oid LIMIT 1;
      IF NOT (coalesce(v_search,ARRAY[]::text[]) @> ARRAY['search_path=public, pg_temp']) THEN
        RAISE EXCEPTION 'HOLD: full-chain immutable helper search_path failed: %', v_fn;
      END IF;
    END LOOP;
    SELECT array_agg(p ORDER BY p) INTO v_missing FROM unnest(v_full_policies) p
    WHERE NOT EXISTS (SELECT 1 FROM pg_policies x WHERE x.schemaname='public' AND x.policyname=p);
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: full-chain policy(ies) missing: %', array_to_string(v_missing, ', '); END IF;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_c8_triggers) t
    WHERE NOT EXISTS (SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid=tg.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT tg.tgisinternal AND tg.tgname=t);
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: C8 archive trigger(s) missing: %', array_to_string(v_missing, ', '); END IF;
    FOREACH v_fn IN ARRAY v_internal_only LOOP
      IF has_function_privilege('public', ('public.'||v_fn)::regprocedure, 'EXECUTE')
         OR has_function_privilege('anon', ('public.'||v_fn)::regprocedure, 'EXECUTE')
         OR has_function_privilege('authenticated', ('public.'||v_fn)::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'HOLD: C9 INTERNAL_ONLY is client executable: %', v_fn;
      END IF;
    END LOOP;
    FOREACH v_fn IN ARRAY v_public_actor_safe LOOP
      IF NOT has_function_privilege('authenticated', ('public.'||v_fn)::regprocedure, 'EXECUTE')
         OR has_function_privilege('anon', ('public.'||v_fn)::regprocedure, 'EXECUTE') THEN
        RAISE EXCEPTION 'HOLD: C9 PUBLIC_ACTOR_SAFE ACL failed: %', v_fn;
      END IF;
    END LOOP;
    SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_full_tables) t
    WHERE (
        has_table_privilege('authenticated','public.'||t,'INSERT')
        OR has_table_privilege('authenticated','public.'||t,'DELETE')
        OR (
          t IS DISTINCT FROM 'academic_council_notifications'
          AND has_table_privilege('authenticated','public.'||t,'UPDATE')
        )
      );
    IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: authenticated direct DML remains on: %', array_to_string(v_missing, ', '); END IF;
    IF v_attachments_present THEN
      IF to_regclass('storage.buckets') IS NULL THEN
        RAISE EXCEPTION 'HOLD: full-chain attachments present but storage.buckets is missing';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='council-topic-attachments')
         OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_select')
         OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_insert') THEN
        RAISE EXCEPTION 'HOLD: full-chain attachments storage contract failed';
      END IF;
    END IF;
    RAISE NOTICE 'PREFLIGHT_STATE_CLASSIFICATION: %', v_final;
    RAISE NOTICE 'PREFLIGHT_CHAIN_ALIAS: FULL_NEW_CHAIN=FULL_NEW_CHAIN_VERIFIED (ledger+schema+security proof)';
    RAISE NOTICE 'FULL_NEW_CHAIN_STRUCTURAL_PROOF_PASS';
    RAISE NOTICE 'COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED';
    RAISE NOTICE 'NO_APPLY_REQUIRED';
    PERFORM set_config('councils.preflight_terminal', 'COUNCILS_FULL_CHAIN_ALREADY_APPLIED_AND_VERIFIED', false);
    RETURN;
  END IF;

  -- Legacy path: exact inventory, fingerprint, predecessor ACL/RLS and absence
  -- of C0+ objects are all required before authorizing C0.
  SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_legacy_tables) t
  WHERE to_regclass('public.'||t) IS NULL;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy table(s) missing: %', array_to_string(v_missing, ', '); END IF;
  v_attachments_present := to_regclass('public.'||v_optional_table) IS NOT NULL;
  SELECT array_agg(c.relname ORDER BY c.relname) INTO v_extra FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'academic_council%'
    AND NOT (c.relname=ANY(v_legacy_tables)) AND c.relname IS DISTINCT FROM v_optional_table;
  IF v_extra IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy council table inventory drift: %', array_to_string(v_extra, ', '); END IF;
  SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_legacy_tables || CASE WHEN v_attachments_present THEN ARRAY[v_optional_table] ELSE ARRAY[]::text[] END) t
  JOIN pg_class c ON c.oid=to_regclass('public.'||t) WHERE NOT c.relrowsecurity;
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy RLS missing: %', array_to_string(v_missing, ', '); END IF;
  FOREACH v_enum IN ARRAY ARRAY['academic_council_type','academic_council_member_role','academic_council_meeting_status','academic_council_topic_status','academic_council_decision_status'] LOOP
    IF to_regtype('public.'||v_enum) IS NULL THEN RAISE EXCEPTION 'HOLD: legacy enum missing: %', v_enum; END IF;
  END LOOP;
  FOR v_enum,v_labels IN
    SELECT * FROM (VALUES
      ('academic_council_type', ARRAY['college','department']::text[]),
      ('academic_council_member_role', ARRAY['chair','vice_chair','secretary','member','viewer']::text[]),
      ('academic_council_meeting_status', ARRAY['scheduled','intake_open','intake_closed','agenda_ready','in_session','minutes_draft','minutes_locked','archived','cancelled']::text[]),
      ('academic_council_topic_status', ARRAY['draft','submitted','under_review','needs_completion','accepted_for_agenda','deferred','rejected','decided','closed']::text[]),
      ('academic_council_decision_status', ARRAY['issued','assigned','in_progress','partially_completed','completed','delayed','cancelled']::text[])
    ) AS x(enum_name, expected_labels)
  LOOP
    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) INTO v_extra
    FROM pg_enum e WHERE e.enumtypid = ('public.'||v_enum)::regtype;
    IF v_extra IS DISTINCT FROM v_labels THEN
      RAISE EXCEPTION 'HOLD: legacy enum labels drift for %: expected %, got %', v_enum, v_labels, v_extra;
    END IF;
  END LOOP;
  SELECT array_agg(f ORDER BY f) INTO v_missing FROM unnest(v_legacy_functions) f
  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f)
    AND (
      v_attachments_present
      OR f NOT IN (
        'council_topic_attachment_count',
        'can_add_council_topic_attachment',
        'can_read_council_topic_attachment',
        'can_upload_council_topic_attachment',
        'tg_enforce_council_topic_attachment'
      )
    );
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy function inventory drift: %', array_to_string(v_missing, ', '); END IF;
  SELECT array_agg(p.proname ORDER BY p.proname) INTO v_extra
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND (
    p.proname IN (
      'council_schedule_meeting','council_transition_meeting','record_council_meeting_attendance',
      'open_council_session','draft_council_minutes','issue_council_decision',
      'archive_council_meeting','create_council_notification','dispatch_council_notification',
      'get_council_notification_recipients','get_my_council_notifications',
      'acknowledge_council_notification'
    ) OR p.proname LIKE 'get_council_report_%'
  );
  IF v_extra IS NOT NULL THEN RAISE EXCEPTION 'HOLD: forbidden C0+ function(s) in legacy state: %', array_to_string(v_extra, ', '); END IF;
  SELECT array_agg(e.tablename||'.'||e.policyname ORDER BY e.tablename,e.policyname) INTO v_missing
  FROM (SELECT split_part(s,'|',1) tablename,split_part(s,'|',2) policyname,split_part(s,'|',3) cmd FROM unnest(v_expected_policies) s) e
  WHERE NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=e.tablename AND p.policyname=e.policyname AND p.cmd=e.cmd AND p.roles=ARRAY['authenticated']::name[]);
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy policy inventory drift: %', array_to_string(v_missing, ', '); END IF;
  IF EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename LIKE 'academic_council%'
    AND NOT EXISTS (SELECT 1 FROM unnest(v_expected_policies) s WHERE split_part(s,'|',1)=p.tablename AND split_part(s,'|',2)=p.policyname)
    AND NOT (p.tablename=v_optional_table AND p.policyname LIKE 'acta_%')) THEN
    RAISE EXCEPTION 'HOLD: legacy contains unknown public council policy';
  END IF;
  FOREACH v_fn IN ARRAY v_legacy_helpers LOOP
    SELECT p.oid,p.proconfig INTO v_oid,v_search FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=v_fn ORDER BY p.oid LIMIT 1;
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) OR position('public' IN coalesce(array_to_string(v_search,','),''))=0 THEN
      RAISE EXCEPTION 'HOLD: legacy helper security/search_path drift: %', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated',v_oid,'EXECUTE') OR has_function_privilege('anon',v_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'HOLD: legacy helper ACL drift: %', v_fn;
    END IF;
  END LOOP;
  IF v_attachments_present THEN
    IF to_regclass('storage.buckets') IS NULL THEN
      RAISE EXCEPTION 'HOLD: academic_council_topic_attachments present but storage.buckets is missing';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='council-topic-attachments')
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_select')
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_insert') THEN
      RAISE EXCEPTION 'HOLD: legacy attachments storage contract failed';
    END IF;
  END IF;
  SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_legacy_tables) t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=t AND con.contype='p'
  );
  IF v_missing IS NOT NULL THEN RAISE EXCEPTION 'HOLD: legacy table(s) missing primary key: %', array_to_string(v_missing, ', '); END IF;
  IF to_regclass('public.idx_acmeet_council_year_number') IS NULL
     OR to_regclass('public.idx_acmeet_council_number_without_year') IS NULL THEN
    RAISE EXCEPTION 'HOLD: legacy meeting unique index inventory drift';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgcrypto') THEN RAISE EXCEPTION 'HOLD: pgcrypto extension required for schema fingerprint'; END IF;
  SELECT encode(digest(string_agg(line,E'\n' ORDER BY line),'sha256'),'hex') INTO v_actual FROM (
    SELECT 'table:'||c.relname||':'||a.attnum||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod) line FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'academic_council%' AND a.attnum>0 AND NOT a.attisdropped
    UNION ALL SELECT 'constraint:'||con.conname||':'||pg_get_constraintdef(con.oid) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'academic_council%'
    UNION ALL SELECT 'index:'||i.relname||':'||pg_get_indexdef(i.oid) FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_class c ON c.oid=x.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'academic_council%'
    UNION ALL SELECT 'trigger:'||t.tgname||':'||pg_get_triggerdef(t.oid,true) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname LIKE 'academic_council%' AND NOT t.tgisinternal
    UNION ALL SELECT 'enum:'||t.typname||':'||string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname LIKE 'academic_council%' GROUP BY t.typname
    UNION ALL SELECT 'function:'||p.proname||':'||pg_get_function_identity_arguments(p.oid)||':'||btrim(regexp_replace(pg_get_functiondef(p.oid),'\s+',' ','g')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(v_legacy_functions)
    UNION ALL SELECT 'policy:'||p.schemaname||':'||p.tablename||':'||p.policyname||':'||p.cmd||':'||coalesce(p.qual::text,'NULL')||':'||coalesce(p.with_check::text,'NULL') FROM pg_policies p WHERE (p.schemaname='public' AND p.tablename LIKE 'academic_council%') OR (p.schemaname='storage' AND p.tablename='objects' AND p.policyname LIKE 'acta_%')
  ) q;
  RAISE NOTICE 'PREFLIGHT_SCHEMA_FINGERPRINT: %', v_actual;
  -- Non-production deprecated override guard. Production override attempts are
  -- structurally rejected in Phase D before any successful terminal return.
  IF coalesce(current_setting('councils.fingerprint_expected', true), '') <> '' THEN
    RAISE EXCEPTION 'HOLD: deprecated councils.fingerprint_expected; use councils.local_test_fingerprint_mode=LOCAL_TEST_ONLY';
  END IF;
  v_expected := '3985ae87d59f5bb50b8088c8a620846fcb2203e9238d59d98db18e18210d44a9';
  IF NOT v_production_ledger AND v_actual IS DISTINCT FROM v_expected THEN
    IF current_setting('councils.local_test_fingerprint_mode',true) = 'LOCAL_TEST_ONLY' THEN
      v_expected := nullif(current_setting('councils.local_test_fingerprint_expected',true),'');
      IF v_expected IS NULL OR v_expected = '' THEN
        RAISE EXCEPTION 'HOLD: LOCAL_TEST_ONLY requires councils.local_test_fingerprint_expected (self-match forbidden)';
      END IF;
      RAISE NOTICE 'PREFLIGHT_LOCAL_TEST_FINGERPRINT_MODE: LOCAL_TEST_ONLY';
    ELSE
      RAISE EXCEPTION 'HOLD: disposable fingerprint mismatch; require canonical pin match or councils.local_test_fingerprint_mode=LOCAL_TEST_ONLY with local_test_fingerprint_expected';
    END IF;
  END IF;
  RAISE NOTICE 'PREFLIGHT_FINGERPRINT_EXPECTED: %',v_expected;
  IF v_actual IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'HOLD: schema fingerprint mismatch; expected %, got %',v_expected,v_actual; END IF;
  RAISE NOTICE 'PREFLIGHT_FINGERPRINT_MATCH: LEGACY_SUPPORTED_EXACT';
  RAISE NOTICE 'READY_FOR_APPLY_C0';
  PERFORM set_config('councils.preflight_terminal', 'READY_FOR_APPLY_C0', false);
END $$;

-- Terminal status is set only after the DO block proves the correlated state.
-- Never derive PASS/apply markers from the migration ledger alone.
SELECT current_setting('councils.preflight_terminal', true) AS preflight_status;
