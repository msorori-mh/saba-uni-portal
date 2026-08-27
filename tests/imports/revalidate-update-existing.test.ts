/**
 * HIGH-4 (review #193) — updateExisting must survive the server revalidation
 * path used by runBulkImport.
 *
 * runBulkImport (src/lib/imports.functions.ts) revalidates client-parsed rows
 * server-side via revalidateBulkImportRows BEFORE executing. Pre-fix, that
 * function hardcoded `updateExisting = false` when calling
 * previewBulkImportValidation, so every batch imported with «تحديث القائم»
 * re-flagged its existing rows as duplicates and died at
 * assertServerValidationPassed ("فشل التحقق على الخادم"). This test exercises
 * the real module end-to-end (loadLookups + validator) with a mocked supabase
 * client and proves the flag now flows through.
 *
 * Run: bun test tests/imports/revalidate-update-existing.test.ts
 */
import { describe, expect, it, mock, beforeAll, beforeEach } from "bun:test";
import type { ValidatedRow } from "../../src/lib/imports/types";

process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

const DEP = "dep-1";
const PROG = "prog-1";
const AY = "ay-1";
const SEM = "sem-1";
const LVL1 = "lvl-1";
const STU = "stu-1";
const STATUS = "status-1";
const AC = "2600001";

const TABLES: Record<string, unknown[]> = {
  departments: [{ id: DEP, name_ar: "قسم تقنية المعلومات" }],
  programs: [{ id: PROG, code: "IT", department_id: DEP, years: 4 }],
  academic_levels: [{ id: LVL1, name: "المستوى الأول", level_number: 1, status: "active" }],
  courses: [],
  academic_years: [{ id: AY, name: "2025-2026" }],
  semesters: [{ id: SEM, name: "الفصل الأول", code: "first", academic_year_id: AY }],
  student_profiles: [{ id: STU, academic_number: AC, program_id: PROG }],
  // The row being imported already exists for (student, year, semester):
  student_academic_status: [
    { id: STATUS, student_profile_id: STU, academic_year_id: AY, semester_id: SEM },
  ],
};

const mockFrom = mock((table: string) => ({
  select: () => {
    const base = Promise.resolve({ data: TABLES[table] ?? [], error: null });
    return Object.assign(base, {
      in: async () => ({ data: TABLES[table] ?? [], error: null }),
      eq: () => base,
      order: () => base,
    });
  },
}));

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

type Revalidate = (
  type: "student_academic_status",
  rows: ValidatedRow[],
  updateExisting?: boolean,
) => Promise<ValidatedRow[]>;
let revalidateBulkImportRows: Revalidate;

beforeAll(async () => {
  const mod = await import("../../src/lib/imports/bulk-import-validation.server");
  revalidateBulkImportRows = mod.revalidateBulkImportRows as unknown as Revalidate;
});

beforeEach(() => {
  setFromHandler((table) => mockFrom(table));
  setRpcHandler(async () => ({ data: null, error: null }));
});

const raw = {
  academic_number: AC,
  academic_year: "2025-2026",
  semester: "first",
  academic_level: "1",
  enrollment_status: "active",
};

function clientRows(): ValidatedRow[] {
  return [{ rowNumber: 2, raw: { ...raw }, parsed: null, errors: [] } as unknown as ValidatedRow];
}

describe("revalidateBulkImportRows forwards updateExisting (HIGH-4)", () => {
  it("updateExisting=false flags the already-existing status row (duplicate guard)", async () => {
    const rows = await revalidateBulkImportRows("student_academic_status", clientRows(), false);
    expect(rows[0]?.parsed).toBeNull();
    expect(rows[0]?.errors.some((e) => e.message.includes("موجودة مسبقاً لهذا الفصل"))).toBe(true);
  });

  it("updateExisting=true validates the same row as an update (pre-fix: always failed)", async () => {
    const rows = await revalidateBulkImportRows("student_academic_status", clientRows(), true);
    expect(rows[0]?.errors).toHaveLength(0);
    const parsed = rows[0]?.parsed as { _existingId?: string; enrollment_status?: string } | null;
    expect(parsed?._existingId).toBe(STATUS);
    expect(parsed?.enrollment_status).toBe("active");
  });
});
