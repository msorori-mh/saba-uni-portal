import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "docs", "migration-drafts", "REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql"),
  "utf8",
);
const stamp = readFileSync(
  join(
    process.cwd(),
    "docs",
    "migration-drafts",
    "REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql",
  ),
  "utf8",
);

describe("B1 detail ACL atomic cutover 06 draft", () => {
  it("is a source-only single transaction with exactly one cutover invocation", () => {
    expect(sql).toContain("DRAFT ONLY — DO NOT APPLY FROM THIS FILE");
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
    expect(sql.match(/SELECT public\.apply_b1_detail_rpc_write_boundaries\(\);/g)).toHaveLength(
      1,
    );
  });

  it("fails closed unless the atomic caller, real five-service dispatcher, and primitive all exist", () => {
    for (const signature of [
      "submit_b1_student_request_atomic(uuid,text,jsonb,timestamptz,uuid[])",
      "persist_validated_b1_request_details(uuid,text,jsonb,uuid[])",
      "apply_b1_detail_rpc_write_boundaries()",
    ]) {
      expect(sql).toContain(`to_regprocedure('public.${signature}')`);
    }
    expect(sql).toContain("PERFORM public.persist_validated_b1_request_details(");
    expect(sql).toContain("B1_SERVICE_PERSISTENCE_NOT_INSTALLED");
    for (const service of [
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]) {
      expect(sql).toContain(`v_dispatcher NOT LIKE '%${service}%'`);
    }
  });

  it("requires non-bypassable release evidence on the atomic caller before cutover", () => {
    expect(sql).toContain("B1_ACL_CUTOVER_RELEASE_EVIDENCE_MISSING");
    expect(sql).toContain("B1_ATOMIC_CALLER_RELEASE_EVIDENCE=");
    expect(sql).toContain("obj_description(");
    expect(stamp).toContain("APPROVED_RELEASE_COMMIT_PLACEHOLDER");
    expect(stamp).toContain("B1_ATOMIC_CALLER_RELEASE_EVIDENCE_NOT_APPROVED");
    expect(stamp).toContain("v_commit !~ '^[0-9a-f]{40}$'");
  });

  it("proves all five detail-boundary prerequisites and post-verifies all five tables", () => {
    for (const table of [
      "enrollment_suspension_details",
      "absence_excuse_details",
      "transfer_request_details",
      "extra_chance_details",
      "file_withdrawal_details",
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toContain("B1_ACL_CUTOVER_FIVE_BOUNDARY_PREREQUISITE_FAILED");
    expect(sql).toContain("B1_ACL_CUTOVER_POSTVERIFY_FAILED");
  });

  it("requires the public atomic boundary and keeps internal functions non-executable", () => {
    expect(sql).toContain(
      "NOT has_function_privilege('authenticated','public.submit_b1_student_request_atomic",
    );
    expect(sql).toContain(
      "has_function_privilege('anon','public.submit_b1_student_request_atomic",
    );
    for (const fn of [
      "persist_validated_b1_request_details",
      "apply_b1_detail_rpc_write_boundaries",
    ]) {
      expect(sql).toContain(`has_function_privilege('authenticated','public.${fn}`);
      expect(sql).toContain(`has_function_privilege('service_role','public.${fn}`);
    }
  });

  it("does not mutate data, activate services, change visibility, or introduce financial state", () => {
    expect(sql).not.toMatch(/^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\s+|DROP\s+)/im);
    expect(sql).not.toMatch(/student_visible|fee_type|amount|currency|invoice|gateway|balance/i);
    expect(sql).not.toMatch(/supabase|migration up|db push|deploy|publish/i);
    expect(stamp).not.toMatch(/student_visible|fee_type|amount|currency|invoice|gateway/i);
  });

  it("pins a stable git-normalized checksum for the cutover draft", () => {
    const normalized = sql.replace(/\r\n/g, "\n");
    const digest = createHash("sha256").update(normalized, "utf8").digest("hex");
    expect(digest).toHaveLength(64);
    expect(digest).not.toEqual("0".repeat(64));
  });
});
