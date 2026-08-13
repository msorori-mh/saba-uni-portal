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
 *  G-11 (LOW): imported level must not exceed the program's duration years.
 *  G-12 (LOW): study-plan prerequisites must not self-reference or form cycles
 *       (LOW-6: edges come only from otherwise-valid rows — two-pass).
 *  G-13 (LOW): at most one ACTIVE plan version per program — checked against
 *       the DB AND within the file itself (MEDIUM-5, review #193).
 *
 * Run: bun test tests/imports/import-validators-linking.test.ts
 */
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import type { LookupMaps } from "../../src/lib/imports/types";
import * as importDb from "../../src/lib/imports/import-db";
import { loadLookups } from "../../src/lib/imports/lookups";
import {
  validateStudents,
  validateStudyPlans,
  validateCourseSections,
  validateStudentFees,
} from "../../src/lib/imports/validators";

/** Active getImportDb spy — must be restored so later suites see runWithImportDb overrides. */
let activeGetImportDbSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  activeGetImportDbSpy?.mockRestore();
  activeGetImportDbSpy = undefined;
});

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
const LVL2 = "lvl-2-id";
const COURSE_CS101 = "course-cs101-id";
const COURSE_CS102 = "course-cs102-id";
const STUDENT_ID = "student-1-id";

// ---------------------------------------------------------------- helpers
function makeLookups(): LookupMaps {
  return {
    departmentsByName: new Map([["قسم تكنولوجيا المعلومات والاتصالات", DEP_IT]]),
    programsByCode: new Map<string, { id: string; department_id: string | null; years: number | null }>([
      ["it", { id: PROG_IT, department_id: DEP_IT, years: 4 }],
      ["cs", { id: PROG_CS, department_id: DEP_CS, years: 4 }],
    ]),
    levelsByName: new Map(),
    levelsByNumber: new Map([
      ["1", LVL1],
      ["2", LVL2],
    ]),
    coursesByCode: new Map([
      ["cs101", { id: COURSE_CS101, department_id: null }],
      ["cs102", { id: COURSE_CS102, department_id: null }],
    ]),
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
    levelNumberById: new Map([
      [LVL1, 1],
      [LVL2, 2],
    ]),
    programYearsById: new Map([
      [PROG_IT, 4],
      [PROG_CS, 4],
    ]),
  };
}

