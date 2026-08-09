/**
 * QWEN-FINAL-F1 / F2 — durable RPC argument contract + version-conflict mapping.
 * Compares the live GraduatesAffairsRpcClient payload keys against the SQL
 * signature of public.graduate_update_own_profile(...), and proves the SQL
 * optimistic-lock exception maps to the user-facing Arabic label.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ERROR_LABELS,
  GraduatesAffairsRpcClient,
  GraduatesAffairsRpcError,
  mapGraduatesAffairsRpcError,
} from "../../src/lib/graduates-affairs/rpc";

const root = join(import.meta.dir, "../..");
const auth04Sql = readFileSync(
  join(root, "docs/migration-drafts/GRADUATES-AFFAIRS-AUTHORIZATION-04.sql"),
  "utf8",
);

function sqlNamedArgs(fnName: string): string[] {
  const marker = `CREATE OR REPLACE FUNCTION public.${fnName}(`;
  const start = auth04Sql.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const open = start + marker.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = open; i < auth04Sql.length; i++) {
    const ch = auth04Sql[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end).toBeGreaterThan(open);
  const params = auth04Sql.slice(open + 1, end);
  const names = [...params.matchAll(/\bp_([a-z0-9_]+)\b/g)].map((m) => `p_${m[1]}`);
  expect(names.length).toBeGreaterThan(0);
  return names;
}

describe("QWEN-FINAL-F1 updateOwnProfile RPC argument contract", () => {
  test("runtime payload keys match SQL graduate_update_own_profile args exactly", async () => {
    const sqlArgs = sqlNamedArgs("graduate_update_own_profile");
    expect(sqlArgs).toContain("p_expected_row_version");
    expect(sqlArgs).not.toContain("p_row_version");

    let capturedFn = "";
    let capturedArgs: Record<string, unknown> | undefined;
    const client = new GraduatesAffairsRpcClient({
      rpc: async (fn, args) => {
        capturedFn = fn;
        capturedArgs = args ?? {};
        return { data: 1, error: null };
      },
    });

    await client.updateOwnProfile({
      graduateRecordId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      publicDisplayName: "Grad",
      preferredContactChannel: "email",
      careerSummary: null,
      profileVisibility: "private",
      rowVersion: 3,
    });

    expect(capturedFn).toBe("graduate_update_own_profile");
    expect(capturedArgs).toBeDefined();
    const runtimeKeys = Object.keys(capturedArgs!).sort();
    expect(runtimeKeys).toEqual([...sqlArgs].sort());
    expect(capturedArgs!.p_expected_row_version).toBe(3);
    expect(capturedArgs!).not.toHaveProperty("p_row_version");
  });

  test("contract drift: wrong row-version key name is detectable", async () => {
    const sqlArgs = new Set(sqlNamedArgs("graduate_update_own_profile"));
    // Simulate the pre-fix bug payload and prove it would diverge from SQL.
    const drifted = {
      p_graduate_record_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      p_public_display_name: "Grad",
      p_preferred_contact_channel: "email",
      p_career_summary: null,
      p_profile_visibility: "private",
      p_row_version: 1,
    };
    const driftedKeys = Object.keys(drifted);
    expect(driftedKeys.some((k) => !sqlArgs.has(k))).toBe(true);
    expect(sqlArgs.has("p_expected_row_version")).toBe(true);
    expect(sqlArgs.has("p_row_version")).toBe(false);
  });
});

describe("QWEN-FINAL-F2 profile version conflict error mapping", () => {
  test("canonical SQL GRADUATE_PROFILE_VERSION_CONFLICT maps to Arabic label", () => {
    expect(ERROR_LABELS.GRADUATE_PROFILE_VERSION_CONFLICT).toContain("تم تحديث الملف");
    const mapped = mapGraduatesAffairsRpcError({
      message: "ERROR: GRADUATE_PROFILE_VERSION_CONFLICT",
      code: "P0001",
    });
    expect(mapped).toBeInstanceOf(GraduatesAffairsRpcError);
    expect(mapped.code).toBe("GRADUATE_PROFILE_VERSION_CONFLICT");
    expect(mapped.message).toBe(ERROR_LABELS.GRADUATE_PROFILE_VERSION_CONFLICT);
    expect(mapped.unavailable).toBe(false);
  });

  test("legacy STALE_VERSION alias remains mapped if still present in error text", () => {
    const mapped = mapGraduatesAffairsRpcError({
      message: "GRADUATE_PROFILE_STALE_VERSION",
    });
    expect(mapped.code).toBe("GRADUATE_PROFILE_STALE_VERSION");
    expect(mapped.message).toBe(ERROR_LABELS.GRADUATE_PROFILE_STALE_VERSION);
  });

  test("version conflict is not swallowed as a generic/unavailable error", () => {
    const mapped = mapGraduatesAffairsRpcError({
      message: "GRADUATE_PROFILE_VERSION_CONFLICT",
      code: "P0001",
    });
    expect(mapped.unavailable).toBe(false);
    expect(mapped.message).not.toBe("حدث خطأ غير متوقع");
    expect(mapped.message).not.toMatch(/قيد التحديث/);
  });
});
