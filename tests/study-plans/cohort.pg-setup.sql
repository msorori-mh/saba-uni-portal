-- Disposable PostgreSQL 17 fixture for the two forward-only cohort migrations.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE TABLE public.programs (id uuid PRIMARY KEY);
CREATE TABLE public.study_plans (
  id uuid PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id),
  name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT study_plans_program_id_version_key UNIQUE (program_id, version)
);
CREATE TABLE public.student_profiles (
  id uuid PRIMARY KEY,
  program_id uuid REFERENCES public.programs(id)
);
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE ON public.student_profiles TO authenticated;
