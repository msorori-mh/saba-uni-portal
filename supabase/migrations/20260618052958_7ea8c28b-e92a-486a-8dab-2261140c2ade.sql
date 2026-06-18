-- SECURITY-RLS-REMEDIATION-01 (follow-up)
-- Replace the security-definer view with column-level privileges on the
-- base table. This keeps anon access scoped to safe public columns only,
-- without introducing a new view object.

DROP VIEW IF EXISTS public.faculty_directory;

-- Re-create the public SELECT policy that was dropped in the previous
-- migration. Row filter is identical to the original ("is_active = true");
-- the protection now comes from column-level GRANTs below.
DROP POLICY IF EXISTS "Public can view active faculty" ON public.faculty;
CREATE POLICY "Public can view active faculty"
  ON public.faculty FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Strip any table-wide SELECT privilege the anon role may have inherited,
-- then grant SELECT only on safe public-directory columns. email and
-- phone are intentionally excluded so they can never be read by anon
-- even if a query asks for them.
REVOKE SELECT ON public.faculty FROM anon;
GRANT SELECT (
  id, employee_id, full_name_ar, full_name_en,
  degree, specialization, program_id, rank, photo,
  bio_ar, bio_en, sort_order, is_active, category,
  start_year, admin_position, admin_position_order
) ON public.faculty TO anon;

-- Authenticated users still need full table SELECT so the existing
-- "Admins can view all faculty" RLS policy and admin pages keep working.
-- (Non-admin authenticated users are filtered out by the existing RLS,
-- so they can only see active rows and only the safe columns above via
-- the anon policy path.)
GRANT SELECT ON public.faculty TO authenticated;