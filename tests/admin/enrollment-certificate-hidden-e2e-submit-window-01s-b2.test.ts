import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canAnyRoleManageEnrollmentCertificateE2E,
  canCreateStudentRequestForType,
  canRoleManageEnrollmentCertificateE2E,
  canSubmitStudentRequestForType,
  ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES,
  ENROLLMENT_CERTIFICATE_E2E_DENIED_ROLES,
  isRequestTypeListedForStudents,
  isSafeHiddenSubmitWindowState,
  isValidEnrollmentCertificateE2EMarker,
} from "../../src/lib/enrollment-certificate-e2e-auth";

const ROOT = join(import.meta.dir, "../..");
const MIGRATION = join(
  ROOT,
  "supabase/migrations/20260713020000_enrollment_certificate_hidden_e2e_draft_and_submit_window.sql",
);
const CREATE_RPC = join(
  ROOT,
  "supabase/migrations/20260710140000_student_request_types_rpc_rls.sql",
);
const SUBMIT_RPC = join(
  ROOT,
  "supabase/migrations/20260710190000_student_request_workflow_runtime.sql",
);
const SERVER_FN = join(
  ROOT,
  "src/lib/admin-enrollment-certificate-e2e.functions.ts",
);

function functionBody(sql: string, name: string, nextMarker?: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  let end = sql.length;
  if (nextMarker) {
    const found = sql.indexOf(nextMarker, start + 1);
    expect(found).toBeGreaterThan(start);
    end = found;
  }
  return sql.slice(start, end);
}

describe("enrollment certificate E2E auth matrix 01S-B2", () => {
  it("allows admin and system_admin only", () => {
    expect([...ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES]).toEqual([
      "admin",
      "system_admin",
    ]);
    expect(canRoleManageEnrollmentCertificateE2E("admin")).toBe(true);
    expect(canRoleManageEnrollmentCertificateE2E("system_admin")).toBe(true);
    for (const role of ENROLLMENT_CERTIFICATE_E2E_DENIED_ROLES) {
      expect(canRoleManageEnrollmentCertificateE2E(role)).toBe(false);
    }
    expect(canRoleManageEnrollmentCertificateE2E(null)).toBe(false);
    expect(canAnyRoleManageEnrollmentCertificateE2E([])).toBe(false);
    expect(canAnyRoleManageEnrollmentCertificateE2E(["student"])).toBe(false);
    expect(canAnyRoleManageEnrollmentCertificateE2E(["registrar", "admin"])).toBe(
      true,
    );
  });

  it("validates e2e marker format", () => {
    expect(
      isValidEnrollmentCertificateE2EMarker("ENROLLMENT-ZERO-FEE-E2E-20260713-001"),
    ).toBe(true);
    expect(isValidEnrollmentCertificateE2EMarker("SHORT")).toBe(false);
    expect(isValidEnrollmentCertificateE2EMarker("bad lowercase marker!!")).toBe(
      false,
    );
  });

  it("keeps catalog/create closed while submit can open on active+hidden", () => {
    const windowState = { is_active: true, student_visible: false };
    expect(isSafeHiddenSubmitWindowState(windowState)).toBe(true);
    expect(isRequestTypeListedForStudents(windowState)).toBe(false);
    expect(canCreateStudentRequestForType(windowState)).toBe(false);
    expect(canSubmitStudentRequestForType(windowState)).toBe(true);

    const hiddenIdle = { is_active: false, student_visible: false };
    expect(canSubmitStudentRequestForType(hiddenIdle)).toBe(false);
    expect(isRequestTypeListedForStudents(hiddenIdle)).toBe(false);

    const publicType = { is_active: true, student_visible: true };
    expect(isRequestTypeListedForStudents(publicType)).toBe(true);
    expect(canCreateStudentRequestForType(publicType)).toBe(true);
  });
});

describe("create/submit/catalog contracts for active+hidden window", () => {
  const createSql = readFileSync(CREATE_RPC, "utf8");
  const submitSql = readFileSync(SUBMIT_RPC, "utf8");

  it("create_student_request requires is_active and student_visible", () => {
    const body = functionBody(
      createSql,
      "create_student_request",
      "CREATE OR REPLACE FUNCTION public.submit_student_request",
    );
    expect(body).toContain("v_type.is_active IS DISTINCT FROM true");
    expect(body).toContain("v_type.student_visible IS DISTINCT FROM true");
    expect(body).toContain("'draft'");
  });

  it("submit_student_request requires is_active but not student_visible", () => {
    const body = functionBody(submitSql, "submit_student_request");
    expect(body).toContain("v_type.is_active IS DISTINCT FROM true");
    expect(body).not.toContain("student_visible");
    expect(body).toContain("initialize_student_request_workflow");
  });

  it("get_available_request_types_for_current_student filters student_visible", () => {
    const body = functionBody(
      createSql,
      "get_available_request_types_for_current_student",
      "CREATE OR REPLACE FUNCTION public.create_student_request",
    );
    expect(body).toContain("rt.is_active = true");
    expect(body).toContain("rt.student_visible = true");
  });

  it("get_my_student_requests returns by profile ownership without visibility filter", () => {
    const body = functionBody(createSql, "get_my_student_requests");
    expect(body).toContain("sr.student_profile_id = v_profile_id");
    expect(body).not.toContain("student_visible");
  });
});

