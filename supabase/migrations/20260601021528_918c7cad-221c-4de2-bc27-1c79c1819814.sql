
-- 1) Table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL,
  reference_type text,
  reference_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_chk CHECK (notification_type IN ('request','grade','finance','payment_receipt','system'))
);

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS: user reads own; admins read all
CREATE POLICY "notif_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

-- User can update only is_read on own rows (other fields locked via trigger)
CREATE POLICY "notif_update_own_read" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_notifications_user ON public.notifications(user_id);
CREATE INDEX idx_notifications_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON public.notifications(created_at DESC);

-- Protect immutable fields on user updates
CREATE OR REPLACE FUNCTION public.protect_notification_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_any_role(auth.uid(), ARRAY['admin','system_admin']) THEN
    RETURN NEW;
  END IF;
  NEW.user_id := OLD.user_id;
  NEW.title := OLD.title;
  NEW.message := OLD.message;
  NEW.notification_type := OLD.notification_type;
  NEW.reference_type := OLD.reference_type;
  NEW.reference_id := OLD.reference_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notifications_protect
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_notification_fields();

-- 2) Central function
CREATE OR REPLACE FUNCTION public.create_notification(
  _target_user_id uuid,
  _title text,
  _message text,
  _type text,
  _reference_type text DEFAULT NULL,
  _reference_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF _target_user_id IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.notifications(user_id, title, message, notification_type, reference_type, reference_id)
  VALUES (_target_user_id, _title, _message, _type, _reference_type, _reference_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 3) Triggers

-- Request approval/rejection
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
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  SELECT sp.user_id INTO v_user_id FROM public.student_profiles sp WHERE sp.id = NEW.student_profile_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  v_type_label := CASE NEW.request_type
    WHEN 'absence_excuse' THEN 'عذر غياب'
    WHEN 'enrollment_suspension' THEN 'وقف القيد'
    WHEN 'extra_chance' THEN 'فرصة إضافية'
    WHEN 'transfer' THEN 'التحويل'
    WHEN 'equivalency' THEN 'المقاصة'
    ELSE NEW.request_type
  END;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد طلب ' || v_type_label;
    v_msg := 'تم اعتماد طلبك (' || COALESCE(NEW.title,'') || ').';
  ELSE
    v_title := 'تم رفض طلب ' || v_type_label;
    v_msg := COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض طلبك.');
  END IF;

  PERFORM public.create_notification(v_user_id, v_title, v_msg, 'request', 'student_request', NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_student_request
AFTER UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_student_request();

-- Grade approved
CREATE OR REPLACE FUNCTION public.trg_notify_student_grade()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_course_name text;
  v_course_code text;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  SELECT sp.user_id, c.name_ar, c.code
    INTO v_user_id, v_course_name, v_course_code
  FROM public.student_enrollments se
  JOIN public.student_profiles sp ON sp.id = se.student_profile_id
  JOIN public.course_sections cs ON cs.id = se.course_section_id
  JOIN public.course_offerings co ON co.id = cs.course_offering_id
  JOIN public.courses c ON c.id = co.course_id
  WHERE se.id = NEW.student_enrollment_id;

  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.create_notification(
    v_user_id,
    'تم اعتماد درجة',
    'تم اعتماد درجة جديدة في مقرر ' || COALESCE(v_course_code,'') || ' - ' || COALESCE(v_course_name,''),
    'grade', 'student_grade', NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_student_grade
AFTER INSERT OR UPDATE OF status ON public.student_grades
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_student_grade();

-- Payment receipt approved/rejected
CREATE OR REPLACE FUNCTION public.trg_notify_payment_receipt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_title text;
  v_msg text;
BEGIN
  IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status,'') = COALESCE(NEW.status,'') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;

  SELECT user_id INTO v_user_id FROM public.student_profiles WHERE id = NEW.student_profile_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' THEN
    v_title := 'تم اعتماد سند الدفع';
    v_msg := 'تم اعتماد سند الدفع الخاص بك بمبلغ ' || NEW.amount::text || ' وتم تسجيل الدفعة.';
  ELSE
    v_title := 'تم رفض سند الدفع';
    v_msg := COALESCE('سبب الرفض: ' || NEW.rejection_reason, 'تم رفض سند الدفع الخاص بك.');
  END IF;

  PERFORM public.create_notification(v_user_id, v_title, v_msg, 'payment_receipt', 'payment_receipt', NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_payment_receipt
AFTER UPDATE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_payment_receipt();

-- New fee created
CREATE OR REPLACE FUNCTION public.trg_notify_student_fee()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_fee_name text;
BEGIN
  SELECT sp.user_id, ft.name_ar
    INTO v_user_id, v_fee_name
  FROM public.student_profiles sp
  LEFT JOIN public.fee_types ft ON ft.id = NEW.fee_type_id
  WHERE sp.id = NEW.student_profile_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.create_notification(
    v_user_id,
    'إضافة رسوم جديدة',
    'تم إضافة رسوم جديدة (' || COALESCE(v_fee_name,'') || ') بقيمة ' || NEW.amount::text,
    'finance', 'student_fee', NEW.id
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_student_fee
AFTER INSERT ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_student_fee();
