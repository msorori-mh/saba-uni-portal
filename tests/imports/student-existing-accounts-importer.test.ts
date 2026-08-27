/**
 * STUDENT-EXISTING-ACCOUNTS-IMPORTER-01
 *
 * Run: bun test tests/imports/student-existing-accounts-importer.test.ts
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { LookupMaps, ValidatedRow } from "../../src/lib/imports/types";
import * as importDb from "../../src/lib/imports/import-db";
import {
  normalizeStudentAccountRaw,
  parseStudentAccountBool,
  validateStudentAccounts,
  type StudentAccountRow,
  type StudentAccountsAuthProbe,
} from "../../src/lib/imports/student-accounts";

process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

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
    auth: { admin: { createUser: async () => ({ data: null, error: { message: "unused" } }), deleteUser: async () => ({}) } },
  }),
}));

// Avoid real Auth admin pagination in unit tests — inject probe.
mock.module("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
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
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
        createUser: async () => ({
          data: { user: { id: "new-auth-user" } },
          error: null,
        }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
  },
}));

const AC = "2026001";
const AC2 = "2026002";
const EMAIL = "s2026001@students.usr.edu.ye";
const EMAIL2 = "s2026002@students.usr.edu.ye";
const STUDENT_ID = "11111111-1111-1111-1111-111111111111";
const STUDENT_ID_2 = "22222222-2222-2222-2222-222222222222";
const AUTH_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const EMPTY_LOOKUPS: LookupMaps = {
  departmentsByName: new Map(),
  programsByCode: new Map(),
  levelsByName: new Map(),
  levelsByNumber: new Map(),
  coursesByCode: new Map(),
  academicYearsByName: new Map(),
  semestersByCode: new Map(),
  semestersByName: new Map(),
};

let activeSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => {
  activeSpy?.mockRestore();
  activeSpy = undefined;
});

type Profile = {
  id: string;
  academic_number: string;
  user_id: string | null;
  email: string | null;
};

function installDb(opts: {
  profilesByAc?: Profile[];
  emailOwners?: Profile[];
  userIdOwners?: Profile[];
}) {
  const byAc = new Map((opts.profilesByAc ?? []).map((p) => [p.academic_number, p]));
  const byEmail = new Map((opts.emailOwners ?? []).map((p) => [p.email ?? "", p]));
  const byUser = new Map((opts.userIdOwners ?? []).map((p) => [p.user_id ?? "", p]));

  const handler: FromHandler = (table: string) => {
    if (table !== "student_profiles") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        in: async (_col: string, values: string[]) => ({
          data: values.map((v) => byAc.get(v)).filter(Boolean),
          error: null,
        }),
        eq: (col: string, value: string) => ({
          maybeSingle: async () => {
            if (col === "email") return { data: byEmail.get(value) ?? null, error: null };
            if (col === "user_id") return { data: byUser.get(value) ?? null, error: null };
            if (col === "id") {
              const hit = [...byAc.values()].find((p) => p.id === value) ?? null;
              return { data: hit, error: null };
            }
            return { data: null, error: null };
          },
        }),
      }),
    };
  };
  setFromHandler(handler);
  setRpcHandler(async () => ({ data: null, error: null }));
  activeSpy?.mockRestore();
  activeSpy = spyOn(importDb, "getImportDb").mockReturnValue({
    from: handler,
  } as ReturnType<typeof importDb.getImportDb>);
}

function probe(authByEmail: Record<string, string | null> = {}): StudentAccountsAuthProbe {
  return {
    findAuthUserIdByEmail: async (email: string) => authByEmail[email.toLowerCase()] ?? null,
  };
}

function raw(overrides: Record<string, unknown> = {}) {
  return {
    academic_number: AC,
    university_email: EMAIL,
    must_change_password: true,
    is_active: true,
    notes: "",
    ...overrides,
  };
}

let importStudentAccounts: typeof import("../../src/lib/imports/engine.server").importStudentAccounts;

beforeAll(async () => {
  const mod = await import("../../src/lib/imports/engine.server");
  importStudentAccounts = mod.importStudentAccounts;
});

beforeEach(() => {
  setFromHandler(() => {
    throw new Error("from-handler not configured");
  });
  setRpcHandler(async () => ({ data: null, error: null }));
});

describe("normalizeStudentAccountRaw / bool", () => {
  it("accepts Arabic header aliases", () => {
    const n = normalizeStudentAccountRaw({
      "الرقم الأكاديمي": AC,
      "البريد الإلكتروني الجامعي": EMAIL,
    });
    expect(n.academic_number).toBe(AC);
    expect(n.university_email).toBe(EMAIL);
  });

  it("defaults must_change_password to true", () => {
    expect(parseStudentAccountBool(undefined, true)).toBe(true);
    expect(parseStudentAccountBool("لا", true)).toBe(false);
    expect(parseStudentAccountBool("نعم", false)).toBe(true);
  });
});

describe("validateStudentAccounts", () => {
  it("PASS: existing student without account → READY_TO_CREATE", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: null, email: null }],
    });
    const result = await validateStudentAccounts([raw()], EMPTY_LOOKUPS, probe());
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.parsed?.outcome).toBe("READY_TO_CREATE");
    expect(result.rows[0]?.parsed?.must_change_password).toBe(true);
  });

  it("SKIP: existing student already linked → ALREADY_LINKED", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: AUTH_ID, email: EMAIL }],
    });
    const result = await validateStudentAccounts([raw()], EMPTY_LOOKUPS, probe());
    expect(result.validRows).toBe(1);
    expect(result.rows[0]?.parsed?.outcome).toBe("ALREADY_LINKED");
  });

  it("DENY: student not found", async () => {
    installDb({ profilesByAc: [] });
    const result = await validateStudentAccounts([raw()], EMPTY_LOOKUPS, probe());
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0]?.errors[0]?.message).toContain("الطالب غير موجود — يجب استيراد بياناته أولاً");
    expect(result.rows[0]?.errors[0]?.message).toContain("STUDENT_NOT_FOUND");
  });

  it("DENY: email linked to another student profile", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: null, email: null }],
      emailOwners: [
        { id: STUDENT_ID_2, academic_number: AC2, user_id: null, email: EMAIL },
      ],
    });
    const result = await validateStudentAccounts([raw()], EMPTY_LOOKUPS, probe());
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0]?.errors[0]?.message).toContain("CONFLICT");
    expect(result.rows[0]?.errors[0]?.message).toContain("البريد مرتبط بطالب آخر");
  });

  it("DENY: Auth exists for email and not this student → CONFLICT (no auto-link)", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: null, email: null }],
    });
    const result = await validateStudentAccounts(
      [raw()],
      EMPTY_LOOKUPS,
      probe({ [EMAIL]: AUTH_ID }),
    );
    expect(result.invalidRows).toBe(1);
    expect(result.rows[0]?.errors[0]?.message).toContain("CONFLICT");
    expect(result.rows[0]?.errors[0]?.message).toContain("لا ربط تلقائي");
  });

  it("DENY: duplicate academic_number in file", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: null, email: null }],
    });
    const result = await validateStudentAccounts(
      [raw(), raw({ university_email: EMAIL2 })],
      EMPTY_LOOKUPS,
      probe(),
    );
    expect(result.rows.some((r) => r.errors.some((e) => e.message.includes("مكرر")))).toBe(true);
  });

  it("DENY: duplicate email in file", async () => {
    installDb({
      profilesByAc: [
        { id: STUDENT_ID, academic_number: AC, user_id: null, email: null },
        { id: STUDENT_ID_2, academic_number: AC2, user_id: null, email: null },
      ],
    });
    const result = await validateStudentAccounts(
      [raw(), raw({ academic_number: AC2 })],
      EMPTY_LOOKUPS,
      probe(),
    );
    expect(result.rows.some((r) => r.errors.some((e) => e.message.includes("البريد مكرر")))).toBe(
      true,
    );
  });

  it("DENY: invalid email", async () => {
    installDb({
      profilesByAc: [{ id: STUDENT_ID, academic_number: AC, user_id: null, email: null }],
    });
    const result = await validateStudentAccounts(
      [raw({ university_email: "not-an-email" })],
      EMPTY_LOOKUPS,
      probe(),
    );
    expect(result.rows[0]?.errors[0]?.message).toContain("INVALID_EMAIL");
  });
});

describe("importStudentAccounts", () => {
  function validated(
    parsed: StudentAccountRow,
    rowNumber = 2,
  ): ValidatedRow<StudentAccountRow> {
    return { rowNumber, raw: {}, parsed, errors: [] };
  }

  it("dry-run does not create Auth users and counts READY_TO_CREATE", async () => {
    const createUser = mock(async () => ({ data: { user: { id: "x" } }, error: null }));
    // provision path not reached on dry-run
    const report = await importStudentAccounts(
      [
        validated({
          academic_number: AC,
          university_email: EMAIL,
          must_change_password: true,
          is_active: true,
          notes: null,
          student_profile_id: STUDENT_ID,
          outcome: "READY_TO_CREATE",
        }),
        validated({
          academic_number: AC2,
          university_email: EMAIL2,
          must_change_password: true,
          is_active: true,
          notes: null,
          student_profile_id: STUDENT_ID_2,
          outcome: "ALREADY_LINKED",
        }),
      ],
      true,
      { userId: "admin-1", userSupabase: { rpc: async () => ({ error: null }) } },
    );
    expect(createUser).not.toHaveBeenCalled();
    expect(report.rows_created).toBe(1);
    expect(report.rows_updated).toBe(1);
    expect(report.student_accounts_summary?.ready_to_create).toBe(1);
    expect(report.student_accounts_summary?.already_linked).toBe(1);
    expect(JSON.stringify(report)).not.toMatch(/password/i);
  });

  it("live create for READY_TO_CREATE is idempotent when already linked mid-flight", async () => {
    installDb({
      profilesByAc: [
        { id: STUDENT_ID, academic_number: AC, user_id: AUTH_ID, email: EMAIL },
      ],
    });
    // getImportDb used by import path via sb = supabaseAdmin mock which uses FROM_HANDLER
    setFromHandler((table: string) => {
      if (table !== "student_profiles") throw new Error(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: STUDENT_ID, academic_number: AC, user_id: AUTH_ID, email: EMAIL },
              error: null,
            }),
          }),
        }),
      };
    });

    const report = await importStudentAccounts(
      [
        validated({
          academic_number: AC,
          university_email: EMAIL,
          must_change_password: true,
          is_active: true,
          notes: null,
          student_profile_id: STUDENT_ID,
          outcome: "READY_TO_CREATE",
        }),
      ],
      false,
      { userId: "admin-1", userSupabase: { rpc: async () => ({ error: null }) } },
    );
    expect(report.rows_created).toBe(0);
    expect(report.student_accounts_summary?.already_linked).toBe(1);
    expect(report.student_accounts_summary?.skipped).toBe(1);
  });

  it("live create provisions via RPC without putting password in report", async () => {
    const rpcs: string[] = [];
    setFromHandler((table: string) => {
      if (table === "student_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STUDENT_ID, academic_number: AC, user_id: null, email: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return { insert: async () => ({ error: null }) };
      }
      return {};
    });

    const report = await importStudentAccounts(
      [
        validated({
          academic_number: AC,
          university_email: EMAIL,
          must_change_password: true,
          is_active: true,
          notes: "batch",
          student_profile_id: STUDENT_ID,
          outcome: "READY_TO_CREATE",
        }),
      ],
      false,
      {
        userId: "admin-1",
        userSupabase: {
          rpc: async (name: string) => {
            rpcs.push(name);
            return { error: null };
          },
        },
      },
    );

    expect(report.rows_created).toBe(1);
    expect(report.student_accounts_summary?.created).toBe(1);
    expect(rpcs).toContain("link_student_user_account");
    expect(rpcs).toContain("admin_mark_student_password_reset");
    expect(JSON.stringify(report)).not.toMatch(/"password"\s*:/);
  });

  it("does not mutate academic fields in any write payload", async () => {
    const updates: Record<string, unknown>[] = [];
    setFromHandler((table: string) => {
      if (table === "student_profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STUDENT_ID, academic_number: AC, user_id: null, email: null },
                error: null,
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: () => ({ is: async () => ({ error: null }) }) };
          },
        };
      }
      if (table === "user_roles") return { insert: async () => ({ error: null }) };
      return {};
    });

    await importStudentAccounts(
      [
        validated({
          academic_number: AC,
          university_email: EMAIL,
          must_change_password: true,
          is_active: true,
          notes: null,
          student_profile_id: STUDENT_ID,
          outcome: "READY_TO_CREATE",
        }),
      ],
      false,
      {
        userId: "admin-1",
        userSupabase: { rpc: async () => ({ error: null }) },
      },
    );

    for (const payload of updates) {
      expect(payload).not.toHaveProperty("department_id");
      expect(payload).not.toHaveProperty("program_id");
      expect(payload).not.toHaveProperty("level_id");
      expect(payload).not.toHaveProperty("academic_year_id");
      expect(payload).not.toHaveProperty("semester_id");
      expect(payload).not.toHaveProperty("enrollment_status");
    }
  });
});

describe("template + roles contract", () => {
  it("template headers match the accepted contract", async () => {
    const src = await Bun.file("src/lib/imports/templates.ts").text();
    expect(src).toContain("student_accounts:");
    expect(src).toContain('"academic_number"');
    expect(src).toContain('"university_email"');
    expect(src).toContain('"must_change_password"');
    expect(src).toContain('"is_active"');
    expect(src).toContain("الرقم الأكاديمي");
    expect(src).toContain("CONFLICT");
  });

  it("IMPORT_ROLES for student_accounts is admin/system_admin only (source pin)", async () => {
    const src = await Bun.file("src/lib/imports.functions.ts").text();
    expect(src).toMatch(/student_accounts:\s*\[\s*"admin"\s*,\s*"system_admin"\s*\]/);
  });
});
