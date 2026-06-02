CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Realign demo faculty/staff emails with their employee_number (identifier)
UPDATE auth.users
   SET email = 'demo-fac@faculty.usr.edu.ye'
 WHERE email = 'demo@faculty.usr.edu.ye';

UPDATE auth.users
   SET email = 'demo-stf@staff.usr.edu.ye'
 WHERE email = 'demo@staff.usr.edu.ye';

-- 2) Reset passwords for the three demo accounts to a known value: Demo@2024
UPDATE auth.users
   SET encrypted_password = crypt('Demo@2024', gen_salt('bf')),
       email_confirmed_at = COALESCE(email_confirmed_at, now()),
       updated_at = now()
 WHERE email IN (
   'demo2024@students.usr.edu.ye',
   'demo-fac@faculty.usr.edu.ye',
   'demo-stf@staff.usr.edu.ye'
 );

-- 3) Ensure must_change_password is false for the demo profiles (idempotent)
UPDATE public.student_profiles sp
   SET must_change_password = false
  FROM auth.users u
 WHERE sp.user_id = u.id
   AND u.email = 'demo2024@students.usr.edu.ye';

UPDATE public.faculty_profiles fp
   SET must_change_password = false
  FROM auth.users u
 WHERE fp.user_id = u.id
   AND u.email = 'demo-fac@faculty.usr.edu.ye';

UPDATE public.staff_profiles st
   SET must_change_password = false
  FROM auth.users u
 WHERE st.user_id = u.id
   AND u.email = 'demo-stf@staff.usr.edu.ye';