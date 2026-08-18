import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { portalFeatures } from "../../src/lib/portal-features";
import {
  filterAvailableRequestTypesForStudentPage,
  isRequestTypeActionable,
} from "../../src/lib/student-requests/available-request-types-ui";
import {
  CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP,
  CURRENT_PROCESSING_UNIT_UNSET_LABEL_AR,
  formatStudentCurrentProcessingUnitLabel,
} from "../../src/lib/student-requests/student-request-unit-label";

const ROOT = join(import.meta.dir, "../..");

describe("STUDENT-PORTAL-DASHBOARD-REQUESTS-UX-CLOSURE-01", () => {
  it("1 — available services on requests page use live RPC server fn", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).toContain("getStudentRequestTypesForStudent");
    // STUDENT-REQUEST-TRACKING-01: list source moved from
    // getMyStudentServiceRequests → getMyStudentRequestsWithProgress so the
    // card can render the workflow-derived current stage + fee status
    // (current_role_key / legacy service-step reads are gone).
    expect(page).toContain("getMyStudentRequestsWithProgress");
    expect(page).toContain("الخدمات المتاحة");
    expect(page).toContain("اختر الخدمة التي ترغب في تقديم طلب بشأنها.");
    expect(page).not.toMatch(/const\s+STATIC_SERVICES|hardcodedTypes/);
  });

  it("2 — eligible active-visible type appears; inactive-style disabled dropped when not official", () => {
    const rows = filterAvailableRequestTypesForStudentPage([
      {
        code: "grade_appeal",
        name_ar: "تظلم درجة",
        description_ar: "وصف",
        is_eligible: true,
        is_disabled: false,
        ineligible_display_mode: "show",
        sort_order: 1,
      },
      {
        code: "other",
        name_ar: "أخرى",
        description_ar: null,
        is_eligible: false,
        is_disabled: false,
        ineligible_display_mode: "show",
        sort_order: 2,
      },
    ]);
    expect(rows.map((r) => r.code)).toEqual(["grade_appeal"]);
    expect(isRequestTypeActionable(rows[0]!)).toBe(true);
  });

  it("3 — hidden / enrollment_certificate hide mode does not appear", () => {
    const rows = filterAvailableRequestTypesForStudentPage([
      {
        code: "enrollment_certificate",
        name_ar: "شهادة قيد",
        description_ar: null,
        is_eligible: false,
        is_disabled: false,
        ineligible_display_mode: "hidden",
        sort_order: 0,
      },
      {
        code: "hidden_svc",
        name_ar: "مخفي",
        description_ar: null,
        is_eligible: false,
        is_disabled: true,
        ineligible_display_mode: "hide",
        sort_order: 1,
      },
    ]);
    expect(rows).toHaveLength(0);
  });

  it("4 — official disabled listing can appear but is not actionable", () => {
    const rows = filterAvailableRequestTypesForStudentPage([
      {
        code: "grade_appeal",
        name_ar: "تظلم درجة",
        description_ar: null,
        is_eligible: false,
        is_disabled: true,
        ineligible_display_mode: "disabled",
        sort_order: 3,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(isRequestTypeActionable(rows[0]!)).toBe(false);
  });

  it("4b — eligible hidden-mode rows stay visible; B1 services are not duplicated", () => {
    const rows = filterAvailableRequestTypesForStudentPage([
      {
        code: "enrollment_certificate",
        name_ar: "شهادة قيد",
        description_ar: null,
        is_eligible: true,
        is_disabled: false,
        ineligible_display_mode: "hidden",
        sort_order: 1,
      },
      {
        code: "department_transfer",
        name_ar: "تحويل",
        description_ar: null,
        is_eligible: true,
        is_disabled: false,
        ineligible_display_mode: "hidden",
        sort_order: 9,
      },
    ]);
    expect(rows.map((r) => r.code)).toEqual(["enrollment_certificate"]);
  });


  it("5 — empty vs error copy exist as distinct strings on page", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).toContain("لا توجد خدمات متاحة للتقديم حالياً.");
    expect(page).toContain("تعذر تحميل الخدمات المتاحة. حاول مرة أخرى.");
    expect(page).toContain("typesError");
    expect(page).toContain("requestsError");
    expect(page).toContain("لا توجد طلبات بعد.");
  });

  it("6 — requests list uses owner RPC; no impersonation / service-role student swap", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    const fn = readFileSync(join(ROOT, "src/lib/student-affairs.functions.ts"), "utf8");
    const trackingFn = readFileSync(
      join(ROOT, "src/lib/student-requests/student-tracking.functions.ts"),
      "utf8",
    );
    // Page calls the enriched wrapper; the wrapper delegates to
    // rpcGetMyStudentRequests (auth.uid()-scoped RPC via context.supabase).
    expect(page).toContain("getMyStudentRequestsWithProgress");
    expect(trackingFn).toContain("rpcGetMyStudentRequests(context.supabase)");
    // Legacy wrapper is still exported and still auth-scoped for other consumers.
    expect(fn).toContain("getMyStudentServiceRequests");
    expect(fn).toContain("rpcGetMyStudentRequests");
    expect(page).not.toContain("93807768");
    expect(page).not.toMatch(/service_role|as\s+student_profile_id\s*:/);
  });

  it("7 — requests are isolated in a dedicated accessible tab", () => {
    const nav = readFileSync(join(ROOT, "src/components/portal/StudentRequestsNav.tsx"), "utf8");
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    const layout = readFileSync(join(ROOT, "src/routes/student.requests.tsx"), "utf8");
    expect(nav).toContain('to="/student"');
    expect(nav).toContain("العودة إلى بوابة الطالب");
    expect(layout).toContain("StudentRequestsNav");
    expect(page).toContain('useState<"services" | "requests">("services")');
    expect(page).toContain('aria-label="أقسام الخدمات الطلابية"');
    expect(page).toContain('role="tablist"');
    expect(page).toContain('role="tab"');
    expect(page).toContain('role="tabpanel"');
    expect(page).toContain("الوثائق والإفادات والشكاوى");
    expect(page).toContain('aria-selected={activeTab === "services"}');
    expect(page).toContain('aria-selected={activeTab === "requests"}');
    expect(page).toContain('{activeTab === "services" ? (');
    expect(page).toContain('{activeTab === "requests" ? (');
    expect(page).toContain("طلباتي");
    expect(page).toContain("{requests.length}");
    expect(page).not.toContain("scrollToServices");
  });

  it("8 — طلب جديد / تقديم طلب opens type selection path", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    const neu = readFileSync(join(ROOT, "src/routes/student.requests.new.tsx"), "utf8");
    expect(page).toContain('to="/student/requests/new"');
    expect(page).toContain("search={{ type: type.code }}");
    expect(neu).toContain("validateSearch");
    expect(neu).toContain("typeFromSearch");
  });

  it("9 — dashboard cards use compact density and horizontal service row", () => {
    const dash = readFileSync(join(ROOT, "src/routes/student.index.tsx"), "utf8");
    const card = readFileSync(join(ROOT, "src/components/brand/StatCard.tsx"), "utf8");
    const std = readFileSync(join(ROOT, "src/components/brand/StandardCard.tsx"), "utf8");
    expect(dash).toContain('density="compact"');
    expect(dash).toContain("flex-row items-start gap-3");
    expect(dash).toContain("grid-cols-1 sm:grid-cols-2 lg:grid-cols-4");
    expect(card).toContain('compact ? "items-center"');
    expect(std).toContain('"p-3"');
  });

  it("10 — mobile request cards vs desktop table; no page-wide only overflow as sole mobile UX", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).toContain("md:hidden");
    expect(page).toContain("hidden md:block");
    expect(page).toContain("عرض التفاصيل");
    expect(page).toContain("break-words");
    expect(page).toContain("break-all");
  });

  it("11 — finance feature flags remain frozen; no finance fee UI forced on", () => {
    expect(portalFeatures.studentFinance).toBe(false);
    expect(portalFeatures.adminFinance).toBe(false);
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).toContain("portalFeatures.studentFinance");
  });

  it("12 — current stage now derived from student_request_workflow_steps (no current_role_key on card)", () => {
    // Helper still exports these for other legacy surfaces / imports.
    expect(formatStudentCurrentProcessingUnitLabel(null)).toBe(
      CURRENT_PROCESSING_UNIT_UNSET_LABEL_AR,
    );
    expect(formatStudentCurrentProcessingUnitLabel("student_affairs")).toBe("شؤون الطلاب");
    expect(CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP).toContain(
      "CURRENT_PROCESSING_UNIT_READ_CONTRACT_GAP",
    );
    // The student requests LIST page no longer reads current_role_key —
    // it shows the workflow-derived Arabic stage name (currentStageAr).
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).not.toContain("formatStudentCurrentProcessingUnitLabel");
    expect(page).not.toContain("current_role_key");
    expect(page).toContain("currentStageAr");
    expect(page).toContain("المرحلة الحالية");
  });

  it("13 — no Migration / Auth / role grant mutations in this phase files", () => {
    const page = readFileSync(join(ROOT, "src/routes/student.requests.index.tsx"), "utf8");
    expect(page).not.toMatch(/\.insert\(|\.update\(|\.delete\(|supabaseAdmin/);
    expect(page).not.toContain("93807768-a281-42de-bfb4-0c0c03786b20");
  });

  it("14 — routes for finance / schedule / progress not deleted", () => {
    expect(readFileSync(join(ROOT, "src/routes/student.index.tsx"), "utf8")).toContain(
      'to: "/student/schedule"',
    );
    expect(readFileSync(join(ROOT, "src/lib/portal-features.ts"), "utf8")).toContain(
      "studentFinance: false",
    );
  });
});
