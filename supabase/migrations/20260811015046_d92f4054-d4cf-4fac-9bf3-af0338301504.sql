CREATE TABLE public.backup_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verified_at timestamptz NOT NULL DEFAULT now(),
  check_kind text NOT NULL CHECK (check_kind IN ('backup_snapshot','pitr','restore_drill','storage_coverage')),
  result text NOT NULL CHECK (result IN ('pass','pass_with_notes','fail')),
  observed_rto_minutes integer CHECK (observed_rto_minutes IS NULL OR observed_rto_minutes >= 0),
  observed_rpo_minutes integer CHECK (observed_rpo_minutes IS NULL OR observed_rpo_minutes >= 0),
  checklist_items text[] NOT NULL DEFAULT '{}',
  notes text,
  performed_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_backup_verifications_verified_at ON public.backup_verifications (verified_at DESC);

GRANT SELECT, INSERT ON public.backup_verifications TO authenticated;
GRANT ALL ON public.backup_verifications TO service_role;

ALTER TABLE public.backup_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "backup_verifications_select_admins"
  ON public.backup_verifications
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'system_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "backup_verifications_insert_admins"
  ON public.backup_verifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    performed_by = auth.uid()
    AND (
      public.has_role(auth.uid(), 'system_admin'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

CREATE OR REPLACE FUNCTION public.backup_verifications_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'سجل التحقق من النسخ الاحتياطي غير قابل للتعديل أو الحذف';
END;
$$;

CREATE TRIGGER trg_backup_verifications_immutable
  BEFORE UPDATE OR DELETE ON public.backup_verifications
  FOR EACH ROW EXECUTE FUNCTION public.backup_verifications_block_mutation();