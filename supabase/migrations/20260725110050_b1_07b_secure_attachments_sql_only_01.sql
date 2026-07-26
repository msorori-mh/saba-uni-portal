-- PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION
-- REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL
-- Track: PORTAL-B1-SEQ07-B-ALTERNATE-APPLY-PACKAGE-PREFLIGHT-01 / order 7B
-- Alternate to: supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql
--   (LF SHA-256 66ba4c96c23c44bbcca62de28360d806ee6ff5dbd358a20f2e181b9a8fd6bca8 — KEEP UNMODIFIED; DO NOT APPLY on Lovable Cloud)
-- Semantically equivalent SQL objects to SEQ07 except bucket upsert replaced by B0 prerequisite assert.
-- Companion: docs/migration-drafts/b1-backend-verifiers/07B-*
-- Production apply is a separate gate AFTER source merge + CI + fresh RO.
BEGIN;

-- SEQ07-B SQL-only track: bucket MUST already exist (created via Lovable Storage tool / B0).
-- Original SEQ07 file 20260725110000 remains unmodified and MUST NOT be applied on Lovable Cloud.
DO $b0_required$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets b
    WHERE b.id = 'student-request-secure-attachments'
      AND b.public IS FALSE
      AND b.file_size_limit = 5242880
      AND b.allowed_mime_types @> ARRAY['application/pdf','image/jpeg','image/png']::text[]
      AND b.allowed_mime_types <@ ARRAY['application/pdf','image/jpeg','image/png']::text[]
  ) THEN
    RAISE EXCEPTION 'B1_SEQ07B_BUCKET_PREREQUISITE_MISSING'
      USING ERRCODE = 'P0001',
            HINT = 'Create private bucket student-request-secure-attachments (5MiB, pdf/jpeg/png) via Storage tool before this migration';
  END IF;
END
$b0_required$;
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
 PERFORM public.log_audit(
   'student_request_attachment'::text,
   v_id::uuid,
   'attachment_upload_intent_created'::text,
   NULL::jsonb,
   jsonb_build_object('request_id',v_req.id,'field_key',p_field_key)::jsonb,
   NULL::text,
   v_uid::uuid
 );
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
 PERFORM public.log_audit(
   'student_request_attachment'::text,
   a.id::uuid,
   'attachment_upload_completed'::text,
   NULL::jsonb,
   NULL::jsonb,
   NULL::text,
   v_uid::uuid
 );
 PERFORM public.log_audit(
   'student_request_attachment'::text,
   a.id::uuid,
   'attachment_attached'::text,
   NULL::jsonb,
   NULL::jsonb,
   NULL::text,
   v_uid::uuid
 );
 RETURN jsonb_build_object('attachmentId',a.id,'studentRequestId',a.student_request_id,'studentProfileId',a.student_profile_id,'fieldKey',a.field_key,'status','attached','mimeType',a.mime_type,'sizeBytes',a.size_bytes,'originalFileName',a.original_file_name,'checksumSha256',a.checksum_sha256);
END $$;

