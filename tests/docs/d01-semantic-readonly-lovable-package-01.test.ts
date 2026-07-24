import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const doc = readFileSync(
  join(root, "docs", "D01-SEMANTIC-READONLY-LOVABLE-EXECUTION-PACKAGE-01.md"),
  "utf8",
).replace(/\r\n/g, "\n");
const audit = readFileSync(
  join(root, "docs", "migration-drafts", "DEPARTMENT-CHAIRS-SEMANTIC-AUDIT-READONLY-01.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

const RESULT_CODES = [
  "MATCHED",
  "MISSING",
  "DUPLICATE",
  "WRONG_UNIT",
  "WRONG_IDENTITY",
  "INACTIVE",
  "AMBIGUOUS",
];

const NINE_COLUMNS = [
  "expected_academic_number",
  "matched_profile_count",
  "active_assignment_count",
  "semantic_position",
  "wrong_unit_count",
  "duplicate_count",
  "inactive_assignment_count",
  "expired_window_count",
  "final_classification",
];

describe("D01-SEMANTIC-READONLY-LOVABLE-EXECUTION-PACKAGE-01", () => {
  test("embeds the approved audit SQL byte-for-byte", () => {
    const blocks = [...doc.matchAll(/```sql\n([\s\S]*?)```/g)].map((b) => b[1]);
    const embedded = blocks.find((b) => b.includes("SHARED:CLASSIFICATION_BODY"));
    expect(embedded).toBeDefined();
    expect(embedded).toBe(audit);
  });

  test("declares all seven result codes and keeps the raw 8-class audit mapping", () => {
    for (const code of RESULT_CODES) {
      expect(doc).toContain(code);
    }
    expect(doc).toContain("EXPIRED");
  });

  test("covers the nine required output columns", () => {
    for (const col of NINE_COLUMNS) {
      expect(doc).toContain(col);
    }
  });

  test("pins the audited source blob and forbids chair-substring matching", () => {
    expect(doc).toContain("72fad14644249e32fc3a1de24c77102c462b3245");
    expect(doc).not.toMatch(/ilike\s+'%chair%'/i);
    expect(doc).not.toMatch(/[^a-z]like\s+'%chair%'/i);
    expect(doc).not.toMatch(/position_title\s+ilike/i);
  });

  test("guards readonly scope: not executed, no D-01 run, PACKAGE-02 hold, Lovable channel", () => {
    expect(doc).toContain("D01_LOVABLE_AUDIT_NOT_EXECUTED");
    expect(doc).toContain("D01_LOVABLE_AUDIT_COMPLETE");
    expect(doc).toContain("PACKAGE-02");
    expect(doc).toContain("Lovable");
    expect(doc).toContain("debf9d041f7c05794f6df33877f1dff91253625e");
  });

  test("doc hygiene: no trailing whitespace and final newline", () => {
    expect(doc).not.toMatch(/[ \t]+\n/);
    expect(doc.endsWith("\n")).toBe(true);
  });
});
