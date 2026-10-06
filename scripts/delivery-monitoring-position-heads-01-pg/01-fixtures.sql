\set ON_ERROR_STOP on
-- Departments: CS / IT / IS. Sections: CS-A, CS-B, IT-A, IS-A (+ one inactive CS section).
INSERT INTO public.departments(id, name_ar) VALUES
 ('d0000000-0000-4000-8000-0000000000c5', 'علوم الحاسوب'),
 ('d0000000-0000-4000-8000-000000000017', 'تقنية المعلومات'),
 ('d0000000-0000-4000-8000-000000000015', 'نظم المعلومات');
INSERT INTO public.academic_years(id) VALUES ('a0000000-0000-4000-8000-000000000001');
INSERT INTO public.semesters(id) VALUES ('a0000000-0000-4000-8000-000000000002');
INSERT INTO public.courses(id, code, name_ar, department_id) VALUES
 ('c0000000-0000-4000-8000-000000000001', 'CS101', 'برمجة', 'd0000000-0000-4000-8000-0000000000c5'),
 ('c0000000-0000-4000-8000-000000000002', 'IT101', 'شبكات', 'd0000000-0000-4000-8000-000000000017'),
 ('c0000000-0000-4000-8000-000000000003', 'IS101', 'قواعد بيانات', 'd0000000-0000-4000-8000-000000000015');
INSERT INTO public.course_offerings(id, course_id, academic_year_id, semester_id)
SELECT ('0f' || substr(id::text, 3))::uuid, id, 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002'
FROM public.courses;

-- Users (u…01..) — see 02-cases.sql for who is who.
INSERT INTO auth.users(id) SELECT ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid FROM generate_series(1, 16) n;
INSERT INTO public.user_roles(user_id, role) VALUES
 ('00000000-0000-4000-8000-000000000001', 'faculty_member'),   -- position-only head of CS
 ('00000000-0000-4000-8000-000000000002', 'faculty_member'),   -- legacy head of IT
 ('00000000-0000-4000-8000-000000000002', 'department_head'),
 ('00000000-0000-4000-8000-000000000003', 'dean'),
 ('00000000-0000-4000-8000-000000000004', 'admin'),
 ('00000000-0000-4000-8000-000000000005', 'registrar'),
 ('00000000-0000-4000-8000-000000000006', 'student_affairs'),
 ('00000000-0000-4000-8000-000000000007', 'faculty_member'),   -- plain faculty (teaches CS-A)
 ('00000000-0000-4000-8000-000000000008', 'faculty_member'),   -- ended head assignment
 ('00000000-0000-4000-8000-000000000009', 'faculty_member'),   -- inactive head assignment
 ('00000000-0000-4000-8000-000000000010', 'faculty_member'),   -- future head assignment
 ('00000000-0000-4000-8000-000000000011', 'faculty_member'),   -- head position without department
 ('00000000-0000-4000-8000-000000000012', 'faculty_member'),   -- inactive head position
 ('00000000-0000-4000-8000-000000000013', 'faculty_member'),   -- non-head position that has a department
 ('00000000-0000-4000-8000-000000000014', 'department_head'),  -- legacy role, no faculty-profile department
 ('00000000-0000-4000-8000-000000000015', 'faculty_member'),   -- legacy head of IT + position head of IS
 ('00000000-0000-4000-8000-000000000015', 'department_head'),
 ('00000000-0000-4000-8000-000000000016', 'system_admin');
INSERT INTO public.faculty(id, full_name_ar)
SELECT ('fa' || substr(id::text, 3))::uuid, 'عضو ' || right(id::text, 2) FROM auth.users;
-- The position-only CS head has an IT faculty profile (the production shape).
INSERT INTO public.faculty_profiles(id, user_id, faculty_id, department_id)
SELECT ('f9' || substr(u.id::text, 3))::uuid, u.id, ('fa' || substr(u.id::text, 3))::uuid,
  CASE right(u.id::text, 2)
    WHEN '01' THEN 'd0000000-0000-4000-8000-000000000017'::uuid
    WHEN '02' THEN 'd0000000-0000-4000-8000-000000000017'::uuid
    WHEN '15' THEN 'd0000000-0000-4000-8000-000000000017'::uuid
    WHEN '14' THEN NULL
    ELSE 'd0000000-0000-4000-8000-0000000000c5'::uuid END
FROM auth.users u WHERE right(u.id::text, 2) NOT IN ('03', '04', '05', '06', '16');

INSERT INTO public.course_sections(id, course_offering_id, section_code, faculty_profile_id, status) VALUES
 ('5ec00000-0000-4000-8000-0000000000a1', '0f000000-0000-4000-8000-000000000001', 'A', 'f9000000-0000-4000-8000-000000000007', 'active'),
 ('5ec00000-0000-4000-8000-0000000000a2', '0f000000-0000-4000-8000-000000000001', 'B', 'f9000000-0000-4000-8000-000000000008', 'active'),
 ('5ec00000-0000-4000-8000-0000000000a9', '0f000000-0000-4000-8000-000000000001', 'Z', 'f9000000-0000-4000-8000-000000000008', 'inactive'),
 ('5ec00000-0000-4000-8000-0000000000b1', '0f000000-0000-4000-8000-000000000002', 'A', 'f9000000-0000-4000-8000-000000000002', 'active'),
 ('5ec00000-0000-4000-8000-0000000000c1', '0f000000-0000-4000-8000-000000000003', 'A', 'f9000000-0000-4000-8000-000000000009', 'active');
