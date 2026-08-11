ALTER TABLE public.user_role_assignments
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS source_position_assignment_id uuid
    REFERENCES public.position_assignments(id) ON DELETE SET NULL;

ALTER TABLE public.user_role_assignments
  DROP CONSTRAINT IF EXISTS user_role_assignments_source_type_check;

ALTER TABLE public.user_role_assignments
  ADD CONSTRAINT user_role_assignments_source_type_check
  CHECK (source_type IN ('direct', 'position'));

CREATE INDEX IF NOT EXISTS idx_user_role_assignments_source_pa
  ON public.user_role_assignments (source_position_assignment_id)
  WHERE source_position_assignment_id IS NOT NULL;