
-- Departments table
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name_ar TEXT NOT NULL,
  name_en TEXT,
  description_ar TEXT,
  description_en TEXT,
  image TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.departments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active departments"
  ON public.departments FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can view all departments"
  ON public.departments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert departments"
  ON public.departments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update departments"
  ON public.departments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete departments"
  ON public.departments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extend programs with department link + degree fields
ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS degree_type TEXT,
  ADD COLUMN IF NOT EXISTS years INTEGER;

-- Admin policies for programs
CREATE POLICY "Admins can view all programs"
  ON public.programs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert programs"
  ON public.programs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update programs"
  ON public.programs FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete programs"
  ON public.programs FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;

-- Storage bucket for department images
INSERT INTO storage.buckets (id, name, public)
VALUES ('department-images', 'department-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view department images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'department-images');

CREATE POLICY "Admins can upload department images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'department-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update department images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'department-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete department images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'department-images' AND has_role(auth.uid(), 'admin'::app_role));
