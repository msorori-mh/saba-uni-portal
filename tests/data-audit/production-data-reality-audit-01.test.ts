// PORTAL-PRODUCTION-DATA-REALITY-AUDIT-AND-IMPORT-GAP-MATRIX-01
// G9 invariant test suite (spec lines 453-470) for the audit Git deliverables:
//   docs/data/PORTAL-DATA-IMPORT-BACKLOG-01.json            (26 entries BL-001..BL-026)
//   docs/data/PORTAL-PRODUCTION-DATA-AUDIT-READONLY-PACKAGE-01.md (Q-Px-nn SQL blocks)
//   docs/PORTAL-DATA-IMPORT-GAP-MATRIX-01.md
//   docs/PORTAL-DATA-USER-INPUT-REQUIRED-01.md
//   docs/PORTAL-PRODUCTION-DATA-REALITY-AUDIT-AND-IMPORT-GAP-MATRIX-01-REPORT.md (optional)
// Read-only structural tests; never touches a database. Pure ASCII source.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");

const BACKLOG_PATH = join(root, "docs", "data", "PORTAL-DATA-IMPORT-BACKLOG-01.json");
const PACKAGE_PATH = join(root, "docs", "data", "PORTAL-PRODUCTION-DATA-AUDIT-READONLY-PACKAGE-01.md");
const MATRIX_PATH = join(root, "docs", "PORTAL-DATA-IMPORT-GAP-MATRIX-01.md");
const UIR_PATH = join(root, "docs", "PORTAL-DATA-USER-INPUT-REQUIRED-01.md");
const REPORT_PATH = join(
  root,
  "docs",
  "PORTAL-PRODUCTION-DATA-REALITY-AUDIT-AND-IMPORT-GAP-MATRIX-01-REPORT.md",
);

const backlogRaw = readFileSync(BACKLOG_PATH, "utf8");
const backlog = JSON.parse(backlogRaw);
const pkg = readFileSync(PACKAGE_PATH, "utf8");
const matrix = readFileSync(MATRIX_PATH, "utf8");
const uir = readFileSync(UIR_PATH, "utf8");
const reportExists = existsSync(REPORT_PATH);
const report = reportExists ? readFileSync(REPORT_PATH, "utf8") : null;

const entries = backlog.entries as Array<Record<string, any>>;
const ids = entries.map((e) => e.backlog_id as string);
const idSet = new Set(ids);
const byId = new Map(entries.map((e) => [e.backlog_id as string, e]));
const byEntity = new Map(entries.map((e) => [e.entity as string, e]));
const orderOfEntity = (entity: string): number => {
  const e = byEntity.get(entity);
  expect(e, `entry with entity=${entity} must exist`).toBeTruthy();
  return (e as any).import_order as number;
};

// 23 required G7 fields per entry (backlog_id and optional notes excluded).
const REQUIRED_FIELDS = [
  "entity",
  "scope",
  "current_count",
  "expected_count",
  "gap_count",
  "source_file",
  "source_sha256",
  "source_status",
  "importer_status",
  "conflict_count",
  "duplicate_count",
  "missing_required_count",
  "prerequisites",
  "recommended_action",
  "priority",
  "risk",
  "approval_required",
  "import_order",
  "dry_run_required",
  "verification_query",
  "rollback_or_correction_method",
  "final_status",
  "backlog_id",
];

const SOURCE_STATUS_ENUM = ["SOURCE_FILE_READY", "SOURCE_FILE_PARTIAL", "SOURCE_FILE_MISSING"];
const IMPORTER_STATUS_ENUM = ["IMPORTER_READY", "IMPORTER_MISSING", "IMPORTER_GUARDED"];
const FINAL_STATUS_ENUM = [
  "COMPLETE",
  "PARTIAL",
  "MISSING",
  "CONFLICT",
  "DUPLICATED",
  "ORPHANED",
  "SOURCE_FILE_READY",
  "SOURCE_FILE_PARTIAL",
  "SOURCE_FILE_MISSING",
  "IMPORTER_READY",
  "IMPORTER_MISSING",
  "DECISION_REQUIRED",
  "NOT_APPLICABLE",
  "DO_NOT_IMPORT",
];

