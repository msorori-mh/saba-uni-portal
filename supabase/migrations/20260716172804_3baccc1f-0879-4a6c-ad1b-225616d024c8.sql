BEGIN;

-- 1) Units
INSERT INTO public.request_processing_units
  (code, name_ar, name_en, portal_scope, is_academic_unit, is_active, sort_order)
VALUES
  ('library',          'المكتبة',              'Library',           'staff', false, true, 60),
  ('labs',             'المعامل',              'Labs',              'staff', false, true, 61),
  ('graduate_affairs', 'شؤون الدراسات العليا', 'Graduate Affairs',  'staff', false, true, 62),
  ('department',       'الأقسام العلمية',      'Academic Departments','staff', true,  true, 63)
ON CONFLICT (code) DO NOTHING;

-- 2) Roles
WITH u AS (
  SELECT id, code FROM public.request_processing_units
),
new_roles(unit_code, code, name_ar, is_managerial, sort_order) AS (
  VALUES
    ('library',          'library_officer',              'أمين المكتبة',              false, 10),
    ('labs',             'labs_manager',                 'مسؤول المعامل',             true,  10),
    ('graduate_affairs', 'graduate_affairs_manager',     'مدير الدراسات العليا',      true,  10),
    ('graduate_affairs', 'graduate_affairs_specialist',  'أخصائي الدراسات العليا',    false, 20),
    ('department',       'department_head',              'رئيس القسم',                true,  10)
)
INSERT INTO public.request_processing_roles
  (unit_id, code, name_ar, is_managerial, sort_order, is_active)
SELECT u.id, r.code, r.name_ar, r.is_managerial, r.sort_order, true
FROM new_roles r
JOIN u ON u.code = r.unit_code
ON CONFLICT (unit_id, code) DO NOTHING;

-- 3) Staff-profile assignments
WITH u AS (SELECT id, code FROM public.request_processing_units),
     r AS (
       SELECT rr.id, rr.code AS role_code, uu.code AS unit_code
       FROM public.request_processing_roles rr
       JOIN u uu ON uu.id = rr.unit_id
     ),
     mapping(unit_code, role_code, staff_profile_id) AS (
       VALUES
         ('library',          'library_officer',
            '4a838311-0ab7-4033-8e0c-69327d522bc7'::uuid),
         ('labs',             'labs_manager',
            'b59e6e45-260d-4af6-b312-85381d354104'::uuid),
         ('graduate_affairs', 'graduate_affairs_manager',
            'f463a79b-65be-4a94-8003-1c9a2727b88f'::uuid),
         ('graduate_affairs', 'graduate_affairs_specialist',
            'aa4f5c16-c993-4af6-a6d4-59d9542c1a7f'::uuid)
     )
INSERT INTO public.request_processing_assignments
  (unit_id, role_id, assignment_type, staff_profile_id, is_active)
SELECT u.id, r.id, 'staff_profile', sp.id, true
FROM mapping m
JOIN u ON u.code = m.unit_code
JOIN r ON r.unit_code = m.unit_code AND r.role_code = m.role_code
JOIN public.staff_profiles sp ON sp.id = m.staff_profile_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.request_processing_assignments existing
  WHERE existing.unit_id = u.id
    AND existing.role_id = r.id
    AND existing.assignment_type = 'staff_profile'
    AND existing.staff_profile_id = sp.id
);

-- 4) Faculty-profile assignments for department heads
WITH u AS (
  SELECT id FROM public.request_processing_units WHERE code = 'department'
),
r AS (
  SELECT id FROM public.request_processing_roles
  WHERE code = 'department_head' AND unit_id = (SELECT id FROM u)
),
chairs(faculty_profile_id) AS (
  VALUES
    ('d08a8509-4c04-472e-885f-053a80be12ec'::uuid),
    ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3'::uuid),
    ('c1fe6084-e594-482e-a178-ac8eaffed376'::uuid)
)
INSERT INTO public.request_processing_assignments
  (unit_id, role_id, assignment_type, faculty_profile_id, department_id, is_active)
SELECT (SELECT id FROM u),
       (SELECT id FROM r),
       'faculty_profile',
       fp.id,
       fp.department_id,
       true
FROM public.faculty_profiles fp
JOIN chairs c ON c.faculty_profile_id = fp.id
WHERE NOT EXISTS (
  SELECT 1 FROM public.request_processing_assignments existing
  WHERE existing.unit_id = (SELECT id FROM u)
    AND existing.role_id = (SELECT id FROM r)
    AND existing.assignment_type = 'faculty_profile'
    AND existing.faculty_profile_id = fp.id
);

COMMIT;