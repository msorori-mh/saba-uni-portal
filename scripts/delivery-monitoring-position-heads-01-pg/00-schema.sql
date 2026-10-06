-- Minimal production-shaped schema for the delivery-monitoring rehearsal.
-- Throwaway cluster only. Function bodies under test are NOT defined here:
-- run.sh extracts them verbatim from the applied migrations.
\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
-- Supabase default: new public functions are executable by the API roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TYPE public.app_role AS ENUM ('system_admin','admin','dean','registrar','student_affairs',
  'finance_officer','hr_officer','department_head','faculty_member','graduate','student');
CREATE TABLE public.user_roles(user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id, role));
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE TABLE public.departments(id uuid PRIMARY KEY, name_ar text NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE public.faculty(id uuid PRIMARY KEY, full_name_ar text);
CREATE TABLE public.faculty_profiles(id uuid PRIMARY KEY, user_id uuid, faculty_id uuid, department_id uuid);
CREATE TABLE public.academic_years(id uuid PRIMARY KEY, is_current boolean NOT NULL DEFAULT true);
CREATE TABLE public.semesters(id uuid PRIMARY KEY, is_current boolean NOT NULL DEFAULT true);
CREATE TABLE public.courses(id uuid PRIMARY KEY, code text, name_ar text, department_id uuid);
CREATE TABLE public.course_offerings(id uuid PRIMARY KEY, course_id uuid, academic_year_id uuid, semester_id uuid,
  status text NOT NULL DEFAULT 'active');
CREATE TABLE public.course_sections(id uuid PRIMARY KEY, course_offering_id uuid, section_code text,
  faculty_profile_id uuid, status text NOT NULL DEFAULT 'active', study_system text);
CREATE TABLE public.course_delivery_plans(id uuid PRIMARY KEY, course_section_id uuid, planned_session_count integer,
  status text, is_current boolean NOT NULL DEFAULT true, source text, syllabus_version integer, published_at timestamptz);
CREATE TABLE public.course_delivery_plan_sessions(id uuid PRIMARY KEY, plan_id uuid, session_number integer,
  week_number integer, planned_title text, planned_topics text);
CREATE TABLE public.course_session_executions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_session_id uuid,
  status text, execution_date date, compensation_date date, reason text, notes text, recorded_at timestamptz DEFAULT now());
CREATE TABLE public.student_profiles(id uuid PRIMARY KEY, user_id uuid);
CREATE TABLE public.student_enrollments(student_profile_id uuid, course_section_id uuid, enrollment_status text);
CREATE TABLE public.organizational_positions(id uuid PRIMARY KEY, code text UNIQUE NOT NULL, name_ar text NOT NULL,
  unit_type text NOT NULL DEFAULT 'position', parent_code text, is_active boolean NOT NULL DEFAULT true,
  department_id uuid REFERENCES public.departments(id), is_department_head_position boolean NOT NULL DEFAULT false);
CREATE TABLE public.position_assignments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id uuid NOT NULL REFERENCES public.organizational_positions(id), user_id uuid NOT NULL,
  assigned_from date NOT NULL DEFAULT current_date, assigned_to date, is_active boolean NOT NULL DEFAULT true, notes text);
CREATE UNIQUE INDEX uniq_active_position_holder ON public.position_assignments(position_id) WHERE is_active;
