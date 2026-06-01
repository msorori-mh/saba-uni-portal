CREATE TABLE public.request_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description_ar text,
  is_active boolean NOT NULL DEFAULT true,
  requires_attachment boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_types TO authenticated;
GRANT ALL ON public.request_types TO service_role;

ALTER TABLE public.request_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY rt_select_active ON public.request_types
  FOR SELECT TO authenticated
  USING (is_active = true OR public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs','dean']));

CREATE POLICY rt_insert ON public.request_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY rt_update ON public.request_types
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY rt_delete ON public.request_types
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE TRIGGER trg_request_types_updated_at
  BEFORE UPDATE ON public.request_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order) VALUES
  ('absence_excuse',        'غياب بعذر',            'تقديم عذر عن غياب محاضرة أو فترة', true,  true,  1),
  ('enrollment_suspension', 'وقف قيد',              'طلب إيقاف القيد لفصل أو سنة',      false, true,  2),
  ('extra_chance',          'منح فرصة',             'طلب منح فرصة استثنائية',           false, false, 3),
  ('transfer',              'تحويل',                'طلب تحويل بين الأقسام أو الكليات', false, true,  4),
  ('equivalency',           'مقاصة',                'طلب معادلة مقررات',                false, true,  5),
  ('official_transcript',   'طلب سجل أكاديمي رسمي','إصدار سجل أكاديمي رسمي مختوم',     false, false, 6);
