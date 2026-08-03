import { describe, expect, it, afterAll } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const root = process.cwd();
const harnessSqlPath = join(
  root,
  "tests",
  "b1-authoritative-positive-fixture-matrix-19",
  "pg17-disposable-harness.sql"
);

const sqlContent = readFileSync(harnessSqlPath, "utf8");
const container = `test-pg17-disposable-${Date.now()}`;

function teardownContainer() {
  try { execSync(`docker stop ${container}`); } catch {}
  try { execSync(`docker rm -f ${container}`); } catch {}
}

function psql(sql: string) {
  const res = spawnSync("docker", ["exec", "-i", container, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], {
    input: sql,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(`PSQL Error:\n${res.stderr || res.stdout}`);
  }
  return (res.stdout || "") + "\n" + (res.stderr || "");
}

function psqlFile(filePath: string) {
  const raw = readFileSync(filePath, "utf8");
  const content = raw.trim().startsWith("BEGIN;") ? raw : `BEGIN;\n${raw}\nCOMMIT;`;
  psql(content);
}

afterAll(() => {
  teardownContainer();
});

describe("Disposable PostgreSQL 17 Positive Harness Contract", () => {
  it("enforces transactional safety with BEGIN and ROLLBACK", () => {
    expect(sqlContent).toMatch(/^\s*BEGIN;/m);
    expect(sqlContent).toMatch(/^\s*ROLLBACK;/m);
    expect(sqlContent).not.toMatch(/^\s*COMMIT;/m);
  });

  it("covers all 19 fixture case request numbers", () => {
    for (let i = 1; i <= 19; i++) {
      const padOrd = i.toString().padStart(6, "0");
      expect(sqlContent).toContain(`SR-20260801-13${padOrd}`);
    }
  });

  it("proves wrong actor, wrong action, exact execution, stale replay and zero mutation", () => {
    expect(sqlContent).toContain("v_wrong_actor_ok");
    expect(sqlContent).toContain("v_wrong_action_ok");
    expect(sqlContent).toContain("v_exact_rpc_ok");
    expect(sqlContent).toContain("v_transition_ok");
    expect(sqlContent).toContain("v_stale_replay_ok");
    expect(sqlContent).toContain("v_zero_mutation_ok");
    expect(sqlContent).toContain("unrelated_state_fingerprint");
    expect(sqlContent).toContain("enrollment_certificate_fingerprint");
    expect(sqlContent).not.toContain("powershell");
    expect(sqlContent).toContain("PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19");
  });

  it("launches PostgreSQL 17 container and executes real RPC harness verifying 19 of 19 cases", async () => {
    try {
      execSync(`docker run --rm --detach --name ${container} -e POSTGRES_PASSWORD=local_only postgres:17-alpine`);

      let ready = false;
      for (let i = 0; i < 40; i++) {
        try {
          const logs = execSync(`docker logs ${container}`).toString("utf8");
          if (logs.includes("PostgreSQL init process complete")) {
            execSync(`docker exec ${container} pg_isready -U postgres`);
            ready = true;
            break;
          }
        } catch {
          // container not ready yet
        }
        await Bun.sleep(500);
      }

      expect(ready).toBe(true);

      psql(`
        CREATE SCHEMA IF NOT EXISTS supabase_migrations;
        CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
          version text PRIMARY KEY,
          inserted_at timestamp with time zone DEFAULT now()
        );
        INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20260731203030');
      `);

      psqlFile(join(root, "tests", "b1-rpc-matrix", "pg", "10-minimal-schema.sql"));

      psql(`
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
        LANGUAGE sql STABLE AS $$
          SELECT coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', ''),
            nullif(current_setting('e_rpcmatrix.uid', true), '')
          )::uuid
        $$;

        CREATE OR REPLACE FUNCTION public.update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = now();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SET search_path = public;

        ALTER TABLE public.student_profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
        ALTER TABLE public.request_types ADD COLUMN IF NOT EXISTS student_visible boolean NOT NULL DEFAULT false;
        ALTER TABLE public.transfer_request_details ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
        ALTER TABLE public.transfer_request_details ADD COLUMN IF NOT EXISTS notes text;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS title text;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS description text;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS current_step_index integer DEFAULT 1;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
        ALTER TABLE public.student_requests ADD COLUMN IF NOT EXISTS internal_notes text;

        UPDATE public.request_types SET code = 'excused_absence' WHERE code = 'absence_excuse';
        UPDATE public.request_types SET code = 'department_transfer' WHERE code = 'transfer';
        UPDATE public.request_types SET code = 'final_chance' WHERE code = 'extra_chance';
      `);

      psqlFile(join(root, "supabase", "migrations", "20260711020000_student_requests_p1_foundations.sql"));

      const foundation = [
        "docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql",
        "docs/migration-drafts/STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql",
        "docs/migration-drafts/B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql",
        "docs/migration-drafts/REQUEST-PROCESSING-DOMAINS-EXPANSION-SOURCE-01.sql",
        "docs/migration-drafts/REQUEST-B1-ATOMIC-SUBMIT-ACTION-04.sql"
      ];
      for (const rel of foundation) {
        if (existsSync(join(root, rel))) {
          psqlFile(join(root, rel));
        }
      }

      const stampPath = join(root, "docs", "migration-drafts", "REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql");
      const stampContent = readFileSync(stampPath, "utf8").replace(
        "v_commit text := 'APPROVED_RELEASE_COMMIT_PLACEHOLDER';",
        "v_commit text := 'b63725e02d4199b46dee604be8f8c03f72c5d414';"
      );
      psql(`BEGIN;\n${stampContent}\nCOMMIT;`);

      const promotedChain = [
        "supabase/migrations/20260725002135_13c05466-74a5-4a03-8c7d-8617be9e5353.sql",
        "supabase/migrations/20260725110000_b1_07_secure_attachments_source_01.sql",
        "supabase/migrations/20260725110100_b1_08_trusted_reference_validators_05a.sql",
        "supabase/migrations/20260725110200_b1_09_excused_absence_vocabulary_05a.sql",
        "supabase/migrations/20260725110300_b1_10_excused_absence_detail_05a.sql",
        "supabase/migrations/20260725110400_b1_11_file_withdrawal_details_05a.sql",
        "supabase/migrations/20260725110500_b1_12_transfer_secure_attachment_05a.sql",
        "supabase/migrations/20260725110600_b1_13_final_chance_canonical_write_03.sql",
        "supabase/migrations/20260725110700_b1_14_detail_rpc_write_boundaries_05a.sql",
        "supabase/migrations/20260725110800_b1_15_service_details_dispatcher_05a.sql",
        "supabase/migrations/20260725110900_b1_16_free_service_workflows_08.sql",
        "supabase/migrations/20260725111000_b1_17_external_university_payment_workflows_02.sql",
        "supabase/migrations/20260725111100_b1_18_detail_acl_cutover_06.sql",
        "docs/migration-drafts/B1-FIVE-SERVICES-ACTOR-ACTION-ASSIGNMENT-HARDENING-01.sql",
        "supabase/migrations/20260725120000_b1_confirm_payment_predecessor_guard_01.sql",
        "supabase/migrations/20260725130000_b1_21_secure_read_contracts_01.sql",
        "supabase/migrations/20260725140000_b1_22_secure_draft_mutations_01.sql",
        "supabase/migrations/20260725150000_b1_23_transfer_department_scope_position_assignment_01.sql",
        "supabase/migrations/20260725160000_b1_24_file_withdrawal_impact_ack_null_guard_01.sql",
        "supabase/migrations/20260727120000_b1_25_academic_effect_markers_01.sql",
        "supabase/migrations/20260727120100_b1_26_academic_effect_functions_01.sql",
        "supabase/migrations/20260727120200_b1_27_act_on_academic_effect_integration_01.sql"
      ];

      for (const rel of promotedChain) {
        if (existsSync(join(root, rel))) {
          psqlFile(join(root, rel));
        }
      }

      psql(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            CREATE ROLE service_role;
          END IF;
        END $$;
        REVOKE ALL ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) FROM public, anon;
        GRANT EXECUTE ON FUNCTION public.act_on_b1_student_request_step_atomic(uuid,text,text,jsonb) TO authenticated, service_role;
        GRANT EXECUTE ON FUNCTION public.record_external_university_payment_confirmation(uuid,text) TO authenticated, service_role;
      `);

      const remainingPromoted = [
        "supabase/migrations/20260728015540_9a307610-cd06-4e91-b3f8-4b9b58ab2819.sql",
        "supabase/migrations/20260729014518_65fd6606-34b7-430e-89f5-d58f9b2a4ac2.sql",
        "supabase/migrations/20260729173359_9a749214-c28e-489b-95ec-038f290a5c3c.sql",
        "supabase/migrations/20260730175527_89e2a6a3-4e9f-48d7-9371-8e996ae1c00a.sql"
      ];

      for (const rel of remainingPromoted) {
        if (existsSync(join(root, rel))) {
          psqlFile(join(root, rel));
        }
      }

      psql(`
        UPDATE public.request_type_workflows SET is_active = true, status = 'active';

        INSERT INTO auth.users(id) VALUES('b1e20002-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;

        INSERT INTO public.departments(id, name_ar, code) VALUES
          ('ce485c67-5f7c-498d-b120-4b1130a86ae8', 'IT', 'IT'),
          ('11111111-1111-4111-8111-111111111111', 'CS', 'CS'),
          ('22222222-2222-4222-8222-222222222222', 'CIS', 'CIS')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.programs(id, department_id) VALUES
          ('97638001-87cd-4df0-abe9-63c829504072', 'ce485c67-5f7c-498d-b120-4b1130a86ae8'),
          ('8df96335-4197-4e33-85ca-a970608f6a63', '11111111-1111-4111-8111-111111111111')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.student_profiles(id, user_id, academic_number, status, department_id, program_id) VALUES
          ('b1e20002-0000-4000-8000-000000000002', 'b1e20002-0000-4000-8000-000000000002', 'TEST_ONLY_B1_0002', 'active', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', '97638001-87cd-4df0-abe9-63c829504072')
        ON CONFLICT (id) DO UPDATE SET
          user_id = EXCLUDED.user_id,
          academic_number = EXCLUDED.academic_number,
          status = EXCLUDED.status,
          department_id = EXCLUDED.department_id,
          program_id = EXCLUDED.program_id;

        UPDATE public.request_types SET is_active = true, student_visible = false
        WHERE code IN ('enrollment_suspension','excused_absence','absence_excuse','department_transfer','transfer','final_chance','extra_chance','file_withdrawal');

        UPDATE public.request_types SET is_active = true, student_visible = true
        WHERE code = 'enrollment_certificate';

        CREATE TABLE IF NOT EXISTS public.enrollment_certificate_document_details (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          official_document_id uuid NOT NULL REFERENCES public.official_documents(id) ON DELETE CASCADE,
          student_request_id uuid NOT NULL REFERENCES public.student_requests(id) ON DELETE CASCADE,
          student_profile_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE RESTRICT,
          academic_number text NOT NULL,
          student_name_ar text NOT NULL,
          department_id uuid,
          department_name_ar text NOT NULL,
          program_id uuid,
          program_name_ar text NOT NULL,
          study_system text,
          student_study_status text,
          academic_year_id uuid,
          academic_year_name text NOT NULL,
          semester_id uuid,
          semester_name text NOT NULL,
          level_id uuid,
          level_name text NOT NULL,
          enrollment_status text NOT NULL,
          issued_snapshot_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.notifications (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid,
          title text,
          message text,
          notification_type text,
          reference_type text,
          reference_id uuid,
          is_read boolean NOT NULL DEFAULT false,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS public.payment_receipts (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          student_profile_id uuid,
          amount numeric(12,2),
          status text,
          created_at timestamptz NOT NULL DEFAULT now()
        );

        INSERT INTO public.student_requests(id, student_profile_id, request_type, status) VALUES
          ('ec000000-0000-4000-8000-000000000101', '33333333-3333-4333-8333-333333333301', 'enrollment_certificate', 'completed'),
          ('ec000000-0000-4000-8000-000000000102', '33333333-3333-4333-8333-333333333301', 'enrollment_certificate', 'completed'),
          ('ec000000-0000-4000-8000-000000000103', '33333333-3333-4333-8333-333333333301', 'enrollment_certificate', 'completed'),
          ('ec000000-0000-4000-8000-000000000104', '33333333-3333-4333-8333-333333333301', 'enrollment_certificate', 'completed')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.official_documents(id, status, document_number) VALUES
          ('ec000000-0000-4000-8000-000000000001', 'issued', 'DOC-EC-01'),
          ('ec000000-0000-4000-8000-000000000002', 'issued', 'DOC-EC-02')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.enrollment_certificate_document_details(
          id, official_document_id, student_request_id, student_profile_id,
          academic_number, student_name_ar, department_name_ar, program_name_ar,
          academic_year_name, semester_name, level_name, enrollment_status
        ) VALUES
          ('ec000000-0000-4000-8000-000000000201', 'ec000000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000101', '33333333-3333-4333-8333-333333333301', '2026001', 'طالب تجريبي', 'قسم IT', 'برنامج IT', '2025/2026', 'الأول', 'المستوى الأول', 'مستمر'),
          ('ec000000-0000-4000-8000-000000000202', 'ec000000-0000-4000-8000-000000000002', 'ec000000-0000-4000-8000-000000000102', '33333333-3333-4333-8333-333333333301', '2026001', 'طالب تجريبي', 'قسم IT', 'برنامج IT', '2025/2026', 'الأول', 'المستوى الأول', 'مستمر')
        ON CONFLICT DO NOTHING;

        INSERT INTO auth.users(id) VALUES
          ('c8a94548-4782-4252-86f9-23559d3b95bd'),
          ('aac0e62d-4e8b-4440-b649-caa388d34837'),
          ('4c261c1c-97fb-42da-a544-e8a59853ebe3'),
          ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0'),
          ('79783c0f-8d95-4110-8239-0ac504d63a24'),
          ('e7a93314-bb06-4525-b412-5315198c668a'),
          ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5a'),
          ('aec1303e-de6a-4580-94cf-7205c17b5535'),
          ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e'),
          ('97acbe02-c59c-409c-8d51-7d4ef72e6db7'),
          ('f602b62c-194b-4591-8e9c-956e5cbb347d'),
          ('00000000-0000-4000-8000-0000000000ff')
        ON CONFLICT DO NOTHING;

        INSERT INTO public.staff_profiles(id, user_id, status, full_name_ar) VALUES
          ('c8a94548-4782-4252-86f9-23559d3b95bd', 'c8a94548-4782-4252-86f9-23559d3b95bd', 'active', 'SA Specialist'),
          ('aac0e62d-4e8b-4440-b649-caa388d34837', 'aac0e62d-4e8b-4440-b649-caa388d34837', 'active', 'SA Manager'),
          ('4c261c1c-97fb-42da-a544-e8a59853ebe3', '4c261c1c-97fb-42da-a544-e8a59853ebe3', 'active', 'Registrar'),
          ('79783c0f-8d95-4110-8239-0ac504d63a24', '79783c0f-8d95-4110-8239-0ac504d63a24', 'active', 'Finance'),
          ('e7a93314-bb06-4525-b412-5315198c668a', 'e7a93314-bb06-4525-b412-5315198c668a', 'active', 'Library'),
          ('67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', 'active', 'Labs'),
          ('aec1303e-de6a-4580-94cf-7205c17b5535', 'aec1303e-de6a-4580-94cf-7205c17b5535', 'active', 'Archive')
        ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'active';

        INSERT INTO public.faculty_profiles(id, user_id, status, full_name_ar) VALUES
          ('b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', 'active', 'Dean')
        ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, status = 'active';

        CREATE TABLE IF NOT EXISTS public.position_assignments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          position_id uuid,
          user_id uuid REFERENCES auth.users(id),
          department_id uuid REFERENCES public.departments(id),
          is_active boolean NOT NULL DEFAULT true,
          assigned_from date DEFAULT '2026-01-01',
          assigned_to date,
          notes text,
          created_at timestamptz DEFAULT now(),
          updated_at timestamptz DEFAULT now()
        );
        ALTER TABLE public.position_assignments ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id);

        INSERT INTO public.position_assignments(id, user_id, department_id, is_active, assigned_from) VALUES
          ('d4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', true, '2026-01-01'),
          ('97acbe02-c59c-409c-8d51-7d4ef72e6db7', '97acbe02-c59c-409c-8d51-7d4ef72e6db7', '11111111-1111-4111-8111-111111111111', true, '2026-01-01'),
          ('f602b62c-194b-4591-8e9c-956e5cbb347d', 'f602b62c-194b-4591-8e9c-956e5cbb347d', '22222222-2222-4222-8222-222222222222', true, '2026-01-01')
        ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, department_id = EXCLUDED.department_id, is_active = true, assigned_from = '2026-01-01';

        INSERT INTO public.request_processing_units(id, code, name_ar, is_active) VALUES
          ('aaaaaaaa-0000-4000-8000-000000000001', 'student_affairs', 'شؤون الطلاب', true),
          ('aaaaaaaa-0000-4000-8000-000000000002', 'registrar', 'التسجيل', true),
          ('aaaaaaaa-0000-4000-8000-000000000003', 'finance', 'المالية', true),
          ('aaaaaaaa-0000-4000-8000-000000000004', 'dean', 'العمادة', true),
          ('aaaaaaaa-0000-4000-8000-000000000005', 'archive', 'الأرشيف', true),
          ('aaaaaaaa-0000-4000-8000-000000000006', 'library', 'المكتبة', true),
          ('aaaaaaaa-0000-4000-8000-000000000007', 'labs', 'المعامل', true),
          ('aaaaaaaa-0000-4000-8000-000000000008', 'department', 'القسم الأكاديمي', true)
        ON CONFLICT (code) DO UPDATE SET is_active = true;

        INSERT INTO public.request_processing_roles(id, unit_id, code, name_ar, is_active) VALUES
          ('bbbbbbbb-0000-4000-8000-000000000001', (SELECT id FROM public.request_processing_units WHERE code = 'student_affairs'), 'student_affairs_specialist', 'مختص شؤون الطلاب', true),
          ('bbbbbbbb-0000-4000-8000-000000000002', (SELECT id FROM public.request_processing_units WHERE code = 'student_affairs'), 'student_affairs_manager', 'مدير شؤون الطلاب', true),
          ('bbbbbbbb-0000-4000-8000-000000000003', (SELECT id FROM public.request_processing_units WHERE code = 'registrar'), 'registrar_general', 'المسجل العام', true),
          ('bbbbbbbb-0000-4000-8000-000000000004', (SELECT id FROM public.request_processing_units WHERE code = 'finance'), 'revenue_finance_officer', 'مختص المالية', true),
          ('bbbbbbbb-0000-4000-8000-000000000005', (SELECT id FROM public.request_processing_units WHERE code = 'dean'), 'dean', 'العميد', true),
          ('bbbbbbbb-0000-4000-8000-000000000006', (SELECT id FROM public.request_processing_units WHERE code = 'archive'), 'archive_officer', 'مختص الأرشيف', true),
          ('bbbbbbbb-0000-4000-8000-000000000007', (SELECT id FROM public.request_processing_units WHERE code = 'library'), 'library_officer', 'مختص المكتبة', true),
          ('bbbbbbbb-0000-4000-8000-000000000008', (SELECT id FROM public.request_processing_units WHERE code = 'labs'), 'labs_manager', 'مدير المعامل', true),
          ('bbbbbbbb-0000-4000-8000-000000000009', (SELECT id FROM public.request_processing_units WHERE code = 'department'), 'department_head', 'رئيس القسم', true)
        ON CONFLICT (unit_id, code) DO UPDATE SET is_active = true;

        DELETE FROM public.request_processing_assignments;

        INSERT INTO public.request_processing_assignments(unit_id, role_id, assignment_type, staff_profile_id, faculty_profile_id, user_id, position_assignment_id, department_id, is_active) VALUES
          ((SELECT id FROM public.request_processing_units WHERE code='student_affairs'), (SELECT id FROM public.request_processing_roles WHERE code='student_affairs_specialist'), 'staff_profile', 'c8a94548-4782-4252-86f9-23559d3b95bd', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='student_affairs'), (SELECT id FROM public.request_processing_roles WHERE code='student_affairs_manager'), 'staff_profile', 'aac0e62d-4e8b-4440-b649-caa388d34837', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='registrar'), (SELECT id FROM public.request_processing_roles WHERE code='registrar_general'), 'staff_profile', '4c261c1c-97fb-42da-a544-e8a59853ebe3', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='dean'), (SELECT id FROM public.request_processing_roles WHERE code='dean'), 'faculty_profile', NULL, 'b3dd71e6-3794-4fae-abd5-0d7c9e7e0bf0', NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='finance'), (SELECT id FROM public.request_processing_roles WHERE code='revenue_finance_officer'), 'staff_profile', '79783c0f-8d95-4110-8239-0ac504d63a24', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='library'), (SELECT id FROM public.request_processing_roles WHERE code='library_officer'), 'staff_profile', 'e7a93314-bb06-4525-b412-5315198c668a', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='labs'), (SELECT id FROM public.request_processing_roles WHERE code='labs_manager'), 'staff_profile', '67b39ee4-4918-4b00-b4cc-0d5046ac8a5a', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='archive'), (SELECT id FROM public.request_processing_roles WHERE code='archive_officer'), 'staff_profile', 'aec1303e-de6a-4580-94cf-7205c17b5535', NULL, NULL, NULL, NULL, true),
          ((SELECT id FROM public.request_processing_units WHERE code='department'), (SELECT id FROM public.request_processing_roles WHERE code='department_head'), 'position_assignment', NULL, NULL, NULL, 'd4aaa5c9-72d1-4996-b0e8-d30c6327da6e', 'ce485c67-5f7c-498d-b120-4b1130a86ae8', true),
          ((SELECT id FROM public.request_processing_units WHERE code='department'), (SELECT id FROM public.request_processing_roles WHERE code='department_head'), 'position_assignment', NULL, NULL, NULL, '97acbe02-c59c-409c-8d51-7d4ef72e6db7', '11111111-1111-4111-8111-111111111111', true),
          ((SELECT id FROM public.request_processing_units WHERE code='department'), (SELECT id FROM public.request_processing_roles WHERE code='department_head'), 'position_assignment', NULL, NULL, NULL, 'f602b62c-194b-4591-8e9c-956e5cbb347d', '22222222-2222-4222-8222-222222222222', true);
      `);

      psqlFile(join(root, "supabase", "migrations", "20260801021541_4a93f2d8-18ad-453f-a00d-6a9ea08f7fbe.sql"));

      psql(`
        INSERT INTO public.levels(id) VALUES
          ('77777777-7777-4777-8777-777777777777'::uuid)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.academic_years(id) VALUES
          ('77777777-7777-4777-8777-777777777701'::uuid),
          ('99999999-9999-4999-8999-999999999999'::uuid)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.semesters(id, academic_year_id) VALUES
          ('77777777-7777-4777-8777-777777777702'::uuid, '77777777-7777-4777-8777-777777777701'::uuid),
          ('88888888-8888-4888-8888-888888888888'::uuid, '99999999-9999-4999-8999-999999999999'::uuid)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.student_academic_status(student_profile_id, academic_year_id, semester_id, level_id, enrollment_status)
        VALUES ('b1e20002-0000-4000-8000-000000000002'::uuid, '77777777-7777-4777-8777-777777777701'::uuid, '77777777-7777-4777-8777-777777777702'::uuid, '99999999-9999-4999-8999-999999999901'::uuid, 'active')
        ON CONFLICT DO NOTHING;

        UPDATE public.student_academic_status SET enrollment_status = 'active';

        INSERT INTO public.course_sections(id) VALUES
          ('66666666-6666-4666-8666-666666666666'::uuid)
        ON CONFLICT (id) DO NOTHING;

        INSERT INTO public.student_enrollments(student_profile_id, course_section_id, enrollment_status)
        SELECT sp.id, '66666666-6666-4666-8666-666666666666'::uuid, 'enrolled'
        FROM public.student_profiles sp
        ON CONFLICT DO NOTHING;

        INSERT INTO public.enrollment_suspension_details(request_id, requested_from_academic_year_id, requested_from_semester_id, suspension_reason, suspension_duration_type)
        VALUES ('f1300000-0000-4000-8000-000000000007', '77777777-7777-4777-8777-777777777701', '77777777-7777-4777-8777-777777777702', 'Personal Reasons', 'one_semester')
        ON CONFLICT (request_id) DO NOTHING;

        INSERT INTO public.absence_excuse_details(request_id, course_section_id, absence_date, reason_type, absence_reason_detail)
        VALUES ('f1300000-0000-4000-8000-000000000009', '66666666-6666-4666-8666-666666666666', current_date, 'medical', 'Medical Emergency')
        ON CONFLICT (request_id) DO NOTHING;

        INSERT INTO public.file_withdrawal_details(request_id, withdrawal_reason, impact_ack, library_cleared_at, labs_cleared_at, activities_cleared_at, finance_cleared_at)
        VALUES ('f1300000-0000-4000-8000-000000000014', 'Relocating to another city', true, now(), now(), now(), now())
        ON CONFLICT (request_id) DO UPDATE SET library_cleared_at = now(), labs_cleared_at = now(), activities_cleared_at = now(), finance_cleared_at = now();

        INSERT INTO public.extra_chance_details(request_id, academic_year_id, semester_id, reason, chance_type)
        VALUES ('f1300000-0000-4000-8000-000000000019', '77777777-7777-4777-8777-777777777701', '77777777-7777-4777-8777-777777777702', 'Academic improvement', 'final_chance')
        ON CONFLICT (request_id) DO UPDATE SET academic_year_id = '77777777-7777-4777-8777-777777777701'::uuid, semester_id = '77777777-7777-4777-8777-777777777702'::uuid;
      `);

      // Execute real RPC harness script
      const harnessOutput = psql(sqlContent);

      expect(harnessOutput).toContain("DISPOSABLE_HARNESS_PASS: All 19 of 19 authoritative positive fixture cases verified via REAL RPC executions!");
      expect(harnessOutput).toContain("PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19");
      console.log("PASS_B1_PR277_REAL_PG17_RPC_HARNESS_19_OF_19");
    } finally {
      teardownContainer();
    }
  }, 180000);
});
