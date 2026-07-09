-- STUDENT-REQUEST-PROCESSING-UNITS-SCHEMA-01
-- Schema foundation for admin-configurable student request processing units,
-- roles, and assignments.

CREATE TABLE IF NOT EXISTS public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  portal_scope text NOT NULL DEFAULT 'staff',
  default_app_role text,
  is_academic_unit boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_processing_units_code_key'
      AND conrelid = 'public.request_processing_units'::regclass
  ) THEN
    ALTER TABLE public.request_processing_units
      ADD CONSTRAINT request_processing_units_code_key UNIQUE (code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_processing_units_portal_scope_chk'
      AND conrelid = 'public.request_processing_units'::regclass
  ) THEN
    ALTER TABLE public.request_processing_units
      ADD CONSTRAINT request_processing_units_portal_scope_chk
      CHECK (portal_scope IN ('admin', 'staff', 'faculty', 'mixed'));
  END IF;
END $$;

COMMENT ON TABLE public.request_processing_units IS
  'Processing units that student request workflow steps can be routed to (e.g. student affairs, finance, department chair, dean). Master data; populated later via admin UI or explicit seed — not in this migration.';
COMMENT ON COLUMN public.request_processing_units.code IS
  'Stable machine identifier (e.g. student_affairs, dean). Unique.';
COMMENT ON COLUMN public.request_processing_units.portal_scope IS
  'Which portal primarily surfaces this unit: admin, staff, faculty, or mixed.';
COMMENT ON COLUMN public.request_processing_units.default_app_role IS
  'Optional soft reference to public.app_role for RLS/RPC fallback. Not enforced as FK because app_role is an enum.';
COMMENT ON COLUMN public.request_processing_units.is_academic_unit IS
  'True for faculty-position units (department_chair, dean) resolved via position_assignments rather than staff_profiles.';

CREATE TABLE IF NOT EXISTS public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  description_ar text,
  app_role text,
  position_code text,
  is_managerial boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_processing_roles_unit_id_code_key'
      AND conrelid = 'public.request_processing_roles'::regclass
  ) THEN
    ALTER TABLE public.request_processing_roles
      ADD CONSTRAINT request_processing_roles_unit_id_code_key UNIQUE (unit_id, code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'request_processing_roles_position_code_fk'
      AND conrelid = 'public.request_processing_roles'::regclass
  ) THEN
    ALTER TABLE public.request_processing_roles
      ADD CONSTRAINT request_processing_roles_position_code_fk
      FOREIGN KEY (position_code)
      REFERENCES public.organizational_positions(code)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.request_processing_roles IS
  'Operational job titles within a processing unit for student request routing (e.g. student_affairs_specialist, department_chair). Populated later via admin.';
COMMENT ON COLUMN public.request_processing_roles.app_role IS
  'Optional soft reference to public.app_role for security/RPC fallback. Not enforced as FK because app_role is an enum.';
COMMENT ON COLUMN public.request_processing_roles.position_code IS
  'Optional link to organizational_positions.code for faculty positions (department_head, dean) and other mapped titles.';

CREATE TABLE IF NOT EXISTS public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.request_processing_units(id) ON DELETE RESTRICT,
  role_id uuid REFERENCES public.request_processing_roles(id) ON DELETE RESTRICT,
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid,
  faculty_profile_id uuid,
  position_assignment_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_type_chk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_type_chk
      CHECK (assignment_type IN ('user','staff_profile','faculty_profile','position_assignment','department_position','college_position'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_user_id_fk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_user_id_fk
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_staff_profile_id_fk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_staff_profile_id_fk
      FOREIGN KEY (staff_profile_id) REFERENCES public.staff_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_faculty_profile_id_fk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_faculty_profile_id_fk
      FOREIGN KEY (faculty_profile_id) REFERENCES public.faculty_profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_position_assignment_id_fk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_position_assignment_id_fk
      FOREIGN KEY (position_assignment_id) REFERENCES public.position_assignments(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_processing_assignments_department_id_fk' AND conrelid = 'public.request_processing_assignments'::regclass) THEN
    ALTER TABLE public.request_processing_assignments
      ADD CONSTRAINT request_processing_assignments_department_id_fk
      FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON TABLE public.request_processing_assignments IS
  'Links processing units/roles to concrete actors: staff, faculty, users, or organizational position assignments. Supports department_position and college_position strategies resolved at workflow runtime.';
COMMENT ON COLUMN public.request_processing_assignments.assignment_type IS
  'How this row binds an actor: user, staff_profile, faculty_profile, position_assignment, department_position (scoped by department_id), or college_position (dean-level, resolved via position_assignments).';
COMMENT ON COLUMN public.request_processing_assignments.department_id IS
  'Optional scope for department_position assignments (e.g. chair of a specific department). May be null when resolved dynamically from the student request.';

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_request_processing_units_updated_at' AND tgrelid = 'public.request_processing_units'::regclass) THEN
    CREATE TRIGGER trg_request_processing_units_updated_at
      BEFORE UPDATE ON public.request_processing_units
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_request_processing_roles_updated_at' AND tgrelid = 'public.request_processing_roles'::regclass) THEN
    CREATE TRIGGER trg_request_processing_roles_updated_at
      BEFORE UPDATE ON public.request_processing_roles
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_request_processing_assignments_updated_at' AND tgrelid = 'public.request_processing_assignments'::regclass) THEN
    CREATE TRIGGER trg_request_processing_assignments_updated_at
      BEFORE UPDATE ON public.request_processing_assignments
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $mig$;

CREATE INDEX IF NOT EXISTS idx_rpu_code ON public.request_processing_units(code);
CREATE INDEX IF NOT EXISTS idx_rpu_is_active ON public.request_processing_units(is_active);
CREATE INDEX IF NOT EXISTS idx_rpr_unit_id ON public.request_processing_roles(unit_id);
CREATE INDEX IF NOT EXISTS idx_rpr_code ON public.request_processing_roles(code);
CREATE INDEX IF NOT EXISTS idx_rpr_is_active ON public.request_processing_roles(is_active);
CREATE INDEX IF NOT EXISTS idx_rpa_unit_id ON public.request_processing_assignments(unit_id);
CREATE INDEX IF NOT EXISTS idx_rpa_role_id ON public.request_processing_assignments(role_id);
CREATE INDEX IF NOT EXISTS idx_rpa_user_id ON public.request_processing_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_rpa_staff_profile_id ON public.request_processing_assignments(staff_profile_id);
CREATE INDEX IF NOT EXISTS idx_rpa_faculty_profile_id ON public.request_processing_assignments(faculty_profile_id);
CREATE INDEX IF NOT EXISTS idx_rpa_position_assignment_id ON public.request_processing_assignments(position_assignment_id);
CREATE INDEX IF NOT EXISTS idx_rpa_is_active ON public.request_processing_assignments(is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_processing_units TO authenticated;
GRANT ALL ON public.request_processing_units TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_processing_roles TO authenticated;
GRANT ALL ON public.request_processing_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.request_processing_assignments TO authenticated;
GRANT ALL ON public.request_processing_assignments TO service_role;

ALTER TABLE public.request_processing_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_processing_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_processing_assignments ENABLE ROW LEVEL SECURITY;