import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = process.cwd();
const DOC = readFileSync(
  join(root, "docs", "STUDENT-ACCOUNTS-CONTROLLED-PREFLIGHT-PACKAGE-01.md"),
  "utf8",
);

// PII-shaped patterns that must never appear in the package doc.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SECRETISH = new RegExp(
  [
    "password\\s*[:=]",
    "api[_-]?key\\s*[:=]",
    "bearer\\s+[a-z0-9._\\-]+",
    "eyJ[a-zA-Z0-9_-]{10,}\\.",
    "postgres(?:ql)?:\\/\\/",
    "serv" + "ice_role",
    "sb_" + "secret_",
  ].join("|"),
  "i",
);

const ROW_CODES = [
  "ALREADY_LINKED",
  "READY_TO_CREATE",
  "CONFLICT",
  "STUDENT_NOT_FOUND",
  "INVALID_EMAIL",
  "DUPLICATE_IN_FILE",
  "DUPLICATE_ACADEMIC_NUMBER",
  "DUPLICATE_EMAIL",
  "SNAPSHOT_MISMATCH",
];
const BATCH_CODES = ["FILE_CHANGED_AFTER_PREVIEW", "UNAUTHORIZED", "STALE_SNAPSHOT"];

describe("STUDENT-ACCOUNTS-CONTROLLED-PREFLIGHT-PACKAGE-01", () => {
  test("pins D merged reality on main with blob SHAs", () => {
    expect(DOC).toContain("debf9d041f7c05794f6df33877f1dff91253625e");
    expect(DOC).toContain("1b22a37ab525b2020684d7856016ae12c7402f28");
    expect(DOC).toContain("8e33a6fae6a66938168f4ec1b5bf130d7dd6e20a");
    expect(DOC).toContain("61ab7d5bfed67e83eea74dab72b2872b6293820c");
    expect(DOC).toContain("cc8edd0a94cf44281bdadac2aa8b80ee56229502");
    expect(DOC).toContain("2caffb3ee993a38e4ee1e7351b093ea1dfa81c14");
    expect(DOC).toContain("5aa85688f4277856f4e766b69d96749ab5a605d7");
    expect(DOC).toContain("846");
    expect(DOC).toContain("843");
  });

  test("carries the 12 contracted classification codes and the binding rule", () => {
    for (const code of [...ROW_CODES, ...BATCH_CODES]) {
      expect(DOC).toContain(code);
    }
    expect(DOC).toContain("BINDING_RULE_VIOLATION");
    expect(DOC).toContain("snapshot.unlinked_profiles");
  });

  test("decision is HOLD and is justified by 566 vs 3", () => {
    expect(DOC).toContain("566");
    expect(DOC).toMatch(/566\s*(!=|≠)\s*3/);
    expect(DOC).toContain("HOLD");
    expect(DOC).toContain("EVIDENCE — HOLD");
    expect(DOC).toContain("decision               : HOLD");
    // GO appears only as a conditional/future template, never as current decision.
    expect(DOC).toContain("GO");
  });

  test("ten GO conditions present with deployed-SHA proof PENDING on F/PR #205", () => {
    expect(DOC).toContain("PENDING");
    expect(DOC).toContain("PR #205");
    expect(DOC).toContain('meta[name="build-sha"]');
    expect(DOC).toContain("/version.json");
    expect(DOC).toContain("UNVERIFIABLE");
    // F must not be cited as already on main ("not merged" is allowed, "is merged" is not).
    expect(DOC).not.toMatch(/PR #205[^\n]*(?<!not )merged/i);
  });

  test("snapshot contract: 15-minute TTL, snapshot hash, auth scan cap 20x200", () => {
    expect(DOC).toContain("snapshot_hash");
    expect(DOC).toContain("15");
    expect(DOC).toContain("4000");
    expect(DOC).toContain("STALE_SNAPSHOT");
  });

  test("roles gate and dry-run and file-hash stability are enforced", () => {
    expect(DOC).toContain("system_admin");
    expect(DOC).toContain("DRY_RUN_MISSING");
    expect(DOC).toContain("FILE_CHANGED_AFTER_PREVIEW");
    expect(DOC).toContain("file_hash");
    expect(DOC).toContain('previewBulkImportValidation("student_accounts", rawRows)');
  });

  test("no PII-shaped content, no secrets, docs-only scope", () => {
    expect(DOC).not.toMatch(EMAIL);
    expect(DOC).not.toMatch(SECRETISH);
    expect(DOC).toContain("docs-only");
  });
});
