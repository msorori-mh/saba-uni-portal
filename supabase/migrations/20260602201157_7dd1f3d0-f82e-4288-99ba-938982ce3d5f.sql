
-- Phase 12A.1 — Academic Automation Foundation
-- Configuration-only table for automation toggles. No execution logic.

CREATE TABLE IF NOT EXISTS public.automation_settings (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;

ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;

-- Read: admin, system_admin, registrar, dean
CREATE POLICY "automation_settings_read"
  ON public.automation_settings
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
    OR public.has_role(auth.uid(), 'registrar')
    OR public.has_role(auth.uid(), 'dean')
  );

-- Manage (insert/update): admin, system_admin only
CREATE POLICY "automation_settings_insert"
  ON public.automation_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
  );

CREATE POLICY "automation_settings_update"
  ON public.automation_settings
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
  );

-- Seed the four automation rows (idempotent)
INSERT INTO public.automation_settings (key, enabled, config) VALUES
  ('registration', false, '{}'::jsonb),
  ('progression',  false, '{}'::jsonb),
  ('graduation',   false, '{}'::jsonb),
  ('finance',      false, '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;
