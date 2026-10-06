import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  NO_DEPARTMENT_KEY,
  rowsOfDepartment,
  summarizeByDepartment,
  totalsOfRows,
} from "../../src/lib/lecture-execution-by-department";

const row = (over: Record<string, unknown>) =>
  ({
    course_section_id: Math.random().toString(36),
    course_code: "X",
    course_name_ar: "م",
    section_code: "A",
    department_name_ar: "قسم علوم الحاسوب",
    faculty_name: "",
    plan_status: "published",
    planned_count: 10,
    executed_count: 5,
    compensated_count: 1,
    postponed_count: 1,
    cancelled_count: 0,
    hindered_count: 1,
    not_executed_count: 2,
    uncompensated_count: 2,
    remaining_count: 3,
    execution_percent: 50,
    behind_plan: true,
    risk_level: "medium",
    ...over,
  }) as never;

const rows = [
  row({}),
  row({ planned_count: 20, executed_count: 18, behind_plan: false, remaining_count: 2 }),
  row({ department_name_ar: "قسم تكنولوجيا المعلومات", planned_count: 3, executed_count: 1 }),
  row({ department_name_ar: "قسم تكنولوجيا المعلومات", plan_status: "draft", planned_count: 0, executed_count: 0, behind_plan: false }),
  row({ department_name_ar: null, planned_count: 0, executed_count: 0, behind_plan: false }),
];

describe("delivery monitoring by department (college scope)", () => {
  test("totals mirror the RPC arithmetic", () => {
    const t = totalsOfRows(rows.slice(0, 2));
    expect(t.sections).toBe(2);
    expect(t.planned).toBe(30);
    expect(t.executed).toBe(23);
    expect(t.execution_percent).toBe(76.7);
    expect(t.behind_plan_courses).toBe(1);
    expect(totalsOfRows([]).execution_percent).toBeNull();
  });

  test("one summary per department; no-department last; awaiting plans counted", () => {
    const s = summarizeByDepartment(rows);
    expect(s.map((d) => d.name)).toEqual(["قسم تكنولوجيا المعلومات", "قسم علوم الحاسوب", "بدون قسم"]);
    expect(s[0].totals.sections).toBe(2);
    expect(s[0].awaitingPlan).toBe(1);
    expect(s[0].totals.execution_percent).toBe(33.3);
    expect(s[2].key).toBe(NO_DEPARTMENT_KEY);
  });

  test("department figures add up to the college figures", () => {
    const s = summarizeByDepartment(rows);
    const all = totalsOfRows(rows);
    for (const k of ["sections", "planned", "executed", "remaining", "uncompensated", "behind_plan_courses"] as const) {
      expect(s.reduce((a, d) => a + d.totals[k], 0)).toBe(all[k]);
    }
  });

  test("filter: null = college, unknown key = nothing", () => {
    expect(rowsOfDepartment(rows, null)).toHaveLength(5);
    expect(rowsOfDepartment(rows, "قسم علوم الحاسوب")).toHaveLength(2);
    expect(rowsOfDepartment(rows, NO_DEPARTMENT_KEY)).toHaveLength(1);
    expect(rowsOfDepartment(rows, "غير موجود")).toHaveLength(0);
  });

  test("panel shows the breakdown only in college scope and never widens data", () => {
    const panel = readFileSync("src/components/lecture-execution/DeliveryMonitoringPanel.tsx", "utf8");
    expect(panel).toContain("المتابعة حسب القسم");
    expect(panel).toContain("isCollege && departmentSummaries.length > 0");
    expect(panel).toContain('const isCollege = data.scope === "college"');
    // still one RPC-backed query; the breakdown only regroups returned rows
    expect(panel.match(/useQuery\(/g)).toHaveLength(1);
    const lib = readFileSync("src/lib/lecture-execution-by-department.ts", "utf8");
    expect(lib).not.toContain("supabase");
  });
});
