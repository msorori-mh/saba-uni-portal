-- Standalone stub schema for the graduates-affairs AUTHORIZATION chain.
-- Own CI leg cluster (roles are created unconditionally). Contains only the
-- columns the three chained drafts need; the real tables live elsewhere.
-- Fixture ids are deterministic and documented per block below.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

-- auth.uid() reads the simulated JWT claims; empty/missing setting -> NULL.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

CREATE TABLE public.student_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.programs (id uuid PRIMARY KEY, department_id uuid);
CREATE TABLE public.departments (id uuid PRIMARY KEY);
CREATE TABLE public.staff_profiles (id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.staff_profile_departments (
  staff_profile_id uuid NOT NULL,
  department_id uuid NOT NULL,
  PRIMARY KEY (staff_profile_id, department_id)
);
CREATE TABLE public.request_processing_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.request_processing_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.request_processing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL,
  role_id uuid NOT NULL,
  assignment_type text NOT NULL,
  user_id uuid,
  staff_profile_id uuid,
  department_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

-- Broad table ACLs on purpose: RLS (not table privileges) is the boundary
-- this chain proves. DEFAULT PRIVILEGES cover tables created later by the
-- chained drafts in this same session/role.
GRANT USAGE ON SCHEMA public, auth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON auth.users TO authenticated;

-- ---------------------------------------------------------------------
-- Fixture users (prefix 10000000-0000-4000-8000-00000000000X):
--   a = graduateA, b = graduateB, c = managerU, d = specialistU,
--   e = unrelatedStaffU, f = unrelatedUserU, 1 = inactiveStaffU,
--   2 = expiredStaffU (graduate_affairs assignment already ended).
-- ---------------------------------------------------------------------
INSERT INTO auth.users VALUES
  ('10000000-0000-4000-8000-00000000000a'),
  ('10000000-0000-4000-8000-00000000000b'),
  ('10000000-0000-4000-8000-00000000000c'),
  ('10000000-0000-4000-8000-00000000000d'),
  ('10000000-0000-4000-8000-00000000000e'),
  ('10000000-0000-4000-8000-00000000000f'),
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

-- Student profiles (prefix 20000000): graduateA/graduateB only.
INSERT INTO public.student_profiles VALUES
  ('20000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-00000000000a'),
  ('20000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b');

-- Departments (prefix 30000000): D1 = ...0001, D2 = ...0002.
INSERT INTO public.departments VALUES
  ('30000000-0000-4000-8000-000000000001'),
  ('30000000-0000-4000-8000-000000000002');

-- Programs (prefix 40000000): P1 in D1, P2 in D2.
INSERT INTO public.programs VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002');

-- Staff profiles (prefix 50000000) for every staff-side user.
INSERT INTO public.staff_profiles VALUES
  ('50000000-0000-4000-8000-00000000000c', '10000000-0000-4000-8000-00000000000c'),
  ('50000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-00000000000d'),
  ('50000000-0000-4000-8000-00000000000e', '10000000-0000-4000-8000-00000000000e'),
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002');

-- Specialist scope: D1 only (D2 stays out of scope for scope tests).
INSERT INTO public.staff_profile_departments VALUES
  ('50000000-0000-4000-8000-00000000000d', '30000000-0000-4000-8000-000000000001');

-- Units (prefix 60000000): graduate_affairs = ...0001, student_affairs = ...0002.
INSERT INTO public.request_processing_units (id, code) VALUES
  ('60000000-0000-4000-8000-000000000001', 'graduate_affairs'),
  ('60000000-0000-4000-8000-000000000002', 'student_affairs');

-- Roles (prefix 70000000): manager/specialist under graduate_affairs,
-- one student_affairs role for the wrong-unit negative fixture.
INSERT INTO public.request_processing_roles (id, unit_id, code) VALUES
  ('70000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'graduate_affairs_manager'),
  ('70000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'graduate_affairs_specialist'),
  ('70000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000002', 'student_affairs_officer');

-- Assignments (prefix 80000000):
--   ...0001 managerU      active manager,       assignment_type 'user'
--   ...0002 specialistU   active specialist,    assignment_type 'staff_profile'
--   ...0003 unrelatedStaffU active, wrong unit (student_affairs)
--   ...0004 inactiveStaffU  graduate_affairs role but is_active = false
--   ...0005 expiredStaffU   graduate_affairs manager, ends_at in the past
INSERT INTO public.request_processing_assignments (
  id, unit_id, role_id, assignment_type, user_id, staff_profile_id,
  is_active, starts_at, ends_at
) VALUES
  ('80000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'user', '10000000-0000-4000-8000-00000000000c', NULL, true, NULL, NULL),
  ('80000000-0000-4000-8000-000000000002',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'staff_profile', NULL, '50000000-0000-4000-8000-00000000000d', true, NULL, NULL),
  ('80000000-0000-4000-8000-000000000003',
   '60000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000003',
   'user', '10000000-0000-4000-8000-00000000000e', NULL, true, NULL, NULL),
  ('80000000-0000-4000-8000-000000000004',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000002',
   'staff_profile', NULL, '50000000-0000-4000-8000-000000000001', false, NULL, NULL),
  ('80000000-0000-4000-8000-000000000005',
   '60000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001',
   'user', '10000000-0000-4000-8000-000000000002', NULL, true,
   now() - interval '30 days', now() - interval '1 day');

-- Approved official decisions and graduate records are created in the
-- pg-verify superuser section (they need the chained drafts to exist first).
