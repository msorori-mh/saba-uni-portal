import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const root = process.cwd();
const drafts = join(root, "docs", "migration-drafts");
const report = readFileSync(
  join(root, "docs", "B1-PREFLIGHT-BLOCKERS-SOURCE-REMEDIATION-01-REPORT.md"),
  "utf8",
);
const runbook = readFileSync(
  join(root, "docs", "B1-MIGRATION-PROMOTION-AND-APPLICATION-RUNBOOK-07.md"),
  "utf8",
);
const inventory = readFileSync(
  join(root, "docs", "B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md"),
  "utf8",
);
const manifest = readFileSync(
  join(root, "docs", "B1-RELEASE-CANDIDATE-MANIFEST-01.md"),
  "utf8",
);
const queue = readFileSync(join(root, "docs", "autopilot", "TASK-QUEUE.md"), "utf8");
const adapter = readFileSync(
  join(root, "src", "lib", "student-requests", "request-service-adapter.ts"),
  "utf8",
);
const logAuditDraft = readFileSync(
  join(drafts, "REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql"),
  "utf8",
);
const attachments = readFileSync(
  join(drafts, "STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql"),
  "utf8",
);
const transfer = readFileSync(
  join(drafts, "REQUEST-B1-TRANSFER-SECURE-ATTACHMENT-05A.sql"),
  "utf8",
);

function lfSha(path: string): string {
  const bytes = readFileSync(path)
    .toString("utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

describe("B1 preflight blockers source remediation 01", () => {
  it("records source remediation PASS and keeps production apply gated", () => {
    expect(report).toContain(
      "PASS_B1_PREFLIGHT_BLOCKERS_SOURCE_REMEDIATED_READY_FOR_RELEASE_DEPLOY_GATE",
    );
    expect(report).toContain("B1-PRODUCTION-MIGRATION-SEQUENCE = REQUIRES_USER_APPROVAL");
    expect(report).toContain("DEFERRED_USER_LIFECYCLE_INPUT");
    expect(queue).toContain("REQUIRES_USER_APPROVAL");
    expect(queue).toContain("DEFERRED_USER_LIFECYCLE_INPUT");
  });

  it("uses explicit typed 7-arg log_audit and does not drop overloads", () => {
    expect(logAuditDraft).toContain("B1_LOG_AUDIT_SIX_ARG_MISSING");
    expect(logAuditDraft).toContain("B1_LOG_AUDIT_SEVEN_ARG_MISSING");
    expect(logAuditDraft).not.toMatch(/DROP\s+FUNCTION\s+public\.log_audit/i);
    expect(logAuditDraft).toContain("cancel_official_document");
    expect(logAuditDraft).toContain("'document'::text");
    expect(logAuditDraft).toContain("v_uid::uuid");
    expect(attachments).toMatch(/'student_request_attachment'::text/);
    expect(attachments).toMatch(/v_uid::uuid|auth\.uid\(\)::uuid/);
    expect(attachments).not.toMatch(
      /PERFORM public\.log_audit\('student_request_attachment',/,
    );
    expect(transfer).toMatch(/'student_request_attachment'::text/);
    expect(transfer).toMatch(/v_uid::uuid/);
    expect(lfSha(join(drafts, "REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql"))).toBe(
      "3b8e2cfd90ea4301ba65b86b628d9e39dfe24c355d84f94eca27b3415cd32dab",
    );
  });

  it("orders log_audit before actor hardening and attachments", () => {
    const tableStart = runbook.indexOf("| Order |");
    expect(tableStart).toBeGreaterThan(-1);
    const sequenceTable = runbook.slice(tableStart);
    const logAudit = sequenceTable.indexOf("| 1 | `REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql`");
    const actor = sequenceTable.indexOf("| 2 | `STUDENT-REQUEST-WORKFLOW-ACTOR-AUTHORIZATION-HARDENING.sql`");
    const m302 = sequenceTable.indexOf("| M3 | `B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-02.sql`");
    const attachments = sequenceTable.indexOf(
      "| 7 | `STUDENT-REQUEST-SECURE-ATTACHMENTS-SOURCE-01.sql`",
    );
    expect(logAudit).toBeGreaterThan(-1);
    expect(actor).toBeGreaterThan(logAudit);
    expect(m302).toBeGreaterThan(actor);
    expect(attachments).toBeGreaterThan(m302);
    expect(inventory).toContain("first B1 runtime migration");
    expect(inventory).toContain("a source blocker");
    expect(runbook).toContain("6034c0de0a7a347f576ef8839b730d5c1f1d281ebe74a7ac312266ac92ee2356");
    expect(runbook).toContain("54c1544296374f83bfda9637cfdbd3d3f5f9a9420cb9395daf30034aa4876216");
    expect(runbook).toContain("d80f691c0fd2dd2e403d241f45bc96608f1d3dec74dd6286762732e4632aa284");
  });

  it("keeps RC fail-closed and does not invent stamp SHA", () => {
    expect(manifest).toContain("APPROVED_RELEASE_COMMIT_PLACEHOLDER");
    expect(manifest).toContain("invented value");
    expect(adapter).toContain("runtimeAvailable: false");
    expect(report).toContain("Safe reuse of the current bucket as-is: NO");
    expect(report).toContain("قسم علوم الحاسوب");
    expect(report).toContain("قسم تكنولوجيا المعلومات");
    expect(report).toContain("Deploy/Publish: NO");
  });
});
