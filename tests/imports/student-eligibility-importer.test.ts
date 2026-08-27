import { afterEach, describe, expect, it, mock, beforeAll, beforeEach, spyOn } from "bun:test";
import type { LookupMaps, ValidatedRow } from "../../src/lib/imports/types";
import * as importDb from "../../src/lib/imports/import-db";
import {
  normalizeStudentStudyStatus,
  validateStudentEligibility,
  type StudentEligibilityRow,
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
let importStudentEligibility: EngineModule["importStudentEligibility"];
let computeEligibilityImportSummary: EngineModule["computeEligibilityImportSummary"];

beforeAll(async () => {
  const engine = await import("../../src/lib/imports/engine.server");
  importStudentEligibility = engine.importStudentEligibility;
  computeEligibilityImportSummary = engine.computeEligibilityImportSummary;
});

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ data: null, error: null });
  setFromHandler((table) => mockFrom(table));
  setRpcHandler((...args) => mockRpc(...args));
});

const EMPTY_LOOKUPS = {} as LookupMaps;
const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const AC = "20251001";

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    academic_number: AC,
    student_study_status: "new",
    transferred_current_year: "false",
    previous_suspension_semesters_count: 0,
    consecutive_suspension_years_count: 0,
    source_reference: "كشف شؤون الطلاب 2026-2027",
    notes: "",
    ...overrides,
  };
}

function mockStudentLookup(
  students: { id: string; academic_number: string }[] = [{ id: STUDENT_ID, academic_number: AC }],
) {
  activeGetImportDbSpy?.mockRestore();
  activeGetImportDbSpy = spyOn(importDb, "getImportDb").mockReturnValue({
    from: () => ({
      select: () => ({
        in: async () => ({ data: students, error: null }),
      }),
    }),
  } as ReturnType<typeof importDb.getImportDb>);
  return activeGetImportDbSpy;
}

function validatedRow(
  parsed: StudentEligibilityRow | null,
  errors: ValidatedRow<StudentEligibilityRow>["errors"] = [],
): ValidatedRow<StudentEligibilityRow> {
  return { rowNumber: 2, raw: {}, errors, parsed };
}

describe("normalizeStudentStudyStatus", () => {
  it("accepts new and repeat", () => {
    expect(normalizeStudentStudyStatus("new")).toBe("new");
    expect(normalizeStudentStudyStatus("repeat")).toBe("repeat");
  });

  it("accepts Arabic aliases", () => {
    expect(normalizeStudentStudyStatus("مستجد")).toBe("new");
    expect(normalizeStudentStudyStatus("باقي للإعادة")).toBe("repeat");
    expect(normalizeStudentStudyStatus("إعادة")).toBe("repeat");
  });

  it("rejects invalid values", () => {
    expect(normalizeStudentStudyStatus("graduate")).toBeNull();
    expect(normalizeStudentStudyStatus("")).toBeNull();
  });
});

describe("validateStudentEligibility", () => {
  it("accepts a valid row", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility([validRaw()], EMPTY_LOOKUPS);
    expect(result.invalidRows).toBe(0);
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.parsed?.student_study_status).toBe("new");
    expect(result.rows[0]?.parsed?.student_profile_id).toBe(STUDENT_ID);
  });

  it("rejects missing academic_number", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ academic_number: "" })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("rejects unknown academic_number", async () => {
    mockStudentLookup([]);
    const result = await validateStudentEligibility([validRaw()], EMPTY_LOOKUPS);
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0]?.errors.some((e) => e.column === "academic_number")).toBe(true);
  });

  it("rejects duplicate academic_number in file", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility([validRaw(), validRaw()], EMPTY_LOOKUPS);
    expect(result.rows[1]?.errors.some((e) => e.message.includes("مكرر"))).toBe(true);
  });

  it("rejects UUID as academic_number", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ academic_number: STUDENT_ID })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("rejects invalid study status", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ student_study_status: "graduate" })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("rejects empty transferred_current_year", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ transferred_current_year: "" })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("accepts Arabic boolean aliases", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ transferred_current_year: "نعم" })],
      EMPTY_LOOKUPS,
    );
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.parsed?.transferred_current_year).toBe(true);
  });

  it("rejects negative and decimal counters", async () => {
    mockStudentLookup();
    const negative = await validateStudentEligibility(
      [validRaw({ previous_suspension_semesters_count: -1 })],
      EMPTY_LOOKUPS,
    );
    const decimal = await validateStudentEligibility(
      [validRaw({ consecutive_suspension_years_count: "1.5" })],
      EMPTY_LOOKUPS,
    );
    expect(negative.invalidRows).toBe(1);
    expect(decimal.invalidRows).toBe(1);
  });

  it("rejects empty counters", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ previous_suspension_semesters_count: "" })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("rejects empty source_reference", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ source_reference: "" })],
      EMPTY_LOOKUPS,
    );
    expect(result.invalidRows).toBe(1);
  });

  it("allows optional notes", async () => {
    mockStudentLookup();
    const result = await validateStudentEligibility(
      [validRaw({ notes: "ملاحظة تدقيق" })],
      EMPTY_LOOKUPS,
    );
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.parsed?.notes).toBe("ملاحظة تدقيق");
  });
});

