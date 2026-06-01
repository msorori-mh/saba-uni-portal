
-- ================= discount_types =================
CREATE TABLE public.discount_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage','fixed_amount')),
  default_value numeric NOT NULL DEFAULT 0 CHECK (default_value >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.discount_types TO authenticated;
GRANT ALL ON public.discount_types TO service_role;

ALTER TABLE public.discount_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY dt_select ON public.discount_types FOR SELECT TO authenticated
USING (is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean']));
CREATE POLICY dt_insert ON public.discount_types FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY dt_update ON public.discount_types FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY dt_delete ON public.discount_types FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_discount_types_updated BEFORE UPDATE ON public.discount_types
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================= student_discounts =================
CREATE TABLE public.student_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  discount_type_id uuid NOT NULL REFERENCES public.discount_types(id),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id),
  semester_id uuid NOT NULL REFERENCES public.semesters(id),
  value numeric NOT NULL CHECK (value >= 0),
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','cancelled')),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_discounts_student ON public.student_discounts(student_profile_id);
CREATE INDEX idx_student_discounts_ys ON public.student_discounts(academic_year_id, semester_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_discounts TO authenticated;
GRANT ALL ON public.student_discounts TO service_role;

ALTER TABLE public.student_discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sd_select ON public.student_discounts FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.student_profiles sp WHERE sp.id = student_profile_id AND sp.user_id = auth.uid())
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
);
CREATE POLICY sd_insert ON public.student_discounts FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sd_update ON public.student_discounts FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sd_delete ON public.student_discounts FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_student_discounts_updated BEFORE UPDATE ON public.student_discounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ================= student_fee_adjustments =================
CREATE TABLE public.student_fee_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_fee_id uuid NOT NULL REFERENCES public.student_fees(id) ON DELETE CASCADE,
  student_discount_id uuid NOT NULL REFERENCES public.student_discounts(id) ON DELETE CASCADE,
  original_amount numeric NOT NULL,
  discount_amount numeric NOT NULL,
  final_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_fee_id, student_discount_id)
);
CREATE INDEX idx_sfa_fee ON public.student_fee_adjustments(student_fee_id);
CREATE INDEX idx_sfa_discount ON public.student_fee_adjustments(student_discount_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fee_adjustments TO authenticated;
GRANT ALL ON public.student_fee_adjustments TO service_role;

ALTER TABLE public.student_fee_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY sfa_select ON public.student_fee_adjustments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.student_fees f
    JOIN public.student_profiles sp ON sp.id = f.student_profile_id
    WHERE f.id = student_fee_id AND sp.user_id = auth.uid()
  )
  OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean'])
);
CREATE POLICY sfa_insert ON public.student_fee_adjustments FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sfa_update ON public.student_fee_adjustments FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));
CREATE POLICY sfa_delete ON public.student_fee_adjustments FOR DELETE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

-- ================= Logic: apply / revert a discount =================
CREATE OR REPLACE FUNCTION public.apply_student_discount(_discount_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d record;
  dt record;
  f record;
  v_disc numeric;
  v_final numeric;
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
      v_disc := ROUND((f.amount * d.value / 100.0)::numeric, 2);
    ELSE
      v_disc := d.value;
    END IF;
    IF v_disc > f.amount THEN v_disc := f.amount; END IF;
    v_final := f.amount - v_disc;

    INSERT INTO public.student_fee_adjustments(student_fee_id, student_discount_id, original_amount, discount_amount, final_amount)
    VALUES (f.id, d.id, f.amount, v_disc, v_final);

    UPDATE public.student_fees SET amount = v_final, updated_at = now() WHERE id = f.id;
    PERFORM public.recalc_student_fee_status(f.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_student_discount(_discount_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a record;
BEGIN
  FOR a IN
    SELECT * FROM public.student_fee_adjustments WHERE student_discount_id = _discount_id
  LOOP
    UPDATE public.student_fees SET amount = a.original_amount, updated_at = now() WHERE id = a.student_fee_id;
    DELETE FROM public.student_fee_adjustments WHERE id = a.id;
    PERFORM public.recalc_student_fee_status(a.student_fee_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_student_discounts_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'active' THEN
      PERFORM public.apply_student_discount(NEW.id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'active' AND NEW.status <> 'active' THEN
      PERFORM public.revert_student_discount(NEW.id);
    ELSIF OLD.status <> 'active' AND NEW.status = 'active' THEN
      PERFORM public.apply_student_discount(NEW.id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.revert_student_discount(OLD.id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_student_discounts_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.student_discounts
FOR EACH ROW EXECUTE FUNCTION public.trg_student_discounts_apply();
