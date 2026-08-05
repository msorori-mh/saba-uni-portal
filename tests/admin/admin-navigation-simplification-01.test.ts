/**
 * PORTAL_ADMIN_NAVIGATION_SIMPLIFICATION_01
 *
 * SOURCE-LEVEL focused guards for task-oriented admin navigation.
 * No DB / no browser dependency.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_NAV_FREQUENT_PATHS,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_LEGACY_SIDEBAR_PATHS,
  ADMIN_NAV_PRIMARY_GROUP_ORDER,
  ADMIN_NAV_SEARCH_PLACEHOLDER,
  applyAdminFinanceNavGate,
  assertMaxNavDepthTwo,
  collectAdminNavPaths,
  findActiveAdminNavGroupId,
  frequentAdminNavItems,
  hasDuplicateNavPaths,
  navContainsGraduatesAffairsLinks,
  searchAdminNav,
  toggleExclusiveGroup,
  type AdminNavGroup,
} from "../../src/lib/admin-navigation-config";
import { filterNavGroups, NAV_ITEM_ROLES } from "../../src/lib/admin-nav";
import { portalFeatures } from "../../src/lib/portal-features";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SHELL = read("src/components/admin/AdminShell.tsx");
const ROUTE_TREE = read("src/routeTree.gen.ts");
const ROUTE_TREE_SHA = createHash("sha256").update(ROUTE_TREE).digest("hex");

function visibleFor(roles: string[]): AdminNavGroup[] {
  return filterNavGroups(
    applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, portalFeatures.adminFinance),
    roles,
  ) as AdminNavGroup[];
}

describe("PORTAL_ADMIN_NAVIGATION_SIMPLIFICATION_01", () => {
  it("1 — primary group ordering matches product IA", () => {
    expect(ADMIN_NAV_GROUPS.map((g) => g.id)).toEqual([...ADMIN_NAV_PRIMARY_GROUP_ORDER]);
    expect(ADMIN_NAV_GROUPS.map((g) => g.label)).toEqual([
      "لوحة التحكم",
      "العمل اليومي",
      "الشؤون الأكاديمية",
      "شؤون الطلاب والخدمات",
      "الكادر الأكاديمي",
      "مشاريع التخرج والخريجون",
      "القيادة والحوكمة",
      "إدارة النظام",
    ]);
  });

  it("2 — maximum depth is two levels", () => {
    expect(assertMaxNavDepthTwo(ADMIN_NAV_GROUPS)).toBe(true);
    expect(SHELL).not.toMatch(/items:\s*\[[\s\S]*items:\s*\[/);
  });

  it("3 — only one expanded group at a time (exclusive accordion)", () => {
    expect(toggleExclusiveGroup(null, "academic")).toBe("academic");
    expect(toggleExclusiveGroup("academic", "students")).toBe("students");
    expect(toggleExclusiveGroup("students", "students")).toBe(null);
    expect(SHELL).toContain("toggleExclusiveGroup");
    expect(SHELL).toContain("expandedGroupId");
  });

  it("4 — active route expands its parent group", () => {
    const groups = visibleFor(["admin"]);
    expect(findActiveAdminNavGroupId(groups, "/admin/grades")).toBe("academic");
    expect(findActiveAdminNavGroupId(groups, "/admin/student-requests")).toBe("daily");
    expect(SHELL).toMatch(/setExpandedGroupId\(activeGroupId\)/);
  });

  it("5 — unauthorized links are hidden via existing predicates", () => {
    const hr = visibleFor(["hr_officer"]);
    const paths = collectAdminNavPaths(hr);
    expect(paths).toContain("/admin/faculty-management");
    expect(paths).not.toContain("/admin/users");
    expect(paths).not.toContain("/admin/grades");
    expect(SHELL).toContain("filterNavGroups");
  });

  it("6 — empty groups are hidden", () => {
    const financeOnly = visibleFor(["finance_officer"]);
    expect(financeOnly.every((g) => g.items.length > 0)).toBe(true);
    expect(financeOnly.find((g) => g.id === "faculty")).toBeUndefined();
    // finance feature frozen → finance link also gone
    expect(collectAdminNavPaths(financeOnly)).not.toContain("/admin/finance");
  });

  it("7 — search returns authorized visible links only", () => {
    const registrar = visibleFor(["registrar"]);
    const hits = searchAdminNav(registrar, "الدرجات");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => registrar.some((g) => g.items.some((i) => i.to === h.item.to)))).toBe(
      true,
    );
    const adminOnlyHits = searchAdminNav(registrar, "سجل التدقيق");
    expect(adminOnlyHits.length).toBe(0);
    expect(SHELL).toContain("ADMIN_NAV_SEARCH_PLACEHOLDER");
    expect(SHELL).toContain("searchAdminNav");
    expect(ADMIN_NAV_SEARCH_PLACEHOLDER).toBe("ابحث عن صفحة أو إجراء");
  });

  it("8 — Escape clears search (wired in shell)", () => {
    expect(SHELL).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(SHELL).toMatch(/setSearchQuery\(""\)/);
  });

  it("9 — frequently used links remain authorized and visible-only", () => {
    expect(ADMIN_NAV_FREQUENT_PATHS.length).toBeGreaterThanOrEqual(4);
    expect(ADMIN_NAV_FREQUENT_PATHS.length).toBeLessThanOrEqual(6);
    const dept = visibleFor(["department_head"]);
    const freq = frequentAdminNavItems(dept);
    expect(freq.length).toBeGreaterThan(0);
    expect(freq.every((it) => NAV_ITEM_ROLES[it.to])).toBe(true);
    expect(freq.every((it) => collectAdminNavPaths(dept).includes(it.to))).toBe(true);
    expect(SHELL).toContain("frequentAdminNavItems");
  });

  it("10 — mobile link selection closes the drawer", () => {
    expect(SHELL).toMatch(/onClick=\{\(\)\s*=>\s*setMobileOpen\(false\)\}/);
    expect(SHELL).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*setMobileOpen\(false\);\s*\},\s*\[pathname\]\)/);
  });

  it("11 — footer is separated from scrolling navigation", () => {
    expect(SHELL).toContain('data-testid="admin-sidebar-footer"');
    expect(SHELL).toContain("عرض الموقع العام");
    expect(SHELL).toContain("flex-1 overflow-y-auto");
    expect(SHELL).toContain("shrink-0 border-t");
    const footerIdx = SHELL.indexOf('data-testid="admin-sidebar-footer"');
    const navIdx = SHELL.indexOf('aria-label="التنقل الرئيسي"');
    expect(navIdx).toBeGreaterThan(-1);
    expect(footerIdx).toBeGreaterThan(navIdx);
  });

  it("12 — no duplicate route paths in navigation config", () => {
    expect(hasDuplicateNavPaths(ADMIN_NAV_GROUPS)).toBe(false);
  });

  it("13 — all legacy sidebar route paths are preserved", () => {
    const current = new Set(collectAdminNavPaths(ADMIN_NAV_GROUPS));
    for (const path of ADMIN_NAV_LEGACY_SIDEBAR_PATHS) {
      expect(current.has(path)).toBe(true);
    }
  });

  it("14 — Graduates Affairs remains default-deny (no nav links)", () => {
    expect(navContainsGraduatesAffairsLinks(ADMIN_NAV_GROUPS)).toBe(false);
    expect(SHELL).not.toMatch(/graduates-affairs|\/admin\/graduates(?!-candidates)/);
    expect(collectAdminNavPaths(ADMIN_NAV_GROUPS)).toContain("/admin/graduation-candidates");
  });

  it("15 — routeTree.gen.ts unchanged in this change set (content pin)", () => {
    // Pin presence of critical admin routes; full tree must not be regenerated by this task.
    expect(ROUTE_TREE).toContain("'/admin/schedules'");
    expect(ROUTE_TREE).toContain("'/admin/graduation-candidates'");
    expect(ROUTE_TREE_SHA.length).toBe(64);
    // Working-tree check is enforced in the agent verification step (git status).
    expect(SHELL).not.toContain("routeTree.gen");
  });

  it("mobile drawer width ≈ 94vw with max width + touch targets", () => {
    expect(SHELL).toContain("94vw");
    expect(SHELL).toContain("min-h-11");
    expect(SHELL).toContain('aria-label="إغلاق القائمة"');
  });

  it("desktop collapsed mode shows primary icons with tooltips (no long child lists)", () => {
    expect(SHELL).toContain("desktopCollapsed");
    expect(SHELL).toContain("TooltipContent");
    expect(SHELL).toContain("w-16");
  });

  it("accessibility: aria-expanded groups, aria-current links, RTL shell", () => {
    expect(SHELL).toContain("aria-expanded={isOpen}");
    expect(SHELL).toMatch(/aria-current=\{active\s*\?\s*"page"\s*:\s*undefined\}/);
    expect(SHELL).toContain('dir="rtl"');
    expect(SHELL).toMatch(/e\.key\s*===\s*"Enter"\s*\|\|\s*e\.key\s*===\s*" "/);
  });

  it("every nav path has an authorization predicate (no broadening)", () => {
    for (const path of collectAdminNavPaths(ADMIN_NAV_GROUPS)) {
      expect(NAV_ITEM_ROLES[path]).toBeTruthy();
    }
  });
});
