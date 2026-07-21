/**
 * ACADEMIC-DATA-QUALITY-AND-COHORT-LINKING-01 — regression tests.
 *
 *  G-01 (CRITICAL): five validators used an unresolved identifier `sb`
 *       (ReferenceError at runtime) — now they resolve via getImportDb().
 *  G-02 (HIGH): semesters are unique per (academic_year, code); semester
 *       resolution must be year-scoped so rows never link to another
 *       academic year's semester.
 *  G-06 (MEDIUM): imported program must belong to the resolved department.
 *  G-07 (MEDIUM): study-plan semester_code is whitelisted (first/second/
 *       summer + Arabic aliases) instead of free text.
 *
 * Run: bun test tests/imports/import-validators-linking.test.ts
 */
import { describe, expect, it, spyOn } from "bun:test";
import type { LookupMaps } from "../../src/lib/imports/types";
import * as importDb from "../../src/lib/imports/import-db";
import { loadLookups } from "../../src/lib/imports/lookups";
import {
  validateStudents,
  validateStudyPlans,
  validateCourseSections,
  validateStudentFees,
} from "../../src/lib/imports/validators";

// ---------------------------------------------------------------- ids
const DEP_IT = "dep-it-id";
const DEP_CS = "dep-cs-id";
const PROG_IT = "prog-it-id";
const PROG_CS = "prog-cs-id";
const AY_2526 = "ay-2526-id";
const AY_2627 = "ay-2627-id";
const SEM_2526_FIRST = "sem-2526-first-id";
const SEM_2627_FIRST = "sem-2627-first-id";
const LVL1 = "lvl-1-id";
const COURSE_CS101 = "course-cs101-id";
const STUDENT_ID = "student-1-id";

// ---------------------------------------------------------------- helpers
function makeLookups(): LookupMaps {
  return {
    departmentsByName: new Map([["قسم تكنولوجيا المعلومات والاتصالات", DEP_IT]]),
    programsByCode: new Map<string, { id: string; department_id: string | null }>([
      ["it", { id: PROG_IT, department_id: DEP_IT }],
      ["cs", { id: PROG_CS, department_id: DEP_CS }],
    ]),
    levelsByName: new Map(),
    levelsByNumber: new Map([["1", LVL1]]),
    coursesByCode: new Map([["cs101", { id: COURSE_CS101, department_id: null }]]),
    academicYearsByName: new Map([
      ["2025-2026", AY_2526],
      ["2026-2027", AY_2627],
    ]),
    // Legacy global map: simulates the pre-fix collision (last write wins).
    semestersByCode: new Map([["first", SEM_2627_FIRST]]),
    semestersByName: new Map(),
    semestersByYearKey: new Map([
      [`${AY_2526}|first`, SEM_2526_FIRST],
      [`${AY_2627}|first`, SEM_2627_FIRST],
    ]),
  };
}

/**
 * Generic supabase-js-ish mock for import validators.
 * `tables[tableName]` is returned for direct `select()` awaits;
 * `studentsIn` is returned for `.select(...).in("academic_number", ...)`
 * queries on student_profiles.
 */
function mockDb(tables: Record<string, unknown[]>, studentsIn: unknown[] = []) {
  const fake = {
    from: (table: string) => ({
      select: () => {
        const base = Promise.resolve({ data: tables[table] ?? [], error: null });
        return Object.assign(base, {
          in: async () => ({
            data: table === "student_profiles" ? studentsIn : (tables[table] ?? []),
            error: null,
          }),
        });
      },
    }),
  };
  return spyOn(importDb, "getImportDb").mockReturnValue(
    fake as unknown as ReturnType<typeof importDb.getImportDb>,
  );
}

function studentRaw(overrides: Record<string, unknown> = {}) {
  return {
    academic_number: "2600001",
    full_name_ar: "طالب اختبار",
    department_code: "قسم تكنولوجيا المعلومات والاتصالات",
    program_code: "IT",
    academic_level: "1",
    academic_year: "2025-2026",
    semester: "first",
    ...overrides,
  };
}

function planRaw(overrides: Record<string, unknown> = {}) {
  return {
    program_code: "IT",
    plan_name: "خطة اختبار",
    version: "1.0",
    course_code: "CS101",
    level: "1",
    semester: "first",
    required: "true",
    ...overrides,
  };
}

