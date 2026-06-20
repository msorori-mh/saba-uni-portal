
-- Phase 7B: Financial Safety Guardrails

-- 1) CHECK constraints for negative protection (idempotent additions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sfa_original_amount_nonneg') THEN
    ALTER TABLE public.student_fee_adjustments
      ADD CONSTRAINT sfa_original_amount_nonneg CHECK (original_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sfa_discount_amount_nonneg') THEN
    ALTER TABLE public.student_fee_adjustments
      ADD CONSTRAINT sfa_discount_amount_nonneg CHECK (discount_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sfa_final_amount_nonneg') THEN
    ALTER TABLE public.student_fee_adjustments
      ADD CONSTRAINT sfa_final_amount_nonneg CHECK (final_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'discount_types_default_value_nonneg') THEN
    ALTER TABLE public.discount_types
      ADD CONSTRAINT discount_types_default_value_nonneg CHECK (default_value IS NULL OR default_value >= 0);
  END IF;
END$$;

-- 2) Central financial validation function
CREATE OR REPLACE FUNCTION public.validate_financial_transaction(
  _kind text,           -- 'fee_amount' | 'payment_amount' | 'discount_value' | 'receipt_amount'
  _amount numeric,
  _student_fee_id uuid DEFAULT NULL,
  _exclude_payment_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_fee numeric;
  v_paid numeric;
  v_remaining numeric;
BEGIN
  IF _amount IS NULL OR _amount < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'negative_amount',
      'message', 'القيمة لا يمكن أن تكون سالبة.');
  END IF;

  IF _kind IN ('payment_amount','receipt_amount') THEN
    IF _amount <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'non_positive_amount',
        'message', 'قيمة الدفعة يجب أن تكون أكبر من صفر.');
    END IF;
    IF _student_fee_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'missing_fee',
        'message', 'لا يوجد رسم مرتبط.');
    END IF;

    SELECT amount INTO v_fee FROM public.student_fees WHERE id = _student_fee_id;
    IF v_fee IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'missing_fee',
        'message', 'الرسم غير موجود.');
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.student_payments
    WHERE student_fee_id = _student_fee_id
      AND (_exclude_payment_id IS NULL OR id <> _exclude_payment_id);

    v_remaining := v_fee - v_paid;
    IF _amount > v_remaining THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'overpayment',
        'message', 'قيمة السند أكبر من المبلغ المتبقي على الرسم.',
        'fee', v_fee, 'paid', v_paid, 'remaining', v_remaining, 'requested', _amount);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.validate_financial_transaction(text, numeric, uuid, uuid) TO authenticated, service_role;

