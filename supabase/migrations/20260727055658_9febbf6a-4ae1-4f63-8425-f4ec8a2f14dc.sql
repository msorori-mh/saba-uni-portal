DO $field_constraint$
DECLARE v_def text; v_norm text; v_validated boolean;
BEGIN
  SELECT pg_get_constraintdef(c.oid,false),c.convalidated INTO v_def,v_validated
  FROM pg_constraint c WHERE c.conrelid='public.student_request_attachment_uploads'::regclass
    AND c.conname='student_request_attachment_uploads_field_key_check' AND c.contype='c';
  IF v_def IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_CONSTRAINT_MISSING'; END IF;
  v_norm:=regexp_replace(v_def,'\s+','','g');
  IF v_norm IN (
    'CHECK((field_key=''excuse_documents''::text))',
    'CHECK(field_key=''excuse_documents''::text)'
  ) THEN
    ALTER TABLE public.student_request_attachment_uploads
      DROP CONSTRAINT student_request_attachment_uploads_field_key_check;
    ALTER TABLE public.student_request_attachment_uploads
      ADD CONSTRAINT student_request_attachment_uploads_field_key_check
      CHECK (field_key IN ('excuse_documents','secondary_certificate')) NOT VALID;
    ALTER TABLE public.student_request_attachment_uploads
      VALIDATE CONSTRAINT student_request_attachment_uploads_field_key_check;
  ELSIF v_norm NOT IN (
    'CHECK((field_key=ANY(ARRAY[''excuse_documents''::text,''secondary_certificate''::text])))',
    'CHECK((field_key=ANY(ARRAY[''excuse_documents''::text,''secondary_certificate''::text])))NOTVALID',
    'CHECK(field_key=ANY(ARRAY[''excuse_documents''::text,''secondary_certificate''::text]))',
    'CHECK(field_key=ANY(ARRAY[''excuse_documents''::text,''secondary_certificate''::text]))NOTVALID'
  ) THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_CONSTRAINT_UNEXPECTED:%',v_def;
  ELSIF NOT v_validated THEN
    ALTER TABLE public.student_request_attachment_uploads
      VALIDATE CONSTRAINT student_request_attachment_uploads_field_key_check;
  END IF;
  IF (SELECT count(*) FROM pg_constraint c WHERE c.conrelid='public.student_request_attachment_uploads'::regclass
      AND c.contype='c' AND pg_get_constraintdef(c.oid,true) ILIKE '%field_key%')<>1
    THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_CONSTRAINT_INVENTORY_MISMATCH'; END IF;
END
$field_constraint$;

