CREATE OR REPLACE FUNCTION public.reject_student_request_attachment(p_attachment_id uuid, p_rejection_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.student_request_attachment_uploads%rowtype;
  v_req public.student_requests%rowtype;
  v_owner boolean := false;
  v_field text;
  v_val jsonb;
  v_new jsonb;
  v_code text := coalesce(nullif(btrim(p_rejection_code), ''), 'REMOVED_BY_STUDENT');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED';
  END IF;

  SELECT * INTO v_att
  FROM public.student_request_attachment_uploads
  WHERE id = p_attachment_id
  FOR UPDATE;

  IF v_att.id IS NULL THEN
    RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED';
  END IF;

  SELECT exists (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = v_att.student_profile_id
      AND sp.user_id = v_uid
  ) INTO v_owner;

  IF NOT (v_owner OR v_att.created_by = v_uid) THEN
    RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED';
  END IF;

  SELECT * INTO v_req
  FROM public.student_requests
  WHERE id = v_att.student_request_id
  FOR UPDATE;

  IF v_req.id IS NULL OR v_req.student_profile_id <> v_att.student_profile_id THEN
    RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED';
  END IF;

  IF v_req.status NOT IN ('draft', 'returned', 'returned_for_completion') THEN
    RAISE EXCEPTION 'ATTACHMENT_REMOVAL_NOT_ALLOWED';
  END IF;

  -- Idempotent: already removed leaves no second trace and does not fail.
  IF v_att.upload_status = 'rejected' THEN
    RETURN true;
  END IF;

  IF v_att.upload_status NOT IN ('pending', 'uploaded', 'attached') THEN
    RAISE EXCEPTION 'ATTACHMENT_REMOVAL_NOT_ALLOWED';
  END IF;

  UPDATE public.student_request_attachment_uploads
     SET upload_status = 'rejected',
         rejected_at = now(),
         rejection_code = v_code
   WHERE id = p_attachment_id;

  -- Drop only this attachment reference from the matching form_data field.
  v_field := v_att.field_key;
  v_val := coalesce(v_req.form_data, '{}'::jsonb) -> v_field;

  IF jsonb_typeof(v_val) = 'array' THEN
    SELECT coalesce(jsonb_agg(e), '[]'::jsonb) INTO v_new
    FROM jsonb_array_elements(v_val) e
    WHERE e <> to_jsonb(p_attachment_id::text);

    UPDATE public.student_requests
       SET form_data = jsonb_set(coalesce(form_data, '{}'::jsonb), ARRAY[v_field], v_new, true),
           updated_at = now()
     WHERE id = v_req.id;
  ELSIF jsonb_typeof(v_val) = 'string' AND (v_val #>> '{}') = p_attachment_id::text THEN
    UPDATE public.student_requests
       SET form_data = coalesce(form_data, '{}'::jsonb) - v_field,
           updated_at = now()
     WHERE id = v_req.id;
  ELSE
    UPDATE public.student_requests
       SET updated_at = now()
     WHERE id = v_req.id;
  END IF;

  PERFORM public.log_audit(
    'student_request_attachment'::text,
    p_attachment_id::uuid,
    'attachment_rejected'::text,
    NULL::jsonb,
    NULL::jsonb,
    v_code::text,
    v_uid::uuid
  );

  RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.list_my_student_request_attachments(p_student_request_id uuid)
 RETURNS SETOF public.student_request_attachment_uploads
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT a.*
  FROM public.student_request_attachment_uploads a
  JOIN public.student_profiles sp ON sp.id = a.student_profile_id
  WHERE a.student_request_id = p_student_request_id
    AND sp.user_id = auth.uid()
    AND a.upload_status IN ('pending', 'uploaded', 'attached')
$function$;