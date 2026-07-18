-- DRAFT ONLY — NOT APPLIED — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01
--
-- Production currently hosts BOTH overloads:
--   public.log_audit(text, uuid, text, jsonb, jsonb, text)                 -- 6-arg
--   public.log_audit(text, uuid, text, jsonb, jsonb, text, uuid)           -- 7-arg
-- Untyped 5/6-arg positional calls can raise ambiguous_function (42725),
-- the failure class previously observed on cancel_official_document.
--
-- This draft is forward-only:
--   * does NOT DROP either overload
--   * does NOT rewrite historical audit_logs rows
--   * remediates cancel_official_document to call the 7-arg form explicitly
--   * documents the mandatory call contract for every later B1 draft
--
-- Legal B1 call contract (match import_students_account_audit_fix):
--   PERFORM public.log_audit(
--     <entity_type>::text,
--     <entity_id>::uuid,
--     <action_type>::text,
--     <old>::jsonb,          -- or NULL::jsonb
--     <new>::jsonb,          -- or NULL::jsonb
--     <notes>::text,         -- or NULL::text
--     <actor_user_id>::uuid  -- auth.uid() / explicit actor; NULL::uuid only when intentional
--   );

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text)') IS NULL THEN
    RAISE EXCEPTION 'B1_LOG_AUDIT_SIX_ARG_MISSING';
  END IF;
  IF to_regprocedure('public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'B1_LOG_AUDIT_SEVEN_ARG_MISSING';
  END IF;
  -- Both overloads must remain. Downstream B1 drafts must never rely on
  -- implicit resolution of untyped 5/6-arg positional calls.
END $$;

-- Prevent recurrence of the cancel_official_document ambiguity class.
-- Applied migrations are not edited; this is a forward CREATE OR REPLACE only.
CREATE OR REPLACE FUNCTION public.cancel_official_document(
  _document_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc record;
BEGIN
  IF NOT public.has_any_role(
    v_uid,
    ARRAY['admin','system_admin','registrar','student_affairs','dean']
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_doc FROM public.official_documents WHERE id = _document_id;
  IF v_doc IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  UPDATE public.official_documents
     SET status = 'cancelled', updated_at = now()
   WHERE id = _document_id;

  -- Explicit 7-arg overload; never rely on DEFAULT resolution.
  PERFORM public.log_audit(
    'document'::text,
    _document_id::uuid,
    'document_cancelled'::text,
    jsonb_build_object('status', v_doc.status)::jsonb,
    jsonb_build_object(
      'status', 'cancelled',
      'document_number', v_doc.document_number,
      'reason', _reason
    )::jsonb,
    NULL::text,
    v_uid::uuid
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_official_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_official_document(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cancel_official_document(uuid, text) IS
  'B1_LOG_AUDIT_EXPLICIT_SEVEN_ARG=1; forward remediation; no historical rewrite';

COMMIT;