-- 3) Replace receipt approval to guard against duplicate + overpayment.
--    On violation we auto-reject the receipt (so audit log persists) instead of raising.
CREATE OR REPLACE FUNCTION public.process_payment_receipt_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_receipt_no text;
  v_payment_id uuid;
  v_check jsonb;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') IS DISTINCT FROM 'approved' THEN

    -- Duplicate receipt guard
    IF NEW.student_payment_id IS NOT NULL THEN
      PERFORM public.log_audit('finance', NEW.id, 'duplicate_receipt_blocked',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('student_payment_id', NEW.student_payment_id),
        'محاولة اعتماد سند مرتبط بدفعة قائمة');
      NEW.status := 'rejected';
      NEW.rejection_reason := COALESCE(NEW.rejection_reason, 'تم رفض الاعتماد: السند مرتبط بدفعة سابقة.');
      NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
      RETURN NEW;
    END IF;

    -- Overpayment guard (central validator)
    v_check := public.validate_financial_transaction('receipt_amount', NEW.amount, NEW.student_fee_id, NULL);
    IF NOT (v_check->>'ok')::boolean THEN
      PERFORM public.log_audit('finance', NEW.id,
        CASE WHEN v_check->>'reason' = 'overpayment' THEN 'overpayment_blocked'
             ELSE 'financial_validation_failed' END,
        jsonb_build_object('status', OLD.status),
        v_check,
        v_check->>'message');
      NEW.status := 'rejected';
      NEW.rejection_reason := COALESCE(NEW.rejection_reason, v_check->>'message');
      NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
      NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
      RETURN NEW;
    END IF;

    v_receipt_no := COALESCE(
      NULLIF(NEW.receipt_reference, ''),
      'RCP-' || to_char(now(), 'YYYYMMDD') || '-' || substr(NEW.id::text, 1, 8)
    );
    IF EXISTS (SELECT 1 FROM public.student_payments WHERE receipt_number = v_receipt_no) THEN
      v_receipt_no := v_receipt_no || '-' || substr(NEW.id::text, 1, 6);
    END IF;

    INSERT INTO public.student_payments(student_fee_id, receipt_number, amount, payment_date, payment_method, notes)
    VALUES (NEW.student_fee_id, v_receipt_no, NEW.amount, NEW.payment_date, NEW.payment_method, 'تم الاعتماد من سند مرفوع')
    RETURNING id INTO v_payment_id;

    NEW.student_payment_id := v_payment_id;
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());

  ELSIF NEW.status = 'rejected' AND COALESCE(OLD.status,'') IS DISTINCT FROM 'rejected' THEN
    NEW.reviewed_at := COALESCE(NEW.reviewed_at, now());
    NEW.reviewed_by := COALESCE(NEW.reviewed_by, auth.uid());
  END IF;
  RETURN NEW;
END;
$fn$;

-- 4) Apply discount: ensure clamping audit (function already clamps; add log entry on clamp)
CREATE OR REPLACE FUNCTION public.apply_student_discount(_discount_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  d record; dt record; f record;
  v_disc numeric; v_final numeric; v_raw numeric;
BEGIN
  SELECT * INTO d FROM public.student_discounts WHERE id = _discount_id;
  IF d IS NULL OR d.status <> 'active' THEN RETURN; END IF;

  SELECT * INTO dt FROM public.discount_types WHERE id = d.discount_type_id;
  IF dt IS NULL THEN RETURN; END IF;

  FOR f IN
    SELECT sf.* FROM public.student_fees sf
    WHERE sf.student_profile_id = d.student_profile_id
      AND sf.academic_year_id = d.academic_year_id
      AND sf.semester_id = d.semester_id
      AND sf.status <> 'cancelled'
      AND NOT EXISTS (
        SELECT 1 FROM public.student_fee_adjustments a
        WHERE a.student_fee_id = sf.id AND a.student_discount_id = d.id
      )
  LOOP
    IF dt.discount_type = 'percentage' THEN
      v_raw := ROUND((f.amount * d.value / 100.0)::numeric, 2);
    ELSE
      v_raw := d.value;
    END IF;
    v_disc := v_raw;
    IF v_disc > f.amount THEN v_disc := f.amount; END IF;
    IF v_disc < 0 THEN v_disc := 0; END IF;
    v_final := f.amount - v_disc;
    IF v_final < 0 THEN v_final := 0; END IF;

    IF v_raw > f.amount THEN
      PERFORM public.log_audit('finance', f.id, 'discount_clamped',
        jsonb_build_object('requested_discount', v_raw, 'fee_amount', f.amount),
        jsonb_build_object('applied_discount', v_disc, 'final_amount', v_final),
        'تم تقليص قيمة الخصم لتفادي رصيد سالب');
    END IF;

    INSERT INTO public.student_fee_adjustments(student_fee_id, student_discount_id, original_amount, discount_amount, final_amount)
    VALUES (f.id, d.id, f.amount, v_disc, v_final);

    UPDATE public.student_fees SET amount = v_final, updated_at = now() WHERE id = f.id;
    PERFORM public.recalc_student_fee_status(f.id);
  END LOOP;
END;
$fn$;
