import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const MIGRATION = "docs/migration-drafts/B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01.sql";
const PREFLIGHT = "docs/migration-drafts/B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01-PREFLIGHT.sql";
const POST = "docs/migration-drafts/B1-DRAFT-SAVE-RETURNED-STATUS-PARITY-01-POST-VERIFIER.sql";

const read = (p: string) => readFileSync(p, "utf8");

describe("B1 draft-save returned-status parity migration source", () => {
  it("is source only and forward only", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("SOURCE ONLY — NOT APPLIED");
    expect(sql.toLowerCase()).not.toContain("drop function");
    expect(sql.toLowerCase()).not.toContain("delete from");
    expect(sql.toLowerCase()).not.toContain("truncate");
    expect(sql.toLowerCase()).not.toContain("update public.student_requests");
  });

  it("allows exactly draft, returned and returned_for_completion", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("not in ('draft','returned','returned_for_completion')");
    for (const denied of [
      "submitted",
      "in_review",
      "completed",
      "rejected",
      "cancelled",
      "archived",
    ]) {
      // Denied statuses are never added to the allow list.
      expect(sql).not.toContain(`'${denied}'`);
    }
  });

  it("keeps ownership, stale-version and opaque-deny invariants asserted", () => {
    const post = read(POST);
    for (const marker of [
      "b1_deny_draft_mutation",
      "B1_STALE_REQUEST_VERSION",
      "b1_require_active_student_profile",
      "b1_assert_draft_allowlist",
    ]) {
      expect(post).toContain(marker);
    }
    expect(post).toContain("anon");
    expect(post).toContain("authenticated");
  });

  it("ships a read-only preflight and post-verifier", () => {
    for (const file of [PREFLIGHT, POST]) {
      const sql = read(file);
      expect(sql).toContain("-- READ ONLY");
      expect(sql.trim().endsWith("ROLLBACK;")).toBe(true);
    }
  });

  it("refuses ambiguous or already-applied replacement", () => {
    const sql = read(MIGRATION);
    expect(sql).toContain("AMBIGUOUS_STATUS_GATE");
    expect(sql).toContain("ALREADY_APPLIED");
  });
});