describe("importStudentEligibility dry run", () => {
  it("does not call supabase and returns summary stats", async () => {
    const row = validatedRow({
      student_profile_id: STUDENT_ID,
      academic_number: AC,
      student_study_status: "repeat",
      transferred_current_year: true,
      previous_suspension_semesters_count: 2,
      consecutive_suspension_years_count: 1,
      source_reference: "قرار التحويل رقم 15/2026",
      notes: null,
    });

    const report = await importStudentEligibility([row], true);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
    expect(report.rows_updated).toBe(1);
    expect(report.rows_created).toBe(0);
    expect(report.eligibility_summary?.repeat_count).toBe(1);
    expect(report.eligibility_summary?.transferred_count).toBe(1);
    expect(report.eligibility_summary?.prior_suspension_count).toBe(1);
  });
});

describe("importStudentEligibility execution (mocked)", () => {
  it("updates only the four eligibility fields", async () => {
    const updatePayloads: Record<string, unknown>[] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table !== "student_profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: STUDENT_ID,
                student_study_status: null,
                transferred_current_year: false,
                previous_suspension_semesters_count: 0,
                consecutive_suspension_years_count: 0,
              },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: () => ({
              select: async () => ({ data: [{ id: STUDENT_ID }], error: null }),
            }),
          };
        },
      };
    });

    const row = validatedRow({
      student_profile_id: STUDENT_ID,
      academic_number: AC,
      student_study_status: "new",
      transferred_current_year: false,
      previous_suspension_semesters_count: 0,
      consecutive_suspension_years_count: 0,
      source_reference: "كشف شؤون الطلاب 2026-2027",
      notes: null,
    });

    const report = await importStudentEligibility([row], false, {
      userId: "actor-1",
      fileName: "eligibility.xlsx",
    });

    expect(report.rows_success).toBe(1);
    expect(updatePayloads).toHaveLength(1);
    expect(Object.keys(updatePayloads[0]!).sort()).toEqual([
      "consecutive_suspension_years_count",
      "previous_suspension_semesters_count",
      "student_study_status",
      "transferred_current_year",
    ]);
    expect(mockRpc).toHaveBeenCalled();
    expect(mockFrom.mock.calls.every(([t]) => t === "student_profiles")).toBe(true);
  });

  it("fails when update does not affect exactly one row", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table !== "student_profiles") throw new Error(`unexpected table: ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: STUDENT_ID,
                student_study_status: "repeat",
                transferred_current_year: false,
                previous_suspension_semesters_count: 0,
                consecutive_suspension_years_count: 0,
              },
              error: null,
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            select: async () => ({ data: [], error: null }),
          }),
        }),
      };
    });

    const row = validatedRow({
      student_profile_id: STUDENT_ID,
      academic_number: AC,
      student_study_status: "new",
      transferred_current_year: false,
      previous_suspension_semesters_count: 0,
      consecutive_suspension_years_count: 0,
      source_reference: "كشف شؤون الطلاب 2026-2027",
      notes: null,
    });

    const report = await importStudentEligibility([row], false);
    expect(report.rows_failed).toBe(1);
    expect(report.rows_success).toBe(0);
  });
});

describe("computeEligibilityImportSummary", () => {
  it("aggregates non-PII stats", () => {
    const rows = [
      validatedRow({
        student_profile_id: STUDENT_ID,
        academic_number: AC,
        student_study_status: "new",
        transferred_current_year: false,
        previous_suspension_semesters_count: 0,
        consecutive_suspension_years_count: 0,
        source_reference: "ref-a",
        notes: null,
      }),
      validatedRow({
        student_profile_id: "22222222-2222-4222-8222-222222222222",
        academic_number: "20241025",
        student_study_status: "repeat",
        transferred_current_year: true,
        previous_suspension_semesters_count: 1,
        consecutive_suspension_years_count: 0,
        source_reference: "ref-b",
        notes: null,
      }),
    ];
    const summary = computeEligibilityImportSummary(rows);
    expect(summary.new_count).toBe(1);
    expect(summary.repeat_count).toBe(1);
    expect(summary.transferred_count).toBe(1);
    expect(summary.prior_suspension_count).toBe(1);
    expect(summary.distinct_source_references).toBe(2);
  });
});
