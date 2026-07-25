import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sql = read("docs/migration-drafts/B1-FIVE-SERVICES-SECURE-DRAFT-MUTATIONS-01.sql");
const saveBody = sql.slice(sql.indexOf("create or replace function public.save_b1_request"));
const capabilityBody = sql.slice(
  sql.lastIndexOf("create or replace function public.get_b1_secure_read_runtime_capability"),
);

describe("PR229 independent secure-draft review remediation", () => {
  test("sequence is contiguous: secure read 21, secure draft 22, remediations 23-24, activation gate 25", () => {
    const manifest = JSON.parse(read("docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json"));
    const entries = manifest.migrations as Array<{
      canonical_id: string;
      sequence_order: number;
      sequence_predecessor: string;
    }>;
    expect(entries.map((entry) => entry.sequence_order)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
    expect(new Set(entries.map((entry) => entry.sequence_order)).size).toBe(entries.length);
    const secureRead = entries.find(
      (entry) => entry.canonical_id === "B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20",
    );
    const secureDraft = entries.find(
      (entry) => entry.canonical_id === "B1-SECURE-DRAFT-MUTATIONS-21",
    );
    expect(secureRead?.sequence_order).toBe(21);
    expect(secureDraft).toMatchObject({
      sequence_order: 22,
      sequence_predecessor: "B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20",
    });
    expect(entries.find((e) => e.sequence_order === 23)?.filename).toContain(
      "TRANSFER-DEPARTMENT-SCOPE",
    );
    expect(entries.find((e) => e.sequence_order === 24)?.filename).toContain(
      "FILE-WITHDRAWAL-IMPACT-ACK",
    );
    expect(manifest.global_policies.activation_gate).toContain("gate 25");
  });

  test("create uses auth identity, active student profile, and backend activation state", () => {
    expect(sql).toContain("v_sp := public.b1_require_active_student_profile()");
    expect(sql).toContain("where sp.user_id = v_uid and sp.status = 'active'");
    expect(sql).toContain("v_type.student_visible is distinct from true");
    expect(sql).toContain("w.request_type_id = v_type.id");
    expect(sql).toContain("and w.status = 'active'");
    expect(sql).toContain("and w.is_active is true");
    expect(sql).not.toMatch(/\bp_(user|student|actor|department)_id\b/i);
  });

  test("save requires a non-null authoritative version and resolves exact retries first", () => {
    const nullGuard = saveBody.indexOf("if p_expected_updated_at is null then");
    const idempotentReturn = saveBody.indexOf(
      "return public.b1_build_student_draft_dto(p_request_id)",
    );
    const staleCompare = saveBody.indexOf(
      "if v_r.updated_at is distinct from p_expected_updated_at then",
    );
    const mutation = saveBody.indexOf("perform public.persist_b1_draft_form_and_details");
    expect(nullGuard).toBeGreaterThan(0);
    expect(idempotentReturn).toBeGreaterThan(nullGuard);
    expect(staleCompare).toBeGreaterThan(idempotentReturn);
    expect(mutation).toBeGreaterThan(staleCompare);
  });

  test("runtime capability preserves secure-read fail-closed behavior", () => {
    expect(capabilityBody).toContain("'available', v_ready_count = 5");
    expect(capabilityBody).toContain("rt.student_visible is true");
    expect(capabilityBody).toContain("'writes_available', case when v_ready_count = 5");
    expect(capabilityBody).not.toContain("'available', true");
    expect(capabilityBody).not.toContain("'viewer'");
  });

  test("strict payload and DTO privacy exclude authority, workflow, money, and storage fields", () => {
    expect(sql).toContain("B1_UNEXPECTED_FORM_FIELD");
    expect(sql).toContain("jsonb_object_keys(p_form)");
    for (const forbidden of [
      "amount",
      "currency",
      "invoice",
      "payment_reference",
      "actor_id",
      "status",
      "updated_at",
      "submitted_at",
      "current_department_id",
    ]) {
      expect(sql).toContain(`p_form ? '${forbidden}'`);
    }
    const contracts = read("src/lib/student-requests/b1-secure-draft/contracts.ts");
    expect(contracts).not.toMatch(
      /^\s*(storage_bucket|storage_object_path|object_key|actorId|actor_id)\??\s*:/m,
    );
  });

  test("server wrappers require the backend version and sanitize unknown errors", () => {
    const functions = read("src/lib/student-requests/b1-secure-draft/functions.ts");
    const rpc = read("src/lib/student-requests/b1-secure-draft/rpc.ts");
    expect(functions).toContain("expectedUpdatedAt: z.string().datetime({ offset: true })");
    expect(rpc).toContain("expectedUpdatedAt: string;");
    expect(rpc).not.toContain('msg.split("\\n")[0]');
    expect(functions).not.toContain("new B1SecureDraftRpcError(error.message)");
    expect(functions).not.toMatch(/actorUserId|studentId|userId|clientTimestamp/);
  });

  test("draft mutations do not submit, create runtime workflow, notify, or touch protected service", () => {
    expect(sql).not.toMatch(/submit_b1_student_request_atomic\s*\(/);
    expect(sql).not.toContain("initialize_b1_request_workflow_strict");
    expect(sql).not.toMatch(/insert\s+into\s+public\.student_request_workflow_steps/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.(notifications|student_request_events)/i);
    expect(sql).not.toContain("enrollment_certificate");
    expect(sql).not.toMatch(/student_visible\s*=/);
  });
});
