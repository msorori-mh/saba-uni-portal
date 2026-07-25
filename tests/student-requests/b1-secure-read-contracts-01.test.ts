import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_ADAPTER_READ_RPC_MAP,
  B1_SECURE_READ_CONTRACT_ID,
  B1_SECURE_READ_RPCS,
  B1_SECURE_READ_WRITES_FAIL_CLOSED,
  assertNoStorageCoordinates,
  isB1CanonicalCode,
  normalizeAttachmentMeta,
} from "../../src/lib/student-requests/b1-secure-read/contracts";
import {
  B1SecureReadRpcClient,
  isB1SecureReadRpcUnavailable,
} from "../../src/lib/student-requests/b1-secure-read/rpc";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const shaLf = (rel: string) =>
  createHash("sha256").update(read(rel).replace(/\r\n/g, "\n").replace(/\r/g, "\n")).digest("hex");

const DRAFT = "docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql";
const MIGRATION = "supabase/migrations/20260725130000_b1_19_secure_read_contracts_01.sql";
const PRE =
  "docs/migration-drafts/b1-backend-verifiers/20-B1_19_SECURE_READ_CONTRACTS_01-PREFLIGHT.sql";
const POST =
  "docs/migration-drafts/b1-backend-verifiers/20-B1_19_SECURE_READ_CONTRACTS_01-POST-VERIFIER.sql";
const MAP = "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json";

describe("B1 secure read contracts — source surface", () => {
  test("draft/migration/preflight/post exist and are source-only", () => {
    for (const f of [DRAFT, MIGRATION, PRE, POST]) expect(existsSync(join(root, f))).toBe(true);
    const mig = read(MIGRATION);
    expect(mig).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(mig).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
    expect(mig).not.toMatch(/student_visible\s*=/);
    expect(PRE).toBeTruthy();
    expect(read(PRE)).toContain("READ ONLY");
    expect(read(PRE)).toContain("ROLLBACK;");
    expect(read(POST)).toContain("READ ONLY");
    expect(read(POST)).toContain("ROLLBACK;");
  });

  test("promotion map order 20 pins LF SHAs", () => {
    const map = JSON.parse(read(MAP)) as Array<Record<string, string | number>>;
    const entry = map.find((x) => x.order === 20);
    expect(entry).toBeTruthy();
    expect(entry!.draft).toBe("B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql");
    expect(entry!.migration).toBe(MIGRATION);
    expect(entry!.draft_sha_lf).toBe(shaLf(DRAFT));
    expect(entry!.migration_sha_lf).toBe(shaLf(MIGRATION));
  });

  test("all nine authenticated read RPCs are defined with auth.uid and grants", () => {
    const sql = read(DRAFT);
    for (const rpc of B1_SECURE_READ_RPCS) {
      expect(sql).toContain(`function public.${rpc}`);
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${rpc}`, "i"));
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon`, "i"),
      );
    }
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("b1_require_auth_uid");
    expect(sql).toContain("B1_READ_ACCESS_DENIED");
    expect(sql).toContain("user_matches_workflow_runtime_step");
    expect(sql).toContain("can_current_user_act_on_step");
  });

  test("no storage coordinates in student/staff DTO builders", () => {
    const sql = read(DRAFT);
    expect(sql).toContain("storage_ref");
    expect(sql).toContain("att:' || a.id::text");
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*storage_bucket/);
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*storage_object_path/);
    expect(sql).not.toMatch(/'object_key'/);
  });

  test("no broad admin/dean/registrar/department_head bypass", () => {
    const sql = read(DRAFT).toLowerCase();
    expect(sql).toContain("no admin/dean/registrar/dept-head bypass");
    expect(sql).not.toMatch(/has_any_role\([^)]*admin/);
    expect(sql).not.toMatch(/is_current_user_admin/);
    expect(sql).not.toMatch(/is_current_user_registrar/);
  });
});

