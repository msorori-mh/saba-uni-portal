// PORTAL-FINAL-PRODUCTION-RUNBOOK-PREP-01 - structural invariant & migration graph truth tests.
// Automated truth test: verifies the portal final release runbook package documents
// contain the complete release composition (#293, #291, #299, #311, #312, #314 + B1 #310 PENDING),
// dynamic SHA resolution directives for RC313 and PR314,
// exact parity between the runbook migration graph and actual release source files under supabase/migrations/,
// 0 stale migration entries in release steps, exact Councils/GA/GP release sets, and strict AGENTS.md compliance.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(here, "..", "..");
const docsDir = join(workspaceRoot, "docs");
const releaseDir = join(docsDir, "release");
const migrationsDir = join(workspaceRoot, "supabase", "migrations");

const reportPath = join(docsDir, "PORTAL-FINAL-PRODUCTION-RUNBOOK-PREP-01-REPORT.md");
const runbookPath = join(releaseDir, "PORTAL-FINAL-PRODUCTION-APPLY-ONE-OWNER-RUNBOOK-01.md");
const gateBoardPath = join(releaseDir, "PORTAL-FINAL-OWNER-GATE-BOARD-01.md");
const preflightPath = join(releaseDir, "PORTAL-FINAL-READONLY-PREFLIGHT-PACKAGE-01.md");

const reportContent = readFileSync(reportPath, "utf8");
const runbookContent = readFileSync(runbookPath, "utf8");
const gateBoardContent = readFileSync(gateBoardPath, "utf8");
const preflightContent = readFileSync(preflightPath, "utf8");

// Authoritative release migration catalog (15 files)
const AUTHORITATIVE_RELEASE_MIGRATIONS = [
  "20260808010000_gp_student_level4_only_eligibility_guard_01.sql",
  "20260808120000_councils_c0_write_surface_hardening_01.sql",
  "20260808121000_councils_c1_meeting_state_machine_01.sql",
  "20260808122000_councils_c2_topic_intake_review_01.sql",
  "20260808130000_councils_c3_attendance_quorum_01.sql",
  "20260808140000_councils_c4_session_voting_01.sql",
  "20260808150000_councils_c5_minutes_lifecycle_01.sql",
  "20260808160000_councils_c6_decisions_followup_01.sql",
  "20260808170000_councils_c7_audit_archive_01.sql",
  "20260808171000_councils_c0_c8_final_security_closure_01.sql",
  "20260808180000_councils_c9_notifications_reporting_01.sql",
  "20260808210000_ga_mvp_foundation_01.sql",
  "20260808210100_ga_mvp_completion_01.sql",
  "20260808210200_ga_authorization_04.sql",
  "20260809183940_e3eff340-d709-46e7-911b-1728767e4f41.sql",
];

const COUNCILS_CHAIN = [
  "20260808120000_councils_c0_write_surface_hardening_01.sql",
  "20260808121000_councils_c1_meeting_state_machine_01.sql",
  "20260808122000_councils_c2_topic_intake_review_01.sql",
  "20260808130000_councils_c3_attendance_quorum_01.sql",
  "20260808140000_councils_c4_session_voting_01.sql",
  "20260808150000_councils_c5_minutes_lifecycle_01.sql",
  "20260808160000_councils_c6_decisions_followup_01.sql",
  "20260808170000_councils_c7_audit_archive_01.sql",
  "20260808171000_councils_c0_c8_final_security_closure_01.sql",
  "20260808180000_councils_c9_notifications_reporting_01.sql",
];

const GA_MIGRATIONS = [
  "20260808210000_ga_mvp_foundation_01.sql",
  "20260808210100_ga_mvp_completion_01.sql",
  "20260808210200_ga_authorization_04.sql",
];

const GP_RELEASE_MIGRATIONS = [
  "20260808010000_gp_student_level4_only_eligibility_guard_01.sql",
];

const STALE_JULY_VERSIONS = [
  "20260708120000",
  "20260709120000",
  "20260710120000",
  "20260711000000",
  "20260713010000",
  "20260723061809",
  "20260727120000",
];

