
CREATE TABLE public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  import_type text NOT NULL,
  file_name text NOT NULL,
  rows_total integer NOT NULL DEFAULT 0,
  rows_success integer NOT NULL DEFAULT 0,
  rows_failed integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  notes text
);

GRANT SELECT, INSERT ON public.import_logs TO authenticated;
GRANT ALL ON public.import_logs TO service_role;

ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_logs_select_privileged"
ON public.import_logs FOR SELECT TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::text,'system_admin'::text,'registrar'::text]));

CREATE POLICY "import_logs_insert_privileged"
ON public.import_logs FOR INSERT TO authenticated
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::text,'system_admin'::text,'registrar'::text]));

CREATE INDEX idx_import_logs_created_at ON public.import_logs (created_at DESC);
CREATE INDEX idx_import_logs_type ON public.import_logs (import_type);
