-- DRAFT ONLY — DO NOT APPLY FROM THIS PATH.
-- B1-WORKFLOW-EVENT-TYPES-FEE-DECISION-01 — allow the two event types the fee-decision
-- cycle writes to public.student_request_workflow_events.
--
-- Production defect (2026-10-07): the CHECK constraint
-- student_request_workflow_events_event_type_chk listed neither
--   'fee_decision_recorded'  — written by record_excused_absence_fee_decision and
--                              record_b1_fee_decision (visible to the student), nor
--   'skip'                   — written by act_on_b1_student_request_step_atomic when a
--                              conditional transition skips steps (the no-fee branch).
-- Every fee decision therefore failed with 23514. The rehearsal schema had no such
-- constraint, so the earlier drafts passed. Applied to production 2026-10-07 by the
-- owner's standing authorization for this feature.
--
-- Adds values only (existing values are preserved verbatim); writes no row.
-- Idempotent. Fail closed if the constraint is missing or has an unexpected shape.

BEGIN;

DO $evt$
DECLARE
  v_oid oid;
  v_def text;
  v_validated boolean;
  v_values text[];
  v_new text[];
BEGIN
  SELECT c.oid, pg_get_constraintdef(c.oid), c.convalidated INTO v_oid, v_def, v_validated
  FROM pg_constraint c
  WHERE c.conrelid = 'public.student_request_workflow_events'::regclass
    AND c.conname = 'student_request_workflow_events_event_type_chk' AND c.contype = 'c';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'B1_EVT01_CONSTRAINT_MISSING'; END IF;
  IF v_def NOT LIKE 'CHECK ((event_type = ANY (ARRAY[%' THEN
    RAISE EXCEPTION 'B1_EVT01_CONSTRAINT_SHAPE_UNEXPECTED';
  END IF;
  SELECT array_agg(m[1] ORDER BY ord) INTO v_values
  FROM regexp_matches(v_def, '''([a-z_]+)''::text', 'g') WITH ORDINALITY AS t(m, ord);
  IF v_values IS NULL OR NOT ('created' = ANY (v_values) AND 'reviewed' = ANY (v_values)) THEN
    RAISE EXCEPTION 'B1_EVT01_CONSTRAINT_VALUES_UNEXPECTED';
  END IF;

  v_new := v_values;
  IF NOT ('fee_decision_recorded' = ANY (v_new)) THEN v_new := v_new || 'fee_decision_recorded'::text; END IF;
  IF NOT ('skip' = ANY (v_new)) THEN v_new := v_new || 'skip'::text; END IF;
  IF v_new = v_values THEN RETURN; END IF;

  ALTER TABLE public.student_request_workflow_events
    DROP CONSTRAINT student_request_workflow_events_event_type_chk;
  EXECUTE format(
    'ALTER TABLE public.student_request_workflow_events ADD CONSTRAINT student_request_workflow_events_event_type_chk CHECK (event_type = ANY (ARRAY[%s]))%s',
    (SELECT string_agg(quote_literal(x) || '::text', ', ' ORDER BY ord) FROM unnest(v_new) WITH ORDINALITY AS u(x, ord)),
    CASE WHEN v_validated THEN '' ELSE ' NOT VALID' END);

  v_def := pg_get_constraintdef((SELECT c.oid FROM pg_constraint c
    WHERE c.conrelid = 'public.student_request_workflow_events'::regclass
      AND c.conname = 'student_request_workflow_events_event_type_chk'));
  IF EXISTS (SELECT 1 FROM unnest(v_new) x WHERE position(quote_literal(x) in v_def) = 0) THEN
    RAISE EXCEPTION 'B1_EVT01_POST_VALUE_MISSING';
  END IF;
END $evt$;

COMMIT;
