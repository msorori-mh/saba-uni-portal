-- SR-D1: official transcript student request type + approval document effect

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_type_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_type_chk
  CHECK (request_type = ANY (ARRAY[
    'absence_excuse','enrollment_suspension','enrollment_reinstatement','extra_chance',
    'transfer','equivalency','grade_appeal','official_transcript'
  ]));

INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order)
VALUES (
  'official_transcript',
  'طلب سجل أكاديمي رسمي',
  'إصدار سجل أكاديمي رسمي مختوم',
  true,
  false,
  6
)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  is_active = true,
  requires_attachment = EXCLUDED.requires_attachment,
  sort_order = EXCLUDED.sort_order;

CREATE TABLE public.official_transcript_request_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
  purpose text,
  notes text,
  document_issued_at timestamptz,
  official_document_id uuid REFERENCES public.official_documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT official_transcript_request_details_request_unique UNIQUE (request_id)
);

CREATE INDEX idx_otrd_request ON public.official_transcript_request_details(request_id);
CREATE INDEX idx_otrd_document ON public.official_transcript_request_details(official_document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.official_transcript_request_details TO authenticated;
GRANT ALL ON public.official_transcript_request_details TO service_role;

ALTER TABLE public.official_transcript_request_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY otrd_select ON public.official_transcript_request_details
  FOR SELECT TO authenticated
  USING (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );

CREATE POLICY otrd_insert ON public.official_transcript_request_details
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_owner_of_request(auth.uid(), request_id)
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY otrd_update ON public.official_transcript_request_details
  FOR UPDATE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (
        SELECT 1 FROM public.student_requests sr
        WHERE sr.id = official_transcript_request_details.request_id
          AND sr.status = 'draft'
      ))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY otrd_delete ON public.official_transcript_request_details
  FOR DELETE TO authenticated
  USING (
    (public.is_owner_of_request(auth.uid(), request_id)
      AND EXISTS (
        SELECT 1 FROM public.student_requests sr
        WHERE sr.id = official_transcript_request_details.request_id
          AND sr.status = 'draft'
      ))
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
  );

CREATE TRIGGER trg_otrd_updated_at
  BEFORE UPDATE ON public.official_transcript_request_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_official_transcript_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_open_count integer;
  v_profile_status text;
  v_check boolean := false;
BEGIN
  IF NEW.request_type <> 'official_transcript' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status IN ('draft','submitted','under_review') THEN
    v_check := true;
  ELSIF TG_OP = 'UPDATE'
        AND NEW.status IN ('submitted','under_review')
        AND COALESCE(OLD.status, '') NOT IN ('submitted','under_review','approved','rejected','cancelled','returned') THEN
    v_check := true;
  END IF;

  IF NOT v_check THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_profile_status
  FROM public.student_profiles
  WHERE id = NEW.student_profile_id;

  IF v_profile_status IS NULL OR v_profile_status <> 'active' THEN
    RAISE EXCEPTION 'Cannot create official transcript request: student profile is not active';
  END IF;

  SELECT COUNT(*) INTO v_open_count
  FROM public.student_requests
  WHERE student_profile_id = NEW.student_profile_id
    AND request_type = 'official_transcript'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND status IN ('draft','submitted','under_review','returned');

  IF v_open_count > 0 THEN
    RAISE EXCEPTION 'An open official transcript request already exists for this student';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_official_transcript_request'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_validate_official_transcript_request
      BEFORE INSERT OR UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.validate_official_transcript_request();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.apply_official_transcript_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_details public.official_transcript_request_details%ROWTYPE;
  v_doc_id uuid;
  v_num text;
  v_code text;
BEGIN
  IF NEW.request_type <> 'official_transcript'
     OR NEW.status <> 'approved'
     OR COALESCE(OLD.status, '') = 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_details
  FROM public.official_transcript_request_details
  WHERE request_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Official transcript details missing for request %', NEW.id;
  END IF;

  IF v_details.document_issued_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_num := public.generate_document_number();
  v_code := public.generate_verification_code();

  INSERT INTO public.official_documents (
    student_profile_id,
    document_type,
    document_number,
    verification_code,
    issued_by,
    status,
    metadata
  ) VALUES (
    NEW.student_profile_id,
    'official_transcript',
    v_num,
    v_code,
    NEW.reviewed_by,
    'issued',
    jsonb_build_object('student_request_id', NEW.id)
  )
  RETURNING id INTO v_doc_id;

  PERFORM public.log_audit(
    'document',
    v_doc_id,
    'transcript_generated',
    NULL,
    jsonb_build_object(
      'document_number', v_num,
      'document_type', 'official_transcript',
      'student_profile_id', NEW.student_profile_id,
      'verification_code', v_code,
      'student_request_id', NEW.id
    ),
    NULL,
    NEW.reviewed_by
  );

  UPDATE public.official_transcript_request_details
     SET document_issued_at = now(),
         official_document_id = v_doc_id,
         updated_at = now()
   WHERE request_id = NEW.id;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_apply_official_transcript_on_approval'
      AND tgrelid = 'public.student_requests'::regclass
  ) THEN
    CREATE TRIGGER trg_apply_official_transcript_on_approval
      AFTER UPDATE ON public.student_requests
      FOR EACH ROW EXECUTE FUNCTION public.apply_official_transcript_on_approval();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_notify_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_type_label text;
  v_title text;
  v_msg text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') = COALESCE(NEW.status,'') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected','returned') THEN RETURN NEW; END IF;

  SELECT sp.user_id INTO v_user_id FROM public.student_profiles sp WHERE sp.id = NEW.student_profile_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_type_label := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'عذر غياب'
    WHEN 'enrollment_suspension' THEN 'وقف القيد'
    WHEN 'enrollment_reinstatement' THEN 'إعادة القيد'
    WHEN 'extra_chance' THEN 'فرصة إضافية'
    WHEN 'transfer' THEN 'التحويل'
    WHEN 'equivalency' THEN 'المقاصة'
    WHEN 'grade_appeal' THEN 'تظلم درجات'
    WHEN 'official_transcript' THEN 'سجل أكاديمي رسمي'
    ELSE NEW.request_type
  END;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد طلب ' || v_type_label;
    v_msg := 'تم اعتماد طلبك (' || COALESCE(NEW.title,'') || ').';
  ELSIF NEW.status = 'returned' THEN
    v_title := 'طلب ' || v_type_label || ' يحتاج استكمال';
    v_msg := COALESCE('ملاحظات: ' || NEW.rejection_reason, 'يرجى استكمال بيانات الطلب وإعادة الإرسال.');
  ELSE
    v_title := 'تم رفض طلب ' || v_type_label;
    v_msg := COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض طلبك.');
  END IF;

  PERFORM public.create_notification(v_user_id, v_title, v_msg, 'request', 'student_request', NEW.id);
  RETURN NEW;
END;
$$;
