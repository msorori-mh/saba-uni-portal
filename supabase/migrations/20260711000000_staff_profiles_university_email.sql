-- PORTAL-UNIVERSITY-EMAIL-LOGIN-IMPORT-01 (design only — NOT applied in this phase)
-- Adds optional university login email to staff_profiles for parity with student_profiles.

ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.staff_profiles.email IS
  'University login email for staff portal access. Auth.users.email should match when create_login=true.';
