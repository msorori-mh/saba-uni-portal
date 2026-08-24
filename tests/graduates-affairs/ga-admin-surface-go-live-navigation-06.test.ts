/**
 * PORTAL-GA-ADMIN-SURFACE-NAVIGATION-AND-GO-LIVE-VISIBILITY-06
 *
 * SOURCE-ONLY regression: admin navigation exposes a read-only graduates-affairs
 * overview, while operational AUTH-04 boundaries remain unchanged.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_LEGACY_SIDEBAR_PATHS,
  applyAdminFinanceNavGate,
  collectAdminNavPaths,
  hasDuplicateNavPaths,
} from "../../src/lib/admin-navigation-config";
import { filterNavGroups, NAV_ITEM_ROLES } from "../../src/lib/admin-nav";
import { portalFeatures } from "../../src/lib/portal-features";

const root = join(import.meta.dir, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("PORTAL-GA-ADMIN-SURFACE-NAVIGATION-AND-GO-LIVE-VISIBILITY-06", () => {
  const navConfig = read("src/lib/admin-navigation-config.ts");
  const adminNav = read("src/lib/admin-nav.ts");
  const routeTree = read("src/routeTree.gen.ts");
  const adminRoute = read("src/routes/admin.graduates-affairs.tsx");
  const adminFunctions = read("src/lib/admin-graduates-affairs.functions.ts");
  const staffRoute = read("src/routes/staff.graduates-affairs.tsx");
  const staffDashboard = [
  read("src/routes/staff.index.tsx"),
  read("src/components/staff-portal/StaffEmployeePortal.tsx"),
].join("\n");
  const studentRoute = read("src/routes/student.graduates-affairs.index.tsx");
  const functions = read("src/lib/graduates-affairs/graduates-affairs.functions.ts");
  const runtimeGate = read("src/lib/graduates-affairs/runtime-gate.ts");

  test("1 — admin nav group contains شؤون الخريجين", () => {
    const graduatesGroup = ADMIN_NAV_GROUPS.find((g) => g.id === "graduates");
    expect(graduatesGroup).toBeTruthy();
    expect(graduatesGroup?.label).toBe("شؤون الخريجين");
    expect(graduatesGroup?.items.some((it) => it.to === "/admin/graduates-affairs")).toBe(true);
  });

  test("2 — شؤون الخريجين overview sits in graduates group next to مشاريع التخرج group", () => {
    const order = ADMIN_NAV_GROUPS.map((g) => g.id);
    expect(order.indexOf("projects")).toBeLessThan(order.indexOf("graduates"));
    const graduatesGroup = ADMIN_NAV_GROUPS.find((g) => g.id === "graduates");
    const labels = graduatesGroup?.items.map((it) => it.label) ?? [];
    expect(labels[0]).toBe("شؤون الخريجين");
    // "مرشحو التخرج" is intentionally hidden from the admin sidebar as part of
    // the graduation-projects closure; the route/authorization stay untouched.
    expect(labels).not.toContain("مرشحو التخرج");
  });

  test("3 — admin graduates-affairs link points to /admin/graduates-affairs", () => {
    const graduatesGroup = ADMIN_NAV_GROUPS.find((g) => g.id === "graduates");
    const item = graduatesGroup?.items.find((it) => it.to === "/admin/graduates-affairs");
    expect(item?.to).toBe("/admin/graduates-affairs");
    expect(item?.label).toBe("شؤون الخريجين");
    expect(adminRoute).toContain('createFileRoute("/admin/graduates-affairs")');
  });

  test("4 — admin graduates-affairs route exists in generated route tree", () => {
    expect(routeTree).toContain("./routes/admin.graduates-affairs");
    expect(routeTree).toContain("'/admin/graduates-affairs': typeof AdminGraduatesAffairsRoute");
    expect(routeTree).toContain("fullPath: '/admin/graduates-affairs'");
  });

  test("5 — route mounts read-only overview", () => {
    expect(adminRoute).toContain("نظرة إدارية على شؤون الخريجين");
    expect(adminRoute).toContain('data-testid="admin-ga-overview-content"');
    expect(adminRoute).toContain("نطاق إداري للقراءة فقط");
    expect(adminRoute).toContain('data-testid="admin-ga-overview-loading"');
  });

  test("6 — admin overview has no mutation controls", () => {
    // No buttons that create, update, delete, transition, or assign.
    expect(adminRoute).not.toMatch(/graduate_affairs_create_followup|transitionFollowup|createFollowup/);
    expect(adminRoute).not.toContain("إنشاء متابعة");
    expect(adminRoute).not.toContain("تعيين");
    expect(adminRoute).not.toContain("تعديل");
    expect(adminRoute).not.toContain("حذف");
    // Refresh is allowed (retry / update numbers) — not a domain mutation.
    expect(adminRoute).toContain('data-testid="admin-ga-overview-error"');
  });

  test("7 — staff operational route still exists", () => {
    expect(staffRoute).toContain('createFileRoute("/staff/graduates-affairs")');
    expect(staffRoute).toContain("GraduatesAffairsStaffWorkspace");
  });

  test("8 — staff dashboard GA link exists when flag true", () => {
    expect(portalFeatures.staffGraduatesAffairs).toBe(true);
    expect(staffDashboard).toContain('to="/staff/graduates-affairs"');
    expect(staffDashboard).toContain("شؤون الخريجين");
  });

  test("9 — both GA feature flags remain enabled in final closure branch", () => {
    expect(portalFeatures.studentGraduatesAffairs).toBe(true);
    expect(portalFeatures.staffGraduatesAffairs).toBe(true);
  });

  test("10 — graduate self-service route remains reachable", () => {
    expect(studentRoute).toContain('createFileRoute("/student/graduates-affairs/")');
    expect(studentRoute).toContain("resolveGraduateSelfSurfaceFn");
    expect(routeTree).toContain("StudentGraduatesAffairsIndexRoute");
  });

  test("11 — unauthorized admin cannot use GA operational mutations", () => {
    // Operational mutations are in graduates-affairs.functions.ts and gated by staff flag + AUTH-04.
    expect(functions).toContain("denyMutationWhenFlagOff(\"staffGraduatesAffairs\")");
    expect(functions).toContain("GraduatesAffairsRpcClient");
    expect(functions).not.toMatch(/\.from\(["']graduate_/);
    // Admin overview is a separate read-only server function, not wired to mutations.
    expect(adminFunctions).not.toContain("createFollowup");
    expect(adminFunctions).not.toContain("transitionFollowup");
    expect(adminFunctions).not.toContain("updateOwnProfile");
  });

  test("12 — manager/specialist scope remains enforced; admin title alone is rejected", () => {
    expect(runtimeGate).toContain("NON_AUTHORITATIVE_APP_ROLES");
    expect(runtimeGate).toContain('"admin"');
    expect(runtimeGate).toContain('"system_admin"');
    expect(runtimeGate).toContain("appRoleAloneGrantsGraduateAffairs");
    expect(adminNav).toContain('"/admin/graduates-affairs": ["system_admin", "admin"]');
    // Staff operational RPCs stay in the AUTH-04 client; admin overview never reuses them.
    expect(adminFunctions).toContain("assertAdmin(context.userId)");
    expect(adminFunctions).not.toContain("resolveStaffRecordAccess");
  });

  test("13 — no dead navigation links: every admin nav path authorized and legacy preserved", () => {
    expect(hasDuplicateNavPaths(ADMIN_NAV_GROUPS)).toBe(false);
    const visibleToAdmin = filterNavGroups(
      applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, portalFeatures.adminFinance),
      ["admin"],
    );
    const visiblePaths = collectAdminNavPaths(visibleToAdmin);
    expect(visiblePaths).toContain("/admin/graduates-affairs");
    for (const path of visiblePaths) {
      expect(NAV_ITEM_ROLES[path]).toBeTruthy();
    }
    const legacy = new Set(ADMIN_NAV_LEGACY_SIDEBAR_PATHS);
    for (const path of collectAdminNavPaths(ADMIN_NAV_GROUPS)) {
      expect(legacy.has(path)).toBe(true);
    }
  });

  test("14 — admin overview server function is sanitized and read-only", () => {
    expect(adminFunctions).toContain("assertAdmin(context.userId)");
    expect(adminFunctions).toContain("AdminGraduatesAffairsOverviewDto");
    expect(adminFunctions).toContain("recentRecords");

    // The returned DTO only exposes record metadata and aggregate counts.
    const dtoStart = adminFunctions.indexOf("export type AdminGraduatesAffairsOverviewDto");
    const dtoEnd = adminFunctions.indexOf("};", dtoStart) + 2;
    const dtoBlock = adminFunctions.slice(dtoStart, dtoEnd);
    expect(dtoBlock).not.toContain("protected_value");
    expect(dtoBlock).not.toContain("notes_protected");
    expect(dtoBlock).not.toContain("answers");
    expect(dtoBlock).not.toContain("payload");
    expect(dtoBlock).not.toContain("student_profile_id");

    // The recent-records query only selects non-sensitive fields.
    const queryBlock = adminFunctions.slice(
      adminFunctions.indexOf(".from(\"graduate_records\")"),
      adminFunctions.indexOf(".order(\"created_at\""),
    );
    expect(queryBlock).toContain("record_state");
    expect(queryBlock).toContain("effective_graduation_date");
    expect(queryBlock).not.toContain("student_profile_id");
    expect(queryBlock).not.toContain("academic_snapshot");
  });
});
