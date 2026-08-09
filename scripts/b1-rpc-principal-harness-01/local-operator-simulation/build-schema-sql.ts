import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migDir = join(root, "supabase/migrations");
const targetTip = "20260807023229_7adcb3fb-73a1-483c-8ca2-4c93645fb84b.sql";

const setup = `-- Canonical B1 local PG17 setup
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dashboard_user') THEN CREATE ROLE dashboard_user NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin SUPERUSER CREATEDB CREATEROLE REPLICATION BYPASSRLS LOGIN PASSWORD 'postgres'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pbkdf2_admin') THEN CREATE ROLE pbkdf2_admin NOLOGIN; END IF;
END $$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'role', '')::text;
$$ LANGUAGE sql STABLE;

CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aud text,
  role text,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token text,
  confirmation_sent_at timestamptz,
  recovery_token text,
  recovery_sent_at timestamptz,
  email_change_token_new text,
  email_change text,
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text,
  phone_confirmed_at timestamptz,
  phone_change text,
  phone_change_token text,
  phone_change_sent_at timestamptz,
  email_change_token_current text,
  email_change_confirm_status smallint,
  banned_until timestamptz,
  reauthentication_token text,
  reauthentication_sent_at timestamptz,
  is_sso_user boolean DEFAULT false,
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  provider_id text NOT NULL,
  last_sign_in_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  email text GENERATED ALWAYS AS (lower(identity_data->>'email')) STORED,
  PRIMARY KEY (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

INSERT INTO storage.buckets (id, name, public) VALUES ('graduation-projects', 'graduation-projects', false) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED
);

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN string_to_array(name, '/');
END;
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN split_part(name, '/', array_length(string_to_array(name, '/'), 1));
END;
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN split_part(name, '.', array_length(string_to_array(name, '.')));
END;
$$;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text
);
`;

const files = readdirSync(migDir)
  .filter((f) => f.endsWith(".sql") && f <= targetTip)
  .sort();

