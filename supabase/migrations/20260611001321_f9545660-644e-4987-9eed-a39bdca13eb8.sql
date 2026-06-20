
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_code text NOT NULL REFERENCES public.roles_catalog(code) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_code)
);

GRANT SELECT, INSERT, DELETE ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;

ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ura_read_authenticated"
  ON public.user_role_assignments FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "ura_admin_insert"
  ON public.user_role_assignments FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY "ura_admin_delete"
  ON public.user_role_assignments FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE INDEX IF NOT EXISTS idx_ura_user ON public.user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_ura_role ON public.user_role_assignments(role_code);
