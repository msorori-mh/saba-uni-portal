-- Roll back the over-tight authenticated revoke so admin pages keep working.
-- Anonymous protection on email/phone (column-level GRANT to anon) remains.
GRANT SELECT ON public.faculty TO authenticated;