// SQL blocks of the readonly package.
const sqlBlocks = [...pkg.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => m[1]);
const stripSqlLineComments = (s: string): string =>
  s
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
const stripStringLiterals = (s: string): string => s.replace(/'[^']*'/g, "''");

describe("G9.1 backlog identity and shape", () => {
  test("backlog loads, has 26 entries BL-001..BL-026, and backlog IDs are unique", () => {
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(26);
    expect(idSet.size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^BL-0(0[1-9]|1[0-9]|2[0-6])$/);
    // contiguous 1..26 import_order
    const orders = entries.map((e) => e.import_order as number).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
  });

  test("G9.16 all 23 required fields present per backlog entry", () => {
    expect(REQUIRED_FIELDS.length).toBe(23);
    for (const e of entries) {
      for (const f of REQUIRED_FIELDS) {
        expect(
          Object.prototype.hasOwnProperty.call(e, f),
          `entry ${e.backlog_id} missing field ${f}`,
        ).toBe(true);
      }
    }
  });
});

describe("G9.2 gap counts", () => {
  test("no negative gaps: gap_count is null or >= 0 for every entry", () => {
    for (const e of entries) {
      expect(e.gap_count === null || (typeof e.gap_count === "number" && e.gap_count >= 0)).toBe(
        true,
      );
    }
  });
});

describe("G9.3 dependency graph", () => {
  test("every prerequisite references an existing backlog ID", () => {
    for (const e of entries) {
      expect(Array.isArray(e.prerequisites)).toBe(true);
      for (const p of e.prerequisites as string[]) {
        expect(idSet.has(p), `${e.backlog_id} references missing prerequisite ${p}`).toBe(true);
      }
      expect((e.prerequisites as string[]).includes(e.backlog_id)).toBe(false);
    }
  });

  test("every prerequisite has a strictly lower import_order", () => {
    for (const e of entries) {
      for (const p of e.prerequisites as string[]) {
        const prereq = byId.get(p) as any;
        expect(
          prereq.import_order < e.import_order,
          `${e.backlog_id} (order ${e.import_order}) depends on ${p} (order ${prereq.import_order})`,
        ).toBe(true);
      }
    }
  });

  test("no dependency cycles: topological sort covers all entries", () => {
    const indeg = new Map<string, number>(ids.map((i) => [i, 0]));
    const dependents = new Map<string, string[]>(ids.map((i) => [i, []]));
    for (const e of entries) {
      for (const p of e.prerequisites as string[]) {
        indeg.set(e.backlog_id, (indeg.get(e.backlog_id) ?? 0) + 1);
        dependents.get(p)!.push(e.backlog_id);
      }
    }
    const work = ids.filter((i) => (indeg.get(i) ?? 0) === 0);
    let seen = 0;
    while (work.length) {
      const n = work.pop()!;
      seen++;
      for (const m of dependents.get(n) ?? []) {
        indeg.set(m, (indeg.get(m) ?? 0) - 1);
        if (indeg.get(m) === 0) work.push(m);
      }
    }
    expect(seen).toBe(entries.length);
  });
});

describe("G9.4/G9.5 status enums", () => {
  test("source_status present and valid enum for every entry", () => {
    for (const e of entries) {
      expect(typeof e.source_status).toBe("string");
      expect(SOURCE_STATUS_ENUM).toContain(e.source_status);
    }
  });

  test("importer_status present and valid enum for every entry", () => {
    for (const e of entries) {
      expect(typeof e.importer_status).toBe("string");
      expect(IMPORTER_STATUS_ENUM).toContain(e.importer_status);
    }
  });

  test("final_status present and inside the spec vocabulary for every entry", () => {
    for (const e of entries) {
      expect(typeof e.final_status).toBe("string");
      expect(FINAL_STATUS_ENUM).toContain(e.final_status);
    }
  });
});