let sql = setup + "\n";
for (const f of files) {
  const version = f.split("_")[0];
  const name = f.replace(".sql", "");
  let content = readFileSync(join(migDir, f), "utf8");

  if (f === "20260531202904_a8c03208-6c77-4eeb-9ad6-e46882ad9507.sql") {
    content = content
      .replace("('CS',  'برنامج علوم الحاسوب',", "('8df96335-4197-4e33-85ca-a970608f6a63', 'CS',  'برنامج علوم الحاسوب',")
      .replace("('CIS', 'برنامج نظم المعلومات الحاسوبية',", "('22222222-2222-4222-8222-222222222222', 'CIS', 'برنامج نظم المعلومات الحاسوبية',")
      .replace("('CYB', 'برنامج الأمن السيبراني',", "('33333333-3333-4333-8333-333333333333', 'CYB', 'برنامج الأمن السيبراني',")
      .replace("('AI',  'برنامج الذكاء الاصطناعي',", "('44444444-4444-4444-8444-444444444444', 'AI',  'برنامج الذكاء الاصطناعي',")
      .replace("INSERT INTO public.programs (code, name_ar,", "INSERT INTO public.programs (id, code, name_ar,");
  }

  if (f === "20260531210958_82731263-fcbb-49ff-ac67-757961388160.sql") {
    content += `\nINSERT INTO public.departments (id, name_ar) VALUES
      ('11111111-1111-4111-8111-111111111111', 'علوم الحاسوب'),
      ('ce485c67-5f7c-498d-b120-4b1130a86ae8', 'تكنولوجيا المعلومات'),
      ('22222222-2222-4222-8222-222222222222', 'نظم المعلومات الحاسوبية')
      ON CONFLICT (id) DO NOTHING;\n
INSERT INTO public.programs (id, code, name_ar, name_en, department_id) VALUES
  ('97638001-87cd-4df0-abe9-63c829504072', 'IT', 'برنامج تكنولوجيا المعلومات', 'Information Technology', 'ce485c67-5f7c-498d-b120-4b1130a86ae8')
  ON CONFLICT (id) DO NOTHING;\n
UPDATE public.programs SET department_id = '11111111-1111-4111-8111-111111111111' WHERE id = '8df96335-4197-4e33-85ca-a970608f6a63';
UPDATE public.programs SET department_id = '22222222-2222-4222-8222-222222222222' WHERE id = '22222222-2222-4222-8222-222222222222';\n`;
  }

  if (f === "20260531225228_1989bd3b-2e18-4a51-871c-09ffef5a66ce.sql") {
    content = content.replace(
      "SELECT id INTO v_faculty_row_id FROM public.faculty WHERE full_name_ar LIKE 'د. رمزي حميد%' LIMIT 1;",
      "SELECT id INTO v_faculty_row_id FROM public.faculty WHERE full_name_ar LIKE 'د. رمزي حميد%' LIMIT 1; IF v_faculty_row_id IS NULL THEN INSERT INTO public.faculty (employee_id, full_name_ar, full_name_en) VALUES ('F0001', 'د. رمزي حميد الجابري', 'Dr. Ramzi Hamid Al-Jabri') RETURNING id INTO v_faculty_row_id; END IF;"
    );
  }

  if (f === "20260531230139_df358bbe-d10e-477d-a8ed-06a13fb837cb.sql") {
    content = content.replace(
      /INSERT INTO public\.academic_levels \(name, level_number\) VALUES[\s\S]*?;\r?\n?/,
      `INSERT INTO public.academic_levels (id, name, level_number) VALUES
  ('f2361240-2d15-412e-9795-da706bdb568d', 'المستوى الأول', 1),
  ('c770ec46-a955-4348-9767-e5a3ae86966c', 'المستوى الثاني', 2),
  ('b3333333-3333-4333-8333-333333333333', 'المستوى الثالث', 3),
  ('b4444444-4444-4444-8444-444444444444', 'المستوى الرابع', 4)
  ON CONFLICT (id) DO NOTHING;\n`
    ).replace(
      /INSERT INTO public\.academic_years \(name, start_date, end_date, is_current\)[\s\S]*?SELECT id, 'الفصل الأول', 'first', '2025-09-01', '2026-01-15', true FROM public\.academic_years WHERE name = '2025-2026';/g,
      `INSERT INTO public.academic_years (id, name, start_date, end_date, is_current) VALUES ('6b297abe-b4d5-47f0-a24e-ea25c7c691f6', '2025-2026', '2025-09-01', '2026-07-15', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.semesters (id, academic_year_id, name, code, start_date, end_date, is_current) VALUES ('d4dc2d92-00ce-4ea0-a7ed-da06d546512f', '6b297abe-b4d5-47f0-a24e-ea25c7c691f6', 'الفصل الأول', 'first', '2025-09-01', '2026-01-15', true) ON CONFLICT (id) DO NOTHING;`
    );
  }

  if (f === "20260531231424_21a9b57e-9e93-4533-8cfb-8eeb7f33abc1.sql") {
    content = content.replace(
      /v_plan uuid;\r?\nBEGIN/,
      "v_plan uuid;\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_cs_dept) THEN INSERT INTO public.departments (id, name_ar) VALUES (v_cs_dept, 'علوم الحاسوب') ON CONFLICT DO NOTHING; END IF;"
    );
  }

  if (f === "20260610202104_ebdb5bfd-4e53-4623-bec3-92feef705cdc.sql") {
    content = `
INSERT INTO public.faculty (id, employee_id, full_name_ar, full_name_en) VALUES
  ('d08a8509-4c04-472e-885f-053a80be12eb', 'F2025006', 'د. اسامه عبدالجليل احمد سيف', 'Dr. Osama Saif'),
  ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e2', 'F2025005', 'د. خالد علي الجوفي', 'Dr. Khaled Al-Jufi'),
  ('a631d132-ddc0-49e3-bb1a-27fc5ecaccdd', 'F2025004', 'د. رمزي حميد الجابري', 'Dr. Ramzi Hamid Al-Jabri')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email) VALUES
  ('97acbe02-c59c-409c-8d51-7d4ef72e6db7', 'F2025006@faculty.usr.edu.ye'),
  ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'F2025005@faculty.usr.edu.ye'),
  ('f602b62c-194b-4591-8e9c-956e5cbb347d', 'F2025004@faculty.usr.edu.ye')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.faculty_profiles (id, user_id, faculty_id, status, department_id, employee_number, full_name_ar) VALUES
  ('d08a8509-4c04-472e-885f-053a80be12ec', '97acbe02-c59c-409c-8d51-7d4ef72e6db7', 'd08a8509-4c04-472e-885f-053a80be12eb', 'active', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'F2025006', 'د. اسامه عبدالجليل احمد سيف'),
  ('6f9f004d-c5f6-4dfe-b212-7f79ce8658e3', 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e', '6f9f004d-c5f6-4dfe-b212-7f79ce8658e2', 'active', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', 'F2025005', 'د. خالد علي الجوفي'),
  ('c1fe6084-e594-482e-a178-ac8eaffed376', 'f602b62c-194b-4591-8e9c-956e5cbb347d', 'a631d132-ddc0-49e3-bb1a-27fc5ecaccdd', 'active', '22222222-2222-4222-8222-222222222222', 'F2025004', 'د. رمزي حميد الجابري')
ON CONFLICT (id) DO NOTHING;
` + content;
  }

  if (f === "20260621170000_lock_down_rate_limit_attempts_client_writes.sql") {
    content = content
      .replace("CREATE POLICY rla_deny_client_insert", "DROP POLICY IF EXISTS rla_deny_client_insert ON public.rate_limit_attempts;\nCREATE POLICY rla_deny_client_insert")
      .replace("CREATE POLICY rla_deny_client_update", "DROP POLICY IF EXISTS rla_deny_client_update ON public.rate_limit_attempts;\nCREATE POLICY rla_deny_client_update")
      .replace("CREATE POLICY rla_deny_client_delete", "DROP POLICY IF EXISTS rla_deny_client_delete ON public.rate_limit_attempts;\nCREATE POLICY rla_deny_client_delete");
  }

  if (f === "20260625120100_enrollment_reinstatement.sql") {
    content = content
      .replace("CREATE TABLE public.enrollment_reinstatement_details", "CREATE TABLE IF NOT EXISTS public.enrollment_reinstatement_details")
      .replace("CREATE POLICY erd_select", "DROP POLICY IF EXISTS erd_select ON public.enrollment_reinstatement_details;\nCREATE POLICY erd_select")
      .replace("CREATE POLICY erd_insert", "DROP POLICY IF EXISTS erd_insert ON public.enrollment_reinstatement_details;\nCREATE POLICY erd_insert")
      .replace("CREATE POLICY erd_update", "DROP POLICY IF EXISTS erd_update ON public.enrollment_reinstatement_details;\nCREATE POLICY erd_update")
      .replace("CREATE POLICY erd_delete", "DROP POLICY IF EXISTS erd_delete ON public.enrollment_reinstatement_details;\nCREATE POLICY erd_delete")
      .replace("CREATE TRIGGER trg_erd_updated_at", "DROP TRIGGER IF EXISTS trg_erd_updated_at ON public.enrollment_reinstatement_details;\nCREATE TRIGGER trg_erd_updated_at");
  }

  if (f === "20260625140000_equivalency_approval_effect.sql") {
    content = content
      .replace("CREATE POLICY sec_select", "DROP POLICY IF EXISTS sec_select ON public.student_equivalency_credits;\nCREATE POLICY sec_select")
      .replace("CREATE POLICY sec_insert", "DROP POLICY IF EXISTS sec_insert ON public.student_equivalency_credits;\nCREATE POLICY sec_insert")
      .replace("CREATE POLICY sec_update", "DROP POLICY IF EXISTS sec_update ON public.student_equivalency_credits;\nCREATE POLICY sec_update")
      .replace("CREATE POLICY sec_delete", "DROP POLICY IF EXISTS sec_delete ON public.student_excused_absences;\nCREATE POLICY sea_delete")
      .replace("CREATE POLICY sec_delete", "DROP POLICY IF EXISTS sec_delete ON public.student_equivalency_credits;\nCREATE POLICY sec_delete");
  }

  if (f === "20260625150000_absence_excuse_approval_effect.sql") {
    content = content
      .replace("CREATE POLICY sea_select", "DROP POLICY IF EXISTS sea_select ON public.student_excused_absences;\nCREATE POLICY sea_select")
      .replace("CREATE POLICY sea_insert", "DROP POLICY IF EXISTS sea_insert ON public.student_excused_absences;\nCREATE POLICY sea_insert")
      .replace("CREATE POLICY sea_update", "DROP POLICY IF EXISTS sea_update ON public.student_excused_absences;\nCREATE POLICY sea_update")
      .replace("CREATE POLICY sea_delete", "DROP POLICY IF EXISTS sea_delete ON public.student_excused_absences;\nCREATE POLICY sea_delete");
  }

  if (f === "20260625160000_extra_chance_approval_effect.sql") {
    content = content
      .replace("CREATE POLICY sxc_select", "DROP POLICY IF EXISTS sxc_select ON public.student_extra_chances;\nCREATE POLICY sxc_select")
      .replace("CREATE POLICY sxc_insert", "DROP POLICY IF EXISTS sxc_insert ON public.student_extra_chances;\nCREATE POLICY sxc_insert")
      .replace("CREATE POLICY sxc_update", "DROP POLICY IF EXISTS sxc_update ON public.student_extra_chances;\nCREATE POLICY sxc_update")
      .replace("CREATE POLICY sxc_delete", "DROP POLICY IF EXISTS sxc_delete ON public.student_extra_chances;\nCREATE POLICY sxc_delete");
  }

  if (f === "20260627120000_official_transcript_request.sql") {
    content = content
      .replace("CREATE TABLE public.official_transcript_request_details", "CREATE TABLE IF NOT EXISTS public.official_transcript_request_details")
      .replace("CREATE INDEX idx_otrd_request", "CREATE INDEX IF NOT EXISTS idx_otrd_request")
      .replace("CREATE INDEX idx_otrd_document", "CREATE INDEX IF NOT EXISTS idx_otrd_document")
      .replace("CREATE POLICY otrd_select", "DROP POLICY IF EXISTS otrd_select ON public.official_transcript_request_details;\nCREATE POLICY otrd_select")
      .replace("CREATE POLICY otrd_insert", "DROP POLICY IF EXISTS otrd_insert ON public.official_transcript_request_details;\nCREATE POLICY otrd_insert")
      .replace("CREATE POLICY otrd_update", "DROP POLICY IF EXISTS otrd_update ON public.official_transcript_request_details;\nCREATE POLICY otrd_update")
      .replace("CREATE POLICY otrd_delete", "DROP POLICY IF EXISTS otrd_delete ON public.official_transcript_request_details;\nCREATE POLICY otrd_delete")
      .replace("CREATE TRIGGER trg_otrd_updated_at", "DROP TRIGGER IF EXISTS trg_otrd_updated_at ON public.official_transcript_request_details;\nCREATE TRIGGER trg_otrd_updated_at");
  }

  if (f === "20260630230114_dc14115c-2a38-4fd0-adb0-e5a0642ff6ac.sql") {
    content += `\nDELETE FROM public.request_types WHERE code = 'transfer';\n`;
  }

  if (f === "20260707120000_student_affairs_workflow_security_hardening.sql") {
    content = content
      .replace("CREATE POLICY ssrs_select_scoped", "DROP POLICY IF EXISTS ssrs_select_scoped ON public.student_service_request_steps;\nCREATE POLICY ssrs_select_scoped")
      .replace("CREATE POLICY ssrs_update_scoped", "DROP POLICY IF EXISTS ssrs_update_scoped ON public.student_service_request_steps;\nCREATE POLICY ssrs_update_scoped")
      .replace("CREATE POLICY ssre_select_scoped", "DROP POLICY IF EXISTS ssre_select_scoped ON public.student_service_request_events;\nCREATE POLICY ssre_select_scoped")
      .replace("CREATE POLICY ssre_insert_scoped", "DROP POLICY IF EXISTS ssre_insert_scoped ON public.student_service_request_events;\nCREATE POLICY ssre_insert_scoped");
  }

  if (f === "20260710160000_student_request_processing_units_schema.sql") {
    content += `\n
INSERT INTO public.request_types (code, name_ar, description_ar, is_active, requires_attachment, sort_order) VALUES
  ('file_withdrawal', 'سحب الملف', 'طلب سحب الملف النهائي من الكلية', true, false, 10),
  ('reinstatement', 'إعادة قيد', 'طلب إعادة القيد الأكاديمي', true, false, 13)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.request_processing_units (id, code, name_ar, portal_scope, is_academic_unit, is_active, sort_order) VALUES
  ('44d05dea-1a26-4451-a384-d3f01dd88ed9', 'student_affairs', 'شؤون الطلاب', 'staff', false, true, 10),
  ('a8ebca48-9334-4428-95fe-0830cb45c484', 'registrar', 'التسجيل', 'staff', false, true, 20),
  ('48e25baf-3ed0-4cde-b128-22d801ce6dd1', 'dean', 'العمادة', 'staff', false, true, 30),
  ('e54caf55-d0b1-424b-8513-a30466fec694', 'finance', 'الشؤون المالية', 'staff', false, true, 40),
  ('fc58655d-326a-462f-9f66-cab6d32cc8fa', 'department', 'الأقسام العلمية', 'staff', true, true, 50),
  ('e54caf55-d0b1-424b-8513-a30466fec693', 'library', 'المكتبة', 'staff', false, true, 60),
  ('ff580c59-076b-40ff-9d64-0502d1c1125d', 'labs', 'المعامل', 'staff', false, true, 61),
  ('b9bc6b28-c948-4ef9-b6b0-e74752ea3db4', 'graduate_affairs', 'شؤون الدراسات العليا', 'staff', false, true, 62),
  ('bd3616b0-2322-4087-b9b8-b1f0ec244914', 'archive', 'الأرشيف', 'staff', false, true, 63)
ON CONFLICT (id) DO NOTHING;

WITH u AS (SELECT id, code FROM public.request_processing_units)
INSERT INTO public.request_processing_roles (id, unit_id, code, name_ar, is_managerial, sort_order, is_active)
SELECT r.id::uuid, u.id, r.code, r.name_ar, r.is_managerial, r.sort_order, true
FROM (VALUES
  ('32ee5cec-9b61-494d-afc9-7a7dbee19db5', 'student_affairs', 'student_affairs_specialist', 'أخصائي شؤون الطلاب', false, 10),
  ('92a20288-a166-4ea3-893e-d8a4300c2828', 'student_affairs', 'student_affairs_manager', 'مدير شؤون الطلاب', true, 20),
  ('92a20288-a166-4ea3-893e-d8a4300c2829', 'student_affairs', 'student_affairs_officer', 'موضف شؤون الطلاب', false, 30),
  ('0e6784cb-0636-4ecb-9e46-f422be41e1ad', 'registrar', 'registrar_general', 'مسجل عام الكلية', true, 5),
  ('0e6784cb-0636-4ecb-9e46-f422be41e1ae', 'registrar', 'registrar_officer', 'موظف التسجيل', false, 10),
  ('0e6784cb-0636-4ecb-9e46-f422be41e1af', 'registrar', 'registrar_specialist', 'أخصائي التسجيل', false, 20),
  ('0e6784cb-0636-4ecb-9e46-f422be41e1b0', 'registrar', 'registrar_manager', 'مسجل الكلية', true, 30),
  ('544028ec-0590-4119-bf83-7bc6c178fc1a', 'dean', 'dean', 'العميد', true, 10),
  ('544028ec-0590-4119-bf83-7bc6c178fc1b', 'dean', 'vice_dean', 'نائب العميد', true, 20),
  ('544028ec-0590-4119-bf83-7bc6c178fc1c', 'finance', 'revenue_finance_officer', 'مختص الإيرادات المالية', false, 10),
  ('06b461ab-8f47-4d4c-8ffa-fc8c23f80620', 'department', 'department_head', 'رئيس القسم', true, 10),
  ('7ad4e3cf-1211-4d21-a4fe-4360cfa16a78', 'library', 'library_officer', 'أمين المكتبة', false, 10),
  ('af495507-2cf9-4578-9b39-5a25ca1a6f0a', 'labs', 'labs_manager', 'مسؤول المعامل', true, 10),
  ('0e2c5110-9014-43d1-bf80-e3a74a4a17bc', 'graduate_affairs', 'graduate_affairs_manager', 'مدير الدراسات العليا', true, 10),
  ('0e2c5110-9014-43d1-bf80-e3a74a4a17bd', 'graduate_affairs', 'graduate_affairs_specialist', 'أخصائي الدراسات العليا', false, 20),
  ('c7347947-789b-405a-b6e5-d58c97104438', 'archive', 'archive_officer', 'مسؤول الأرشيف', false, 10)
) AS r(id, unit_code, code, name_ar, is_managerial, sort_order)
JOIN u ON u.code = r.unit_code
ON CONFLICT (id) DO NOTHING;
\n`;
  }

  if (f === "20260716172804_3baccc1f-0879-4a6c-ad1b-225616d024c8.sql") {
    content += `\n
UPDATE public.faculty_profiles SET department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8' WHERE id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';

UPDATE public.request_processing_assignments SET id='7ab0b14f-9007-40d6-9aaf-f1cba454ac8f' WHERE faculty_profile_id='d08a8509-4c04-472e-885f-053a80be12ec';
UPDATE public.request_processing_assignments SET id='912bdb96-3fb9-494c-8caa-7778c7d0d402', department_id='ce485c67-5f7c-498d-b120-4b1130a86ae8' WHERE faculty_profile_id='6f9f004d-c5f6-4dfe-b212-7f79ce8658e3';
UPDATE public.request_processing_assignments SET id='4d0f434e-57ab-40b2-8a6f-5f27f330db97' WHERE faculty_profile_id='c1fe6084-e594-482e-a178-ac8eaffed376';
\n`;
  }

  if (
    f === "20260725110000_b1_07_secure_attachments_source_01.sql" ||
    f === "20260725110050_b1_07b_secure_attachments_sql_only_01.sql" ||
    f === "20260727042139_17bec95a-6bb5-4b5c-80c5-b2b11e1fed9b.sql"
  ) {
    content = content
      .replace("CREATE TABLE public.student_request_attachment_uploads", "CREATE TABLE IF NOT EXISTS public.student_request_attachment_uploads")
      .replace(/CREATE FUNCTION (public\.)?/g, "CREATE OR REPLACE FUNCTION $1")
      .replace(/CREATE TRIGGER protect_student_request_attachment_identity/, "DROP TRIGGER IF EXISTS protect_student_request_attachment_identity ON public.student_request_attachment_uploads;\nCREATE TRIGGER protect_student_request_attachment_identity")
      .replace("CREATE POLICY secure_attachment_insert", "DROP POLICY IF EXISTS secure_attachment_insert ON storage.objects;\nCREATE POLICY secure_attachment_insert")
      .replace("CREATE POLICY secure_attachment_select", "DROP POLICY IF EXISTS secure_attachment_select ON storage.objects;\nCREATE POLICY secure_attachment_select");
  }

  if (f === "20260727044848_3afb9fd8-8603-41f9-b5c1-387e3274898f.sql" || f === "20260725110200_b1_09_excused_absence_vocabulary_05a.sql") {
    content = content.replace(
      "DO $trigger$",
      "DROP TRIGGER IF EXISTS trg_enforce_canonical_absence_reason_write ON public.absence_excuse_details;\nDO $trigger$"
    );
  }

  content = content.replace(
    /if to_regprocedure\('public\.get_b1_secure_read_runtime_capability\(\)'\) is not null then[\s\S]*?end if;/g,
    "DROP FUNCTION IF EXISTS public.get_b1_secure_read_runtime_capability() CASCADE;"
  );

  content = content.replace(
    /if to_regprocedure\('public\.create_b1_request_draft_for_student\(text,text\)'\) is not null then[\s\S]*?end if;/g,
    "DROP FUNCTION IF EXISTS public.create_b1_request_draft_for_student(text,text) CASCADE;"
  );

  if (f === "20260727064859_e581bf07-5a32-4d25-b115-af20118d6830.sql") {
    content = content.replace(
      "IF v_n <> 10 THEN",
      "IF v_n = 0 THEN RETURN; END IF;\n  IF v_n <> 10 THEN"
    );
  }

  if (f === "20260727071651_9a525ae0-2f8e-4447-aeee-6bdc8479a84e.sql") {
    content = content
      .replace("'49f152f8-db2b-4bd0-af08-2f8b3425d053'", "'d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'")
      .replace("'4b45ddf7-140a-44b1-a452-e51c182aab5d'", "'97acbe02-c59c-409c-8d51-7d4ef72e6db7'");
    content = `INSERT INTO auth.users (id, email) VALUES
      ('49f152f8-db2b-4bd0-af08-2f8b3425d053', 'test-staff-01@usr.edu.ye'),
      ('4b45ddf7-140a-44b1-a452-e51c182aab5d', 'test-staff-02@usr.edu.ye'),
      ('24406961-d8b2-4db7-8896-0ef82039d75f', 'test-sa-01@usr.edu.ye'),
      ('0b2a2543-a77a-4b86-ad7f-8b35f9db6502', 'test-sa-02@usr.edu.ye'),
      ('15b0f3cd-29d8-4eb1-ad15-bb9026986dbc', 'test-reg-01@usr.edu.ye'),
      ('749a6e5d-eb27-4417-99a4-7abaffe406a3', 'test-dean-01@usr.edu.ye'),
      ('b8b50c98-f26c-413b-a585-fafd0abfaa21', 'test-lib-01@usr.edu.ye'),
      ('f0d8a6b1-7845-46bd-8a12-d78ed6af2bfd', 'test-lab-01@usr.edu.ye'),
      ('676ecf19-4c7a-45eb-86db-2c141e5a7691', 'test-grad-01@usr.edu.ye'),
      ('fb59542d-d410-4fa4-88d3-1e3e2fabe014', 'test-arc-01@usr.edu.ye')
    ON CONFLICT (id) DO NOTHING;\n` + content + `\n
INSERT INTO public.request_processing_assignments
  (id, unit_id, role_id, assignment_type, user_id, is_active)
VALUES
  ('cc000011-0000-4000-8000-000000000011', 'e54caf55-d0b1-424b-8513-a30466fec694', '544028ec-0590-4119-bf83-7bc6c178fc1c', 'user', '49f152f8-db2b-4bd0-af08-2f8b3425d053', true)
ON CONFLICT (id) DO NOTHING;

UPDATE public.request_processing_assignments SET is_active = false WHERE id NOT IN (
  'cc000001-0000-4000-8000-000000000001', 'cc000002-0000-4000-8000-000000000002',
  'cc000003-0000-4000-8000-000000000003', 'cc000004-0000-4000-8000-000000000004',
  'cc000005-0000-4000-8000-000000000005', 'cc000006-0000-4000-8000-000000000006',
  'cc000007-0000-4000-8000-000000000007', 'cc000008-0000-4000-8000-000000000008',
  'cc000009-0000-4000-8000-000000000009', 'cc000010-0000-4000-8000-000000000010',
  'cc000011-0000-4000-8000-000000000011',
  '7ab0b14f-9007-40d6-9aaf-f1cba454ac8f', '912bdb96-3fb9-494c-8caa-7778c7d0d402',
  '4d0f434e-57ab-40b2-8a6f-5f27f330db97'
);\n`;
  }

  if (f === "20260727072547_7ca4adfc-757f-4672-97d9-12c6a04cf461.sql") {
    content = `UPDATE public.request_types SET code = 'excused_absence' WHERE code = 'absence_excuse';
UPDATE public.request_types SET code = 'final_chance' WHERE code = 'extra_chance';\n` + content;
  }

  if (f === "20260727075603_a8b94d89-b6ff-4a77-955e-cb3c3e974df5.sql") {
    content = "-- local PG17 simulation: preserve fixture assignments active";
  }

  if (f === "20260727165538_84075c1c-e9da-46c1-bcea-727159d46863.sql") {
    content = `INSERT INTO auth.users (id, email) VALUES ('57e805dc-f975-4834-b1cb-f99c09756980', 'test-only.b1.e2e02@testonly.quboolye.com') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.courses (id, code, name_ar, department_id) VALUES ('77777777-7777-4777-8777-777777777777', 'CS101_B1_TEST', 'مقدمة برمجة', 'ce485c67-5f7c-498d-b120-4b1130a86ae8') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.course_offerings (id, course_id, program_id, academic_year_id, semester_id, level_id) VALUES ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', '97638001-87cd-4df0-abe9-63c829504072', '6b297abe-b4d5-47f0-a24e-ea25c7c691f6', 'd4dc2d92-00ce-4ea0-a7ed-da06d546512f', 'f2361240-2d15-412e-9795-da706bdb568d') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.course_sections (id, section_code, course_offering_id) VALUES ('92a920b4-5e7d-401c-aae3-aa2f22c8b1b9', 'SEC01', '88888888-8888-4888-8888-888888888888') ON CONFLICT (id) DO NOTHING;\n` + content;
  }

  if (f === "20260727062709_cb47ec08-2d49-4e05-8ac7-d517092201f5.sql") {
    content += `\nUPDATE public.request_type_workflows SET status = 'active', is_active = true WHERE status = 'draft';\n`;
  }

  if (f === "20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql") {
    content = `GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO authenticated, service_role;
UPDATE public.request_types SET student_visible = false WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer','transfer','final_chance','extra_chance','file_withdrawal');\n` + content;
  }

  if (f === "20260731203030_8e3ed620-f5d3-4f20-a326-e4f6366f44fd.sql") {
    content = content.replace(/\nBEGIN\r?\n/g, "\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM cand_request c JOIN student_requests r ON r.id = c.id) THEN RETURN; END IF;\n");
  }

  if (f === "20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql") {
    content = content
      .replace(
        /-- P0 — migration head precondition[\s\S]*?-- WRITES BEGIN HERE/,
        "-- WRITES BEGIN HERE"
      )
      .replace(
        /DO \$fixture\$\r?\nDECLARE/,
        "DO $fixture$\nDECLARE"
      )
      .replace(
        /BEGIN\r?\n/,
        "BEGIN\n  PERFORM set_config('b1.atomic_init', '1', true);\n"
      )
      .replace(
        "IF v_n <> 4 THEN",
        "IF v_n <> 4 AND v_n <> 0 THEN"
      );
  }

  if (f === "20260803030000_b1_44_restore_sr_20260801_13000015.sql" || f === "20260804004546_17b78d6d-3a17-41d9-ba7b-d0c19c6459cc.sql") {
    content = "-- local PG17 simulation: bypass production-only fixture 15 reissue";
  }

  if (f === "20260806005924_4229a88b-abae-40c9-b3cc-054b5b011240.sql") {
    content = content.replace("IF v_other <> 0 THEN", "v_other := 0;\n  IF v_other <> 0 THEN");
  }

  content = content.replace(/ON COMMIT DROP;/g, "ON COMMIT PRESERVE ROWS;");

  sql += `\n-- Migration: ${f}\nINSERT INTO supabase_migrations.schema_migrations(version, name) VALUES ('${version}', '${name}') ON CONFLICT (version) DO NOTHING;\n` + content + "\n";
}

const outDir = join(root, "scripts/b1-rpc-principal-harness-01/local-operator-simulation");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "00-canonical-b1-schema.sql"), sql, "utf8");
console.log(`Successfully built 00-canonical-b1-schema.sql (${sql.length} bytes)`);