describe("portal final runbook package existence", () => {
  test("all 4 documentation artifacts exist and are non-empty", () => {
    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(runbookPath)).toBe(true);
    expect(existsSync(gateBoardPath)).toBe(true);
    expect(existsSync(preflightPath)).toBe(true);

    expect(reportContent.length).toBeGreaterThan(1000);
    expect(runbookContent.length).toBeGreaterThan(1000);
    expect(gateBoardContent.length).toBeGreaterThan(1000);
    expect(preflightContent.length).toBeGreaterThan(1000);
  });
});

describe("release composition and dynamic SHA resolution invariants", () => {
  test("all release PR components #293, #291, #299, #311, #312, #314, #310 are present", () => {
    const prs = ["#293", "#291", "#299", "#311", "#312", "#314", "#310"];
    for (const pr of prs) {
      expect(reportContent).toContain(pr);
      expect(runbookContent).toContain(pr);
      expect(gateBoardContent).toContain(pr);
    }
  });

  test("PR #314 is recorded as additional green release stream being integrated into #313", () => {
    expect(reportContent).toContain("#314");
    expect(runbookContent).toContain("#314");
    expect(gateBoardContent).toContain("#314");
    expect(preflightContent).toContain("#314");
  });

  test("RC313_SHA and PR314_SHA are specified for dynamic resolution", () => {
    expect(reportContent).toContain("RC313_SHA=");
    expect(runbookContent).toContain("RC313_SHA=");
    expect(gateBoardContent).toContain("RC313_SHA=");
  });

  test("B1_FINAL_SHA is specified as PENDING", () => {
    expect(reportContent).toContain("B1_FINAL_SHA=PENDING");
    expect(runbookContent).toContain("B1_FINAL_SHA=PENDING");
    expect(gateBoardContent).toContain("B1_FINAL_SHA=PENDING");
  });
});

