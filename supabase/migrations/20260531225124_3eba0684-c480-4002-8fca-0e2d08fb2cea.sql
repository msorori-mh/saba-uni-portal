-- ============================================================
-- Phase 1B: Faculty & Staff Identity Layer
-- ============================================================

-- 1) faculty_profiles
CREATE TABLE public.faculty_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  faculty_id uuid NOT NULL REFERENCES public.faculty(id) ON DELETE CASCADE,
  employee_number text UNIQUE,
  full_name_ar text NOT NULL,
  full_name_en text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  academic_rank text,
  position_title text,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT faculty_profiles_user_unique UNIQUE (user_id),
  CONSTRAINT faculty_profiles_faculty_unique UNIQUE (faculty_id)
);

CREATE INDEX idx_faculty_profiles_user ON public.faculty_profiles(user_id);
CREATE INDEX idx_faculty_profiles_dept ON public.faculty_profiles(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_profiles TO authenticated;
GRANT ALL ON public.faculty_profiles TO service_role;

ALTER TABLE public.faculty_profiles ENABLE ROW LEVEL SECURITY;

-- 2) staff_profiles
CREATE TABLE public.staff_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employee_number text UNIQUE,
  full_name_ar text NOT NULL,
  full_name_en text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  job_title text NOT NULL,
  role_type text NOT NULL DEFAULT 'admin_staff',
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_profiles_user_unique UNIQUE (user_id)
);

CREATE INDEX idx_staff_profiles_user ON public.staff_profiles(user_id);
CREATE INDEX idx_staff_profiles_dept ON public.staff_profiles(department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_profiles TO authenticated;
GRANT ALL ON public.staff_profiles TO service_role;

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- 3) updated_at triggers
CREATE TRIGGER trg_faculty_profiles_updated_at
  BEFORE UPDATE ON public.faculty_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_staff_profiles_updated_at
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Helper: is the user a department_head linked to a specific department?
CREATE OR REPLACE FUNCTION public.is_department_head_of(_user_id uuid, _dept_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.faculty_profiles fp
    JOIN public.user_roles ur ON ur.user_id = fp.user_id
    WHERE fp.user_id = _user_id
      AND ur.role = 'department_head'::app_role
      AND fp.department_id = _dept_id
  )
$$;

-- ============================================================
-- 5) RLS — faculty_profiles
-- ============================================================

-- SELECT: own row
CREATE POLICY "Faculty can view own profile"
  ON public.faculty_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- SELECT: admin / system_admin / dean / registrar / student_affairs
CREATE POLICY "Privileged roles can view all faculty profiles"
  ON public.faculty_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean','registrar','student_affairs']));

-- SELECT: department_head sees own department members
CREATE POLICY "Department head can view department faculty"
  ON public.faculty_profiles FOR SELECT TO authenticated
  USING (public.is_department_head_of(auth.uid(), department_id));

-- INSERT/UPDATE/DELETE: admin / system_admin
CREATE POLICY "Admins can insert faculty profiles"
  ON public.faculty_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY "Admins can delete faculty profiles"
  ON public.faculty_profiles FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

-- UPDATE: admins OR self (self-edits are filtered by trigger to safe fields only)
CREATE POLICY "Admins or self can update faculty profile"
  ON public.faculty_profiles FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR auth.uid() = user_id
  );

-- ============================================================
-- 6) RLS — staff_profiles
-- ============================================================

CREATE POLICY "Staff can view own profile"
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Privileged roles can view all staff profiles"
  ON public.staff_profiles FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','dean']));

CREATE POLICY "Admins can insert staff profiles"
  ON public.staff_profiles FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY "Admins can delete staff profiles"
  ON public.staff_profiles FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

CREATE POLICY "Admins or self can update staff profile"
  ON public.staff_profiles FOR UPDATE TO authenticated
  USING (
    public.has_any_role(auth.uid(), ARRAY['admin','system_admin'])
    OR auth.uid() = user_id
  );

-- ============================================================
-- 7) Sensitive-field protection triggers (same pattern as student)
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_faculty_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_faculty_lock', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.has_any_role(auth.uid(), ARRAY['admin','system_admin']) THEN
    RETURN NEW;
  END IF;

  -- Self-edit: revert any sensitive field change
  NEW.user_id              := OLD.user_id;
  NEW.faculty_id           := OLD.faculty_id;
  NEW.employee_number      := OLD.employee_number;
  NEW.full_name_ar         := OLD.full_name_ar;
  NEW.department_id        := OLD.department_id;
  NEW.program_id           := OLD.program_id;
  NEW.academic_rank        := OLD.academic_rank;
  NEW.position_title       := OLD.position_title;
  NEW.status               := OLD.status;
  NEW.must_change_password := OLD.must_change_password;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_faculty_sensitive
  BEFORE UPDATE ON public.faculty_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_faculty_sensitive_fields();

CREATE OR REPLACE FUNCTION public.protect_staff_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.bypass_staff_lock', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF public.has_any_role(auth.uid(), ARRAY['admin','system_admin']) THEN
    RETURN NEW;
  END IF;

  NEW.user_id              := OLD.user_id;
  NEW.employee_number      := OLD.employee_number;
  NEW.full_name_ar         := OLD.full_name_ar;
  NEW.department_id        := OLD.department_id;
  NEW.job_title            := OLD.job_title;
  NEW.role_type            := OLD.role_type;
  NEW.status               := OLD.status;
  NEW.must_change_password := OLD.must_change_password;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_staff_sensitive
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_staff_sensitive_fields();

-- ============================================================
-- 8) Secure password-change RPCs
-- ============================================================

CREATE OR REPLACE FUNCTION public.complete_faculty_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.bypass_faculty_lock', '1', true);
  UPDATE public.faculty_profiles
     SET must_change_password = false,
         updated_at = now()
   WHERE user_id = v_uid;
  PERFORM set_config('app.bypass_faculty_lock', '0', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_faculty_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_faculty_password_change() TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_staff_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM set_config('app.bypass_staff_lock', '1', true);
  UPDATE public.staff_profiles
     SET must_change_password = false,
         updated_at = now()
   WHERE user_id = v_uid;
  PERFORM set_config('app.bypass_staff_lock', '0', true);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_staff_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_staff_password_change() TO authenticated;