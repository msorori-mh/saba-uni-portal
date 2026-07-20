CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA auth;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.student_profiles (id uuid PRIMARY KEY);
CREATE TABLE public.programs (id uuid PRIMARY KEY);
CREATE TABLE public.departments (id uuid PRIMARY KEY);

INSERT INTO auth.users VALUES ('33333333-3333-4333-8333-333333333333');
INSERT INTO public.student_profiles VALUES
  ('22222222-2222-4222-8222-222222222222'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.programs VALUES
  ('44444444-4444-4444-8444-444444444444'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.departments VALUES ('55555555-5555-4555-8555-555555555555');