describe("B1 secure read contracts — adapter mapping", () => {
  test("adapter read methods map to RPCs; draft writes stay fail-closed", () => {
    expect(B1_ADAPTER_READ_RPC_MAP.getFormOptions).toBe("get_b1_request_form_options");
    expect(B1_ADAPTER_READ_RPC_MAP.getDraft).toBe("get_b1_request_draft_for_student");
    expect(B1_ADAPTER_READ_RPC_MAP.getStudentRequestDetails).toBe(
      "get_b1_request_details_for_student",
    );
    expect(B1_ADAPTER_READ_RPC_MAP.getStudentRequests).toBe("list_b1_requests_for_student");
    expect(B1_ADAPTER_READ_RPC_MAP.getAssignedInbox).toBe("get_b1_assigned_inbox_for_actor");
    expect(B1_ADAPTER_READ_RPC_MAP.getAssignedRequestDetails).toBe(
      "get_b1_assigned_request_details_for_actor",
    );
    expect(B1_ADAPTER_READ_RPC_MAP.refreshAfterAct).toBe(
      "get_b1_assigned_request_details_for_actor",
    );
    expect(B1_ADAPTER_READ_RPC_MAP.refreshAfterConfirmPayment).toBe(
      "get_b1_assigned_request_details_for_actor",
    );
    expect(B1_ADAPTER_READ_RPC_MAP.createDraft).toBeNull();
    expect(B1_ADAPTER_READ_RPC_MAP.saveDraft).toBeNull();
    expect(B1_SECURE_READ_WRITES_FAIL_CLOSED).toContain("create_draft");
    expect(B1_SECURE_READ_WRITES_FAIL_CLOSED).toContain("save_draft");
  });

  test("server wrappers never accept actor ids and never touch graduation-project tables", () => {
    const fns = read("src/lib/student-requests/b1-secure-read/functions.ts");
    expect(fns).toContain("requireSupabaseAuth");
    expect(fns).not.toMatch(/actorUserId|actor_user_id|p_actor/);
    expect(fns).not.toMatch(/\.from\(\s*["']graduation_project/);
    expect(fns).toContain("createB1SecureDraftFailClosed");
    expect(fns).toContain("saveB1SecureDraftFailClosed");
  });

  test("five canonical services recognized", () => {
    for (const code of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]) {
      expect(isB1CanonicalCode(code)).toBe(true);
    }
    expect(isB1CanonicalCode("enrollment_certificate")).toBe(false);
  });
});

describe("B1 secure read contracts — privacy helpers", () => {
  test("assertNoStorageCoordinates rejects leaks", () => {
    expect(() => assertNoStorageCoordinates({ storage_bucket: "x" })).toThrow();
    expect(() => assertNoStorageCoordinates({ storage_object_path: "y" })).toThrow();
    expect(() => assertNoStorageCoordinates({ object_key: "z" })).toThrow();
    expect(() => assertNoStorageCoordinates({ storageRef: "att:1" })).not.toThrow();
  });

  test("normalizeAttachmentMeta builds opaque storageRef", () => {
    const meta = normalizeAttachmentMeta({
      attachment_id: "11111111-1111-1111-1111-111111111111",
      attachment_type: "excuse_documents",
      file_name: "a.pdf",
      file_size_bytes: 10,
      mime_type: "application/pdf",
      status: "attached",
      storage_ref: "att:11111111-1111-1111-1111-111111111111",
    });
    expect(meta.storageRef.startsWith("att:")).toBe(true);
    expect(meta.storageRef).not.toContain("student-request-secure-attachments");
  });

  test("RPC client maps unavailable and denies storage leaks", async () => {
    expect(isB1SecureReadRpcUnavailable({ code: "42883", message: "x" })).toBe(true);
    const client = new B1SecureReadRpcClient({
      rpc: async () => ({
        data: { storage_bucket: "leak" },
        error: null,
      }),
    });
    await expect(client.getCapability()).rejects.toThrow("B1_SECURE_READ_STORAGE_COORDINATE_LEAK");
  });

  test("contract id constant stable", () => {
    expect(B1_SECURE_READ_CONTRACT_ID).toBe("B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01");
  });
});

describe("B1 secure read contracts — authorization matrix documentation", () => {
  test("SQL encodes opaque deny and assignment gates for matrix roles", () => {
    const sql = read(DRAFT);
    // Positive paths
    expect(sql).toContain("sp.user_id = v_uid");
    expect(sql).toContain("user_matches_workflow_runtime_step");
    // Negative / opaque
    expect(sql).toContain("perform public.b1_deny_read()");
    expect(sql).toContain("B1_READ_ACCESS_DENIED");
    // Five services only
    expect(sql).toContain("b1_is_five_service_type");
    // enrollment_certificate not in B1 list
    expect(sql).not.toContain("enrollment_certificate");
  });

  test("functions source exposes refresh-after-mutation via assigned details", () => {
    expect(B1_ADAPTER_READ_RPC_MAP.refreshAfterAct).toBe(
      B1_ADAPTER_READ_RPC_MAP.getAssignedRequestDetails,
    );
    expect(B1_ADAPTER_READ_RPC_MAP.refreshAfterConfirmPayment).toBe(
      B1_ADAPTER_READ_RPC_MAP.getAssignedRequestDetails,
    );
  });
});
