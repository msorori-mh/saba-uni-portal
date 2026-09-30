-- COMPREHENSIVE-PERSONAS-READINESS-01
-- Read-only structural preflight for the isolated test database.
-- Execute as an authorized database operator. No passwords or email addresses are returned.
-- A positive row is only a candidate: it does not prove login, page content, or E2E behavior.

WITH active_faculty AS (
  SELECT f.user_id
  FROM public.faculty_profiles f
  JOIN auth.users u ON u.id = f.user_id AND u.email_confirmed_at IS NOT NULL
  WHERE f.status = 'active'
), active_staff AS (
  SELECT s.user_id, s.job_title
  FROM public.staff_profiles s
  JOIN auth.users u ON u.id = s.user_id AND u.email_confirmed_at IS NOT NULL
  WHERE s.status = 'active'
), active_membership AS (
  SELECT m.user_id, c.council_type::text AS council_type, m.member_role::text AS member_role
  FROM public.academic_council_members m
  JOIN public.academic_councils c ON c.id = m.council_id
  WHERE m.is_active AND c.is_active
    AND (m.active_to IS NULL OR m.active_to >= current_date)
), active_role AS (
  SELECT r.user_id, r.role::text AS role FROM public.user_roles r
), candidate AS (
  SELECT 'student' AS persona, p.user_id
  FROM public.student_profiles p JOIN active_role r ON r.user_id=p.user_id AND r.role='student'
  JOIN auth.users u ON u.id=p.user_id AND u.email_confirmed_at IS NOT NULL
  UNION ALL SELECT 'faculty', f.user_id FROM active_faculty f
    JOIN active_role r ON r.user_id=f.user_id AND r.role='faculty_member'
  UNION ALL SELECT 'faculty_department_member', f.user_id FROM active_faculty f
    JOIN active_membership m ON m.user_id=f.user_id AND m.council_type='department' AND m.member_role='member'
  UNION ALL SELECT 'department_head', f.user_id FROM active_faculty f
    JOIN active_role r ON r.user_id=f.user_id AND r.role='department_head'
    JOIN active_membership m ON m.user_id=f.user_id AND m.council_type='department' AND m.member_role='chair'
  UNION ALL SELECT 'department_head_college_member', f.user_id FROM active_faculty f
    JOIN active_role r ON r.user_id=f.user_id AND r.role='department_head'
    JOIN active_membership dm ON dm.user_id=f.user_id AND dm.council_type='department' AND dm.member_role='chair'
    JOIN active_membership cm ON cm.user_id=f.user_id AND cm.council_type='college' AND cm.member_role='member'
  UNION ALL SELECT 'vice_dean_dual_council', f.user_id FROM active_faculty f
    JOIN public.position_assignments pa ON pa.user_id=f.user_id AND pa.is_active
      AND pa.assigned_from<=current_date AND (pa.assigned_to IS NULL OR pa.assigned_to>=current_date)
    JOIN public.organizational_positions op ON op.id=pa.position_id AND op.is_active
      AND op.code IN ('vice_dean_academic','vice_dean_students')
    JOIN active_membership dm ON dm.user_id=f.user_id AND dm.council_type='department'
    JOIN active_membership cm ON cm.user_id=f.user_id AND cm.council_type='college'
  UNION ALL SELECT 'dean', r.user_id FROM active_role r
    JOIN auth.users u ON u.id=r.user_id AND u.email_confirmed_at IS NOT NULL WHERE r.role='dean'
  UNION ALL SELECT 'department_council_secretary', f.user_id FROM active_faculty f
    JOIN active_membership m ON m.user_id=f.user_id AND m.council_type='department' AND m.member_role='secretary'
  UNION ALL SELECT 'registrar', s.user_id FROM active_staff s
    JOIN active_role r ON r.user_id=s.user_id AND r.role='registrar'
  UNION ALL SELECT 'student_affairs_specialist', s.user_id FROM active_staff s
    JOIN active_role r ON r.user_id=s.user_id AND r.role='student_affairs'
    WHERE s.job_title ILIKE '%أخصائي%'
  UNION ALL SELECT 'student_affairs_manager', s.user_id FROM active_staff s
    JOIN active_role r ON r.user_id=s.user_id AND r.role='student_affairs'
    WHERE s.job_title ILIKE '%مدير%'
  UNION ALL SELECT 'finance', s.user_id FROM active_staff s
    JOIN active_role r ON r.user_id=s.user_id AND r.role='finance_officer'
  UNION ALL SELECT 'human_resources', s.user_id FROM active_staff s
    JOIN active_role r ON r.user_id=s.user_id AND r.role='hr_officer'
  UNION ALL SELECT 'archive', s.user_id FROM active_staff s
    WHERE s.job_title ILIKE '%أرشيف%'
  UNION ALL SELECT 'administrator', r.user_id FROM active_role r
    JOIN auth.users u ON u.id=r.user_id AND u.email_confirmed_at IS NOT NULL
    WHERE r.role IN ('admin','system_admin')
), required(persona) AS (
  VALUES ('student'),('faculty'),('faculty_department_member'),('department_head'),
    ('department_head_college_member'),('vice_dean_dual_council'),('dean'),
    ('department_council_secretary'),('registrar'),('student_affairs_specialist'),
    ('student_affairs_manager'),
    ('finance'),('human_resources'),('archive'),('administrator')
)
SELECT r.persona, count(DISTINCT c.user_id) AS linked_confirmed_candidates,
       CASE WHEN count(DISTINCT c.user_id)>0 THEN 'CANDIDATE_ONLY' ELSE 'MISSING' END AS structural_status
FROM required r LEFT JOIN candidate c ON c.persona=r.persona
GROUP BY r.persona ORDER BY r.persona;