CREATE OR REPLACE FUNCTION public.b1_expected_secure_attachment_field(p_request_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT CASE p_request_type
    WHEN 'excused_absence' THEN 'excuse_documents'
    WHEN 'absence_excuse' THEN 'excuse_documents'
    WHEN 'department_transfer' THEN 'secondary_certificate'
    WHEN 'transfer' THEN 'secondary_certificate'
    ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.b1_expected_secure_attachment_field(text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_student_request_attachment_upload_intent(
  p_student_request_id uuid,p_field_key text,p_original_file_name text,p_mime_type text,
  p_size_bytes bigint,p_checksum_sha256 text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_profile_id uuid; v_req public.student_requests%ROWTYPE;
  v_id uuid:=gen_random_uuid(); v_path text; v_count integer; v_expected_field text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED' USING ERRCODE='28000'; END IF;
  SELECT sp.id INTO v_profile_id FROM public.student_profiles sp WHERE sp.user_id=v_uid AND sp.status='active';
  SELECT * INTO v_req FROM public.student_requests r
    WHERE r.id=p_student_request_id AND r.student_profile_id=v_profile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_OWNED' USING ERRCODE='42501'; END IF;
  IF v_req.status NOT IN ('draft','returned','returned_for_completion')
    THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_EDITABLE' USING ERRCODE='42501'; END IF;
  v_expected_field:=public.b1_expected_secure_attachment_field(v_req.request_type);
  IF v_expected_field IS NULL OR p_field_key IS DISTINCT FROM v_expected_field
    THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF p_mime_type NOT IN ('application/pdf','image/jpeg','image/png')
    THEN RAISE EXCEPTION 'ATTACHMENT_MIME_NOT_ALLOWED'; END IF;
  IF p_size_bytes<=0 OR p_size_bytes>5242880 THEN RAISE EXCEPTION 'ATTACHMENT_SIZE_EXCEEDED'; END IF;
  IF p_original_file_name IS NULL OR length(btrim(p_original_file_name)) NOT BETWEEN 1 AND 255
    OR p_original_file_name ~ '[\\/]' OR p_original_file_name LIKE '%..%'
    THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH'; END IF;
  SELECT count(*) INTO v_count FROM public.student_request_attachment_uploads a
    WHERE a.student_request_id=v_req.id AND a.field_key=p_field_key AND a.upload_status<>'rejected';
  IF v_count>=3 THEN RAISE EXCEPTION 'ATTACHMENT_COUNT_EXCEEDED'; END IF;
  v_path:=format('student-requests/%s/%s/%s/content.%s',v_profile_id,v_req.id,v_id,
    CASE p_mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' ELSE 'jpg' END);
  INSERT INTO public.student_request_attachment_uploads(
    id,student_request_id,student_profile_id,field_key,original_file_name,mime_type,size_bytes,
    storage_bucket,storage_object_path,checksum_sha256,created_by)
  VALUES(v_id,v_req.id,v_profile_id,p_field_key,p_original_file_name,p_mime_type,p_size_bytes,
    'student-request-secure-attachments',v_path,p_checksum_sha256,v_uid);
  PERFORM public.log_audit(
    'student_request_attachment'::text,
    v_id::uuid,
    'attachment_upload_intent_created'::text,
    NULL::jsonb,
    jsonb_build_object('request_id',v_req.id,'field_key',p_field_key)::jsonb,
    NULL::text,
    v_uid::uuid
  );
  RETURN jsonb_build_object('attachment_id',v_id);
END $$;

CREATE OR REPLACE FUNCTION public.assert_required_student_request_attachments(
  p_student_request_id uuid,p_attachment_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_profile_id uuid; v_request public.student_requests%ROWTYPE;
  v_expected integer; v_attached integer; v_expected_field text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED' USING ERRCODE='28000'; END IF;
  SELECT sp.id INTO v_profile_id FROM public.student_profiles sp WHERE sp.user_id=v_uid AND sp.status='active';
  SELECT r.* INTO v_request FROM public.student_requests r WHERE r.id=p_student_request_id
    AND r.student_profile_id=v_profile_id AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_OWNED' USING ERRCODE='42501'; END IF;
  v_expected_field:=public.b1_expected_secure_attachment_field(v_request.request_type);
  IF v_expected_field IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  v_expected:=COALESCE(cardinality(p_attachment_ids),0);
  IF v_expected NOT BETWEEN 1 AND 3 OR v_expected<>(SELECT count(DISTINCT x) FROM unnest(p_attachment_ids) x)
    THEN RAISE EXCEPTION 'ATTACHMENT_UPLOAD_NOT_COMPLETED'; END IF;
  PERFORM 1 FROM public.student_request_attachment_uploads a WHERE a.id=ANY(p_attachment_ids)
    AND a.student_request_id=p_student_request_id AND a.student_profile_id=v_profile_id FOR UPDATE;
  SELECT count(*) INTO v_attached FROM public.student_request_attachment_uploads a
    WHERE a.id=ANY(p_attachment_ids) AND a.student_request_id=p_student_request_id
      AND a.student_profile_id=v_profile_id AND a.field_key=v_expected_field
      AND a.upload_status='attached' AND a.mime_type IN ('application/pdf','image/jpeg','image/png')
      AND a.size_bytes BETWEEN 1 AND 5242880;
  IF v_attached<>v_expected THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH' USING ERRCODE='42501'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.assert_required_student_request_attachments(uuid,uuid[])
  FROM PUBLIC,anon,authenticated;

-- Old wrapper cannot satisfy atomic 04's form/version arguments and must not bypass it.
REVOKE ALL ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[])
  FROM PUBLIC,anon,authenticated;