import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolveStudentPlanId, resolveStudentPlanIds } from "../../src/lib/study-plan-resolution";
import { SEMESTER_LABELS } from "../../src/lib/student-study-plan";

function fakeDb(plans: Array<{ id: string; program_id: string; version: string; is_active: boolean }>) {
  return {
    from: () => {
      const f: Record<string, unknown> = {};
      let rows = plans.slice();
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => { rows = rows.filter((r) => (r as any)[k] === v); return q; },
        in: (k: string, v: unknown[]) => { rows = rows.filter((r) => v.includes((r as any)[k])); return q; },
        order: () => { rows.sort((a, b) => b.version.localeCompare(a.version)); return q; },
        limit: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ data: rows, error: null }),
      };
      void f;
      return q;
    },
  };
}

const db = fakeDb([
  { id: "old", program_id: "P", version: "1.0", is_active: true },
  { id: "new", program_id: "P", version: "2.0", is_active: true },
  { id: "off", program_id: "P", version: "3.0", is_active: false },
]);

describe("cohort study plan resolution", () => {
  test("assigned plan wins", async () => {
    expect(await resolveStudentPlanId(db, { study_plan_id: "old", program_id: "P" })).toBe("old");
  });
  test("falls back to latest active plan of the program", async () => {
    expect(await resolveStudentPlanId(db, { study_plan_id: null, program_id: "P" })).toBe("new");
    expect(await resolveStudentPlanId(db, { program_id: null })).toBeNull();
  });
  test("batched variant matches", async () => {
    const m = await resolveStudentPlanIds(db, [
      { id: "a", study_plan_id: "old", program_id: "P" },
      { id: "b", study_plan_id: null, program_id: "P" },
    ]);
    expect(m.get("a")).toBe("old");
    expect(m.get("b")).toBe("new");
  });
  test("summer label", () => {
    expect(SEMESTER_LABELS.summer).toBe("الفصل الصيفي");
  });
  test("progress and offerings use the cohort plan", () => {
    const prog = readFileSync("src/lib/academic-status.functions.ts", "utf8");
    expect(prog).toContain("resolveStudentPlanId(supabase, sp)");
    const off = readFileSync("src/lib/admin-course-offerings.functions.ts", "utf8");
    expect(off).toContain('planSource = "cohort"');
    expect(off).toContain('.eq("status", "active")');
  });
  test("second active plan is a warning, not an error", () => {
    const v = readFileSync("src/lib/imports/validators.ts", "utf8");
    expect(v).toContain("warnings.push");
    expect(v).not.toContain("إصدار نشط واحد فقط لكل برنامج");
  });
});
