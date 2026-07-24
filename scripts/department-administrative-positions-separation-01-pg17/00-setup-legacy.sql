\set ON_ERROR_STOP on
ALTER TABLE public.faculty_profiles ADD COLUMN employee_number text;
CREATE TABLE public.organizational_positions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE NOT NULL,name_ar text NOT NULL,
  parent_code text,unit_type text NOT NULL,is_active boolean NOT NULL DEFAULT true,
  notes text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.position_assignments
  ADD COLUMN position_id uuid REFERENCES public.organizational_positions(id),
  ADD COLUMN notes text,
  ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE public.request_processing_assignments ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE public.request_types ADD COLUMN student_visible boolean NOT NULL DEFAULT false;

-- Production-shaped pre-activation fixture:
-- department_transfer:
--   is_active=true
--   student_visible=false
--   active_workflows=0
--   executable_runtime_steps=0
INSERT INTO public.request_types(id,code,name_ar,is_active,student_visible)
VALUES(
  '50000000-0000-4000-8000-000000000001',
  'department_transfer',
  'تحويل القسم',
  true,
  false
);

INSERT INTO auth.users(id) VALUES
 ('97acbe02-c59c-409c-8d51-7d4ef72e6db7'),
 ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'),
 ('f602b62c-194b-4591-8e9c-956e5cbb347d'),
 ('10000000-0000-4000-8000-000000000004');
INSERT INTO public.departments(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('ce485c67-5f7c-498d-b120-4b1130a86ae8'),
 ('22222222-2222-4222-8222-222222222222');
INSERT INTO public.faculty_profiles(id,user_id,status,department_id,employee_number) VALUES
 ('d08a8509-4c04-472e-885f-053a80be12ec','97acbe02-c59c-409c-8d51-7d4ef72e6db7','active','ce485c67-5f7c-498d-b120-4b1130a86ae8','F2025006'),
 ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e','active','ce485c67-5f7c-498d-b120-4b1130a86ae8','F2025005'),
 ('c1fe6084-e594-482e-a178-ac8eaffed376','f602b62c-194b-4591-8e9c-956e5cbb347d','active','22222222-2222-4222-8222-222222222222','F2025004')
ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,status='active',
  department_id=excluded.department_id,employee_number=excluded.employee_number;
INSERT INTO public.request_processing_units(id,code,is_active) VALUES
 ('20000000-0000-4000-8000-000000000001','department',true);
INSERT INTO public.request_processing_roles(id,unit_id,code,is_active) VALUES
 ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','department_head',true);
INSERT INTO public.request_processing_assignments(
 id,unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active
) VALUES
 ('7ab0b14f-9007-40d6-9aaf-f1cba454ac8f','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','faculty_profile','d08a8509-4c04-472e-885f-053a80be12ec','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
 ('912bdb96-3fb9-494c-8caa-7778c7d0d402','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','faculty_profile','6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
 ('4d0f434e-57ab-40b2-8a6f-5f27f330db97','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','faculty_profile','c1fe6084-e594-482e-a178-ac8eaffed376','22222222-2222-4222-8222-222222222222',true);
