DROP POLICY IF EXISTS "Admins or self can update faculty profile" ON public.faculty_profiles;
DROP POLICY IF EXISTS "Students can update own profile (locked)" ON public.student_profiles;

REVOKE UPDATE ON TABLE public.faculty_profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE ON TABLE public.student_profiles FROM PUBLIC, anon, authenticated;