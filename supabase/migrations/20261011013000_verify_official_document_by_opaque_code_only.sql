-- Document numbers are sequential public identifiers. Authenticity checks
-- must require the unguessable verification code printed on the document.
CREATE OR REPLACE FUNCTION public.verify_document(_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.official_documents%ROWTYPE;
  v_q text := upper(trim(COALESCE(_query, '')));
BEGIN
  IF length(v_q) < 6 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO v_doc
  FROM public.official_documents
  WHERE upper(verification_code) = v_q
  LIMIT 1;

  IF v_doc.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'valid', v_doc.status IN ('issued', 'archived'),
    'document_type', v_doc.document_type,
    'document_number', v_doc.document_number,
    'status', v_doc.status,
    'issued_at', v_doc.issued_at,
    'reason', CASE
      WHEN v_doc.status = 'cancelled' THEN 'cancelled'
      WHEN v_doc.status NOT IN ('issued', 'archived') THEN 'not_valid_status'
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_document(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_document(text) TO anon, authenticated;
