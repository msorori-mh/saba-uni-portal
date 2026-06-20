-- Phase 6A: Central Audit Log System

-- 1) Table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_role text,
  entity_type text NOT NULL,
  entity_id uuid,
  action_type text NOT NULL,
  old_values jsonb,
  new_values jsonb,
  notes text,
  ip_address text,
  user_agent text
);

-- Grants
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- Indexes
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor_user_id ON public.audit_logs (actor_user_id);
CREATE INDEX idx_audit_logs_entity_type ON public.audit_logs (entity_type);
CREATE INDEX idx_audit_logs_action_type ON public.audit_logs (action_type);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);

-- RLS: only admin, system_admin, dean can read. No one can write directly (only SECURITY DEFINER functions).
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select_privileged
  ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']));

-- No INSERT/UPDATE/DELETE policies → writes only via SECURITY DEFINER helpers.

-- 2) Helper: resolve actor role (returns highest-priority role name)
CREATE OR REPLACE FUNCTION public.audit_resolve_role(_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles
  WHERE user_id = _user_id
  ORDER BY CASE role::text
    WHEN 'system_admin' THEN 1
    WHEN 'admin' THEN 2
    WHEN 'dean' THEN 3
    WHEN 'registrar' THEN 4
    WHEN 'student_affairs' THEN 5
    WHEN 'department_head' THEN 6
    ELSE 99
  END
  LIMIT 1
$$;

-- 3) Helper: write audit log
CREATE OR REPLACE FUNCTION public.log_audit(
  _entity_type text,
  _entity_id uuid,
  _action_type text,
  _old jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO public.audit_logs(actor_user_id, actor_role, entity_type, entity_id, action_type, old_values, new_values, notes)
  VALUES (v_uid, public.audit_resolve_role(v_uid), _entity_type, _entity_id, _action_type, _old, _new, _notes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;

-- =========================================================
-- 4) Triggers — surgical, only on sensitive events
-- =========================================================

-- A) student_requests: insert + status transitions
CREATE OR REPLACE FUNCTION public.trg_audit_student_requests()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := CASE WHEN NEW.status = 'submitted' THEN 'request_submitted' ELSE 'request_created' END;
    PERFORM public.log_audit('student_request', NEW.id, v_action, NULL,
      jsonb_build_object('request_type', NEW.request_type, 'status', NEW.status,
                         'student_profile_id', NEW.student_profile_id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') IS DISTINCT FROM COALESCE(NEW.status,'') THEN
    v_action := CASE NEW.status
      WHEN 'submitted' THEN 'request_submitted'
      WHEN 'under_review' THEN 'request_review_started'
      WHEN 'approved' THEN 'request_approved'
      WHEN 'rejected' THEN 'request_rejected'
      WHEN 'cancelled' THEN 'request_cancelled'
      ELSE 'request_status_changed'
    END;
    PERFORM public.log_audit('student_request', NEW.id, v_action,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status, 'request_type', NEW.request_type,
                         'rejection_reason', NEW.rejection_reason));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_student_requests_aiu
AFTER INSERT OR UPDATE ON public.student_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_requests();

-- B) student_grades
CREATE OR REPLACE FUNCTION public.trg_audit_student_grades()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('grade', NEW.id, 'grade_created', NULL,
      to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' AND OLD.score IS DISTINCT FROM NEW.score THEN
    PERFORM public.log_audit('grade', NEW.id, 'grade_modified',
      jsonb_build_object('score', OLD.score),
      jsonb_build_object('score', NEW.score));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_student_grades_aiu
AFTER INSERT OR UPDATE ON public.student_grades
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_grades();

-- C) Finance: student_fees
CREATE OR REPLACE FUNCTION public.trg_audit_student_fees()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('finance', NEW.id, 'fee_created', NULL,
      jsonb_build_object('amount', NEW.amount, 'status', NEW.status,
                         'student_profile_id', NEW.student_profile_id,
                         'fee_type_id', NEW.fee_type_id));
  ELSIF TG_OP = 'UPDATE' AND (OLD.amount IS DISTINCT FROM NEW.amount OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.log_audit('finance', NEW.id, 'fee_modified',
      jsonb_build_object('amount', OLD.amount, 'status', OLD.status),
      jsonb_build_object('amount', NEW.amount, 'status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_student_fees_aiu
AFTER INSERT OR UPDATE ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_fees();

-- D) Finance: student_payments
CREATE OR REPLACE FUNCTION public.trg_audit_student_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('finance', NEW.id, 'payment_added', NULL,
      jsonb_build_object('amount', NEW.amount, 'receipt_number', NEW.receipt_number,
                         'student_fee_id', NEW.student_fee_id,
                         'payment_method', NEW.payment_method));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_student_payments_ai
AFTER INSERT ON public.student_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_payments();

-- E) Finance: payment_receipts (approve/reject only)
CREATE OR REPLACE FUNCTION public.trg_audit_payment_receipts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.status,'') IS DISTINCT FROM COALESCE(NEW.status,'') THEN
    IF NEW.status IN ('approved','rejected') THEN
      v_action := CASE NEW.status WHEN 'approved' THEN 'receipt_approved' ELSE 'receipt_rejected' END;
      PERFORM public.log_audit('finance', NEW.id, v_action,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status, 'amount', NEW.amount,
                           'student_fee_id', NEW.student_fee_id,
                           'rejection_reason', NEW.rejection_reason));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_payment_receipts_au
AFTER UPDATE ON public.payment_receipts
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_payment_receipts();

-- F) Finance: student_discounts (apply/cancel)
CREATE OR REPLACE FUNCTION public.trg_audit_student_discounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      PERFORM public.log_audit('finance', NEW.id, 'discount_applied', NULL,
        jsonb_build_object('value', NEW.value, 'student_profile_id', NEW.student_profile_id,
                           'discount_type_id', NEW.discount_type_id));
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'active' THEN
      PERFORM public.log_audit('finance', NEW.id, 'discount_applied',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status, 'value', NEW.value));
    ELSIF OLD.status = 'active' THEN
      PERFORM public.log_audit('finance', NEW.id, 'discount_cancelled',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_student_discounts_aiu
AFTER INSERT OR UPDATE ON public.student_discounts
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_student_discounts();
