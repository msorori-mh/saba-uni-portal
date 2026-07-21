/**
 * Student Academic Status Importer (G-05) — validator ↔ engine wiring.
 *
 * These tests were originally authored while the engine still returned a
 * notImplemented report for student_academic_status. They locked that report
 * in as the expected behavior. G-05 has since been implemented; the engine
 * assertions are now covered by the dedicated mocked-execution tests in
 * student-academic-status-importer.test.ts.
 *
 * What remains here: the ImportType surface checks (union + zod enum + label)
 * and the wiring guards (dispatcher / actionMap / report-shape) that are
 * still meaningful for the implemented importer.
 *
 * Run: bun test tests/imports/import-validators-linking.test.ts
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_TYPE_LABEL_AR } from "../../src/lib/imports/labels";
import type { ImportType } from "../../src/lib/imports/types";

const ROOT = join(__dirname, "../..");
const readSrc = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// Must stay in sync with the ImportType union in types.ts
const ALL_IMPORT_TYPES = [
  "students",
  "faculty",
  "staff",
  "courses",
  "study_plans",
  "departments",
  "programs",
  "levels",
  "course_sections",
  "student_enrollments",
  "student_grades",
  "student_academic_status",
  "student_fees",
  "student_discounts",
  "student_eligibility",
  "documents",
] as const;

describe("ImportType surface", () => {
  it("types.ts union covers every expected import type", () => {
    const src = readSrc("src/lib/imports/types.ts");
    for (const t of ALL_IMPORT_TYPES) {
      expect(src).toContain(`"${t}"`);
    }
  });

  it("imports.functions.ts zod enum matches the type list (no drift)", () => {
    const src = readSrc("src/lib/imports.functions.ts");
    const m = src.match(/const importTypeSchema = z\.enum\(\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    const enumBody = m![1]!;
    for (const t of ALL_IMPORT_TYPES) {
      expect(enumBody).toContain(`"${t}"`);
    }
    // reverse check: no unknown type present in the enum
    const quoted = [...enumBody.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    expect(quoted.sort()).toEqual([...ALL_IMPORT_TYPES].sort());
  });

  it("IMPORT_TYPE_LABEL_AR covers all types incl. student_academic_status", () => {
    const keys = Object.keys(IMPORT_TYPE_LABEL_AR).sort();
    expect(keys).toEqual([...ALL_IMPORT_TYPES].sort());
    expect(IMPORT_TYPE_LABEL_AR.student_academic_status).toBe("الحالة الأكاديمية للطلاب");
  });
});

describe("G-05 wiring guards (source-level)", () => {
  it("bulk-import-validation.server.ts dispatches student_academic_status to its validator", () => {
    const src = readSrc("src/lib/imports/bulk-import-validation.server.ts");
    const m = src.match(/case "student_academic_status":\s*\n\s*return ([A-Za-z0-9_]+)\(/);
    expect(m).not.toBeNull();
    expect(m![1]).toBe("validateStudentAcademicStatus");
  });

  it("imports.functions.ts routes student_academic_status through the academic role set", () => {
    const src = readSrc("src/lib/imports.functions.ts");
    expect(src).toContain("student_academic_status: ACADEMIC_IMPORT_ROLES");
    expect(src).toMatch(
      /case "student_academic_status":[\s\S]{0,200}?importStudentAcademicStatus\(/,
    );
  });

  it("engine.server.ts actionMap contains student_academic_status", () => {
    const src = readSrc("src/lib/imports/engine.server.ts");
    expect(src).toContain('student_academic_status: "student_academic_status"');
  });

  it("ImportReport shape is preserved (engine uses emptyReport + finalizeImportServer)", () => {
    const src = readSrc("src/lib/imports/engine.server.ts");
    expect(src).toContain("emptyReport");
    expect(src).toContain("finalizeImportServer");
  });
});
