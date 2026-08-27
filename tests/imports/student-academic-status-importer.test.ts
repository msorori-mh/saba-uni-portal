/**
 * ACADEMIC-STATUS-IMPORTER-01 (G-05) — student_academic_status importer tests.
 *
 * Validator:
 *  - resolves the semester strictly within the row's academic year (G-02 pattern
 *    via resolveSemesterId / semestersByYearKey) — two years can share code "first".
 *  - defaults enrollment_status to "enrolled", validates against the whitelist.
 *  - detects file duplicates and existing DB rows (updateExisting gate).
 *  - G-11: level must not exceed the student's program duration.
 *
 * Engine (importStudentAcademicStatus):
 *  - batch atomicity (ذرّية الدفعة): ALL new rows go in ONE insert statement and
 *    ALL updates in ONE upsert statement (onConflict = the table's UNIQUE key);
 *    a statement failure fails the whole group with a batch-level error.
 *  - no silent field loss: every parsed field appears in the write payload.
 *  - dry run performs zero DB writes (structDryRun).
 *
 * Run: bun test tests/imports/student-academic-status-importer.test.ts
 */
import { afterEach, describe, expect, it, mock, beforeAll, beforeEach, spyOn } from "bun:test";
import type { LookupMaps, ValidatedRow } from "../../src/lib/imports/types";
import * as importDb from "../../src/lib/imports/import-db";
import {
  validateStudentAcademicStatus,
  type StudentAcademicStatusRow,
} from "../../src/lib/imports/validators";

let activeGetImportDbSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  activeGetImportDbSpy?.mockRestore();
  activeGetImportDbSpy = undefined;
});

process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const mockFrom = mock((_table: string) => ({}));
const mockRpc = mock(async () => ({ data: null, error: null }));

// bun runs test files in ONE process without module isolation: the lazy
// supabase client in client.server.ts is created once and cached across files,
// so per-file createClient mocks collide in full-suite runs. All import-test
// files therefore delegate through a shared globalThis handler that each file
// installs in beforeEach — last writer wins, per test.
const FROM_HANDLER_KEY = "__sabaImportTestFromHandler";
const RPC_HANDLER_KEY = "__sabaImportTestRpcHandler";
type FromHandler = (table: string) => unknown;
type RpcHandler = (...args: unknown[]) => unknown;
function setFromHandler(handler: FromHandler) {
  (globalThis as Record<string, unknown>)[FROM_HANDLER_KEY] = handler;
}
function setRpcHandler(handler: RpcHandler) {
  (globalThis as Record<string, unknown>)[RPC_HANDLER_KEY] = handler;
}

mock.module("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const handler = (globalThis as Record<string, FromHandler | undefined>)[FROM_HANDLER_KEY];
      if (!handler) throw new Error("test from-handler not installed");
      return handler(table);
    },
    rpc: (...args: unknown[]) => {
      const handler = (globalThis as Record<string, RpcHandler | undefined>)[RPC_HANDLER_KEY];
      if (!handler) throw new Error("test rpc-handler not installed");
      return handler(...args);
    },
  }),
}));

type EngineModule = typeof import("../../src/lib/imports/engine.server");
let importStudentAcademicStatus: EngineModule["importStudentAcademicStatus"];

beforeAll(async () => {
  const engine = await import("../../src/lib/imports/engine.server");
  importStudentAcademicStatus = engine.importStudentAcademicStatus;
});

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
  setFromHandler((table) => mockFrom(table));
  setRpcHandler((...args) => mockRpc(...args));
});

// ---------------------------------------------------------------- fixtures
const AY_2526 = "ay-2526-id";
const AY_2627 = "ay-2627-id";
const SEM_2526_FIRST = "sem-2526-first-id";
const SEM_2627_FIRST = "sem-2627-first-id";
const LVL1 = "lvl-1-id";
const LVL2 = "lvl-2-id";
const PROG_IT = "prog-it-id";
const STUDENT_ID = "student-1-id";
const STATUS_ID = "status-1-id";
const AC = "2600001";

