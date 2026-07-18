import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (name: string) => readFileSync(join(process.cwd(), "docs", "autopilot", name), "utf8");
const queue = read("TASK-QUEUE.md");
const workers = read("ACTIVE-WORKERS.md");
const normalizedWorkers = workers.replace(/\s+/g, " ");
const completed = read("COMPLETED-TASKS.md");
const blocked = read("BLOCKED-TASKS.md");
const graph = read("DEPENDENCY-GRAPH.md");

describe("dynamic queue state reconciliation 02", () => {
  test("records merged source/audit PRs without production completion", () => {
    for (const pr of [146,147,148,150,151,152,153,154,156,157,158,159,160])
      expect(completed).toContain(`PR #${pr}`);
    expect(completed).not.toContain("PR #155 /");
    expect(graph).toContain("Merged migration drafts remain unapplied");
  });
  test("preserves open PR and architectural hold truth", () => {
    const cohortAuditRow = queue.split(/\r?\n/).find((line) =>
      line.startsWith("| PORTAL-COHORT-DELIVERY-GROUP-INTEGRATION-AUDIT-01 |"),
    );
    expect(cohortAuditRow).toBeDefined();
    expect(cohortAuditRow).toContain("`audit/portal-cohort-delivery-group-integration-01`");
    expect(cohortAuditRow).toContain("`d569dda` (`449844a` audit)");
    expect(cohortAuditRow).toContain("Draft #149 OPEN");
    expect(cohortAuditRow).toContain("PASS_AUDIT_COMPLETE / HOLD_OPEN_DRAFT_NOT_MERGED");
    expect(completed).toContain("Draft PR #149 OPEN");
    expect(blocked).toContain("HOLD_OPEN_DRAFT_NOT_MERGED");
    expect(queue).toContain("#155 OPEN");
    expect(queue).toContain("HOLD architectural");
    expect(blocked).toContain("PR #155 is OPEN with an architectural HOLD");
  });
  test("keeps production and visibility gates fail closed", () => {
    for (const gate of ["B1-ACL-CUTOVER-DRAFT-06","B1-PRODUCTION-MIGRATION-SEQUENCE","B1-STUDENT-VISIBILITY-ACTIVATION","PORTAL-DEPLOY-PUBLISH"])
      expect(blocked).toContain(gate);
    expect(graph).toContain("remain fail-closed");
  });
  test("marks only reconciliation active for this cycle", () => {
    expect(workers).toContain("DYNAMIC-QUEUE-STATE-RECONCILIATION-02");
    expect(normalizedWorkers).toContain("sole ACTIVE worker");
    expect(normalizedWorkers).toContain("all three slots are released");
  });
  test("preserves audit-only implementation holds", () => {
    expect(blocked).toContain("HOLD_PENDING_ACADEMIC_DECISIONS");
    expect(blocked).toContain("HOLD_PENDING_GRADUATE_DOMAIN_DECISIONS");
    expect(queue).toContain("#159 MERGED");
    expect(queue).toContain("#160 MERGED");
  });
  test("describes the cohort release blocker using current merged-source truth", () => {
    expect(blocked).toContain("resolver and security source work is merged");
    expect(blocked).toContain("migration drafts remain unapplied");
    expect(blocked).toContain("feature flags remain inactive");
    expect(blocked).not.toContain("no canonical current-term resolver");
  });
});
