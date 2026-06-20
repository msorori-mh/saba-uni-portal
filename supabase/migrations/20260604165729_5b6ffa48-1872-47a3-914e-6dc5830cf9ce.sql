UPDATE auth.users
SET encrypted_password = crypt('Demo@2024', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id IN (
  SELECT user_id FROM public.faculty_profiles fp
  JOIN public.faculty f ON f.id = fp.faculty_id
  WHERE f.employee_id = 'DEMO-FAC' AND fp.user_id IS NOT NULL
)
OR id IN (
  SELECT user_id FROM public.student_profiles
  WHERE academic_number = 'DEMO2024' AND user_id IS NOT NULL
)
OR id IN (
  SELECT user_id FROM public.staff_profiles
  WHERE employee_number = 'DEMO-STF' AND user_id IS NOT NULL
);

UPDATE public.faculty_profiles SET must_change_password = false
WHERE faculty_id IN (SELECT id FROM public.faculty WHERE employee_id='DEMO-FAC');

UPDATE public.student_profiles SET must_change_password = false
WHERE academic_number = 'DEMO2024';

UPDATE public.staff_profiles SET must_change_password = false
WHERE employee_number = 'DEMO-STF';