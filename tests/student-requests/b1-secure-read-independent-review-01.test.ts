import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { B1_SECURE_READ_RPCS } from "../../src/lib/student-requests/b1-secure-read/contracts";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const sql = read("docs/migration-drafts/B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-01.sql");
const contracts = read("src/lib/student-requests/b1-secure-read/contracts.ts");
const rpc = read("src/lib/student-requests/b1-secure-read/rpc.ts");
const functions = read("src/lib/student-requests/b1-secure-read/functions.ts");
const verifier = read("tests/b1-secure-read/pg/40-verifier.sql");
const manifest = JSON.parse(read("docs/b1/B1-SEQUENTIAL-APPLY-MANIFEST.json"));

describe("PR227 independent secure-read remediation", () => {
  test("keeps exactly nine authenticated reads and no draft mutation RPC", () => {
    expect(B1_SECURE_READ_RPCS).toHaveLength(9);
    expect(B1_SECURE_READ_RPCS).not.toContain("create_b1_request_draft");
    expect(B1_SECURE_READ_RPCS).not.toContain("save_b1_request_draft");
    expect(functions).toContain("createB1SecureDraftFailClosed");
    expect(functions).toContain("saveB1SecureDraftFailClosed");
  });

  test("runtime readiness is derived, fail-closed, and identity-free", () => {
    const start = sql.indexOf("function public.get_b1_secure_read_runtime_capability");
    const end = sql.indexOf("-- 2) Form options", start);
    const block = sql.slice(start, end);
    expect(block).not.toMatch(/'available'\s*,\s*true/);
    expect(block).not.toContain("'viewer'");
    expect(block).toContain("rt.student_visible is true");
    expect(block).toContain("rt.is_active is true");
    expect(block).toContain("w.status = 'active'");
    expect(block).toContain("w.is_active is true");
    expect(block).toContain("= 1");
    expect(block).toContain("v_ready_count = 5");
  });

  test("student object reads require the active owner profile", () => {
    expect(
      sql.match(/sp\.user_id = v_uid\s+and sp\.status = 'active'/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(verifier).toContain("inactive_student_details_deny");
    expect(verifier).toContain("inactive_student_attachments_deny");
  });

  test("every advertised staff action passes the authoritative action guard", () => {
    expect(sql).toContain("can_current_user_act_on_step(s.id, 'return')");
    expect(sql).toContain("can_current_user_act_on_step(s.id, 'reject')");
    expect(sql).toContain("can_current_user_act_on_step(v_step.id, 'return')");
    expect(sql).toContain("can_current_user_act_on_step(v_step.id, 'reject')");
    expect(sql).toContain("can_current_user_act_on_step(p_step_id, 'return')");
    expect(sql).toContain("can_current_user_act_on_step(p_step_id, 'reject')");
    expect(verifier).toContain("guard_denied_primary_not_advertised");
    expect(verifier).toContain("guard_denied_return_not_advertised");
    expect(verifier).toContain("guard_denied_reject_not_advertised");
  });

  test("public/client DTOs contain no storage coordinates, contacts, or service role metadata", () => {
    for (const source of [contracts, rpc, functions]) {
      expect(source).not.toMatch(
        /^\s*(storage_bucket|storage_object_path|objectPath|object_key)\??\s*:/m,
      );
      expect(source).not.toMatch(/\bservice_role\b|\bemail\b|\bphone\b/i);
    }
    expect(contracts).not.toMatch(/actorId|actorUserId|assignedUserId|completedBy/i);
  });

  test("manifest has a unique secure-read slot before activation gate 22", () => {
    const entries = manifest.migrations as Array<{
      canonical_id: string;
      sequence_order: number;
      dependencies: string[];
    }>;
    const secureRead = entries.find(
      (entry) => entry.canonical_id === "B1-FIVE-SERVICES-SECURE-READ-CONTRACTS-20",
    );
    expect(secureRead?.sequence_order).toBe(21);
    expect(secureRead?.dependencies).toContain("B1-CONFIRM-PAYMENT-PREDECESSOR-GUARD-19");
    expect(new Set(entries.map((entry) => entry.sequence_order)).size).toBe(entries.length);
    expect(manifest.global_policies.activation_gate).toContain("gate 22");
  });

  test("PG17 matrix asserts opaque denials and zero read mutations", () => {
    for (const marker of [
      "student_other_details_deny",
      "admin_unassigned_deny",
      "student_on_staff_rpc_deny",
      "other_student_attachment_deny",
      "B1_READ_ACCESS_DENIED",
      "zero_mutation_assertions",
    ]) {
      expect(verifier).toContain(marker);
    }
    expect(verifier).toContain("workflow_events");
    expect(verifier).toContain("notifications");
  });

  test("enrollment_certificate and existing secure download remain outside this track", () => {
    expect(sql).not.toContain("enrollment_certificate");
    expect(sql).not.toContain("submit_student_request");
    expect(sql).not.toContain("getPublicUrl");
    expect(sql).not.toMatch(/storage\.objects|official_documents|student_documents/);
  });
});
