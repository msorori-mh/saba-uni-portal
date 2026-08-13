/**
 * ADMIN-NAVIGATION-AND-DASHBOARD-UX-REORGANIZATION-01
 *
 * SOURCE-LEVEL guards: role filtering, search visibility, accordion,
 * dashboard IA priority, terminology, and mobile a11y preservation.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_LEGACY_SIDEBAR_PATHS,
  ADMIN_NAV_PRIMARY_GROUP_ORDER,
  ADMIN_NAV_SEARCH_PLACEHOLDER,
  applyAdminFinanceNavGate,
  collectAdminNavArabicLabels,
  collectAdminNavPaths,
  findActiveAdminNavGroupId,
  hasDuplicateNavPaths,
  searchAdminNav,
  searchMatchingGroupIds,
  toggleExclusiveGroup,
  type AdminNavGroup,
} from "../../src/lib/admin-navigation-config";
import { filterNavGroups, NAV_ITEM_ROLES } from "../../src/lib/admin-nav";
import { portalFeatures } from "../../src/lib/portal-features";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SHELL = read("src/components/admin/AdminShell.tsx");
const DASHBOARD = read("src/routes/admin/index.lazy.tsx");
const NAV_CONFIG = read("src/lib/admin-navigation-config.ts");

/** Banned user-facing Arabic terminology — kept in the test only so source UI files stay clean. */
const BANNED_ADMIN_UI_TERMS = ["شعبة", "شعب", "الشعبة", "الشعب"] as const;

function containsBannedAdminUiTerm(text: string): boolean {
  return BANNED_ADMIN_UI_TERMS.some((term) => text.includes(term));
}

function visibleFor(roles: string[]): AdminNavGroup[] {
  return filterNavGroups(
    applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, portalFeatures.adminFinance),
    roles,
  ) as AdminNavGroup[];
}

