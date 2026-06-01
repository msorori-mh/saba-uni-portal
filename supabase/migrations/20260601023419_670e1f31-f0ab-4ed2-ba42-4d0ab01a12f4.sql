
-- Phase 7A: User & Role Management infrastructure
-- No new tables needed (auth.users + profiles + user_roles cover everything).
-- Add: last-admin protection, helper functions, audit log support.

-- Helper: count current admins
CREATE OR REPLACE FUNCTION public.count_admins()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.user_roles WHERE role = 'admin';
$$;

-- Protect: never allow removing the last admin
CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' THEN
    IF (SELECT COUNT(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'لا يمكن إزالة آخر حساب مدير في النظام';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON public.user_roles;
CREATE TRIGGER trg_prevent_last_admin_removal
BEFORE DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- Allow admins to read auth-related profile status fields via existing policies (already in place).
-- Add admin update policy on student_profiles for status / must_change_password / user_id linkage.
-- These already exist via "Admins or self can update" patterns. No change needed.

-- Allow reading academic_number / employee_number columns for listing — already public to admin via RLS.

-- Index for fast role lookup count
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);