describe("hidden E2E migration static contracts 01S-B2", () => {
  const migration = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n");
  const serverFn = readFileSync(SERVER_FN, "utf8").replace(/\r\n/g, "\n");
  const submitSql = readFileSync(SUBMIT_RPC, "utf8").replace(/\r\n/g, "\n");

  const draftBody = functionBody(
    migration,
    "admin_create_enrollment_certificate_e2e_draft",
    "CREATE OR REPLACE FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window",
  );
  const windowBody = functionBody(
    migration,
    "admin_set_enrollment_certificate_e2e_submit_window",
  );

  it("does not mutate request_types/workflow/assignments/data on apply", () => {
    // No migration-time DML: UPDATE appears only inside RPC function bodies.
    const topLevelDml = migration
      .split(/CREATE OR REPLACE FUNCTION/i)
      .slice(0, 1)
      .join("");
    expect(topLevelDml).not.toMatch(/UPDATE\s+public\./i);
    expect(topLevelDml).not.toMatch(/INSERT\s+INTO\s+public\./i);
    expect(topLevelDml).not.toMatch(/DELETE\s+FROM\s+public\./i);

    expect(migration).not.toContain("student_visible = true");
    expect(migration).not.toContain("UPDATE public.request_type_workflows");
    expect(migration).not.toContain("UPDATE public.request_processing_assignments");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.create_student_request");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.submit_student_request");
    expect(migration).not.toContain("CREATE OR REPLACE FUNCTION public.initialize_student_request_workflow");
  });

  it("window RPC may toggle is_active but never student_visible", () => {
    expect(windowBody).toContain("SET is_active = true");
    expect(windowBody).toContain("SET is_active = false");
    expect(windowBody).not.toContain("SET student_visible");
    expect(windowBody).toContain("student_visible IS FALSE");
    expect(windowBody).toContain("'student_visible', false");
  });

  it("draft RPC is admin-only, enrollment_certificate-only, inactive+hidden", () => {
    expect(draftBody).toContain("assert_can_admin_enrollment_certificate_e2e");
    expect(draftBody).toContain("pg_advisory_xact_lock");
    expect(draftBody).toContain("enrollment_certificate");
    expect(draftBody).toContain("_enrollment_certificate_e2e_load_hidden_type(true)");
    expect(draftBody).toContain("assert_student_can_use_request_type");
    expect(draftBody).toContain("ARRAY['student']");
    expect(draftBody).toContain("reused_existing");
    expect(draftBody).toContain("admin_e2e_request_draft_created");
    expect(draftBody).toContain("'draft'");
    expect(draftBody).toContain("internal_e2e");
    expect(draftBody).toContain("zero_fee");
    expect(draftBody).not.toContain("submit_student_request");
    expect(draftBody).not.toContain("initialize_student_request_workflow");
    expect(draftBody).not.toContain("student_request_fee_assessments");
    expect(draftBody).not.toContain("official_documents");
    expect(draftBody).not.toContain("create_notification");
  });

  it("draft RPC enforces marker, open-request, and workflow readiness", () => {
    expect(draftBody).toContain("بين 8 و100 حرف");
    expect(draftBody).toContain("^[A-Z0-9][A-Z0-9_-]{7,99}$");
    expect(draftBody).toContain("يوجد طلب شهادة قيد مفتوح سابق لهذا الطالب");
    expect(migration).toContain("version IS DISTINCT FROM 2");
    expect(migration).toContain("المتوقع 7 خطوات و9 انتقالات");
    expect(migration).toContain("المتوقع 6");
  });

  it("submit window opens is_active only and keeps student_visible false", () => {
    expect(windowBody).toContain("SET is_active = true");
    expect(windowBody).toContain("SET is_active = false");
    expect(windowBody).toContain("student_visible IS FALSE");
    expect(windowBody).toContain("enrollment_certificate_e2e_submit_window_opened");
    expect(windowBody).toContain("enrollment_certificate_e2e_submit_window_closed");
    expect(windowBody).toContain("نافذة تقديم شهادة القيد مفتوحة مسبقاً");
    expect(windowBody).toContain("طلب شهادة قيد واحد فقط");
    expect(windowBody).toContain("مسودة E2E مطابقة");
    expect(windowBody).not.toContain("SET student_visible");
  });

  it("grants EXECUTE to authenticated and revokes PUBLIC/anon; helpers stay internal", () => {
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.assert_can_admin_enrollment_certificate_e2e()\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public._enrollment_certificate_e2e_load_hidden_type(boolean)\n  FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_create_enrollment_certificate_e2e_draft(uuid, text, text)\n  TO authenticated",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.admin_set_enrollment_certificate_e2e_submit_window(boolean, text)\n  TO authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.admin_create_enrollment_certificate_e2e_draft(uuid, text, text)\n  FROM PUBLIC, anon",
    );
  });

  it("server functions use requireSupabaseAuth, admin roles, zod, and user-session RPC", () => {
    expect(serverFn).toContain("requireSupabaseAuth");
    expect(serverFn).toContain("ENROLLMENT_CERTIFICATE_E2E_ADMIN_ROLES");
    expect(serverFn).toContain("adminCreateEnrollmentCertificateE2EDraft");
    expect(serverFn).toContain("adminSetEnrollmentCertificateE2ESubmitWindow");
    expect(serverFn).toContain("context.supabase.rpc");
    expect(serverFn).toContain("admin_create_enrollment_certificate_e2e_draft");
    expect(serverFn).toContain("admin_set_enrollment_certificate_e2e_submit_window");
    expect(serverFn).not.toContain("supabaseAdmin");
    expect(serverFn).not.toContain("createServerFn({ method: \"GET\" })");
  });

  it("initialize path remains on original submit for runtime steps / initial_review", () => {
    const submitBody = functionBody(submitSql, "submit_student_request");
    const initBody = functionBody(submitSql, "initialize_student_request_workflow");
    expect(submitBody).toContain("initialize_student_request_workflow");
    expect(initBody).toContain("get_active_workflow_for_request_type");
    expect(initBody).toContain("student_request_workflow_steps");
    expect(initBody).toContain("'active'");
  });
});