INSERT INTO public.course_delivery_plans(id, course_section_id, planned_session_count, status, source, published_at)
SELECT ('91' || substr(id::text, 3))::uuid, id, 2, 'published', 'syllabus', now() FROM public.course_sections WHERE status = 'active';
INSERT INTO public.course_delivery_plan_sessions(id, plan_id, session_number, week_number, planned_title)
SELECT ('5' || n || substr(p.id::text, 3))::uuid, p.id, n, n, 'محاضرة ' || n
FROM public.course_delivery_plans p, generate_series(1, 2) n;
INSERT INTO public.course_session_executions(plan_session_id, status, execution_date, reason, notes)
SELECT s.id, CASE s.session_number WHEN 1 THEN 'executed' ELSE 'hindered' END, current_date,
       CASE s.session_number WHEN 2 THEN 'سبب داخلي' END, 'ملاحظة داخلية'
FROM public.course_delivery_plan_sessions s;

INSERT INTO public.organizational_positions(id, code, name_ar, is_active, department_id, is_department_head_position) VALUES
 ('b0000000-0000-4000-8000-000000000001', 'cs_department_head', 'رئيس قسم علوم الحاسوب', true, 'd0000000-0000-4000-8000-0000000000c5', true),
 ('b0000000-0000-4000-8000-000000000002', 'cs_head_ended', 'رئيس قسم (منتهٍ)', true, 'd0000000-0000-4000-8000-0000000000c5', true),
 ('b0000000-0000-4000-8000-000000000003', 'cs_head_inactive_assignment', 'رئيس قسم (تعيين معطل)', true, 'd0000000-0000-4000-8000-0000000000c5', true),
 ('b0000000-0000-4000-8000-000000000004', 'cs_head_future', 'رئيس قسم (مستقبلي)', true, 'd0000000-0000-4000-8000-0000000000c5', true),
 ('b0000000-0000-4000-8000-000000000005', 'head_without_department', 'رئيس قسم بلا قسم', true, NULL, true),
 ('b0000000-0000-4000-8000-000000000006', 'cs_head_inactive_position', 'منصب معطل', false, 'd0000000-0000-4000-8000-0000000000c5', true),
 ('b0000000-0000-4000-8000-000000000007', 'cs_department_secretary', 'سكرتير قسم', true, 'd0000000-0000-4000-8000-0000000000c5', false),
 ('b0000000-0000-4000-8000-000000000008', 'is_department_head', 'رئيس قسم نظم المعلومات', true, 'd0000000-0000-4000-8000-000000000015', true);
INSERT INTO public.position_assignments(position_id, user_id, assigned_from, assigned_to, is_active) VALUES
 ('b0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', current_date - 30, NULL, true),
 ('b0000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000008', current_date - 30, current_date - 1, true),
 ('b0000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000009', current_date - 30, NULL, false),
 ('b0000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000010', current_date + 1, NULL, true),
 ('b0000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000011', current_date - 30, NULL, true),
 ('b0000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000012', current_date - 30, NULL, true),
 ('b0000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000013', current_date - 30, NULL, true),
 ('b0000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000015', current_date - 30, current_date, true);

-- Harness helpers (rehearsal only).
CREATE FUNCTION public.hp_u(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS
$$ SELECT ('00000000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
-- Calls an RPC exactly like PostgREST: role `authenticated` + JWT subject.
CREATE FUNCTION public.hp_call(n integer, q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', CASE WHEN n IS NULL THEN '' ELSE public.hp_u(n)::text END, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    EXECUTE q INTO v;
  EXCEPTION WHEN OTHERS THEN v := 'ERR:' || SQLERRM;
  END;
  RESET ROLE;
  RETURN v;
END $$;
CREATE FUNCTION public.hp_mon(n integer) RETURNS text LANGUAGE sql AS
$$ SELECT public.hp_call(n, $q$SELECT (public.cdp_delivery_monitoring('term') - 'period')::text$q$) $$;
CREATE FUNCTION public.hp_sections(n integer) RETURNS text LANGUAGE sql AS $$
  SELECT public.hp_call(n, $q$SELECT m->>'scope' || ':' || coalesce((SELECT string_agg((r->>'course_code') || '-' || (r->>'section_code'), ','
            ORDER BY r->>'course_code', r->>'section_code') FROM jsonb_array_elements(m->'rows') r), '')
          FROM public.cdp_delivery_monitoring('term') m$q$) $$;
CREATE FUNCTION public.hp_plan(n integer, section uuid) RETURNS text LANGUAGE sql AS
$$ SELECT public.hp_call(n, format('SELECT public.cdp_get_section_plan(%L)::text', section)) $$;
CREATE FUNCTION public.hp_fingerprint() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(p.proname || md5(pg_get_functiondef(p.oid)) || coalesce(p.proacl::text, ''), ',' ORDER BY p.proname))
  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname NOT LIKE 'hp\_%' $$;
CREATE TABLE public.hp_before AS
SELECT n, NULL::text AS mon, NULL::text AS plan_cs, NULL::text AS plan_it FROM generate_series(1, 16) n;
