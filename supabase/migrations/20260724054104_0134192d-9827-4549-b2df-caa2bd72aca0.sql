-- DRAFT ONLY — DO NOT APPLY FROM THIS FILE.
-- Shared atomic B1 submit/action boundary. Service-specific validators and detail
-- persistence replace the fail-closed dispatcher in later ordered migrations.

BEGIN;

CREATE OR REPLACE FUNCTION public.persist_validated_b1_request_details(
  p_request_id uuid,
  p_canonical_code text,
  p_form_data jsonb,
  p_attachment_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'B1_SERVICE_PERSISTENCE_NOT_INSTALLED:%', p_canonical_code
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.persist_validated_b1_request_details(uuid,text,jsonb,uuid[])
  FROM PUBLIC, anon, authenticated;

COMMIT;

-- NOTE: The full atomic submit migration exceeds the safe single-approval size for this session.
-- This approval installs only the fail-closed dispatcher stub. Remaining objects
-- (guards, triggers, is_valid_b1_direct_assignment, initialize_b1_request_workflow_strict,
-- submit_b1_student_request_atomic) will be applied in a follow-up approval within the same lineage.