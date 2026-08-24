import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const staffGuard = readFileSync("src/routes/staff.tsx", "utf8");
const portalLogin = readFileSync("src/routes/portal-login.tsx", "utf8");
const staffRoute = [
  readFileSync("src/routes/staff.index.tsx", "utf8"),
  readFileSync("src/components/staff-portal/StaffEmployeePortal.tsx", "utf8"),
].join("\n");
const adminRoute = readFileSync("src/routes/admin/staff-management.tsx", "utf8");
const employeeShowcase = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceShowcase.tsx",
  "utf8",
);
const adminShowcase = readFileSync(
  "src/components/admin/staff-management/EmployeeServicesShowcase.tsx",
  "utf8",
);
const actions = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveActions.tsx",
  "utf8",
);
const dashboard = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveDashboard.tsx",
  "utf8",
);
const workbench = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceLiveWorkbench.tsx",
  "utf8",
);
const governance = readFileSync(
  "src/components/staff-showcase/StaffGovernancePanels.tsx",
  "utf8",
);

describe("PORTAL_STAFF_OPERATIONAL_VISUAL_CLOSURE_02K", () => {
  test("permanently removes the legacy demo credential helper from every environment", () => {
    for (const legacyMarker of [
      "VITE_SHOW_DEMO_LOGIN",
      "SHOW_DEMO",
      "DEMO_CREDENTIALS",
      "DemoHint",
      "CopyChip",
      "تعبئة الحقول فقط",
      "تعبئة بيانات الحساب التجريبي",
      "دخول تجريبي بنقرة واحدة",
    ]) {
      expect(portalLogin).not.toContain(legacyMarker);
    }
  });

  test("defers the fail-closed staff guard until hydration and preserves login context", () => {
    expect(staffGuard).not.toContain("beforeLoad: async");
    expect(staffGuard).toContain("void validateSession()");
    expect(staffGuard).toContain("staff-auth-guard-loading");
    expect(staffGuard).toContain('to: "/portal-login"');
    expect(staffGuard).toContain('search: { type: "staff" }');
    expect(staffGuard).toContain("profileError || !profile");
    expect(staffGuard).toContain('pathname !== "/staff/change-password"');
  });

  test("keeps one employee operational surface and the admin workspace mounted", () => {
    expect(staffRoute).toContain("<StaffSelfServiceLiveActions");
    expect(staffRoute).toContain("<StaffSelfServiceLiveDashboard");
    expect(staffRoute).not.toContain("<StaffSelfServiceShowcase");
    expect(adminRoute).toContain("<StaffSelfServiceLiveWorkbench");
    expect(adminRoute).toContain("<EmployeeServicesShowcase");
    expect(actions).toContain('variant: "employee" | "approver"');
    expect(workbench).toContain("staff-self-service-live-workbench");
  });

  test("keeps legacy print sources isolated and the administrator pack available", () => {
    expect(staffRoute).not.toContain("staff-services-print-pack");
    expect(employeeShowcase).toContain("staff-services-print-pack");
    expect(employeeShowcase).toContain("طباعة الصفحة");
    expect(employeeShowcase).toContain("طباعة حزمة العرض");
    expect(employeeShowcase).toContain("print:break-after-page");
    expect(adminShowcase).toContain("admin-services-print-pack");
    expect(adminShowcase).toContain("طباعة حزمة العرض");
    expect(adminShowcase).toContain("print:break-after-page");
    expect(governance).toContain('dir="rtl"');
  });

  test("retains live request, payroll, correspondence, custody, and governance controls", () => {
    for (const marker of [
      "submitStaffServiceRequest",
      "decideStaffServiceRequest",
      "uploadStaffServiceAttachment",
    ]) {
      expect(actions).toContain(marker);
    }
    for (const marker of [
      "generateStaffPayrollStatementPdf",
      "markCorrespondenceRead",
      "acknowledgeCorrespondence",
      "لا توجد عهد مسجلة باسمك.",
    ]) {
      expect(dashboard).toContain(marker);
    }
    expect(governance).toContain("تقارير الموارد البشرية والمديرين");
    expect(governance).toContain("سجل التدقيق الموحد والمختزل");
    expect(governance).toContain("يلزم التحقق متعدد العوامل");
  });
});