// ---------------------------------------------------------------- G-02
describe("G-02: year-scoped semester resolution", () => {
  it("binds the semester of the row's own academic year (not another year's)", async () => {
    mockDb({ student_profiles: [] });

    const r1 = await validateStudents([studentRaw()], makeLookups());
    expect(r1.invalidRows).toBe(0);
    expect(r1.rows[0]?.parsed?.semester_id).toBe(SEM_2526_FIRST);

    const r2 = await validateStudents(
      [studentRaw({ academic_year: "2026-2027" })],
      makeLookups(),
    );
    expect(r2.invalidRows).toBe(0);
    expect(r2.rows[0]?.parsed?.semester_id).toBe(SEM_2627_FIRST);
  });

  it("rejects a semester code that does not exist within the given year", async () => {
    mockDb({ student_profiles: [] });
    const res = await validateStudents([studentRaw({ semester: "summer" })], makeLookups());
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "semester");
    expect(err?.message).toContain("ضمن السنة الأكاديمية");
  });

  it("falls back to legacy global maps when the year-scoped map is absent", async () => {
    mockDb({ student_profiles: [] });
    const lookups = makeLookups();
    delete lookups.semestersByYearKey;
    const res = await validateStudents([studentRaw()], lookups);
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.semester_id).toBe(SEM_2627_FIRST);
  });

  it("loadLookups builds year-scoped keys for identical codes across years", async () => {
    mockDb({
      departments: [],
      programs: [],
      academic_levels: [],
      courses: [],
      academic_years: [
        { id: AY_2526, name: "2025-2026" },
        { id: AY_2627, name: "2026-2027" },
      ],
      semesters: [
        { id: SEM_2526_FIRST, name: "الفصل الأول", code: "first", academic_year_id: AY_2526 },
        { id: SEM_2627_FIRST, name: "الفصل الأول", code: "first", academic_year_id: AY_2627 },
      ],
    });
    const lookups = await loadLookups();
    expect(lookups.semestersByYearKey?.get(`${AY_2526}|first`)).toBe(SEM_2526_FIRST);
    expect(lookups.semestersByYearKey?.get(`${AY_2627}|first`)).toBe(SEM_2627_FIRST);
  });
});

// ---------------------------------------------------------------- G-06
describe("G-06: program ↔ department coherence", () => {
  it("rejects a program that does not belong to the resolved department", async () => {
    mockDb({ student_profiles: [] });
    const res = await validateStudents(
      [studentRaw({ program_code: "CS" })], // CS belongs to DEP_CS, row says IT dept
      makeLookups(),
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "program_code");
    expect(err?.message).toContain("لا يتبع القسم");
  });

  it("accepts a matching department/program pair", async () => {
    mockDb({ student_profiles: [] });
    const res = await validateStudents([studentRaw()], makeLookups());
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.department_id).toBe(DEP_IT);
    expect(res.rows[0]?.parsed?.program_id).toBe(PROG_IT);
  });
});

// ---------------------------------------------------------------- G-07
describe("G-07: study plan semester_code whitelist", () => {
  it("normalizes Arabic semester aliases to canonical codes", async () => {
    const first = await validateStudyPlans([planRaw({ semester: "الأول" })], makeLookups());
    expect(first.invalidRows).toBe(0);
    expect(first.rows[0]?.parsed?.semester_code).toBe("first");

    const second = await validateStudyPlans([planRaw({ semester: "الثاني" })], makeLookups());
    expect(second.invalidRows).toBe(0);
    expect(second.rows[0]?.parsed?.semester_code).toBe("second");
  });

  it("rejects invalid semester codes instead of storing free text", async () => {
    const res = await validateStudyPlans([planRaw({ semester: "خريف" })], makeLookups());
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "semester");
    expect(err?.message).toContain("رمز الفصل غير صحيح");
  });

  it("defaults to 'first' when semester is empty", async () => {
    const res = await validateStudyPlans([planRaw({ semester: "" })], makeLookups());
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.semester_code).toBe("first");
  });
});

// ---------------------------------------------------------------- G-01
describe("G-01: previously-broken validators resolve via getImportDb", () => {
  it("validateCourseSections resolves its offering (was ReferenceError: sb)", async () => {
    mockDb({
      course_offerings: [
        {
          id: "offering-1-id",
          course_id: COURSE_CS101,
          academic_year_id: AY_2526,
          semester_id: SEM_2526_FIRST,
          program_id: PROG_IT,
          level_id: LVL1,
        },
      ],
      course_sections: [],
      faculty_profiles: [],
    });
    const res = await validateCourseSections(
      [
        {
          course_code: "CS101",
          academic_year: "2025-2026",
          semester: "first",
          program_code: "IT",
          level: "1",
          section_code: "A",
        },
      ],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.course_offering_id).toBe("offering-1-id");
    expect(res.rows[0]?.parsed?.semester_id).toBe(SEM_2526_FIRST);
  });

  it("validateStudentFees binds the semester of the row's own year", async () => {
    mockDb(
      {
        fee_types: [{ id: "fee-type-1-id", code: "TUITION", is_active: true }],
        student_fees: [],
      },
      [{ id: STUDENT_ID, academic_number: "2600001" }],
    );
    const res = await validateStudentFees(
      [
        {
          academic_number: "2600001",
          fee_type_code: "TUITION",
          academic_year: "2025-2026",
          semester: "first",
          amount: 1000,
        },
      ],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.semester_id).toBe(SEM_2526_FIRST);
    expect(res.rows[0]?.parsed?.academic_year_id).toBe(AY_2526);
  });
});