describe("G9.6 verification queries", () => {
  test("verification_query present and non-empty for every entry", () => {
    for (const e of entries) {
      expect(typeof e.verification_query).toBe("string");
      expect((e.verification_query as string).trim().length).toBeGreaterThan(0);
      expect(e.verification_query).toMatch(/Q-P[1-6]/);
    }
  });
});

describe("G9.7 readiness vs conflicts", () => {
  test("no READY_TO_IMPORT entry carries conflict_count > 0", () => {
    for (const e of entries) {
      if (e.recommended_action === "READY_TO_IMPORT" || e.final_status === "READY_TO_IMPORT") {
        expect(
          e.conflict_count,
          `${e.backlog_id} is READY_TO_IMPORT with conflict_count=${e.conflict_count}`,
        ).toBe(0);
      }
    }
  });
});

describe("G9.8 account-import hold posture", () => {
  test("no account-import entry is marked ready; HOLD_ACCOUNT_IMPORT documented", () => {
    const accountEntries = entries.filter((e) =>
      (e.entity as string).toLowerCase().includes("account"),
    );
    expect(accountEntries.length).toBeGreaterThan(0);
    for (const e of accountEntries) {
      expect(e.final_status, `${e.backlog_id} final_status must not be READY_TO_IMPORT`).not.toBe(
        "READY_TO_IMPORT",
      );
      expect(
        e.recommended_action,
        `${e.backlog_id} recommended_action must not be READY_TO_IMPORT`,
      ).not.toBe("READY_TO_IMPORT");
    }
    const e14 = byId.get("BL-014") as any;
    expect(e14.entity).toBe("student_accounts_existing_566");
    expect(e14.recommended_action).toBe("HOLD_ACCOUNT_IMPORT");
    expect(matrix).toContain("HOLD_ACCOUNT_IMPORT");
  });
});

describe("G9.9 account import count mismatch / binding rule", () => {
  test("accounts entry documents READY_TO_CREATE == snapshot.unlinked_profiles and its unverifiability", () => {
    const e14 = byId.get("BL-014") as any;
    const blob = JSON.stringify(e14);
    expect(blob).toMatch(/READY_TO_CREATE\s*==+\s*snapshot\.unlinked_profiles/);
    expect(blob).toContain("UNVERIFIED_CHANNEL");
    expect(blob).toMatch(/stale|unverifiable|cannot be reconciled/i);
    // 566 rows vs D-02 unlinked=3 arithmetic mismatch must be visible in the entry
    expect(e14.expected_count).toBe(566);
    expect(blob).toContain("846/843/3");
  });
});

describe("G9.10 critical ordering pairs", () => {
  test("grades after enrollments; plan after courses; student import after academic structure", () => {
    expect(orderOfEntity("student_grades")).toBeGreaterThan(orderOfEntity("student_enrollments"));
    expect(orderOfEntity("study_plans")).toBeGreaterThan(orderOfEntity("courses"));
    expect(orderOfEntity("study_plan_courses_and_prerequisites")).toBeGreaterThan(
      orderOfEntity("courses"),
    );
    for (const structure of [
      "departments",
      "programs",
      "academic_levels",
      "academic_years_semesters",
    ]) {
      expect(orderOfEntity("student_profiles_new_535")).toBeGreaterThan(orderOfEntity(structure));
    }
  });
});

describe("G9.11 no PII in committed outputs", () => {
  const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
  const STUDENTS_DOMAIN = /students\.usr\.edu\.ye/i;
  const YE_PHONE = /(?:^|[^0-9])(?:\+?967[ -]?)?7[01378][0-9]{7}(?![0-9])/;
  const NATIONAL_ID = /(?:^|[^0-9])[0-9]{10,11}(?![0-9])/;
  test("committed docs and JSON contain no email/phone/national-id/students-domain PII", () => {
    const targets: Array<[string, string]> = [
      ["backlog-json", backlogRaw],
      ["readonly-package", pkg],
      ["gap-matrix", matrix],
      ["user-input-required", uir],
    ];
    if (reportExists && report !== null) targets.push(["final-report", report]);
    for (const [name, text] of targets) {
      expect(EMAIL.test(text), `${name} contains an email address`).toBe(false);
      expect(STUDENTS_DOMAIN.test(text), `${name} mentions students.usr.edu.ye`).toBe(false);
      expect(YE_PHONE.test(text), `${name} contains a Yemeni phone number`).toBe(false);
      expect(NATIONAL_ID.test(text), `${name} contains a national-id-like number`).toBe(false);
    }
  });
});

