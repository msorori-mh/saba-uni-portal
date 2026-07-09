ALTER TABLE public.staff_profiles
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.staff_profiles.email IS
  'University login email for staff portal access. Auth.users.email should match when create_login=true.';