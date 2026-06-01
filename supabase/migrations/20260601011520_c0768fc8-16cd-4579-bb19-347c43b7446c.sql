
-- 1) payment_receipts table
CREATE TABLE public.payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','other')),
  receipt_reference text,
  file_url text NOT NULL,
  file_name text NOT NULL,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  student_payment_id uuid REFERENCES public.student_payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_receipts_student ON public.payment_receipts(student_profile_id);
CREATE INDEX idx_payment_receipts_fee ON public.payment_receipts(student_fee_id);
CREATE INDEX idx_payment_receipts_status ON public.payment_receipts(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_receipts TO authenticated;
GRANT ALL ON public.payment_receipts TO service_role;

ALTER TABLE public.payment_receipts ENABLE ROW LEVEL SECURITY;

-- Student: insert own
CREATE POLICY pr_insert_student ON public.payment_receipts
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_profile_id AND sp.user_id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs'])
  );

CREATE POLICY pr_select ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_profiles sp
      WHERE sp.id = student_profile_id AND sp.user_id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );

CREATE POLICY pr_update_admin ON public.payment_receipts
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY pr_delete_admin ON public.payment_receipts
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_payment_receipts_updated
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Approval -> create student_payment
CREATE OR REPLACE FUNCTION public.process_payment_receipt_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_no text;
  v_payment_id uuid;
BEGIN
  IF NEW.status = 'approved' AND COALESCE(OLD.status,'') IS DISTINCT FROM 'approved' THEN
    -- Prevent duplicate payments for the same receipt
    IF NEW.student_payment_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    v_receipt_no := COALESCE(
      NULLIF(NEW.receipt_reference, ''),
      'RCP-' || to_char(now(), 'YYYYMMDD') || '-' || substr(NEW.id::text, 1, 8)
    );

    -- If a receipt_number collision exists, suffix with the id
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
$$;

CREATE TRIGGER trg_payment_receipts_approval
  BEFORE UPDATE ON public.payment_receipts
  FOR EACH ROW EXECUTE FUNCTION public.process_payment_receipt_approval();

-- 3) Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path is {auth.uid()}/{receipt_id}/{filename}
CREATE POLICY "payment_receipts_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  )
);

CREATE POLICY "payment_receipts_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "payment_receipts_delete_admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-receipts'
  AND public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
);