describe("G9.12/G9.13 readonly package SQL safety", () => {
  test("package exposes a full set of sql blocks", () => {
    expect(sqlBlocks.length).toBeGreaterThanOrEqual(150);
  });

  test("no write SQL: zero INSERT/UPDATE/DELETE/MERGE/DDL/TRUNCATE/GRANT/REVOKE/CALL/DO", () => {
    const WRITE =
      /\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i;
    for (const b of sqlBlocks) {
      const code = stripStringLiterals(stripSqlLineComments(b));
      const m = code.match(WRITE);
      expect(m, `write keyword ${m ? m[0] : ""} found in block: ${b.slice(0, 80)}`).toBeNull();
    }
  });

  test("every production query is SELECT-only (block starts with SELECT/WITH after comment stripping)", () => {
    for (const b of sqlBlocks) {
      const code = stripSqlLineComments(b).trim();
      expect(
        /^(SELECT|WITH)\b/i.test(code),
        `block does not start with SELECT/WITH: ${code.slice(0, 80)}`,
      ).toBe(true);
    }
  });
});

describe("G9.14 thirteen-stage minimum order", () => {
  test("import_order honors the spec stage chain where stages have entries", () => {
    const chain: Array<[string, string]> = [
      ["colleges", "programs"], // stage 1 structure corrections before stage 2
      ["departments", "programs"], // stage 2 academic structure
      ["programs", "courses"], // stage 3 courses
      ["courses", "study_plans"], // stage 4 plans
      ["study_plans", "study_plan_courses_and_prerequisites"],
      ["study_plan_courses_and_prerequisites", "student_profiles_new_535"], // stage 5 students
      ["student_profiles_new_535", "faculty_profiles"], // stage 6 faculty/staff
      ["faculty_profiles", "staff_profiles"],
      ["staff_profiles", "student_accounts_existing_566"], // stage 7 accounts
      ["student_accounts_existing_566", "faculty_accounts"],
      ["faculty_accounts", "course_offerings"], // stage 8 offerings/sections
      ["course_offerings", "course_sections"],
      ["course_sections", "teaching_assignments"], // stage 9 assignments
      ["teaching_assignments", "student_enrollments"], // stage 10 enrollments
      ["student_enrollments", "student_grades"], // stage 11 grades
      ["student_grades", "buildings"], // stage 12 rooms/schedules
      ["buildings", "rooms"],
      ["rooms", "class_schedule"],
      ["class_schedule", "administrative_assignments"], // stage 13 admin
    ];
    for (const [a, b] of chain) {
      expect(
        orderOfEntity(a),
        `stage order violated: ${a} (order ${orderOfEntity(a)}) must precede ${b} (order ${orderOfEntity(b)})`,
      ).toBeLessThan(orderOfEntity(b));
    }
  });
});

describe("G9.15 final decision posture", () => {
  test("final decision doc states HOLD_DATA_REALITY_AUDIT_READONLY_CHANNEL_REQUIRED", () => {
    const HOLD = "HOLD_DATA_REALITY_AUDIT_READONLY_CHANNEL_REQUIRED";
    if (reportExists && report !== null) {
      expect(report).toContain(HOLD);
    } else {
      // Report is written concurrently; fall back to the committed decision docs.
      const decisionDocs: Array<[string, string]> = [
        ["gap-matrix", matrix],
        ["user-input-required", uir],
        ["readonly-package", pkg],
      ];
      expect(
        decisionDocs.some(([, text]) => text.includes(HOLD)),
        "no committed decision doc states " + HOLD,
      ).toBe(true);
    }
  });
});
