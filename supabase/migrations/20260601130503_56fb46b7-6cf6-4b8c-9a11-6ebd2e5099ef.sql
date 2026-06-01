-- Phase 9B: Email Notification System (Resend)
-- email_logs table for audit & monitoring of email send attempts

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  related_entity_type TEXT,
  related_entity_id UUID,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.email_logs TO authenticated;
GRANT ALL ON public.email_logs TO service_role;

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Admins/system_admins can read all
CREATE POLICY "Admins view all email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'system_admin'::app_role)
);

-- Dean can read all (read-only oversight)
CREATE POLICY "Dean views all email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'dean'::app_role));

-- Authenticated users (server-side actions) can insert logs
CREATE POLICY "Authenticated can insert email logs"
ON public.email_logs FOR INSERT
TO authenticated
WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON public.email_logs (template_name);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs (recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_related ON public.email_logs (related_entity_type, related_entity_id);