
-- ============ fee_types ============
CREATE TABLE public.fee_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_types TO authenticated;
GRANT ALL ON public.fee_types TO service_role;
ALTER TABLE public.fee_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY ft_select ON public.fee_types FOR SELECT TO authenticated
  USING (is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean']));
CREATE POLICY ft_insert ON public.fee_types FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY ft_update ON public.fee_types FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY ft_delete ON public.fee_types FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_fee_types_updated_at BEFORE UPDATE ON public.fee_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ student_fees ============
CREATE TABLE public.student_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  fee_type_id uuid NOT NULL REFERENCES public.fee_types(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','partially_paid','paid','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_fees_student ON public.student_fees(student_profile_id);
CREATE INDEX idx_student_fees_status ON public.student_fees(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fees TO authenticated;
GRANT ALL ON public.student_fees TO service_role;
ALTER TABLE public.student_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY sf_select ON public.student_fees FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );
CREATE POLICY sf_insert ON public.student_fees FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sf_update ON public.student_fees FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sf_delete ON public.student_fees FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_student_fees_updated_at BEFORE UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ student_payments ============
CREATE TABLE public.student_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  receipt_number text NOT NULL UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','bank_transfer','other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_payments_fee ON public.student_payments(student_fee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_payments TO authenticated;
GRANT ALL ON public.student_payments TO service_role;
ALTER TABLE public.student_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY sp_select ON public.student_payments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.student_fees f
      JOIN public.student_profiles sp ON sp.id = f.student_profile_id
      WHERE f.id = student_fee_id AND sp.user_id = auth.uid()
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
  );
CREATE POLICY sp_insert ON public.student_payments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sp_update ON public.student_payments FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sp_delete ON public.student_payments FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_student_payments_updated_at BEFORE UPDATE ON public.student_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Auto-recalc fee status ============
CREATE OR REPLACE FUNCTION public.recalc_student_fee_status(_fee_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_paid numeric;
  v_status text;
  v_current text;
BEGIN
  SELECT amount, status INTO v_amount, v_current FROM public.student_fees WHERE id = _fee_id;
  IF v_amount IS NULL THEN RETURN; END IF;
  IF v_current = 'cancelled' THEN RETURN; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.student_payments WHERE student_fee_id = _fee_id;

  IF v_paid <= 0 THEN
    v_status := 'pending';
  ELSIF v_paid >= v_amount THEN
    v_status := 'paid';
  ELSE
    v_status := 'partially_paid';
  END IF;

  UPDATE public.student_fees SET status = v_status, updated_at = now()
   WHERE id = _fee_id AND status IS DISTINCT FROM v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_student_payments_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_student_fee_status(OLD.student_fee_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_student_fee_status(NEW.student_fee_id);
    IF TG_OP = 'UPDATE' AND OLD.student_fee_id <> NEW.student_fee_id THEN
      PERFORM public.recalc_student_fee_status(OLD.student_fee_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

CREATE TRIGGER trg_student_payments_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.student_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_student_payments_recalc();

-- Recalc on fee amount change too
CREATE OR REPLACE FUNCTION public.trg_student_fees_recalc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount AND NEW.status <> 'cancelled' THEN
    PERFORM public.recalc_student_fee_status(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_fees_au
AFTER UPDATE ON public.student_fees
FOR EACH ROW EXECUTE FUNCTION public.trg_student_fees_recalc();
