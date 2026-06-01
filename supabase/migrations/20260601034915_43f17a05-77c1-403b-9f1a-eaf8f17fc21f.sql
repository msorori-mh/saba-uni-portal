
-- ===== Phase 9A: Official Documents =====

CREATE TABLE public.official_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN (
    'enrollment_certificate','student_status_certificate','official_transcript','financial_receipt'
  )),
  document_number text NOT NULL UNIQUE,
  verification_code text NOT NULL UNIQUE,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','cancelled')),
  pdf_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_official_documents_student ON public.official_documents(student_profile_id);
CREATE INDEX idx_official_documents_type    ON public.official_documents(document_type);
CREATE INDEX idx_official_documents_number  ON public.official_documents(document_number);
CREATE INDEX idx_official_documents_verify  ON public.official_documents(verification_code);
CREATE INDEX idx_official_documents_issued_at ON public.official_documents(issued_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.official_documents TO authenticated;
GRANT ALL ON public.official_documents TO service_role;

ALTER TABLE public.official_documents ENABLE ROW LEVEL SECURITY;

-- Student: own documents (read only)
CREATE POLICY "Students view own documents"
ON public.official_documents FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.student_profiles sp
          WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean','registrar','student_affairs'])
);

-- Issuance: registrar / student_affairs / admin / system_admin
CREATE POLICY "Staff issue documents"
ON public.official_documents FOR INSERT TO authenticated
WITH CHECK (
  public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
);

CREATE POLICY "Staff update documents"
ON public.official_documents FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean']))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean']));

-- updated_at
CREATE TRIGGER trg_official_documents_updated_at
BEFORE UPDATE ON public.official_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== Helpers =====

CREATE OR REPLACE FUNCTION public.generate_document_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(now(), 'YYYY');
  v_count int;
  v_num text;
BEGIN
  LOOP
    SELECT COUNT(*) + 1 INTO v_count
      FROM public.official_documents
      WHERE document_number LIKE 'USR-' || v_year || '-%';
    v_num := 'USR-' || v_year || '-' || lpad(v_count::text, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.official_documents WHERE document_number = v_num);
  END LOOP;
  RETURN v_num;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_verification_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  LOOP
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.official_documents WHERE verification_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- ===== Issue document RPC (single entry point) =====

CREATE OR REPLACE FUNCTION public.issue_official_document(
  _student_profile_id uuid,
  _document_type text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_num text;
  v_code text;
  v_action text;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar','student_affairs']) THEN
    RAISE EXCEPTION 'Not authorized to issue documents';
  END IF;

  IF _document_type NOT IN (
    'enrollment_certificate','student_status_certificate','official_transcript','financial_receipt'
  ) THEN
    RAISE EXCEPTION 'Invalid document_type: %', _document_type;
  END IF;

  v_num := public.generate_document_number();
  v_code := public.generate_verification_code();

  INSERT INTO public.official_documents(
    student_profile_id, document_type, document_number, verification_code,
    issued_by, status, metadata
  ) VALUES (
    _student_profile_id, _document_type, v_num, v_code, v_uid, 'issued', COALESCE(_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  v_action := CASE _document_type
    WHEN 'enrollment_certificate' THEN 'certificate_generated'
    WHEN 'student_status_certificate' THEN 'certificate_generated'
    WHEN 'official_transcript' THEN 'transcript_generated'
    WHEN 'financial_receipt' THEN 'financial_receipt_generated'
  END;

  PERFORM public.log_audit('document', v_id, v_action, NULL,
    jsonb_build_object(
      'document_number', v_num,
      'document_type', _document_type,
      'student_profile_id', _student_profile_id,
      'verification_code', v_code
    ));

  RETURN jsonb_build_object(
    'id', v_id,
    'document_number', v_num,
    'verification_code', v_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_official_document(_document_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_doc record;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','system_admin','registrar','student_affairs','dean']) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT * INTO v_doc FROM public.official_documents WHERE id = _document_id;
  IF v_doc IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;

  UPDATE public.official_documents SET status = 'cancelled', updated_at = now()
   WHERE id = _document_id;

  PERFORM public.log_audit('document', _document_id, 'document_cancelled',
    jsonb_build_object('status', v_doc.status),
    jsonb_build_object('status', 'cancelled', 'document_number', v_doc.document_number, 'reason', _reason));
END;
$$;

-- ===== Public verification RPC (anon-callable) =====

CREATE OR REPLACE FUNCTION public.verify_document(_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc record;
  v_q text := upper(trim(COALESCE(_query, '')));
BEGIN
  IF length(v_q) < 6 THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_input');
  END IF;
  SELECT id, document_type, document_number, status, issued_at
    INTO v_doc
    FROM public.official_documents
    WHERE upper(document_number) = v_q OR upper(verification_code) = v_q
    LIMIT 1;
  IF v_doc.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'valid', v_doc.status = 'issued',
    'document_type', v_doc.document_type,
    'document_number', v_doc.document_number,
    'status', v_doc.status,
    'issued_at', v_doc.issued_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_document(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_official_document(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_official_document(uuid, text) TO authenticated;