CREATE FUNCTION public.assert_required_student_request_attachments(
  p_student_request_id uuid,p_attachment_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid(); v_profile_id uuid; v_request public.student_requests%ROWTYPE; v_expected integer; v_attached integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED' USING ERRCODE='28000'; END IF;
 SELECT sp.id INTO v_profile_id FROM public.student_profiles sp
 WHERE sp.user_id=v_uid;
 SELECT r.* INTO v_request FROM public.student_requests r
 WHERE r.id=p_student_request_id AND r.student_profile_id=v_profile_id
 AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_OWNED' USING ERRCODE='42501'; END IF;
 v_expected:=coalesce(cardinality(p_attachment_ids),0);
 IF v_expected NOT BETWEEN 1 AND 3 OR v_expected<>(SELECT count(DISTINCT selected_id) FROM unnest(p_attachment_ids) AS selected_id)
 THEN RAISE EXCEPTION 'ATTACHMENT_UPLOAD_NOT_COMPLETED'; END IF;
 -- Lock the exact submission set so completion/rejection cannot race the check.
 PERFORM 1 FROM public.student_request_attachment_uploads a
 WHERE a.id=ANY(p_attachment_ids) AND a.student_request_id=p_student_request_id
 AND a.student_profile_id=v_profile_id FOR UPDATE;
 SELECT count(*) INTO v_attached FROM public.student_request_attachment_uploads a
 WHERE a.id=ANY(p_attachment_ids) AND a.student_request_id=p_student_request_id
 AND a.student_profile_id=v_profile_id AND a.field_key='excuse_documents'
 AND a.upload_status='attached' AND a.mime_type IN ('application/pdf','image/jpeg','image/png')
 AND a.size_bytes BETWEEN 1 AND 5242880;
 IF v_attached<>v_expected THEN RAISE EXCEPTION 'ATTACHMENT_OBJECT_MISMATCH' USING ERRCODE='42501'; END IF;
END $$;

-- This becomes the only authenticated submit entrypoint when this Draft is
-- applied. The legacy entrypoint is revoked below, closing direct bypass.
CREATE FUNCTION public.submit_student_request_with_secure_attachments(
  p_request_id uuid,p_attachment_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_request public.student_requests%ROWTYPE;
BEGIN
 SELECT r.* INTO v_request FROM public.student_requests r
 JOIN public.student_profiles sp ON sp.id=r.student_profile_id
 WHERE r.id=p_request_id AND sp.user_id=auth.uid()
 AND r.status IN ('draft','returned','returned_for_completion') FOR UPDATE OF r;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_REQUEST_NOT_OWNED' USING ERRCODE='42501'; END IF;
 IF v_request.request_type IN ('excused_absence','absence_excuse') THEN
   PERFORM public.assert_required_student_request_attachments(p_request_id,p_attachment_ids);
 ELSIF coalesce(cardinality(p_attachment_ids),0)<>0 THEN
   RAISE EXCEPTION 'ATTACHMENT_FIELD_NOT_ALLOWED' USING ERRCODE='42501';
 END IF;
 PERFORM public.submit_student_request(p_request_id);
END $$;

CREATE FUNCTION public.list_my_student_request_attachments(p_student_request_id uuid) RETURNS SETOF public.student_request_attachment_uploads
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT a.* FROM public.student_request_attachment_uploads a JOIN public.student_profiles sp ON sp.id=a.student_profile_id WHERE a.student_request_id=p_student_request_id AND sp.user_id=auth.uid() $$;

CREATE FUNCTION public.get_owned_student_request_attachment_upload(p_attachment_id uuid) RETURNS SETOF public.student_request_attachment_uploads
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT a.* FROM public.student_request_attachment_uploads a JOIN public.student_profiles sp ON sp.id=a.student_profile_id WHERE a.id=p_attachment_id AND sp.user_id=auth.uid() AND a.upload_status='pending' $$;

CREATE FUNCTION public.reject_student_request_attachment(p_attachment_id uuid,p_rejection_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_uid uuid:=auth.uid();
BEGIN
 UPDATE public.student_request_attachment_uploads
    SET upload_status='rejected',rejected_at=now(),rejection_code=p_rejection_code
  WHERE id=p_attachment_id AND created_by=v_uid AND upload_status IN ('pending','uploaded');
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF;
 PERFORM public.log_audit(
   'student_request_attachment'::text,
   p_attachment_id::uuid,
   'attachment_rejected'::text,
   NULL::jsonb,
   NULL::jsonb,
   p_rejection_code::text,
   v_uid::uuid
 );
 RETURN true;
END $$;

CREATE FUNCTION public.authorize_student_request_attachment_download(p_attachment_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE a public.student_request_attachment_uploads%ROWTYPE; assigned_ok boolean; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF; SELECT * INTO a FROM public.student_request_attachment_uploads WHERE id=p_attachment_id AND upload_status='attached'; IF NOT FOUND THEN RAISE EXCEPTION 'ATTACHMENT_ACCESS_DENIED'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.student_request_workflow_steps s WHERE s.student_request_id=a.student_request_id AND s.status='active'
   AND s.processing_unit_id IS NOT NULL AND s.processing_role_id IS NOT NULL AND CASE
     WHEN s.assigned_user_id IS NOT NULL THEN s.assigned_user_id=auth.uid()
     WHEN s.assigned_staff_profile_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.staff_profiles sp WHERE sp.id=s.assigned_staff_profile_id AND sp.user_id=auth.uid())
     WHEN s.assigned_faculty_profile_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.faculty_profiles fp WHERE fp.id=s.assigned_faculty_profile_id AND fp.user_id=auth.uid())
     WHEN s.assigned_position_assignment_id IS NOT NULL THEN EXISTS(SELECT 1 FROM public.position_assignments pa WHERE pa.id=s.assigned_position_assignment_id AND pa.user_id=auth.uid() AND pa.is_active=true AND (pa.assigned_to IS NULL OR pa.assigned_to>=CURRENT_DATE))
     ELSE false END
   AND public.current_user_has_exact_processing_binding(s.processing_unit_id,s.processing_role_id)) INTO assigned_ok;
 IF NOT assigned_ok THEN RAISE EXCEPTION 'ATTACHMENT_DIRECT_ASSIGNMENT_REQUIRED'; END IF;
 PERFORM public.log_audit(
   'student_request_attachment'::text,
   a.id::uuid,
   'attachment_downloaded'::text,
   NULL::jsonb,
   NULL::jsonb,
   NULL::text,
   auth.uid()::uuid
 );
 RETURN jsonb_build_object('storage_bucket',a.storage_bucket,'storage_object_path',a.storage_object_path);
END $$;

-- Server-proxy upload is the only object path. No SELECT policy exists: even an
-- owner/effective assignee must use the audited 300-second signed-download RPC.
-- There is likewise no UPDATE/MOVE/DELETE policy in v1.
CREATE POLICY secure_attachment_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
 bucket_id='student-request-secure-attachments' AND EXISTS(SELECT 1 FROM public.student_request_attachment_uploads a WHERE a.storage_bucket=bucket_id AND a.storage_object_path=name AND a.created_by=auth.uid() AND a.upload_status='pending'));

REVOKE ALL ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.complete_student_request_attachment_upload(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.assert_required_student_request_attachments(uuid,uuid[]) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[]) FROM PUBLIC,anon;
-- DEFERRED CUTOVER (owner decision): the authenticated EXECUTE revoke on the
-- pre-attachment boundary public.submit_student_request(uuid) is intentionally
-- NOT applied in this draft. The live enrollment_certificate submit path still
-- invokes it as authenticated (src/lib/student-request-rpc.ts), so revoking it
-- now would break the only live service. The revoke is DEFERRED to a separate
-- cutover phase, after all callers are migrated to
-- submit_student_request_with_secure_attachments and authorization tests prove
-- the cutover. authenticated EXECUTE remains exactly as today.
REVOKE ALL ON FUNCTION public.list_my_student_request_attachments(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_owned_student_request_attachment_upload(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.authorize_student_request_attachment_download(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.reject_student_request_attachment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_student_request_attachment_upload_intent(uuid,text,text,text,bigint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_student_request_attachment_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_required_student_request_attachments(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_student_request_with_secure_attachments(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_student_request_attachments(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_owned_student_request_attachment_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_student_request_attachment_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_student_request_attachment(uuid,text) TO authenticated;
COMMIT;
