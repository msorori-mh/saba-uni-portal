create schema auth;
create table auth.users(id uuid primary key);
create table public.departments(id uuid primary key);
create table public.faculty_profiles(id uuid primary key,user_id uuid,full_name_ar text,employee_number text,status text,department_id uuid,updated_at timestamptz default now());
create table public.request_processing_units(id uuid primary key,code text,is_active boolean);
create table public.request_processing_roles(id uuid primary key,unit_id uuid,code text,is_active boolean);
create table public.request_processing_assignments(id uuid primary key default gen_random_uuid(),unit_id uuid,role_id uuid,assignment_type text,faculty_profile_id uuid,user_id uuid,staff_profile_id uuid,position_assignment_id uuid,department_id uuid,is_active boolean,starts_at timestamptz,ends_at timestamptz,updated_at timestamptz default now());
create table public.audit_logs(id bigint generated always as identity,entity_id uuid,actor_id uuid,payload jsonb);
create function public.log_audit(text,uuid,text,jsonb,jsonb,text,uuid) returns void language plpgsql as $$begin insert into audit_logs(entity_id,actor_id,payload) values($2,$7,$5); end$$;
insert into auth.users values ('97acbe02-c59c-409c-8d51-7d4ef72e6db7'),('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'),('f602b62c-194b-4591-8e9c-956e5cbb347d');
insert into departments values ('11111111-1111-4111-8111-111111111111'),('ce485c67-5f7c-498d-b120-4b1130a86ae8'),('22222222-2222-4222-8222-222222222222');
insert into request_processing_units values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','department',true);
insert into request_processing_roles values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','department_head',true);
insert into faculty_profiles(id,user_id,full_name_ar,employee_number,status,department_id) values
('d08a8509-4c04-472e-885f-053a80be12ec','97acbe02-c59c-409c-8d51-7d4ef72e6db7','د. اسامه عبدالجليل احمد سيف','F2025006','active','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','d4aaa5c9-72d1-4996-b0e8-d30c6327da6e','د. خالد قاسم محمد البراحي','F2025005','active','ce485c67-5f7c-498d-b120-4b1130a86ae8'),
('c1fe6084-e594-482e-a178-ac8eaffed376','f602b62c-194b-4591-8e9c-956e5cbb347d','د. رمزي حميد الجابري','F2025004','active','22222222-2222-4222-8222-222222222222');
insert into request_processing_assignments(id,unit_id,role_id,assignment_type,faculty_profile_id,department_id,is_active) values
('7ab0b14f-9007-40d6-9aaf-f1cba454ac8f','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','faculty_profile','d08a8509-4c04-472e-885f-053a80be12ec','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
('912bdb96-3fb9-494c-8caa-7778c7d0d402','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','faculty_profile','6f9f004d-c5f6-4dfe-b212-7f79ce8658e3','ce485c67-5f7c-498d-b120-4b1130a86ae8',true),
('4d0f434e-57ab-40b2-8a6f-5f27f330db97','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','faculty_profile','c1fe6084-e594-482e-a178-ac8eaffed376','22222222-2222-4222-8222-222222222222',true);
