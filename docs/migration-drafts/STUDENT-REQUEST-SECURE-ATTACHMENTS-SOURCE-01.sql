-- DRAFT ONLY — NOT APPLIED — DO NOT EXECUTE WITHOUT EXPLICIT APPROVAL
-- Source design for an independent secure attachment runtime. This file is not a migration.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('student-request-secure-attachments','student-request-secure-attachments',false,5242880,
  ARRAY['application/pdf','image/jpeg','image/png']::text[])
ON CONFLICT (id) DO UPDATE SET public=false,file_size_limit=5242880,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE TABLE public.student_request_attachment_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_request_id uuid NOT NULL REFERENCES public.student_requests(id),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id),
  field_key text NOT NULL CHECK (field_key='excuse_documents'),
  original_file_name text NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 255),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  storage_bucket text NOT NULL CHECK (storage_bucket='student-request-secure-attachments'),
  storage_object_path text NOT NULL,
  upload_status text NOT NULL DEFAULT 'pending' CHECK (upload_status IN ('pending','uploaded','attached','rejected')),
  checksum_sha256 text CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), uploaded_at timestamptz, attached_at timestamptz,
  rejected_at timestamptz, rejection_code text,
  UNIQUE(storage_bucket, storage_object_path)
);
ALTER TABLE public.student_request_attachment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_request_attachment_uploads FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.protect_student_request_attachment_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
  IF (NEW.student_request_id,NEW.student_profile_id,NEW.field_key,NEW.storage_bucket,NEW.storage_object_path,NEW.created_by)
     IS DISTINCT FROM (OLD.student_request_id,OLD.student_profile_id,OLD.field_key,OLD.storage_bucket,OLD.storage_object_path,OLD.created_by)
  THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH' USING ERRCODE='42501'; END IF; RETURN NEW; END $$;
CREATE TRIGGER protect_student_request_attachment_identity BEFORE UPDATE ON public.student_request_attachment_uploads
FOR EACH ROW EXECUTE FUNCTION public.protect_student_request_attachment_identity();

