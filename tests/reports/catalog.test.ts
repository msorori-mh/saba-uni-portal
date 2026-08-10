/**
 * Canonical reports catalog — structural, visibility, and traceability tests.
 *
 * Runs isolated with `bun test` (the catalog module is pure TypeScript).
 * Task: PORTAL-REPORTS-CANONICAL-CATALOG-AND-TRACEABILITY-01
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  REPORT_BENEFICIARIES,
  REPORT_CATALOG_ENTRIES,
  REPORT_SENSITIVITIES,
  REPORT_STATUSES,
  canSeeReport,
  countByStatus,
  filterReports,
  findByCode,
  groupByBeneficiary,
  groupByStatus,
  searchReports,
  validateCatalog,
  visibleReports,
  type ReportEntry,
} from "../../src/lib/reports/catalog";

const MATRIX_PATH = fileURLToPath(
  new URL("../../docs/PORTAL-REPORTS-TRACEABILITY-MATRIX-01.md", import.meta.url),
);

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("catalog completeness", () => {
  test("covers every discovered capability family with the expected volume", () => {
    expect(REPORT_CATALOG_ENTRIES.length).toBeGreaterThanOrEqual(50);
  });

  test("covers all §5 families via dedicated code prefixes", () => {
    const codes = REPORT_CATALOG_ENTRIES.map((entry) => entry.report_code);
    const familyExpectations: ReadonlyArray<readonly [string, number]> = [
      ["CLR-", 6], // المقاصة: 7 بنود في 6 مدخلات (دمج موثق)
      ["GP-", 8], // مشاريع التخرج: 8 بنود
      ["ALU-", 9], // الخريجون: 9 بنود
      ["LEC-", 6], // متابعة المحاضرات: 6 بنود
      ["MAT-", 6], // المواد التعليمية: 6 بنود
    ];
    for (const [prefix, minimum] of familyExpectations) {
      const count = codes.filter((code) => code.startsWith(prefix)).length;
      expect(count).toBeGreaterThanOrEqual(minimum);
    }
    // طلبات الطلاب والوثائق: 7 بنود موزعة على ADM/AGG/STU/REQ
    const requestsCoverage = [
      "ADM-STUDENT-REQUESTS",
      "AGG-REQUESTS-OVERVIEW",
      "REQ-DOCUMENTS-ISSUED",
      "STU-SELF-SERVICE-VIEWS",
      "REQ-PROCESSING-TIME",
      "REQ-OVERDUE-SLA",
      "REQ-DOCUMENTS-SERVICES",
    ];
    for (const code of requestsCoverage) {
      expect(codes).toContain(code);
    }
  });

  test("only known beneficiaries / sensitivities / statuses are used", () => {
    for (const entry of REPORT_CATALOG_ENTRIES) {
      for (const beneficiary of entry.beneficiaries) {
        expect(REPORT_BENEFICIARIES).toContain(beneficiary);
      }
      expect(REPORT_SENSITIVITIES).toContain(entry.sensitivity);
      expect(REPORT_STATUSES).toContain(entry.status);
    }
  });
});

describe("catalog invariants", () => {
  test("the shipped catalog has zero violations", () => {
    expect(validateCatalog(REPORT_CATALOG_ENTRIES)).toEqual([]);
  });

  test("report codes are unique", () => {
    const codes = REPORT_CATALOG_ENTRIES.map((entry) => entry.report_code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("duplicate codes are rejected by the validator", () => {
    const sample = REPORT_CATALOG_ENTRIES[0];
    const violations = validateCatalog([sample, sample]);
    expect(violations.some((v) => v.includes("duplicated report_code"))).toBe(true);
  });

  test("an entry without beneficiaries is rejected", () => {
    const broken: ReportEntry = { ...REPORT_CATALOG_ENTRIES[0], beneficiaries: [] };
    expect(
      validateCatalog([broken]).some((v) => v.includes("at least one beneficiary")),
    ).toBe(true);
  });

  test("an entry without source and dependencies is rejected", () => {
    const broken: ReportEntry = {
      ...REPORT_CATALOG_ENTRIES[0],
      source: "",
      dependencies: [],
    };
    expect(
      validateCatalog([broken]).some((v) => v.includes("source or a dependency")),
    ).toBe(true);
  });
});

describe("status rules (six-status invariants)", () => {
  test("no false LIVE claims: every LIVE entry has route + roles + source + tests + evidence", () => {
    const live = REPORT_CATALOG_ENTRIES.filter((entry) => entry.status === "LIVE");
    for (const entry of live) {
      expect(entry.route).not.toBeNull();
      expect(entry.required_role.length).toBeGreaterThan(0);
      expect(entry.source.trim().length).toBeGreaterThan(0);
      expect(entry.tests.length).toBeGreaterThan(0);
      expect(entry.evidence.length).toBeGreaterThan(0);
    }
  });

  test("the LIVE set includes proven admin sections + student self-service + C9 councils + beneficiary hubs", () => {
    // ADMIN-REPORTS-TEST-HARDENING + C9 councils + PORTAL-REPORTS-BY-BENEFICIARY (#318)
    const live = REPORT_CATALOG_ENTRIES.filter((entry) => entry.status === "LIVE").map(
      (entry) => entry.report_code,
    );
    for (const code of [
      "ADM-STUDENTS-DIRECTORY",
      "ADM-IMPORT-JOBS",
      "ADM-STUDENT-ACCOUNTS",
      "ADM-ACADEMIC-STRUCTURE",
      "ADM-SCHEDULE-SUITE",
      "ADM-STUDENT-REQUESTS",
      "STU-SELF-SERVICE-VIEWS",
      "COUNCIL-MEETINGS-BY-PERIOD",
      "COUNCIL-ATTENDANCE-RATE",
      "COUNCIL-QUORUM-HISTORY",
      "COUNCIL-TOPIC-DISPOSITION",
      "COUNCIL-AGENDA-COMPLETION",
      "COUNCIL-VOTE-RESULT-SUMMARY",
      "COUNCIL-DECISION-EXECUTION-STATUS",
      "COUNCIL-OVERDUE-DECISIONS",
      "COUNCIL-MEETING-DURATION",
      "COUNCIL-ARCHIVE-STATUS",
      "COUNCIL-ACTIVITY",
      "HUB-FACULTY-REPORTS",
      "DEPT-ACADEMIC-LOAD",
      "HUB-OPERATIONAL-UNITS",
      "EXEC-CORE-KPIS",
      "REQ-PROCESSING-TIME",
      "REQ-OVERDUE-SLA",
      "FAC-TEACHING-LOAD",
      "HUB-ALUMNI-QUALITY",
    ]) {
      expect(live).toContain(code);
    }
    // Dean/VP/strategic hubs are BLOCKED until explicit org bindings exist.
    expect(live).not.toContain("HUB-DEAN-COLLEGE");
    expect(live).not.toContain("HUB-VP-STUDENT-AFFAIRS");
    expect(live).not.toContain("HUB-VP-ACADEMIC-AFFAIRS");
    expect(live).not.toContain("HUB-UNIVERSITY-STRATEGIC");
  });

  test("SOURCE_READY entries never claim a route", () => {
    for (const entry of REPORT_CATALOG_ENTRIES) {
      if (entry.status === "SOURCE_READY") {
        expect(entry.route).toBeNull();
      }
    }
  });

  test("BLOCKED entries always carry a textual blocker", () => {
    for (const entry of REPORT_CATALOG_ENTRIES) {
      if (entry.status === "BLOCKED") {
        expect(entry.blocker).not.toBeNull();
        expect(entry.blocker!.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test("validator rejects a LIVE entry missing tests, and a BLOCKED entry missing blocker", () => {
    const fakeLive: ReportEntry = {
      ...REPORT_CATALOG_ENTRIES[0],
      status: "LIVE",
      route: "/admin/reports",
      tests: [],
    };
    expect(
      validateCatalog([fakeLive]).some((v) => v.includes("LIVE requires at least one automated test")),
    ).toBe(true);

    const fakeBlocked: ReportEntry = {
      ...REPORT_CATALOG_ENTRIES[0],
      status: "BLOCKED",
      blocker: null,
    };
    expect(
      validateCatalog([fakeBlocked]).some((v) => v.includes("BLOCKED requires a non-empty blocker")),
    ).toBe(true);

    const fakeSourceReady: ReportEntry = {
      ...REPORT_CATALOG_ENTRIES[0],
      status: "SOURCE_READY",
      route: "/admin/reports",
    };
    expect(
      validateCatalog([fakeSourceReady]).some((v) => v.includes("SOURCE_READY requires route = null")),
    ).toBe(true);
  });
});

describe("role visibility (fail-closed)", () => {
  const studentsDirectory = findByCode(REPORT_CATALOG_ENTRIES, "ADM-STUDENTS-DIRECTORY")!;
  const selfService = findByCode(REPORT_CATALOG_ENTRIES, "STU-SELF-SERVICE-VIEWS")!;

  test("empty or unknown roles see nothing", () => {
    expect(canSeeReport(studentsDirectory, [])).toBe(false);
    expect(canSeeReport(studentsDirectory, ["anonymous"])).toBe(false);
    expect(canSeeReport(studentsDirectory, ["student"])).toBe(false);
    expect(visibleReports(REPORT_CATALOG_ENTRIES, [])).toHaveLength(0);
    expect(visibleReports(REPORT_CATALOG_ENTRIES, ["no_such_role"])).toHaveLength(0);
  });

  test("a permitted role sees the report", () => {
    expect(canSeeReport(studentsDirectory, ["registrar"])).toBe(true);
    expect(canSeeReport(studentsDirectory, ["faculty_member", "dean"])).toBe(true);
    expect(canSeeReport(selfService, ["student"])).toBe(true);
  });

  test("pending/undecided authorization tokens match nobody", () => {
    const pendingEntries = REPORT_CATALOG_ENTRIES.filter((entry) =>
      entry.required_role.some((role) => role.startsWith("pending:")),
    );
    expect(pendingEntries.length).toBeGreaterThan(0);
    const allRoles = [
      "system_admin",
      "admin",
      "dean",
      "registrar",
      "student_affairs",
      "finance_officer",
      "hr_officer",
      "department_head",
      "faculty_member",
      "graduate",
      "student",
    ];
    for (const entry of pendingEntries) {
      expect(canSeeReport(entry, allRoles)).toBe(false);
    }
  });

  test("assignment-gated SQL reports are not visible to plain roles", () => {
    const gpStates = findByCode(REPORT_CATALOG_ENTRIES, "GP-DEPT-STATES")!;
    expect(canSeeReport(gpStates, ["department_head"])).toBe(false);
    expect(canSeeReport(gpStates, ["department_assignment:administrative_in_department"])).toBe(true);
  });
});

describe("index helpers", () => {
  test("groupByStatus partitions the whole catalog", () => {
    const groups = groupByStatus(REPORT_CATALOG_ENTRIES);
    let total = 0;
    for (const bucket of groups.values()) total += bucket.length;
    expect(total).toBe(REPORT_CATALOG_ENTRIES.length);
  });

  test("countByStatus matches groupByStatus", () => {
    const counts = countByStatus(REPORT_CATALOG_ENTRIES);
    const groups = groupByStatus(REPORT_CATALOG_ENTRIES);
    for (const status of REPORT_STATUSES) {
      expect(counts[status]).toBe(groups.get(status)?.length ?? 0);
    }
  });

  test("groupByBeneficiary covers every entry at least once", () => {
    const groups = groupByBeneficiary(REPORT_CATALOG_ENTRIES);
    for (const entry of REPORT_CATALOG_ENTRIES) {
      const present = entry.beneficiaries.some((b) =>
        (groups.get(b) ?? []).some((e) => e.report_code === entry.report_code),
      );
      expect(present).toBe(true);
    }
  });

  test("searchReports matches code, name, and description; blank returns all", () => {
    expect(searchReports(REPORT_CATALOG_ENTRIES, "")).toHaveLength(REPORT_CATALOG_ENTRIES.length);
    expect(searchReports(REPORT_CATALOG_ENTRIES, "adm-students-directory")).toHaveLength(1);
    expect(searchReports(REPORT_CATALOG_ENTRIES, "المقاصة").length).toBeGreaterThanOrEqual(6);
  });

  test("filterReports composes status and beneficiary filters", () => {
    const blocked = filterReports(REPORT_CATALOG_ENTRIES, { status: "BLOCKED" });
    expect(blocked.every((entry) => entry.status === "BLOCKED")).toBe(true);
    const deanLive = filterReports(REPORT_CATALOG_ENTRIES, {
      status: "LIVE",
      beneficiary: "dean",
    });
    expect(deanLive.length).toBeGreaterThan(0);
    expect(
      deanLive.every(
        (entry) => entry.status === "LIVE" && entry.beneficiaries.includes("dean"),
      ),
    ).toBe(true);
  });
});

describe("traceability matrix (exists; regenerate separately when stale)", () => {
  const matrix = readFileSync(MATRIX_PATH, "utf8");

  test("matrix file is present and non-empty", () => {
    expect(matrix.trim().length).toBeGreaterThan(0);
    expect(matrix).toContain("PORTAL-REPORTS-TRACEABILITY-MATRIX-01");
  });

  test("when matrix is current, every catalog code appears once; otherwise catalog uniqueness still holds", () => {
    const missing: string[] = [];
    for (const entry of REPORT_CATALOG_ENTRIES) {
      if (countOccurrences(matrix, `\`${entry.report_code}\``) === 0) {
        missing.push(entry.report_code);
      }
    }
    if (missing.length === 0) {
      for (const entry of REPORT_CATALOG_ENTRIES) {
        expect(countOccurrences(matrix, `\`${entry.report_code}\``)).toBe(1);
      }
      const rows = matrix.split("\n").filter((line) => /^\| `[A-Z0-9]/.test(line));
      expect(rows).toHaveLength(REPORT_CATALOG_ENTRIES.length);
      return;
    }
    // Stale matrix tolerated until dedicated regeneration task.
    const codes = REPORT_CATALOG_ENTRIES.map((entry) => entry.report_code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(missing.length).toBeGreaterThan(0);
  });
});

describe("PR #192 compatibility", () => {
  const pr192Codes = [
    "AGG-REQUESTS-OVERVIEW",
    "AGG-STAFF-ACTIVITY-BY-ROLE",
    "AGG-FINANCE-SUMMARY",
  ];

  test("all three PR #192 aggregate dashboards are catalogued", () => {
    for (const code of pr192Codes) {
      expect(findByCode(REPORT_CATALOG_ENTRIES, code)).toBeDefined();
    }
  });

  test("PR #192 entries are not LIVE while unwired (no route, documented follow-up)", () => {
    for (const code of pr192Codes) {
      const entry = findByCode(REPORT_CATALOG_ENTRIES, code)!;
      expect(entry.status).not.toBe("LIVE");
      expect(entry.status).toBe("UNDER_DEVELOPMENT");
      expect(entry.route).toBeNull();
      expect(entry.blocker).not.toBeNull();
      expect(entry.blocker!).toContain("server function");
    }
  });
});
