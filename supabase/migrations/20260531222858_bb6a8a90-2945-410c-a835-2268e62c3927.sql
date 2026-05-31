
-- 1) Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'system_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dean';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'department_head';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'registrar';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student_affairs';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_officer';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'faculty_member';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'student';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'graduate';

-- 2) Helper: has_any_role (avoids enum-cast-in-same-tx issue)
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role::text = ANY(_roles)
  )
$$;

-- 3) student_profiles table
CREATE TABLE public.student_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  academic_number text NOT NULL UNIQUE,
  full_name_ar text NOT NULL,
  full_name_en text,
  national_id text,
  phone text,
  email text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_student_profiles_user_id ON public.student_profiles(user_id);
CREATE INDEX idx_student_profiles_academic_number ON public.student_profiles(academic_number);
CREATE INDEX idx_student_profiles_department ON public.student_profiles(department_id);
CREATE INDEX idx_student_profiles_program ON public.student_profiles(program_id);

-- 4) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_profiles TO authenticated;
GRANT ALL ON public.student_profiles TO service_role;

-- 5) Enable RLS
ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- 6) Policies
-- Student: read own
CREATE POLICY "Students can view own profile"
ON public.student_profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Student: update own (limited via column-level app logic; full row update allowed but
-- they only know their own user_id; admin will manage sensitive fields)
CREATE POLICY "Students can update own profile"
ON public.student_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Admins / system_admin / registrar / student_affairs: full read
CREATE POLICY "Admins can view all student profiles"
ON public.student_profiles FOR SELECT
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY "Admins can insert student profiles"
ON public.student_profiles FOR INSERT
TO authenticated
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY "Admins can update student profiles"
ON public.student_profiles FOR UPDATE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin','registrar','student_affairs']));

CREATE POLICY "Admins can delete student profiles"
ON public.student_profiles FOR DELETE
TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin','system_admin']));

-- 7) Trigger to maintain updated_at
CREATE TRIGGER trg_student_profiles_updated_at
BEFORE UPDATE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
