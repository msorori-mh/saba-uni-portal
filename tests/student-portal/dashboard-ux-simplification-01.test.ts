import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  portalFeatures,
  isPortalFeatureEnabled,
} from "../../src/lib/portal-features";
import { filterDashboardAvailableServices } from "../../src/components/portal/StudentRequestsPortalSummary";

const ROOT = join(import.meta.dir, "../..");

describe("STUDENT-PORTAL-DASHBOARD-UX-SIMPLIFICATION-01", () => {
  it("1 — finance and transcript feature flags are off", () => {
    expect(portalFeatures.studentFinance).toBe(false);
    expect(portalFeatures.adminFinance).toBe(false);
    expect(portalFeatures.studentRegisteredCourses).toBe(false);
    expect(portalFeatures.studentUnofficialTranscript).toBe(false);
    expect(isPortalFeatureEnabled("studentFinance")).toBe(false);
  });

  it("2 — student dashboard hides courses and unofficial transcript behind flags", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.index.tsx"), "utf8");
    expect(page).toContain("portalFeatures.studentRegisteredCourses");
    expect(page).toContain("portalFeatures.studentUnofficialTranscript");
    expect(page).toContain("portalFeatures.studentFinance");
    expect(page).toContain('to: "/student/requests"');
    expect(page).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
  });

  it("3 — student requests summary has طلب جديد / طلباتي and empty copy", () => {
    const src = readFileSync(
      join(ROOT, "src/components/portal/StudentRequestsPortalSummary.tsx"),
      "utf8",
    );
    expect(src).toContain('to="/student/requests/new"');
    expect(src).toContain('to="/student/requests"');
    expect(src).toContain("طلب جديد");
    expect(src).toContain("طلباتي");
    expect(src).toContain("لم تقدم أي طلب حتى الآن.");
    expect(src).toContain("ابدأ بتقديم طلب جديد من الخدمات المتاحة.");
    expect(src).toContain("slice(0, 3)");
    expect(src).not.toContain("إدارة الطلبات");
    expect(src).not.toContain("عرض كل الطلبات");
    expect(src).toContain("getStudentRequestTypesForStudent");
    expect(src).toContain("isError: requestsError");
  });

  it("4 — filterDashboardAvailableServices hides ineligible/disabled types", () => {
    const rows = filterDashboardAvailableServices(
      [
        {
          code: "enrollment_certificate",
          name_ar: "شهادة قيد",
          description_ar: null,
          is_eligible: false,
          is_disabled: false,
          ineligible_display_mode: "hide",
          sort_order: 1,
        },
        {
          code: "other",
          name_ar: "خدمة",
          description_ar: "وصف",
          is_eligible: true,
          is_disabled: false,
          ineligible_display_mode: "show_disabled",
          sort_order: 2,
        },
        {
          code: "disabled",
          name_ar: "معطّلة",
          description_ar: null,
          is_eligible: true,
          is_disabled: true,
          ineligible_display_mode: "show",
          sort_order: 0,
        },
      ],
      4,
    );
    expect(rows.map((r) => r.code)).toEqual(["other"]);
  });

  it("5 — admin finance nav and dashboard gated by adminFinance", () => {
    const shell = readFileSync(join(ROOT, "src/components/admin/AdminShell.tsx"), "utf8");
    expect(shell).toContain("portalFeatures.adminFinance");
    expect(shell).toContain("applyAdminFinanceNavGate");
    const navConfig = readFileSync(join(ROOT, "src/lib/admin-navigation-config.ts"), "utf8");
    expect(navConfig).toContain("applyAdminFinanceNavGate");
    expect(navConfig).toContain('it.to !== "/admin/finance"');
    const dash = readFileSync(join(ROOT, "src/routes/admin/index.lazy.tsx"), "utf8");
    expect(dash).toContain("FINANCE_FROZEN_CARD_LABELS");
    expect(dash).toContain('sec.title !== "المالية"');
    const finance = readFileSync(join(ROOT, "src/routes/admin/finance.lazy.tsx"), "utf8");
    expect(finance).toContain("FeatureFrozenNotice");
    expect(finance).toContain("!portalFeatures.adminFinance");
  });

  it("6 — mobile finance respects studentFinance flag", () => {
    const mobile = readFileSync(join(ROOT, "src/routes/mobile.student.finance.tsx"), "utf8");
    expect(mobile).toContain("portalFeatures.studentFinance");
    expect(mobile).toContain("STUDENT_FINANCE_FROZEN_MSG");
    // The mobile home surface must not expose an unguarded finance entry point.
    const home = readFileSync(join(ROOT, "src/routes/mobile.student.index.tsx"), "utf8");
    if (home.includes("/mobile/student/finance")) {
      expect(home).toContain("portalFeatures.studentFinance");
    }
  });

  it("7 — documents empty state points to student affairs requests", () => {
    const docs = readFileSync(
      join(ROOT, "src/components/portal/StudentDocumentsSection.tsx"),
      "utf8",
    );
    expect(docs).toContain("لا توجد وثائق رسمية صادرة لك حالياً.");
    expect(docs).toContain("يمكنك طلب الوثائق المتاحة من قسم طلبات شؤون الطلاب.");
  });
});