/**
 * Generic supabase-js-ish mock for import validators.
 * `tables[tableName]` is returned for direct `select()` awaits and for
 * `.select(...).eq(...)` chains (G-13 reads active study_plans this way);
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
          eq: () => base,
        });
      },
    }),
  };
  activeGetImportDbSpy?.mockRestore();
  activeGetImportDbSpy = spyOn(importDb, "getImportDb").mockReturnValue(
    fake as unknown as ReturnType<typeof importDb.getImportDb>,
  );
  return activeGetImportDbSpy;
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
    mockDb({ study_plans: [] });
    const first = await validateStudyPlans([planRaw({ semester: "الأول" })], makeLookups());
    expect(first.invalidRows).toBe(0);
    expect(first.rows[0]?.parsed?.semester_code).toBe("first");

    const second = await validateStudyPlans([planRaw({ semester: "الثاني" })], makeLookups());
    expect(second.invalidRows).toBe(0);
    expect(second.rows[0]?.parsed?.semester_code).toBe("second");
  });

  it("rejects invalid semester codes instead of storing free text", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans([planRaw({ semester: "خريف" })], makeLookups());
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "semester");
    expect(err?.message).toContain("رمز الفصل غير صحيح");
  });

  it("defaults to 'first' when semester is empty", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans([planRaw({ semester: "" })], makeLookups());
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.semester_code).toBe("first");
  });
});

// ---------------------------------------------------------------- G-11
describe("G-11: level must not exceed program duration", () => {
  it("rejects a student row whose level exceeds the program years", async () => {
    mockDb({ student_profiles: [] });
    const lookups = makeLookups();
    lookups.programsByCode.set("it", { id: PROG_IT, department_id: DEP_IT, years: 1 });
    const res = await validateStudents([studentRaw({ academic_level: "2" })], lookups);
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "academic_level");
    expect(err?.message).toContain("يتجاوز عدد سنوات البرنامج");
  });

  it("accepts the same row when the program duration allows it", async () => {
    mockDb({ student_profiles: [] });
    const res = await validateStudents([studentRaw({ academic_level: "2" })], makeLookups());
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.level_id).toBe(LVL2);
  });

  it("rejects a study plan course placed beyond the program years", async () => {
    mockDb({ study_plans: [] });
    const lookups = makeLookups();
    lookups.programsByCode.set("it", { id: PROG_IT, department_id: DEP_IT, years: 1 });
    const res = await validateStudyPlans([planRaw({ level: "2" })], lookups);
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "level");
    expect(err?.message).toContain("يتجاوز عدد سنوات البرنامج");
  });

  it("rejects a course section whose level exceeds the program years", async () => {
    mockDb({
      course_offerings: [],
      course_sections: [],
      faculty_profiles: [],
    });
    const lookups = makeLookups();
    lookups.programsByCode.set("it", { id: PROG_IT, department_id: DEP_IT, years: 1 });
    const res = await validateCourseSections(
      [
        {
          course_code: "CS101",
          academic_year: "2025-2026",
          semester: "first",
          program_code: "IT",
          level: "2",
          section_code: "A",
        },
      ],
      lookups,
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "level");
    expect(err?.message).toContain("يتجاوز عدد سنوات البرنامج");
  });

  it("skips the check when lookups were built without level/program years maps", async () => {
    mockDb({ student_profiles: [] });
    const lookups = makeLookups();
    delete lookups.levelNumberById;
    const res = await validateStudents([studentRaw({ academic_level: "2" })], lookups);
    expect(res.invalidRows).toBe(0);
  });
});

// ---------------------------------------------------------------- G-12
describe("G-12: prerequisite self-reference and cycles", () => {
  it("rejects a course that is its own prerequisite", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans(
      [planRaw({ prerequisite_course_code: "CS101" })],
      makeLookups(),
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "prerequisite_course_code");
    expect(err?.message).toContain("متطلباً سابقاً لنفسه");
  });

  it("rejects a prerequisite cycle within the same plan file", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans(
      [
        planRaw({ course_code: "CS102", prerequisite_course_code: "CS101" }),
        planRaw({ course_code: "CS101", prerequisite_course_code: "CS102" }),
      ],
      makeLookups(),
    );
    expect(res.validRows).toBe(1);
    const err = res.rows[1]?.errors.find((e) => e.column === "prerequisite_course_code");
    expect(err?.message).toContain("دورة");
    expect(res.rows[1]?.parsed).toBeNull();
  });

  it("accepts a linear prerequisite chain", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans(
      [planRaw({ course_code: "CS102", prerequisite_course_code: "CS101" })],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.prerequisite_course_id).toBe(COURSE_CS101);
  });

  it("LOW-6: rows failing for other reasons do not contribute cycle edges", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans(
      [
        // Invalid level — its CS102→CS101 edge must NOT enter the graph.
        planRaw({ course_code: "CS102", prerequisite_course_code: "CS101", level: "9" }),
        planRaw({ course_code: "CS101", prerequisite_course_code: "CS102" }),
      ],
      makeLookups(),
    );
    expect(res.rows[0]?.errors.some((e) => e.column === "level")).toBe(true);
    // Row 2 must NOT be flagged for a cycle — row 1's edge never entered the graph.
    expect(res.rows[1]?.errors.some((e) => e.message.includes("دورة"))).toBe(false);
    expect(res.rows[1]?.parsed).not.toBeNull();
    expect(res.rows[1]?.parsed?.prerequisite_course_id).toBe(COURSE_CS102);
  });
});

// ---------------------------------------------------------------- G-13
describe("G-13: one active plan version per program", () => {
  it("rejects activating a second version while another is active", async () => {
    mockDb({ study_plans: [{ program_id: PROG_IT, version: "1.0" }] });
    const res = await validateStudyPlans([planRaw({ version: "2.0" })], makeLookups());
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "plan_status");
    expect(err?.message).toContain("خطة نشطة أخرى");
  });

  it("allows importing into the currently-active version", async () => {
    mockDb({ study_plans: [{ program_id: PROG_IT, version: "1.0" }] });
    const res = await validateStudyPlans([planRaw({ version: "1.0" })], makeLookups());
    expect(res.invalidRows).toBe(0);
  });

  it("allows a new version as draft while another is active", async () => {
    mockDb({ study_plans: [{ program_id: PROG_IT, version: "1.0" }] });
    const res = await validateStudyPlans(
      [planRaw({ version: "2.0", plan_status: "draft" })],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
  });

  it("MEDIUM-5: rejects a second distinct ACTIVE version inside the same file", async () => {
    mockDb({ study_plans: [] }); // DB has no active plans — the file itself must be coherent
    const res = await validateStudyPlans(
      [planRaw({ version: "1.0" }), planRaw({ version: "2.0" })],
      makeLookups(),
    );
    expect(res.validRows).toBe(1);
    const err = res.rows[1]?.errors.find((e) => e.column === "plan_status");
    expect(err?.message).toContain("إصداراً نشطاً آخر لنفس البرنامج");
  });

  it("MEDIUM-5: allows repeated rows of the SAME active version in one file", async () => {
    mockDb({ study_plans: [] });
    const res = await validateStudyPlans(
      [planRaw({ version: "1.0" }), planRaw({ course_code: "CS102", version: "1.0" })],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
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
          study_system: "عام",
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
