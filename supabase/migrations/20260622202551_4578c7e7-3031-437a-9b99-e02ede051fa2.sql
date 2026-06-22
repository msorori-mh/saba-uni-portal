-- STAFF-DEPARTMENT-SCOPE-01: multi-department scope for staff profiles.
ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS department_scope text NOT NULL DEFAULT 'specific';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'staff_profiles_department_scope_check'
      AND conrelid = 'public.staff_profiles'::regclass
  ) THEN
    ALTER TABLE public.staff_profiles
      ADD CONSTRAINT staff_profiles_department_scope_check
      CHECK (department_scope IN ('all', 'specific'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.staff_profile_departments (
  staff_profile_id uuid NOT NULL REFERENCES public.staff_profiles(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_profile_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_profile_departments_department
  ON public.staff_profile_departments(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profile_departments TO authenticated;
GRANT ALL ON public.staff_profile_departments TO service_role;

ALTER TABLE public.staff_profile_departments ENABLE ROW LEVEL SECURITY;

UPDATE public.staff_profiles
   SET department_scope = 'specific'
 WHERE department_scope IS DISTINCT FROM 'specific'
   AND department_scope IS DISTINCT FROM 'all';

INSERT INTO public.staff_profile_departments (staff_profile_id, department_id)
SELECT sp.id, sp.department_id
  FROM public.staff_profiles sp
 WHERE sp.department_id IS NOT NULL
ON CONFLICT (staff_profile_id, department_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_profile_departments'
      AND policyname = 'Staff can view own department links'
  ) THEN
    CREATE POLICY "Staff can view own department links"
      ON public.staff_profile_departments FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.staff_profiles sp
          WHERE sp.id = staff_profile_departments.staff_profile_id
            AND sp.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_profile_departments'
      AND policyname = 'Privileged roles can view staff department links'
  ) THEN
    CREATE POLICY "Privileged roles can view staff department links"
      ON public.staff_profile_departments FOR SELECT TO authenticated
      USING (
        public.has_any_role(
          auth.uid(),
          ARRAY['admin','system_admin','dean','vice_dean','hr_officer']
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'staff_profile_departments'
      AND policyname = 'Privileged roles can manage staff department links'
  ) THEN
    CREATE POLICY "Privileged roles can manage staff department links"
      ON public.staff_profile_departments FOR ALL TO authenticated
      USING (
        public.has_any_role(
          auth.uid(),
          ARRAY['admin','system_admin','dean','vice_dean','hr_officer']
        )
      )
      WITH CHECK (
        public.has_any_role(
          auth.uid(),
          ARRAY['admin','system_admin','dean','vice_dean','hr_officer']
        )
      );
  END IF;
END $$;