function makeLookups(): LookupMaps {
  return {
    departmentsByName: new Map(),
    programsByCode: new Map(),
    levelsByName: new Map(),
    levelsByNumber: new Map([
      ["1", LVL1],
      ["2", LVL2],
    ]),
    coursesByCode: new Map(),
    academicYearsByName: new Map([
      ["2025-2026", AY_2526],
      ["2026-2027", AY_2627],
    ]),
    // Legacy global maps deliberately collide on "first" (last write wins).
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
    programYearsById: new Map([[PROG_IT, 4]]),
  };
}

function statusRaw(overrides: Record<string, unknown> = {}) {
  return {
    academic_number: AC,
    academic_year: "2025-2026",
    semester: "first",
    academic_level: "1",
    enrollment_status: "",
    ...overrides,
  };
}

/** Mock for validator DB reads: students via .in(), statuses via direct select. */
function mockStatusDb(
  students: unknown[] = [{ id: STUDENT_ID, academic_number: AC, program_id: PROG_IT }],
  statuses: unknown[] = [],
) {
  const fake = {
    from: (table: string) => ({
      select: () => {
        const data = table === "student_academic_status" ? statuses : [];
        const base = Promise.resolve({ data, error: null });
        return Object.assign(base, {
          in: async () => ({
            data: table === "student_profiles" ? students : data,
            error: null,
          }),
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

function parsedStatus(overrides: Partial<StudentAcademicStatusRow> = {}): StudentAcademicStatusRow {
  return {
    student_profile_id: STUDENT_ID,
    academic_year_id: AY_2526,
    semester_id: SEM_2526_FIRST,
    level_id: LVL1,
    enrollment_status: "enrolled",
    _existingId: null,
    ...overrides,
  };
}

function validatedRow(
  parsed: StudentAcademicStatusRow | null,
  errors: ValidatedRow<StudentAcademicStatusRow>["errors"] = [],
): ValidatedRow<StudentAcademicStatusRow> {
  return { rowNumber: 2, raw: {}, errors, parsed };
}

// ---------------------------------------------------------------- validator
describe("validateStudentAcademicStatus", () => {
  it("accepts a valid row and defaults enrollment_status to enrolled", async () => {
    mockStatusDb();
    const res = await validateStudentAcademicStatus([statusRaw()], makeLookups());
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?.student_profile_id).toBe(STUDENT_ID);
    expect(res.rows[0]?.parsed?.academic_year_id).toBe(AY_2526);
    expect(res.rows[0]?.parsed?.semester_id).toBe(SEM_2526_FIRST);
    expect(res.rows[0]?.parsed?.level_id).toBe(LVL1);
    expect(res.rows[0]?.parsed?.enrollment_status).toBe("enrolled");
    expect(res.rows[0]?.parsed?._existingId).toBeNull();
  });

  it("resolves the semester within the row's own academic year (year-scoped)", async () => {
    mockStatusDb();
    const res = await validateStudentAcademicStatus(
      [statusRaw({ academic_year: "2026-2027" })],
      makeLookups(),
    );
    expect(res.invalidRows).toBe(0);
    // Same code "first" in both years — must bind 2026-2027's semester, not 2025-2026's.
    expect(res.rows[0]?.parsed?.semester_id).toBe(SEM_2627_FIRST);
  });

  it("rejects a semester that does not exist within the given year", async () => {
    mockStatusDb();
    const res = await validateStudentAcademicStatus(
      [statusRaw({ semester: "second" })],
      makeLookups(),
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "semester");
    expect(err?.message).toContain("ضمن السنة الأكاديمية");
  });

  it("rejects an unknown student", async () => {
    mockStatusDb([]);
    const res = await validateStudentAcademicStatus([statusRaw()], makeLookups());
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "academic_number");
    expect(err?.message).toContain("الطالب غير موجود");
  });

  it("rejects an invalid enrollment_status", async () => {
    mockStatusDb();
    const res = await validateStudentAcademicStatus(
      [statusRaw({ enrollment_status: "expelled" })],
      makeLookups(),
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "enrollment_status");
    expect(err?.message).toContain("حالة القيد غير صحيحة");
  });

  it("accepts all whitelisted enrollment statuses", async () => {
    for (const status of ["enrolled", "active", "suspended", "graduated", "withdrawn", "transferred", "completed"]) {
      mockStatusDb();
      const res = await validateStudentAcademicStatus(
        [statusRaw({ enrollment_status: status })],
        makeLookups(),
      );
      expect(res.invalidRows).toBe(0);
      expect(res.rows[0]?.parsed?.enrollment_status).toBe(status);
    }
  });

  it("rejects duplicate student/year/semester rows inside the file", async () => {
    mockStatusDb();
    const res = await validateStudentAcademicStatus([statusRaw(), statusRaw()], makeLookups());
    expect(res.validRows).toBe(1);
    const err = res.rows[1]?.errors.find((e) => e.column === "academic_number");
    expect(err?.message).toContain("مكررة في الملف");
  });

  it("rejects an existing status row unless updateExisting is enabled", async () => {
    mockStatusDb(undefined, [
      {
        id: STATUS_ID,
        student_profile_id: STUDENT_ID,
        academic_year_id: AY_2526,
        semester_id: SEM_2526_FIRST,
      },
    ]);
    const res = await validateStudentAcademicStatus([statusRaw()], makeLookups(), false);
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "academic_number");
    expect(err?.message).toContain("موجودة مسبقاً لهذا الفصل");
  });

  it("accepts an existing status row when updateExisting is enabled", async () => {
    mockStatusDb(undefined, [
      {
        id: STATUS_ID,
        student_profile_id: STUDENT_ID,
        academic_year_id: AY_2526,
        semester_id: SEM_2526_FIRST,
      },
    ]);
    const res = await validateStudentAcademicStatus([statusRaw()], makeLookups(), true);
    expect(res.invalidRows).toBe(0);
    expect(res.rows[0]?.parsed?._existingId).toBe(STATUS_ID);
  });

  it("G-11: rejects a level that exceeds the student's program duration", async () => {
    mockStatusDb();
    const lookups = makeLookups();
    lookups.programYearsById = new Map([[PROG_IT, 1]]);
    const res = await validateStudentAcademicStatus(
      [statusRaw({ academic_level: "2" })],
      lookups,
    );
    expect(res.validRows).toBe(0);
    const err = res.rows[0]?.errors.find((e) => e.column === "academic_level");
    expect(err?.message).toContain("يتجاوز عدد سنوات البرنامج");
  });
});

// ---------------------------------------------------------------- engine dry run
describe("importStudentAcademicStatus dry run", () => {
  it("performs zero DB writes and counts created/updated from _existingId", async () => {
    const rows = [
      validatedRow(parsedStatus()),
      validatedRow(parsedStatus({ _existingId: STATUS_ID })),
      validatedRow(null, [{ row: 4, column: "academic_number", message: "الطالب غير موجود" }]),
    ];
    rows[1]!.rowNumber = 3;
    rows[2]!.rowNumber = 4;

    const report = await importStudentAcademicStatus(rows, true, true);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(report.rows_total).toBe(3);
    expect(report.rows_success).toBe(2);
    expect(report.rows_failed).toBe(1);
    expect(report.rows_created).toBe(1);
    expect(report.rows_updated).toBe(1);
    expect(report.errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- engine execution
describe("importStudentAcademicStatus execution (mocked)", () => {
  it("writes new rows in ONE atomic insert and updates in ONE upsert with the UNIQUE key", async () => {
    const insertCalls: Record<string, unknown>[][] = [];
    const upsertCalls: { payloads: Record<string, unknown>[]; opts: unknown }[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table !== "student_academic_status") throw new Error(`unexpected table: ${table}`);
      return {
        insert: (payloads: Record<string, unknown>[]) => {
          insertCalls.push(payloads);
          return Promise.resolve({ data: null, error: null });
        },
        upsert: (payloads: Record<string, unknown>[], opts: unknown) => {
          upsertCalls.push({ payloads, opts });
          return Promise.resolve({ data: null, error: null });
        },
      };
    });

    const newRow = validatedRow(parsedStatus());
    const existingRow = validatedRow(
      parsedStatus({ _existingId: STATUS_ID, enrollment_status: "active", level_id: LVL2 }),
    );
    existingRow.rowNumber = 3;

    const report = await importStudentAcademicStatus([newRow, existingRow], false, true);

    expect(report.rows_success).toBe(2);
    expect(report.rows_failed).toBe(0);
    expect(report.rows_created).toBe(1);
    expect(report.rows_updated).toBe(1);

    // Atomicity: exactly ONE insert statement carrying ALL new rows.
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]).toHaveLength(1);
    // Atomicity: exactly ONE upsert statement on the table's UNIQUE key.
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0]!.payloads).toHaveLength(1);
    expect((upsertCalls[0]!.opts as { onConflict: string }).onConflict).toBe(
      "student_profile_id,academic_year_id,semester_id",
    );

    // No silent field loss: every parsed field is present in the payloads.
    const expectedKeys = [
      "academic_year_id",
      "enrollment_status",
      "level_id",
      "semester_id",
      "student_profile_id",
      "updated_at",
    ];
    expect(Object.keys(insertCalls[0]![0]!).sort()).toEqual(expectedKeys);
    expect(Object.keys(upsertCalls[0]!.payloads[0]!).sort()).toEqual(expectedKeys);
    expect(insertCalls[0]![0]!.student_profile_id).toBe(STUDENT_ID);
    expect(insertCalls[0]![0]!.semester_id).toBe(SEM_2526_FIRST);
    expect(insertCalls[0]![0]!.enrollment_status).toBe("enrolled");
    expect(upsertCalls[0]!.payloads[0]!.enrollment_status).toBe("active");
    expect(upsertCalls[0]!.payloads[0]!.level_id).toBe(LVL2);
  });

  it("fails the WHOLE insert group atomically when the statement errors (no partial writes)", async () => {
    mockFrom.mockImplementation(() => ({
      insert: () => Promise.resolve({ data: null, error: { message: "duplicate key value" } }),
    }));

    const rows = [
      validatedRow(parsedStatus()),
      validatedRow(parsedStatus({ student_profile_id: "student-2-id" })),
    ];
    rows[1]!.rowNumber = 3;

    const report = await importStudentAcademicStatus(rows, false);
    expect(report.rows_success).toBe(0);
    expect(report.rows_failed).toBe(2);
    expect(report.rows_created).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.row).toBe(0);
    expect(report.errors[0]?.message).toContain("فشل الإدراج الذرّي");
    expect(report.errors[0]?.message).toContain("لم يُدرَج أي صف");
  });

  it("fails the WHOLE upsert group atomically when the statement errors", async () => {
    mockFrom.mockImplementation(() => ({
      upsert: () => Promise.resolve({ data: null, error: { message: "connection reset" } }),
    }));

    const rows = [validatedRow(parsedStatus({ _existingId: STATUS_ID }))];

    const report = await importStudentAcademicStatus(rows, false, true);
    expect(report.rows_success).toBe(0);
    expect(report.rows_failed).toBe(1);
    expect(report.rows_updated).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]?.message).toContain("فشل التحديث الذرّي");
    expect(report.errors[0]?.message).toContain("لم يُحدَّث أي صف");
  });

  it("does not touch the DB when every row failed validation", async () => {
    const rows = [
      validatedRow(null, [{ row: 2, column: "academic_number", message: "الطالب غير موجود" }]),
    ];
    const report = await importStudentAcademicStatus(rows, false);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(report.rows_total).toBe(1);
    expect(report.rows_success).toBe(0);
    expect(report.rows_failed).toBe(1);
    expect(report.errors).toHaveLength(1);
  });
});
