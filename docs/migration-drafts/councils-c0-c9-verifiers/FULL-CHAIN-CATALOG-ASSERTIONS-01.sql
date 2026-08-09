-- COUNCILS-C0-C9 FULL-CHAIN CATALOG ASSERTIONS 01
-- Operator filesystem form: run with psql from this directory so \ir resolves.
-- The production preflight FULL path embeds equivalent stdin-safe assertions;
-- this file reuses the post-verifier contracts for operator investigation.
\set ON_ERROR_STOP on

\ir POST-VERIFIER-C0.sql
\ir POST-VERIFIER-C1.sql
\ir POST-VERIFIER-C2.sql
\ir POST-VERIFIER-C3.sql
\ir POST-VERIFIER-C4.sql
\ir POST-VERIFIER-C5.sql
\ir POST-VERIFIER-C6.sql
\ir POST-VERIFIER-C7.sql
\ir POST-VERIFIER-C8.sql
\ir POST-VERIFIER-C9.sql

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'academic_councils','academic_council_members','academic_council_meetings',
    'academic_council_topics','academic_council_agenda_items','academic_council_minutes',
    'academic_council_decisions','academic_council_meeting_transition_events',
    'academic_council_quorum_policies','academic_council_meeting_attendance_rolls',
    'academic_council_meeting_attendance','academic_council_meeting_quorum_evaluations',
    'academic_council_attendance_audit_events','academic_council_votes',
    'academic_council_vote_results','academic_council_minutes_amendments',
    'academic_council_audit_events','academic_council_notifications'
  ];
  v_missing text[];
  v_attachments boolean := to_regclass('public.academic_council_topic_attachments') IS NOT NULL;
BEGIN
  IF v_attachments THEN v_tables := v_tables || 'academic_council_topic_attachments'; END IF;
  SELECT array_agg(t ORDER BY t) INTO v_missing FROM unnest(v_tables) t
  WHERE has_table_privilege('authenticated','public.' || t,'INSERT')
     OR has_table_privilege('authenticated','public.' || t,'DELETE')
     OR (
       t IS DISTINCT FROM 'academic_council_notifications'
       AND has_table_privilege('authenticated','public.' || t,'UPDATE')
     );
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'HOLD: authenticated direct DML remains on core council table(s): %',
      array_to_string(v_missing, ', ');
  END IF;
  IF v_attachments AND (
    NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'council-topic-attachments')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_select')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='acta_storage_insert')
  ) THEN
    RAISE EXCEPTION 'HOLD: attachment storage bucket or acta_storage policies missing';
  END IF;
END $$;

SELECT 'COUNCILS_FULL_CHAIN_CATALOG_ASSERTIONS_PASS' AS catalog_assertions_status;
