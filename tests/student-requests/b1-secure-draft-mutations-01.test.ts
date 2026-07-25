import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  B1_ADAPTER_DRAFT_RPC_MAP,
  B1_DRAFT_FORM_ALLOWLIST,
  B1_SECURE_DRAFT_MUTATIONS_CONTRACT_ID,
  B1_SECURE_DRAFT_RPCS,
  assertNoStorageCoordinates,
  normalizeDraftDto,
} from "../../src/lib/student-requests/b1-secure-draft/contracts";
import { B1_ADAPTER_READ_RPC_MAP } from "../../src/lib/student-requests/b1-secure-read/contracts";

const root = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const shaLf = (rel: string) =>
  createHash("sha256").update(read(rel).replace(/\r\n/g, "\n").replace(/\r/g, "\n")).digest("hex");

const DRAFT = "docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql";
const MIGRATION = "supabase/migrations/20260725140000_b1_22_secure_draft_mutations_01.sql";
const PRE =
  "docs/migration-drafts/b1-backend-verifiers/22-B1_22_SECURE_DRAFT_MUTATIONS_01-PREFLIGHT.sql";
const POST =
  "docs/migration-drafts/b1-backend-verifiers/22-B1_22_SECURE_DRAFT_MUTATIONS_01-POST-VERIFIER.sql";
const MAP = "docs/migration-drafts/b1-backend-verifiers/PROMOTION-MAP.json";

describe("B1 secure draft mutations — source surface", () => {
  test("draft/migration/preflight/post exist and are source-only", () => {
    for (const f of [DRAFT, MIGRATION, PRE, POST]) expect(existsSync(join(root, f))).toBe(true);
    const mig = read(MIGRATION);
    expect(mig).toContain("PROMOTED MIGRATION - NOT APPLIED TO PRODUCTION");
    expect(mig).toContain("REQUIRES EXPLICIT SINGLE-MIGRATION APPROVAL");
    expect(mig).not.toMatch(/student_visible\s*=/);
    expect(read(PRE)).toContain("READ ONLY");
    expect(read(POST)).toContain("READ ONLY");
  });

  test("promotion map order 22 pins LF SHAs", () => {
    const map = JSON.parse(read(MAP)) as Array<Record<string, string | number>>;
    const entry = map.find((x) => x.order === 22);
    expect(entry).toBeTruthy();
    expect(entry!.draft).toBe("B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql");
    expect(entry!.migration).toBe(MIGRATION);
    expect(entry!.draft_sha_lf).toBe(shaLf(DRAFT));
    expect(entry!.migration_sha_lf).toBe(shaLf(MIGRATION));
  });

  test("RPCs are security definer with auth.uid and grants", () => {
    const sql = read(DRAFT);
    for (const rpc of B1_SECURE_DRAFT_RPCS) {
      expect(sql).toContain(`function public.${rpc}`);
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${rpc}`, "i"));
      expect(sql).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*from public, anon`, "i"),
      );
    }
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("b1_require_auth_uid");
    expect(sql).toContain("B1_DRAFT_ACCESS_DENIED");
    expect(sql).toContain("B1_STALE_REQUEST_VERSION");
    expect(sql).toContain("B1_IDEMPOTENCY_PAYLOAD_MISMATCH");
    expect(sql).toContain("submit_b1_student_request_atomic");
    expect(sql).not.toContain("initialize_b1_request_workflow_strict");
  });

  test("allowlists match freeze keys; no storage coordinates in DTO builder", () => {
    const sql = read(DRAFT);
    for (const [service, keys] of Object.entries(B1_DRAFT_FORM_ALLOWLIST)) {
      for (const key of keys) expect(sql).toContain(`'${key}'`);
      expect(service).toBeTruthy();
    }
    expect(sql).toContain("b1_build_student_draft_dto");
    expect(sql).toContain("b1_list_attachment_metas_for_request");
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*storage_bucket/);
  });

  test("create remains fail-closed until backend visibility/workflow readiness; does not call submit", () => {
    const sql = read(DRAFT);
    expect(sql).toContain("v_type.student_visible is distinct from true");
    expect(sql).toContain("from public.request_type_workflows w");
    expect(sql).toContain("v_ready_count = 5");
    expect(sql).not.toContain("'available', true");
    expect(sql).not.toContain("'viewer'");
    expect(sql).not.toMatch(/submit_b1_student_request_atomic\s*\(/);
    expect(sql).toContain("'submit_rpc', 'submit_b1_student_request_atomic'");
  });

  test("save requires authoritative optimistic-concurrency timestamp before mutation", () => {
    const sql = read(DRAFT);
    expect(sql).toContain("if p_expected_updated_at is null then");
    expect(sql).toContain("v_r.updated_at is distinct from p_expected_updated_at");
    expect(sql.indexOf("return public.b1_build_student_draft_dto(p_request_id)")).toBeLessThan(
      sql.indexOf("v_r.updated_at is distinct from p_expected_updated_at"),
    );
  });
});

describe("B1 secure draft mutations — adapter mapping", () => {
  test("create/save map to mutation RPCs; submit stays separate", () => {
    expect(B1_ADAPTER_DRAFT_RPC_MAP.createDraft).toBe("create_b1_request_draft_for_student");
    expect(B1_ADAPTER_DRAFT_RPC_MAP.saveDraft).toBe("save_b1_request_draft_for_student");
    expect(B1_ADAPTER_DRAFT_RPC_MAP.submit).toBe("submit_b1_student_request_atomic");
    expect(B1_ADAPTER_READ_RPC_MAP.createDraft).toBe("create_b1_request_draft_for_student");
    expect(B1_ADAPTER_READ_RPC_MAP.saveDraft).toBe("save_b1_request_draft_for_student");
  });

  test("wrappers never accept actor ids", () => {
    const fns = read("src/lib/student-requests/b1-secure-draft/functions.ts");
    expect(fns).toContain("requireSupabaseAuth");
    expect(fns).toContain("createB1Draft");
    expect(fns).toContain("saveB1Draft");
    expect(fns).not.toMatch(/actorUserId|actor_user_id|p_actor|student_id|user_id/);
    expect(fns).toContain("expectedUpdatedAt: z.string().datetime({ offset: true })");
  });

  test("wrappers never expose raw backend errors", () => {
    const rpc = read("src/lib/student-requests/b1-secure-draft/rpc.ts");
    const fns = read("src/lib/student-requests/b1-secure-draft/functions.ts");
    expect(rpc).not.toContain('msg.split("\\n")[0]');
    expect(fns).not.toContain("new B1SecureDraftRpcError(error.message)");
  });
});

describe("B1 secure draft mutations — DTO privacy", () => {
  test("normalizeDraftDto rejects storage leaks", () => {
    expect(() =>
      normalizeDraftDto({
        requestId: "11111111-1111-1111-1111-111111111111",
        serviceCode: "file_withdrawal",
        formData: {},
        attachments: [],
        status: "draft",
        updatedAt: "2026-07-25T00:00:00Z",
        storage_bucket: "x",
      }),
    ).toThrow();
    expect(() => assertNoStorageCoordinates({ storageRef: "att:1" })).not.toThrow();
  });

  test("contract id stable", () => {
    expect(B1_SECURE_DRAFT_MUTATIONS_CONTRACT_ID).toBe(
      "B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01",
    );
  });
});
