import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { portalFeatures } from "../../src/lib/portal-features";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Graduates Affairs staff operational surface", () => {
  const route = read("src/routes/staff.graduates-affairs.tsx");
  const workspace = read("src/components/portal/GraduatesAffairsStaffWorkspace.tsx");
  const functions = read("src/lib/graduates-affairs/graduates-affairs.functions.ts");
  const navigation = read("src/lib/admin-navigation-config.ts");

  test("remains behind the existing disabled production gate", () => {
    expect(portalFeatures.staffGraduatesAffairs).toBe(false);
    expect(route).toContain("portalFeatures.staffGraduatesAffairs");
    expect(route).toContain("FeatureFrozenNotice");
    expect(route).toContain("GraduatesAffairsStaffWorkspace");
  });

  test("reads supported records and files through approved server adapters", () => {
    expect(workspace).toContain("searchGraduateRecordsFn");
    expect(workspace).toContain("getStaffGraduateFileFn");
    expect(functions).toContain("GraduatesAffairsRpcClient");
    expect(functions).not.toMatch(/\.from\(["']graduate_/);
    expect(workspace).not.toMatch(/supabase\.from|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });

  test("does not accept app roles or client-supplied staff scope", () => {
    expect(workspace).not.toMatch(
      /appRoles|app_role|assignments|departmentIds|isManager|isSpecialist/,
    );
    expect(workspace).toContain("دور الإدارة العام لا يمنح الوصول");
  });

  test("provides operational states, filters, and responsive RTL presentation", () => {
    expect(route).toContain('dir="rtl"');
    expect(workspace).toContain("نظرة عامة");
    expect(workspace).toContain("مرشحو التخرج");
    expect(workspace).toContain("الخريجون المعتمدون");
    expect(workspace).toContain("قائمة العمل");
    expect(workspace).toContain("جارٍ تحميل");
    expect(workspace).toContain("تعذّر");
    expect(workspace).toContain("لا توجد سجلات مطابقة");
    expect(workspace).toMatch(/sm:grid|md:grid|lg:grid/);
  });

  test("does not modify the protected navigation configuration in this mission", () => {
    expect(navigation).not.toContain("/staff/graduates-affairs");
    expect(navigation).toContain("/admin/graduation-projects");
  });
});