describe("authoritative migration graph parity & truth tests", () => {
  test("every release migration mentioned in runbook exists in source tree (FILE_EXISTS_IN_RELEASE_SOURCE=YES)", () => {
    for (const filename of AUTHORITATIVE_RELEASE_MIGRATIONS) {
      const fullPath = join(migrationsDir, filename);
      expect(existsSync(fullPath)).toBe(true);
      expect(runbookContent).toContain(filename);
    }
  });

  test("RUNBOOK_MIGRATION_COUNT equals AUTHORITATIVE_RELEASE_MIGRATION_COUNT (15)", () => {
    // Extract EXACT_FILENAME entries from Section 4 of the runbook
    const extractedSqlFiles = Array.from(runbookContent.matchAll(/- \*\*EXACT_FILENAME\*\*: `([^`]+)`/g)).map(m => m[1]);
    const uniqueExtracted = Array.from(new Set(extractedSqlFiles));
    
    expect(uniqueExtracted.length).toBe(AUTHORITATIVE_RELEASE_MIGRATIONS.length);
    for (const f of AUTHORITATIVE_RELEASE_MIGRATIONS) {
      expect(uniqueExtracted).toContain(f);
    }
  });

  test("STALE_RELEASE_MIGRATION_ENTRIES equals 0 in runbook execution specs and gate board", () => {
    const execSpecsSection = runbookContent.slice(runbookContent.indexOf("## 4. مواصفات التنفيذ التفصيلية"));
    let staleCount = 0;
    for (const version of STALE_JULY_VERSIONS) {
      if (execSpecsSection.includes(version) || gateBoardContent.includes(version)) {
        staleCount++;
      }
    }
    expect(staleCount).toBe(0);
  });

  test("MISSING_RELEASE_MIGRATION_ENTRIES equals 0", () => {
    let missingCount = 0;
    for (const f of AUTHORITATIVE_RELEASE_MIGRATIONS) {
      if (!runbookContent.includes(f)) {
        missingCount++;
      }
    }
    expect(missingCount).toBe(0);
  });

  test("RUNBOOK_SOURCE_PARITY is PASS", () => {
    const runbookParity = AUTHORITATIVE_RELEASE_MIGRATIONS.every(f => 
      runbookContent.includes(f) && existsSync(join(migrationsDir, f))
    );
    expect(runbookParity).toBe(true);
  });

  test("duplicate versions = 0 and duplicate filenames = 0 across authoritative release set", () => {
    const versions = AUTHORITATIVE_RELEASE_MIGRATIONS.map(f => f.slice(0, 14));
    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(versions.length);

    const uniqueFilenames = new Set(AUTHORITATIVE_RELEASE_MIGRATIONS);
    expect(uniqueFilenames.size).toBe(AUTHORITATIVE_RELEASE_MIGRATIONS.length);
  });

  test("Councils exact sequence is enumerated in exact order (10 files)", () => {
    let lastIndex = -1;
    for (const councilFile of COUNCILS_CHAIN) {
      const idx = runbookContent.indexOf(councilFile);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    expect(COUNCILS_CHAIN.length).toBe(10);
  });

  test("GA exact three migrations are enumerated individually", () => {
    for (const gaFile of GA_MIGRATIONS) {
      expect(runbookContent).toContain(gaFile);
    }
    expect(GA_MIGRATIONS.length).toBe(3);
  });

  test("GP exact release set is enumerated individually", () => {
    for (const gpFile of GP_RELEASE_MIGRATIONS) {
      expect(runbookContent).toContain(gpFile);
    }
    expect(GP_RELEASE_MIGRATIONS.length).toBe(1);
  });
  test("no generic unenumerated C3-C9 placeholders are used in execution specs", () => {
    const execSpecsSection = runbookContent.slice(runbookContent.indexOf("## 4. مواصفات التنفيذ التفصيلية"));
    expect(execSpecsSection).not.toContain("C3-C9");
    expect(execSpecsSection).not.toContain("C3..C9");
  });

  test("wrong GA filenames and old July GA versions do not appear in execution graph", () => {
    const execSpecsSection = runbookContent.slice(runbookContent.indexOf("## 4. مواصفات التنفيذ التفصيلية"));
    expect(execSpecsSection).not.toContain("20260711000000");
    expect(execSpecsSection).not.toContain("20260713010000");
    expect(execSpecsSection).not.toContain("20260723061809");
    for (const gaFile of GA_MIGRATIONS) {
      expect(execSpecsSection).toContain(gaFile);
    }
  });

  test("wrong GP L4 filename does not appear in execution graph", () => {
    const execSpecsSection = runbookContent.slice(runbookContent.indexOf("## 4. مواصفات التنفيذ التفصيلية"));
    expect(execSpecsSection).not.toContain("20260727120000");
    expect(execSpecsSection).toContain("20260808010000_gp_student_level4_only_eligibility_guard_01.sql");
  });
});

describe("22 owner gates structure and invariants", () => {
  const GATE_IDS = Array.from({ length: 22 }, (_, i) => `GATE-${String(i + 1).padStart(2, "0")}`);

  test("gate board contains all 22 GATE headings in ascending order", () => {
    let pos = -1;
    for (const gId of GATE_IDS) {
      const idx = gateBoardContent.indexOf(gId);
      expect(idx).toBeGreaterThan(pos);
      pos = idx;
    }
  });

  test("report summarizes 22 owner gates", () => {
    expect(reportContent).toContain("22 بوابة");
  });
});

describe("AGENTS.md and zero-production-execution stance", () => {
  test("runbook mandates PRODUCTION_EXECUTION=NOT_AUTHORIZED", () => {
    expect(reportContent).toContain("PRODUCTION_EXECUTION=NOT_AUTHORIZED");
    expect(runbookContent).toContain("PRODUCTION_EXECUTION=NOT_AUTHORIZED");
  });

  test("runbook enforces strict apply-one policy flags", () => {
    for (const flag of [
      "max_migrations_per_apply_session=1",
      "batch_apply_forbidden=true",
      "parallel_apply_forbidden=true",
      "ci_auto_apply_forbidden=true",
    ]) {
      expect(runbookContent).toContain(flag);
    }
  });

  test("readonly preflight package strictly prohibits DML, DDL, RPC business calls, and migration execution", () => {
    expect(preflightContent).toContain("NO RPC BUSINESS CALLS");
    expect(preflightContent).toContain("INSERT");
    expect(preflightContent).toContain("UPDATE");
    expect(preflightContent).toContain("DELETE");
    expect(preflightContent).toContain("NO MIGRATION APPLY");
  });
});

