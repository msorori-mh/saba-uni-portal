// PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01 - structural invariant tests.
// Read-only: asserts the canonical rollout runbook contains the 20 gates in
// order, the 9 separate-approval items, the protected set, the 5 core
// definitions, the prohibitions, the 19-entry B1 sequence, and contains no
// forbidden endorsements. Never touches the database. Pure ASCII by design.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const docPath = join(here, "..", "..", "docs", "PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01.md");
const doc = readFileSync(docPath, "utf8");

const GATES = [
  "GATE-01-SOURCE-MAIN-GREEN",
  "GATE-02-RUNTIME-RELEASE-CANDIDATE",
  "GATE-03-DEPLOYED-SHA-PROOF",
  "GATE-04-D02-READONLY-SNAPSHOT",
  "GATE-05-CHAIR-SEMANTIC-AUDIT",
  "GATE-06-D01-CHAIRS-DECISION",
  "GATE-07-LOG-AUDIT-MIGRATION",
  "GATE-08-B1-SEQUENTIAL-MIGRATIONS",
  "GATE-09-PER-MIGRATION-VERIFIER",
  "GATE-10-PROTECTED-RECORD-CHECKS",
  "GATE-11-SERVICE-VISIBILITY-ACTIVATION",
  "GATE-12-WORKFLOW-ACTIVATION",
  "GATE-13-RPC-AUTHORIZATION-MATRIX",
  "GATE-14-POSITIVE-NEGATIVE-TESTS",
  "GATE-15-E2E",
  "GATE-16-REPORTS-ACTIVATION",
  "GATE-17-STUDENT-ACCOUNTS-PREFLIGHT",
  "GATE-18-CONTROLLED-ACCOUNT-CREATION",
  "GATE-19-POST-IMPORT-VERIFICATION",
  "GATE-20-LAUNCH-SMOKE",
];

const B1_IDS = [
  "B1-LOG-AUDIT-CALL-DISAMBIGUATION-01",
  "B1-ACTOR-AUTHORIZATION-HARDENING-02",
  "B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01",
  "B1-PROCESSING-DOMAINS-EXPANSION-03",
  "B1-ATOMIC-SUBMIT-ACTION-04",
  "B1-ATOMIC-CALLER-RELEASE-EVIDENCE-STAMP-05",
  "B1-EXT-UNI-PAYMENT-CONFIRMATION-06",
  "B1-SECURE-ATTACHMENTS-SOURCE-07",
  "B1-TRUSTED-REFERENCE-VALIDATORS-08",
  "B1-EXCUSED-ABSENCE-VOCABULARY-09",
  "B1-EXCUSED-ABSENCE-DETAIL-10",
  "B1-FILE-WITHDRAWAL-DETAILS-11",
  "B1-TRANSFER-SECURE-ATTACHMENT-12",
  "B1-FINAL-CHANCE-CANONICAL-WRITE-13",
  "B1-DETAIL-RPC-WRITE-BOUNDARIES-14",
  "B1-SERVICE-DETAILS-DISPATCHER-15",
  "B1-FREE-SERVICE-WORKFLOWS-16",
  "B1-EXT-UNI-PAYMENT-WORKFLOWS-17",
  "B1-DETAIL-ACL-CUTOVER-18",
];

const PROTECTED = [
  "SR-20260713-2DE64041",
  "SR-20260715-FEDCB3E1",
  "SR-20260716-26BAD4C8",
  "USR-2026-000001",
  "USR-2026-000002",
  "F2025006",
  "F2025005",
  "F2025004",
];

const ascending = (needles: string[]) => {
  let pos = -1;
  for (const n of needles) {
    const i = doc.indexOf(n);
    expect(i).toBeGreaterThan(pos);
    pos = i;
  }
};

describe("runbook exists and is canonical documentation-only", () => {
  test("title, canonical marker, zero-production-execution stance", () => {
    expect(doc).toContain("PRODUCTION-ROLLOUT-MASTER-RUNBOOK-01");
    expect(doc).toContain("CANONICAL");
    expect(doc).toContain("debf9d041f7c05794f6df33877f1dff91253625e");
    expect(doc).toContain("0e2d25c9a2d7923ce74cfae079b99691d61eb1b6");
  });
});

