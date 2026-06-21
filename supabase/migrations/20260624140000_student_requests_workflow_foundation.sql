-- SR-A1 / SR-A2 / SR-B2: student request workflow foundation
-- - dean alignment in protect + RLS
-- - fix student cancel/resubmit RLS (WITH CHECK)
-- - returned status for correction loop
-- - grade_appeal notification label + returned notifications
-- - audit actor fallback via reviewed_by when service role updates

ALTER TABLE public.student_requests DROP CONSTRAINT IF EXISTS sr_status_chk;
ALTER TABLE public.student_requests ADD CONSTRAINT sr_status_chk
  CHECK (status IN ('draft','submitted','under_review','returned','approved','rejected','cancelled'));

CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text,
  _entity_id uuid,
  _action_type text,
  _old jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _notes text DEFAULT NULL,
  _actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(_actor_user_id, auth.uid());
BEGIN
  INSERT INTO public.audit_logs(actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
  VALUES (v_uid, public.audit_resolve_role(v_uid), _entity_type, _entity_id, _action_type, _old, _new, _notes);
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_student_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF public.has_any_role(v_uid, ARRAY['admin','system_admin','dean','registrar','student_affairs']) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.student_profiles sp
    WHERE sp.id = OLD.student_profile_id AND sp.user_id = v_uid
  ) THEN
    IF NEW.status = 'cancelled' AND OLD.status <> 'approved' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      NEW.submitted_at       := OLD.submitted_at;
      NEW.reviewed_by        := OLD.reviewed_by;
      NEW.reviewed_at        := OLD.reviewed_at;
      NEW.rejection_reason   := OLD.rejection_reason;
      RETURN NEW;
    END IF;

    IF OLD.status = 'returned' AND NEW.status = 'submitted' THEN
      NEW.submitted_at := COALESCE(NEW.submitted_at, now());
      NEW.rejection_reason := NULL;
      NEW.reviewed_by := NULL;
      NEW.reviewed_at := NULL;
      NEW.student_profile_id := OLD.student_profile_id;
      NEW.request_type       := OLD.request_type;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Students cannot modify a request after submission';
  END IF;

  RAISE EXCEPTION 'Not authorized to modify this request';
END;
$$;

DROP POLICY IF EXISTS sr_update_self ON public.student_requests;
CREATE POLICY sr_update_self ON public.student_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_requests.student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY['draft','submitted','under_review','returned'])
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_profile_id
        AND sp.user_id = auth.uid()
    )
    AND status = ANY (ARRAY['draft','submitted','under_review','returned','cancelled'])
  );

DROP POLICY IF EXISTS sr_update_priv ON public.student_requests;
CREATE POLICY sr_update_priv ON public.student_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean','registrar','student_affairs'])
  );

CREATE OR REPLACE FUNCTION public.trg_audit_student_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
  v_actor uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('student_request', NEW.id,
      CASE WHEN NEW.status = 'submitted' THEN 'request_submitted' ELSE 'request_created' END,
      NULL,
      jsonb_build_object('request_type', NEW.request_type, 'status', NEW.status, 'student_profile_id', NEW.student_profile_id),
      NULL,
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') IS DISTINCT FROM COALESCE(NEW.status,'') THEN
    v_action := CASE NEW.status
      WHEN 'submitted' THEN 'request_submitted'
      WHEN 'under_review' THEN 'request_review_started'
      WHEN 'returned' THEN 'request_returned'
      WHEN 'approved' THEN 'request_approved'
      WHEN 'rejected' THEN 'request_rejected'
      WHEN 'cancelled' THEN 'request_cancelled'
      ELSE 'request_status_changed'
    END;
    v_actor := COALESCE(auth.uid(), NEW.reviewed_by);
    PERFORM public.log_audit('student_request', NEW.id, v_action,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'request_type', NEW.request_type, 'rejection_reason', NEW.rejection_reason),
      NULL,
      v_actor
    );
  END IF;
  RETURN NEW;
END;
$$;

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
    WHEN 'extra_chance' THEN 'فرصة إضافية'
    WHEN 'transfer' THEN 'التحويل'
    WHEN 'equivalency' THEN 'المقاصة'
    WHEN 'grade_appeal' THEN 'تظلم درجات'
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
