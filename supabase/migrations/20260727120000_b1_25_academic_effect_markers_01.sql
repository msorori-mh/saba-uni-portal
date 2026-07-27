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
