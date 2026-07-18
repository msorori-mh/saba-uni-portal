import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

const root = process.cwd();
const drafts = join(root, "docs", "migration-drafts");
const inventory = readFileSync(
  join(root, "docs", "B1-MIGRATION-INVENTORY-AND-VERIFICATION-PLAN-01.md"),
  "utf8",
);
const report = readFileSync(
  join(root, "docs", "B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01-REPORT.md"),
  "utf8",
);
const queue = readFileSync(join(root, "docs", "autopilot", "TASK-QUEUE.md"), "utf8");
const adapter = readFileSync(
  join(root, "src", "lib", "student-requests", "request-service-adapter.ts"),
  "utf8",
);
const dispatcher = readFileSync(
  join(drafts, "REQUEST-B1-SERVICE-DETAILS-05A.sql"),
  "utf8",
);

function lfSha(path: string): string {
  const bytes = readFileSync(path).toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

const pinned: Array<[string, string]> = [
  [
    "B1-FREE-SERVICE-WORKFLOWS-08.sql",
    "6ae62b5346a21d10a43c88738477f1ecffe57826948d85c9854689debdc4f6f6",
  ],
  [
    "REQUEST-B1-DETAIL-ACL-CUTOVER-06.sql",
    "55f008fa7f516af5da33ea75bb9cfc9cf3b78f6240345c3466fbdbc42cd38383",
  ],
  [
    "REQUEST-B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-01.sql",
    "893a2979bad443b059bf3c0ce2f2b6ad2714dbd9333dd5b332c8c4acc64cf357",
  ],
  [
    "REQUEST-B1-SERVICE-DETAILS-05A.sql",
    "82bab7a52b44dde51c71c12acbdfd3445d08d2d4c24176c66a0b0cc39f99118c",
  ],
];

describe("B1 five-services controlled runtime promotion 01", () => {
  it("holds production apply and records the five-service scope only", () => {
    expect(report).toContain("HOLD_B1_FIVE_SERVICES_RUNTIME_PROMOTION");
    for (const service of [
      "enrollment_suspension",
      "excused_absence",
      "file_withdrawal",
      "department_transfer",
      "final_chance",
    ]) {
      expect(report).toContain(service);
    }
    for (const deferred of [
      "grade_statement_non_graduate",
      "october_exam_entry_form",
      "replacement_student_card",
      "academic_record",
      "grade_statement",
      "graduation_certificate",
    ]) {
      expect(report).toContain(deferred);
      expect(dispatcher).not.toContain(deferred);
    }
    expect(queue).toContain("B1-FIVE-SERVICES-CONTROLLED-RUNTIME-PROMOTION-01");
    expect(queue).toContain("REMAINING-STUDENT-REQUESTS-SOURCE-READINESS-01");
    expect(queue).toContain("DEFERRED_USER_LIFECYCLE_INPUT");
  });

  it("pins LF checksums for free workflows, release stamp, and ACL cutover", () => {
    for (const [file, sha] of pinned) {
      expect(inventory).toContain(sha);
      expect(lfSha(join(drafts, file))).toBe(sha);
    }
  });

  it("keeps adapters fail-closed and free of financial ledger fields", () => {
    expect(adapter).toContain("runtimeAvailable: false");
    expect(adapter).toContain("EXTERNAL_UNIVERSITY_PAYMENT_CONFIRMATION");
    expect(adapter).toContain("FREE_NO_PAYMENT");
    expect(adapter).not.toMatch(/fee_type\.code|invoice|gateway|currency|amount_halalas/i);
    expect(report).toContain("student_visible change: NO");
    expect(report).toContain("Deploy/Publish: NO");
  });
});