describe("20 gates present in canonical order", () => {
  test("all 20 gate IDs appear, strictly ascending", () => {
    expect(GATES.length).toBe(20);
    ascending(GATES);
  });
  test("gate table has exactly 20 numbered GATE rows", () => {
    const rows = doc.match(/^\| \d\d \| GATE-\d\d-/gm) ?? [];
    expect(rows.length).toBe(20);
  });
});

describe("9 separate-approval items", () => {
  test("each approval item is listed", () => {
    expect(doc).toContain("1. **Deploy**");
    expect(doc).toContain("2. **Publish**");
    expect(doc).toContain("3. **D-01**");
    expect(doc).toContain("4. **log_audit migration**");
    expect(doc).toMatch(/^5\. \*\*[^\n]*migration[^\n]*B1/m); // every B1 migration separately
    expect(doc).toContain("6. **service activation**");
    expect(doc).toContain("7. **workflow activation**");
    expect(doc).toContain("8. **account creation**");
    expect(doc).toContain("9. **live import**");
  });
});

describe("protected records and identities", () => {
  test("5 explicit records + 3 chair identities all embedded", () => {
    for (const p of PROTECTED) expect(doc).toContain(p);
  });
  test("class-level protections named", () => {
    expect(doc).toContain("enrollment_certificate v2");
    expect(doc).toContain("absence_reason");
    expect(doc).toContain("chance_type");
    expect(doc).toContain("audit_logs");
  });
});

describe("5 core definitions present (incl. canonical AMBIGUOUS)", () => {
  test("definition rows exist", () => {
    for (const d of ["**PASS**", "**HOLD / HOLD_<reason>**", "**PARTIAL**", "**AMBIGUOUS**", "**ROLLBACK_BY_FORWARD**"]) {
      expect(doc).toContain(d);
    }
  });
  test("AMBIGUOUS is defined as an evidence/identity conflict class with PARTIAL-like stop", () => {
    const i = doc.indexOf("**AMBIGUOUS**");
    const window = doc.slice(i, i + 1200);
    expect(window).toMatch(/PARTIAL/);
    expect(window).toMatch(/status_semantics\.allowed_values/);
  });
  test("supporting tokens present", () => {
    for (const t of ["PASS WITH NOTES", "NOT_RUN_FAIL_CLOSED", "NOT_APPLIED", "DEPLOYED_SHA_PROVEN", "HOLD_RELEASE_SHA_UNPROVEN"]) {
      expect(doc).toContain(t);
    }
  });
});

describe("B1 sequence is exactly 19 entries, canonical order", () => {
  test("all 19 canonical_ids appear, strictly ascending inside the sequence table", () => {
    expect(B1_IDS.length).toBe(19);
    const tableStart = doc.indexOf("| # | canonical_id |");
    expect(tableStart).toBeGreaterThan(-1);
    let pos = tableStart;
    for (const id of B1_IDS) {
      const i = doc.indexOf(id, pos);
      expect(i).toBeGreaterThan(pos);
      pos = i;
    }
  });
  test("PREDECESSOR-GUARD-REMEDIATION is entry 3 and ACL-CUTOVER-18 is entry 19", () => {
    expect(doc).toContain("| 3 | B1-RUNTIME-PREDECESSOR-GUARD-REMEDIATION-01 |");
    expect(doc).toContain("| 19 | B1-DETAIL-ACL-CUTOVER-18 |");
    expect(doc).toContain("| 1 | B1-LOG-AUDIT-CALL-DISAMBIGUATION-01 |");
  });
  test("stale 18-count is explicitly superseded (C2 resolution)", () => {
    expect(doc).toContain("| C2 |");
    expect(doc).toMatch(/C2[^\n]*\n?[^\n]*19/);
  });
});

