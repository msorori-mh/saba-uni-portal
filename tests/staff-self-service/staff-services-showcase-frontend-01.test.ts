import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const data = readFileSync("src/lib/staff-self-service-showcase.ts", "utf8");
const staff = readFileSync(
  "src/components/staff-showcase/StaffSelfServiceShowcase.tsx",
  "utf8",
);
const admin = readFileSync(
  "src/components/admin/staff-management/EmployeeServicesShowcase.tsx",
  "utf8",
);
const route = [
  readFileSync("src/routes/staff.index.tsx", "utf8"),
  readFileSync("src/components/staff-portal/StaffEmployeePortal.tsx", "utf8"),
].join("\n");
const adminRoute = readFileSync("src/routes/admin/staff-management.tsx", "utf8");
const nav = readFileSync("src/lib/admin-navigation-config.ts", "utf8");

describe("PORTAL_STAFF_SERVICES_SHOWCASE_FRONTEND_01", () => {
  test("uses isolated showcase fixtures and contains no Supabase mutation", () => {
    expect(data).toContain("TEST_ONLY_STAFF_SERVICES_SHOWCASE_01");
    expect(data).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(staff).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
    expect(admin).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });

  test("covers all approved employee self-service modules", () => {
    for (const label of [
      "ملفي الوظيفي",
      "الإجازات والمغادرات",
      "كشوف الرواتب",
      "المسار الوظيفي",
      "المراسلات والتعاميم",
      "العُهد",
      "مهام الاعتماد",
      "الإفادات وشهادات الخبرة",
      "الأداء السنوي",
      "الحضور والانصراف",
      "التكليفات والعمل الإضافي",
      "التدريب والتطوير",
      "الترقيات والتسويات",
      "إخلاء الطرف",
    ]) {
      expect(staff).toContain(label);
    }
  });

  test("mirrors employee effects to HR Finance manager and administrator", () => {
    for (const label of [
      "لوحة خدمات الموظفين",
      "الإجازات والمغادرات",
      "الرواتب والمسار المالي",
      "المراسلات والتعاميم",
      "العُهد والتسليم",
      "الترقيات والتسويات",
      "الأداء السنوي",
      "الحضور والعمل الإضافي",
      "التدريب والتطوير",
      "إخلاء الطرف",
      "تقارير الموارد البشرية",
      "سجل التدقيق",
    ]) {
      expect(admin).toContain(label);
    }
    expect(admin).toContain("Direct Manager");
    expect(admin).toContain("Finance");
    expect(admin).toContain("Administrator");
  });

  test("mounts the operational employee surface and keeps the admin workspace", () => {
    expect(route).toContain("StaffSelfServiceLiveActions");
    expect(route).toContain("StaffSelfServiceLiveDashboard");
    expect(route).not.toContain("StaffSelfServiceShowcase");
    expect(adminRoute).toContain("EmployeeServicesShowcase");
    expect(adminRoute).toContain('value="services"');
    expect(nav).toContain("الموارد البشرية وخدمات الموظفين");
  });

  test("keeps legacy print artifacts isolated from the active employee route", () => {
    expect(route).not.toContain("staff-services-print-pack");
    expect(staff).toContain("staff-services-print-pack");
    expect(staff).toContain("طباعة حزمة العرض");
    expect(admin).toContain("admin-services-print-pack");
    expect(admin).toContain("طباعة حزمة العرض");
    expect(staff).toContain("print:break-after-page");
    expect(admin).toContain("print:break-after-page");
  });

  test("keeps salary confidentiality and phase-two integrations explicit", () => {
    expect(staff).toContain("يتطلب العرض والتنزيل تحققاً إضافياً");
    expect(admin).toContain("تظهر هذه الصفحة لدور Finance");
    expect(admin).toContain("نظام الموارد البشرية");
    expect(admin).toContain("النظام المالي");
    expect(admin).toContain("المرحلة الثانية");
  });
});