-- The source implementation uses a server-proxy upload. The client receives only attachment_id.
CREATE FUNCTION public.create_student_request_attachment_upload_intent(
  p_student_request_id uuid,p_field_key text,p_original_file_name text,p_mime_type text,p_size_bytes bigint,p_checksum_sha256 text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_profile_id uuid; v_req public.student_requests%ROWTYPE; v_id uuid:=gen_random_uuid(); v_path text; v_count integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED' USING ERRCODE='28000'; END IF;
 SELECT sp.id INTO v_profile_id FROM public.student_profiles sp WHERE sp.user_id=v_uid;
 SELECT * INTO v_req FROM public.student_requests r WHERE r.id=p_student_request_id AND r.student_profile_id=v_profile_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_OWNED' USING ERRCODE='42501'; END IF;
 IF v_req.status <> 'draft' THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_EDITABLE' USING ERRCODE='42501'; END IF;
 IF v_req.request_type NOT IN ('excused_absence','absence_excuse') OR p_field_key <> 'excuse_documents' THEN RAISE EXCEPTION 'ATTACHMENT_FIELD_NOT_ALLOWED'; END IF;
 IF p_mime_type NOT IN ('application/pdf','image/jpeg','image/png') THEN RAISE EXCEPTION 'ATTACHMENT_MIME_NOT_ALLOWED'; END IF;
 IF p_size_bytes <= 0 OR p_size_bytes > 5242880 THEN RAISE EXCEPTION 'ATTACHMENT_SIZE_EXCEEDED'; END IF;
 SELECT count(*) INTO v_count FROM public.student_request_attachment_uploads a WHERE a.student_request_id=v_req.id AND a.field_key=p_field_key AND a.upload_status<>'rejected';
 IF v_count >= 3 THEN RAISE EXCEPTION 'ATTACHMENT_COUNT_EXCEEDED'; END IF;
 v_path:=format('student-requests/%s/%s/%s/content.%s',v_profile_id,v_req.id,v_id,CASE p_mime_type WHEN 'application/pdf' THEN 'pdf' WHEN 'image/png' THEN 'png' ELSE 'jpg' END);
 INSERT INTO public.student_request_attachment_uploads(id,student_request_id,student_profile_id,field_key,original_file_name,mime_type,size_bytes,storage_bucket,storage_object_path,checksum_sha256,created_by)
 VALUES(v_id,v_req.id,v_profile_id,p_field_key,p_original_file_name,p_mime_type,p_size_bytes,'student-request-secure-attachments',v_path,p_checksum_sha256,v_uid);
 PERFORM public.log_audit('student_request_attachment',v_id,'attachment_upload_intent_created',NULL,jsonb_build_object('request_id',v_req.id,'field_key',p_field_key),NULL);
 RETURN jsonb_build_object('attachment_id',v_id,'storage_bucket','student-request-secure-attachments','storage_object_path',v_path);
END $$;

CREATE FUNCTION public.complete_student_request_attachment_upload(p_attachment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,storage,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); a public.student_request_attachment_uploads%ROWTYPE; o storage.objects%ROWTYPE;
BEGIN
 SELECT * INTO a FROM public.student_request_attachment_uploads WHERE id=p_attachment_id AND created_by=v_uid FOR UPDATE;
 IF NOT FOUND OR a.upload_status<>'pending' THEN RAISE EXCEPTION 'ATTACHMENT_UPLOAD_NOT_COMPLETED'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id=a.storage_bucket AND name=a.storage_object_path;
 IF NOT FOUND OR coalesce((o.metadata->>'size')::bigint,-1)<>a.size_bytes OR coalesce(o.metadata->>'mimetype','')<>a.mime_type THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH'; END IF;
 UPDATE public.student_request_attachment_uploads SET upload_status='uploaded',uploaded_at=now() WHERE id=a.id;
 UPDATE public.student_request_attachment_uploads SET upload_status='attached',attached_at=now() WHERE id=a.id;
 PERFORM public.log_audit('student_request_attachment',a.id,'attachment_upload_completed',NULL,NULL,NULL);
 PERFORM public.log_audit('student_request_attachment',a.id,'attachment_attached',NULL,NULL,NULL);
 RETURN jsonb_build_object('attachmentId',a.id,'studentRequestId',a.student_request_id,'studentProfileId',a.student_profile_id,'fieldKey',a.field_key,'status','attached','mimeType',a.mime_type,'sizeBytes',a.size_bytes,'originalFileName',a.original_file_name,'checksumSha256',a.checksum_sha256);
END $$;

CREATE FUNCTION public.assert_required_student_request_attachments(p_student_request_id uuid,p_student_profile_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.student_request_attachment_uploads a WHERE a.student_request_id=p_student_request_id AND a.student_profile_id=p_student_profile_id AND a.field_key='excuse_documents' AND a.upload_status='attached' AND a.mime_type IN ('application/pdf','image/jpeg','image/png') AND a.size_bytes BETWEEN 1 AND 5242880;
 IF n NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'ATTACHMENT_UPLOAD_NOT_COMPLETED'; END IF;
 IF EXISTS(SELECT 1 FROM public.student_request_attachment_uploads a WHERE a.student_request_id=p_student_request_id AND a.upload_status<>'attached') THEN RAISE EXCEPTION 'ATTACHMENT_UPLOAD_NOT_COMPLETED'; END IF;
END $$;

-- Integrate PERFORM assert_required_student_request_attachments(...) inside the reviewed submit RPC,
-- before workflow initialization and in the same transaction. Do not replace the applied RPC in this draft.

CREATE FUNCTION public.list_my_student_request_attachments(p_student_request_id uuid) RETURNS SETOF public.student_request_attachment_uploads
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT a.* FROM public.student_request_attachment_uploads a JOIN public.student_profiles sp ON sp.id=a.student_profile_id WHERE a.student_request_id=p_student_request_id AND sp.user_id=auth.uid() $$;

CREATE FUNCTION public.get_owned_student_request_attachment_upload(p_attachment_id uuid) RETURNS SETOF public.student_request_attachment_uploads
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT a.* FROM public.student_request_attachment_uploads a JOIN public.student_profiles sp ON sp.id=a.student_profile_id WHERE a.id=p_attachment_id AND sp.user_id=auth.uid() AND a.upload_status='pending' $$;

CREATE FUNCTION public.reject_student_request_attachment(p_attachment_id uuid,p_rejection_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN UPDATE public.student_request_attachment_uploads SET upload_status='rejected',rejected_at=now(),rejection_code=p_rejection_code WHERE id=p_attachment_id AND created_by=auth.uid() AND upload_status IN ('pending','uploaded'); IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF; PERFORM public.log_audit('student_request_attachment',p_attachment_id,'attachment_rejected',NULL,NULL,p_rejection_code); RETURN true; END $$;

CREATE FUNCTION public.authorize_student_request_attachment_download(p_attachment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a public.student_request_attachment_uploads%ROWTYPE; owner_ok boolean; assigned_ok boolean; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF; SELECT * INTO a FROM public.student_request_attachment_uploads WHERE id=p_attachment_id AND upload_status='attached'; IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.student_profiles sp WHERE sp.id=a.student_profile_id AND sp.user_id=auth.uid()) INTO owner_ok;
 SELECT EXISTS(SELECT 1 FROM public.student_request_workflow_steps s WHERE s.student_request_id=a.student_request_id AND s.status='active'
   AND s.processing_unit_id IS NOT NULL AND s.processing_role_id IS NOT NULL AND (
     s.assigned_user_id=auth.uid()
     OR EXISTS(SELECT 1 FROM public.staff_profiles sp WHERE sp.id=s.assigned_staff_profile_id AND sp.user_id=auth.uid())
     OR EXISTS(SELECT 1 FROM public.faculty_profiles fp WHERE fp.id=s.assigned_faculty_profile_id AND fp.user_id=auth.uid())
     OR EXISTS(SELECT 1 FROM public.position_assignments pa WHERE pa.id=s.assigned_position_assignment_id AND pa.user_id=auth.uid() AND pa.is_active=true AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE))
   )) INTO assigned_ok;
 IF NOT owner_ok AND NOT assigned_ok THEN RAISE EXCEPTION 'ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED'; END IF;
 PERFORM public.log_audit('student_request_attachment',a.id,'attachment_downloaded',NULL,NULL,NULL);
 RETURN jsonb_build_object('storage_bucket',a.storage_bucket,'storage_object_path',a.storage_object_path);
END $$;

-- Storage policies are intent-bound; anon has no grant. No UPDATE/MOVE/DELETE policy in v1.
CREATE POLICY secure_attachment_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='student-request-secure-attachments' AND EXISTS(SELECT 1 FROM public.student_request_attachment_uploads a WHERE a.storage_bucket=bucket_id AND a.storage_object_path=name AND a.created_by=auth.uid() AND a.upload_status='pending'));
CREATE POLICY secure_attachment_owner_select ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='student-request-secure-attachments' AND EXISTS(SELECT 1 FROM public.student_request_attachment_uploads a JOIN public.student_profiles sp ON sp.id=a.student_profile_id WHERE a.storage_object_path=name AND sp.user_id=auth.uid()));
CREATE POLICY secure_attachment_direct_assignee_select ON storage.objects FOR SELECT TO authenticated USING (
 bucket_id='student-request-secure-attachments' AND EXISTS(SELECT 1 FROM public.student_request_attachment_uploads a JOIN public.student_request_workflow_steps s ON s.student_request_id=a.student_request_id AND s.status='active'
 WHERE a.storage_object_path=name AND s.processing_unit_id IS NOT NULL AND s.processing_role_id IS NOT NULL AND (
   s.assigned_user_id=auth.uid()
   OR EXISTS(SELECT 1 FROM public.staff_profiles sp WHERE sp.id=s.assigned_staff_profile_id AND sp.user_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.faculty_profiles fp WHERE fp.id=s.assigned_faculty_profile_id AND fp.user_id=auth.uid())
   OR EXISTS(SELECT 1 FROM public.position_assignments pa WHERE pa.id=s.assigned_position_assignment_id AND pa.user_id=auth.uid() AND pa.is_active=true AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE))
 )));

REVOKE ALL ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_student_request_attachment_upload(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.assert_required_student_request_attachments(uuid,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_my_student_request_attachments(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_owned_student_request_attachment_upload(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.authorize_student_request_attachment_download(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reject_student_request_attachment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_student_request_attachment_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_required_student_request_attachments(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_student_request_attachments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owned_student_request_attachment_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_student_request_attachment_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_student_request_attachment(uuid,text) TO authenticated;
COMMIT;
