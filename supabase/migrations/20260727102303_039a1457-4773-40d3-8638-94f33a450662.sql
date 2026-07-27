-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-FIRST-DELIVERY / order 25
-- Source draft: docs/migration-drafts/B1-ACADEMIC-EFFECT-MARKERS-01.sql
-- Companion preflight/post-verifier: docs/migration-drafts/b1-backend-verifiers/
-- Semantic parity with the source draft is required; production apply is a separate gate.

-- Forward-only markers and transfer audit snapshot fields. No backfill.
ALTER TABLE public.enrollment_suspension_details
  ADD COLUMN IF NOT EXISTS effect_applied_at timestamptz;

ALTER TABLE public.transfer_request_details
  ADD COLUMN IF NOT EXISTS effect_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS previous_program_id uuid REFERENCES public.programs(id);

ALTER TABLE public.file_withdrawal_details
  ADD COLUMN IF NOT EXISTS effect_applied_at timestamptz;

-- Allow effect functions to emit workflow events without violating the
-- SEQ07-widened event_type vocabulary (forward-only additive member).
ALTER TABLE public.student_request_workflow_events
  DROP CONSTRAINT IF EXISTS student_request_workflow_events_event_type_chk;
ALTER TABLE public.student_request_workflow_events
  ADD CONSTRAINT student_request_workflow_events_event_type_chk
  CHECK (event_type IN (
    'created','submitted','step_entered','assigned','commented','approved','rejected',
    'returned','attachment_requested','payment_requested','payment_confirmed',
    'reviewed','cleared','applied','signed','archived',
    'document_issued','completed','cancelled','academic_effect_applied'
  ));