describe("prohibitions section", () => {
  test("mission prohibitions and manifest policy flags present", () => {
    for (const p of [
      "batch_apply_forbidden=true",
      "parallel_apply_forbidden=true",
      "ci_auto_apply_forbidden=true",
      "max_migrations_per_apply_session=1",
      "migration repair",
      "gen_random_uuid()",
      "Get-FileHash",
      "raw-byte",
      "git blob sha256",
      "student_visible",
      "continue-on-error",
    ]) {
      expect(doc).toContain(p);
    }
  });
  test("universal posture PREFLIGHT / APPLY ONE / VERIFY / PROTECTED CHECK / EVIDENCE", () => {
    expect(doc).toContain("PREFLIGHT");
    expect(doc).toContain("APPLY ONE ONLY");
    expect(doc).toContain("VERIFY");
    expect(doc).toContain("PROTECTED RECORD CHECK");
    expect(doc).toContain("RECORD EVIDENCE");
    expect(doc).toContain("stop-on-anything");
  });
});

describe("A-track dependency handled as PENDING, never as existing", () => {
  test("closure report and closure draft referenced as PENDING", () => {
    expect(doc).toContain("docs/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT.md");
    expect(doc).toContain("docs/migration-drafts/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01.sql");
    expect(doc).toContain("docs/migration-drafts/REQUEST-B1-LOG-AUDIT-CALL-DISAMBIGUATION-01.sql");
    const pendings = doc.match(/PENDING/g) ?? [];
    expect(pendings.length).toBeGreaterThanOrEqual(3);
  });
  test("runbook does not assert the closure report exists on main", () => {
    expect(doc).not.toMatch(/LOG-AUDIT-CALL-DISAMBIGUATION-CLOSURE-01-REPORT\.md[^\n]*(merged to main|is on main)/i);
  });
});

describe("conflict-resolution appendix covers all 12 conflicts", () => {
  test("C1..C12 rows present in order", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `| C${i + 1} |`);
    ascending(ids);
  });
});

describe("follow-ups recorded", () => {
  test("F1..F6 items present", () => {
    for (const f of ["- **F1**", "- **F2**", "- **F3**", "- **F4**", "- **F5**", "- **F6**"]) {
      expect(doc).toContain(f);
    }
    expect(doc).toContain("Q3d");
    expect(doc).toContain("PG-verifier");
  });
});

describe("deployed-SHA honesty", () => {
  test("DEPLOYED_SHA is UNKNOWN-until-proven; RC pin recorded", () => {
    expect(doc).toMatch(/DEPLOYED_SHA[^\n]*UNKNOWN|UNKNOWN[^\n]*DEPLOYED_SHA/);
    expect(doc).toContain("PASS_ENDPOINT_LIVE");
    expect(doc).toContain("427b7eb4");
  });
});

describe("forbidden-pattern absence", () => {
  test("no batch-apply / auto-merge / SHA-guess endorsements", () => {
    expect(doc).not.toMatch(/BATCH_APPLY_ALLOWED/);
    expect(doc).not.toMatch(/AUTO_MERGE_ALLOWED/);
    expect(doc).not.toMatch(/DEPLOYED_SHA_ASSUMED/);
    expect(doc).not.toMatch(/batch apply is (allowed|permitted|acceptable)/i);
    expect(doc).not.toMatch(/apply all (19 )?migrations (at once|in one session|in a single session)/i);
    expect(doc).not.toMatch(/down-migrations? (are|is) (allowed|permitted)/i);
    expect(doc).not.toMatch(/skip(s|ped)? (the )?(preflight|verification|verifier)/i);
  });
  test("no secret-like literals", () => {
    const secretish = new RegExp(
      [
        "password\\s*[:=]",
        "api[_-]?key\\s*[:=]",
        "bearer\\s+[a-z0-9._\\-]+",
        "eyJ[a-zA-Z0-9_-]{10,}\\.",
        "postgres(?:ql)?:\\/\\/",
        "DATABASE_URL\\s*=",
        "sb_" + "secret_",
      ].join("|"),
      "i",
    );
    expect(doc).not.toMatch(secretish);
  });
});