describe("ADMIN-NAVIGATION-AND-DASHBOARD-UX-REORGANIZATION-01", () => {
  it("1 — admin role filtering remains authoritative (filterNavGroups after finance gate)", () => {
    expect(SHELL).toContain("filterNavGroups");
    expect(SHELL).toContain("applyAdminFinanceNavGate");
    expect(SHELL).toMatch(/filterNavGroups\(\s*applyAdminFinanceNavGate/);
    // Search must not precede filtering in the shell dataflow.
    const filterIdx = SHELL.indexOf("filterNavGroups");
    const searchIdx = SHELL.indexOf("searchAdminNav(visibleGroups");
    expect(filterIdx).toBeGreaterThan(-1);
    expect(searchIdx).toBeGreaterThan(filterIdx);
  });

  it("2 — search only searches role-visible items", () => {
    const hr = visibleFor(["hr_officer"]);
    const hits = searchAdminNav(hr, "الدرجات");
    expect(hits.length).toBe(0);
    expect(collectAdminNavPaths(hr)).not.toContain("/admin/grades");
    expect(SHELL).toContain("searchAdminNav(visibleGroups");
  });

  it("3 — search finds الدرجات", () => {
    const admin = visibleFor(["admin"]);
    const hits = searchAdminNav(admin, "درجات");
    expect(hits.some((h) => h.item.to === "/admin/grades")).toBe(true);
    expect(hits.some((h) => h.item.label.includes("الدرجات"))).toBe(true);
  });

  it("4 — search finds مشاريع التخرج", () => {
    const admin = visibleFor(["admin"]);
    const hits = searchAdminNav(admin, "مشاريع");
    expect(hits.some((h) => h.item.to === "/admin/graduation-projects")).toBe(true);
  });

  it("5 — search finds المجالس الأكاديمية", () => {
    const admin = visibleFor(["admin"]);
    const hits = searchAdminNav(admin, "مجالس");
    expect(hits.some((h) => h.item.to === "/admin/academic-councils")).toBe(true);
  });

  it("6 — search finds المجموعات", () => {
    const admin = visibleFor(["admin"]);
    const hits = searchAdminNav(admin, "مجموعات");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some(
        (h) =>
          h.item.label.includes("المجموعات") ||
          h.item.label.includes("تقسيم المجموعات") ||
          h.item.to === "/admin/course-offerings" ||
          h.item.to === "/admin/enrollments",
      ),
    ).toBe(true);
  });

  it("7 — search does not reveal unauthorized routes", () => {
    const registrar = visibleFor(["registrar"]);
    const auditHits = searchAdminNav(registrar, "سجل التدقيق");
    expect(auditHits.length).toBe(0);
    expect(collectAdminNavPaths(registrar)).not.toContain("/admin/audit-log");

    const usersHits = searchAdminNav(registrar, "المستخدمون");
    expect(usersHits.every((h) => h.item.to !== "/admin/users")).toBe(true);
  });

  it("8 — active group opens on route change", () => {
    const groups = visibleFor(["admin"]);
    expect(findActiveAdminNavGroupId(groups, "/admin/grades")).toBe("academic");
    expect(findActiveAdminNavGroupId(groups, "/admin/academic-councils")).toBe("governance");
    expect(SHELL).toMatch(/setExpandedGroupId\(activeGroupId\)/);
  });

  it("9 — accordion prefers one primary group open", () => {
    expect(toggleExclusiveGroup(null, "academic")).toBe("academic");
    expect(toggleExclusiveGroup("academic", "students")).toBe("students");
    expect(toggleExclusiveGroup("students", "students")).toBe(null);
    expect(SHELL).toContain("toggleExclusiveGroup");
    expect(SHELL).toContain("expandedGroupId");
    // Search temporarily expands matching groups.
    const open = searchMatchingGroupIds(visibleFor(["admin"]), "درجات");
    expect(open.has("academic")).toBe(true);
  });

  it("10 — dashboard route unchanged (/admin/)", () => {
    expect(DASHBOARD).toContain('createLazyFileRoute("/admin/")');
    expect(DASHBOARD).toContain("component: AdminDashboard");
  });

  it("11 — top KPI set exists", () => {
    expect(DASHBOARD).toContain('data-testid="admin-dashboard-kpi-row"');
    expect(DASHBOARD).toContain("نظرة سريعة");
  });

  it("12 — الطلاب metric not duplicated unnecessarily near top", () => {
    // Primary KPI row has الطلاب once; removed the nearby "إحصائيات أكاديمية" duplicate block.
    expect(DASHBOARD).not.toContain("إحصائيات أكاديمية");
    const kpiBlock = DASHBOARD.slice(
      DASHBOARD.indexOf('data-testid="admin-dashboard-kpi-row"'),
      DASHBOARD.indexOf('data-testid="admin-dashboard-attention"'),
    );
    const studentLabels = kpiBlock.match(/label="الطلاب"/g) ?? [];
    expect(studentLabels.length).toBe(1);
  });

  it("13 — المقررات exists in top KPI", () => {
    expect(DASHBOARD).toMatch(/label="المقررات"/);
  });

  it("14 — المجموعات الدراسية exists in top KPI", () => {
    expect(DASHBOARD).toMatch(/label="المجموعات الدراسية"/);
  });

  it("15 — الطلبات المفتوحة exists in top KPI", () => {
    expect(DASHBOARD).toMatch(/label="الطلبات المفتوحة"/);
  });

  it("16 — يحتاج انتباهك exists", () => {
    expect(DASHBOARD).toContain("يحتاج انتباهك");
    expect(DASHBOARD).toContain('data-testid="admin-dashboard-attention"');
  });

  it("17 — system health occurs lower than operational/academic priority areas", () => {
    const opsIdx = DASHBOARD.indexOf('"الشؤون الأكاديمية"');
    const schedulesIdx = DASHBOARD.indexOf('"عمليات اليوم / الجداول"');

    const healthIdx = DASHBOARD.indexOf('"صحة النظام"');
    expect(opsIdx).toBeGreaterThan(-1);
    expect(schedulesIdx).toBeGreaterThan(-1);
    expect(healthIdx).toBeGreaterThan(-1);
    expect(opsIdx).toBeLessThan(healthIdx);
    expect(schedulesIdx).toBeLessThan(healthIdx);
    // «التقدم الأكاديمي» card is intentionally hidden from the rendered
    // dashboard; its ordering rank must still precede system health.
    const orderBlock = DASHBOARD.slice(DASHBOARD.indexOf("const order = ["));
    const progressRank = orderBlock.indexOf('"التقدم الأكاديمي"');
    const healthRank = orderBlock.indexOf('"صحة النظام"');
    expect(progressRank).toBeGreaterThan(-1);
    expect(progressRank).toBeLessThan(healthRank);
    expect(DASHBOARD).toContain("admin-dashboard-system-health");
  });

  it("18 — responsive classes exist (KPI + cards)", () => {
    expect(DASHBOARD).toContain("sm:grid-cols-2");
    expect(DASHBOARD).toContain("xl:grid-cols-4");
    expect(SHELL).toContain("w-80");
    expect(SHELL).toContain("max-w-[94vw]");
  });

  it("19 — mobile drawer accessibility preserved", () => {
    expect(SHELL).toMatch(/aria-expanded=\{mobileOpen\}/);
    expect(SHELL).toMatch(/aria-controls="admin-sidebar"/);
    expect(SHELL).toMatch(/id="admin-sidebar"/);
    expect(SHELL).toMatch(/aria-label="إغلاق القائمة"/);
    expect(SHELL).toMatch(/aria-label="فتح القائمة"/);
    expect(SHELL).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(SHELL).toMatch(/setMobileOpen\(false\)/);
    expect(SHELL).toMatch(/menuButtonRef\.current\?\.focus\(\)/);
    expect(SHELL).toMatch(/if \(mobileOpen\) closeButtonRef\.current\?\.focus\(\)/);
    expect(SHELL).toMatch(/aria-hidden="true"/);
  });

  it("20 — no banned Arabic UI terminology in AdminShell / dashboard / nav config", () => {
    for (const term of BANNED_ADMIN_UI_TERMS) {
      expect(SHELL.includes(term)).toBe(false);
      expect(DASHBOARD.includes(term)).toBe(false);
      expect(NAV_CONFIG.includes(term)).toBe(false);
    }
    const labels = collectAdminNavArabicLabels(ADMIN_NAV_GROUPS);
    expect(labels.some(containsBannedAdminUiTerm)).toBe(false);
    // Approved terminology present.
    expect(NAV_CONFIG).toContain("المجموعات الدراسية");
    expect(NAV_CONFIG).toContain("تقسيم المجموعات");
    expect(DASHBOARD).toContain("المجموعات الدراسية");
    expect(DASHBOARD).toContain("المجموعات الدراسية النشطة");
    expect(DASHBOARD).toContain("المجموعات الدراسية غير المجدولة");
  });

  it("nav groups reorganized to operational IA (~8–10)", () => {
    expect(ADMIN_NAV_GROUPS.map((g) => g.id)).toEqual([...ADMIN_NAV_PRIMARY_GROUP_ORDER]);
    expect(ADMIN_NAV_GROUPS.length).toBeGreaterThanOrEqual(8);
    expect(ADMIN_NAV_GROUPS.length).toBeLessThanOrEqual(10);
    expect(ADMIN_NAV_GROUPS.map((g) => g.label)).toEqual([
      "لوحة التحكم",
      "الشؤون الأكاديمية",
      "شؤون الطلاب",
      "الهيئة التدريسية والإدارية",
      "المجالس الأكاديمية",
      "مشاريع التخرج",
      "شؤون الخريجين",
      "المالية والوثائق",
      "التواصل والتقارير",
      "النظام والإعدادات",
    ]);
  });

  it("legacy sidebar paths preserved; no duplicates; every path authorized", () => {
    expect(hasDuplicateNavPaths(ADMIN_NAV_GROUPS)).toBe(false);
    const current = new Set(collectAdminNavPaths(ADMIN_NAV_GROUPS));
    // /admin/department-reports is intentionally hidden from the admin sidebar
    // (feature not enabled); /admin/graduation-candidates is intentionally
    // hidden as part of the graduation-projects closure. Both routes and their
    // authorization stay untouched.
    const INTENTIONALLY_HIDDEN_LEGACY_PATHS = new Set([
      "/admin/department-reports",
      "/admin/graduation-candidates",
      // Academic-progress surfaces hidden from the sidebar by owner decision;
      // routes and authorization stay untouched.
      "/admin/at-risk-students",
    ]);
    for (const path of ADMIN_NAV_LEGACY_SIDEBAR_PATHS) {
      if (INTENTIONALLY_HIDDEN_LEGACY_PATHS.has(path)) continue;
      expect(current.has(path)).toBe(true);
    }
    for (const path of current) {
      expect(NAV_ITEM_ROLES[path]).toBeTruthy();
    }
  });

  it("search UI placeholder and clear control wired", () => {
    expect(ADMIN_NAV_SEARCH_PLACEHOLDER).toBe("ابحث عن خدمة أو نظام...");
    expect(SHELL).toContain("ADMIN_NAV_SEARCH_PLACEHOLDER");
    expect(SHELL).toContain('id="admin-nav-search"');
    expect(SHELL).toContain('aria-label="مسح البحث"');
    expect(SHELL).toMatch(/setSearchQuery\(""\)/);
  });

  it("loading metrics use em-dash not silent zero for top KPIs", () => {
    expect(DASHBOARD).toContain('return "—"');
    expect(DASHBOARD).toContain("loadingCounts");
    expect(DASHBOARD).toContain("loadingKpis");
  });

  it("font hierarchy targets applied (nav readable, not 13px children)", () => {
    expect(SHELL).toContain("text-[15px]");
    expect(SHELL).toContain("text-sm"); // 14px items
    expect(SHELL).not.toMatch(/text-\[13px\].*font-semibold transition-all/);
    expect(SHELL).toContain("text-[13px]"); // breadcrumb minimum ok
  });

  it("RTL shell preserved", () => {
    expect(SHELL).toContain('dir="rtl"');
  });
});
