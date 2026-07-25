import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getErrorRecoveryHomePath } from "../../src/lib/route-error-recovery";
import { renderErrorPage } from "../../src/lib/error-page";

const ROOT = join(import.meta.dir, "../..");

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("PORTAL-STUDENT-PORTAL-NAVIGATION-RTL-A11Y-CONSISTENCY-QA-01", () => {
  it("1 — site mobile menu: aria-expanded/aria-controls, Escape closes, focus returns to trigger", () => {
    const header = readSrc("src/components/site/Header.tsx");
    expect(header).toContain("aria-expanded={open}");
    expect(header).toContain('aria-controls="site-mobile-menu"');
    expect(header).toContain('id="site-mobile-menu"');
    expect(header).toContain('e.key === "Escape"');
    expect(header).toContain("menuButtonRef.current?.focus()");
    // Accessible name reflects state
    expect(header).toContain('aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}');
  });

  it("2 — mobile bottom nav: no dead tabs (every item has a real route)", () => {
    const layout = readSrc("src/routes/mobile.student.tsx");
    const navBlock = layout.slice(
      layout.indexOf("const NAV_ITEMS"),
      layout.indexOf("function MobileBottomNav"),
    );
    expect(navBlock).not.toContain("to: null");
    expect(navBlock).not.toContain("قريباً");
    // Previously orphaned grades route is now reachable from the primary nav
    expect(navBlock).toContain('to: "/mobile/student/grades"');
  });

  it("3 — mobile bottom nav: active state is not color-only and keeps aria-current", () => {
    const layout = readSrc("src/routes/mobile.student.tsx");
    expect(layout).toContain('aria-current={active ? "page" : undefined}');
    expect(layout).toContain('current.startsWith(item.to + "/")');
    // Visible non-color cue (gold bar) in addition to text color
    expect(layout).toContain("Non-color active cue");
    expect(layout).toContain('className="absolute top-0 h-0.5 w-10 rounded-full bg-gold-gradient"');
  });

  it("4 — study-plan PortalShell receives onLogout (logout button no longer crashes)", () => {
    const page = readSrc("src/routes/student.study-plan.tsx");
    expect(page).toContain("onLogout={handleLogout}");
    expect(page).toContain("supabase.auth.signOut()");
    expect(page).not.toMatch(/<PortalShell>/);
  });

  it("5 — no raw error.message / UUID leak in student progress error state", () => {
    const page = readSrc("src/routes/student.progress.tsx");
    expect(page).not.toContain("(error as any).message");
    expect(page).not.toMatch(/error\.message/);
    expect(page).toContain("تعذّر تحميل بيانات التقدم الأكاديمي");
    expect(page).toContain('role="alert"');
  });

  it("6 — error recovery keeps students inside the portal (no broad fallback to public home)", () => {
    expect(getErrorRecoveryHomePath("/student")).toBe("/student");
    expect(getErrorRecoveryHomePath("/student/requests")).toBe("/student");
    expect(getErrorRecoveryHomePath("/mobile/student")).toBe("/student");
    expect(getErrorRecoveryHomePath("/mobile/student/grades")).toBe("/student");
    // Admin and public behavior unchanged
    expect(getErrorRecoveryHomePath("/admin")).toBe("/admin");
    expect(getErrorRecoveryHomePath("/")).toBe("/");
    expect(getErrorRecoveryHomePath("/news")).toBe("/");
    const root = readSrc("src/routes/__root.tsx");
    expect(root).toContain("العودة إلى بوابة الطالب");
  });

  it("7 — last-resort HTML error page is Arabic RTL, not English", () => {
    const html = renderErrorPage();
    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("تعذّر تحميل الصفحة");
    expect(html).not.toContain('lang="en"');
    expect(html).not.toContain("This page didn't load");
  });

  it("8 — mobile app shell is not wrapped in the public site Header/Footer (no double chrome)", () => {
    const root = readSrc("src/routes/__root.tsx");
    expect(root).toContain('pathname === "/mobile/student"');
    expect(root).toContain('pathname.startsWith("/mobile/student/")');
    expect(root).toContain("isBareShell");
  });

  it("9 — auth gate and mobile loading spinners are announced (role=status)", () => {
    const studentLayout = readSrc("src/routes/student.tsx");
    expect(studentLayout).toContain('role="status"');
    expect(studentLayout).toContain('aria-label="جارٍ التحميل"');
    const mobileLayout = readSrc("src/routes/mobile.student.tsx");
    expect(mobileLayout).toContain('role="status"');
  });

  it("10 — notifications bell: Escape closes, focus returns, state and unread count announced", () => {
    const bell = readSrc("src/components/portal/NotificationsBell.tsx");
    expect(bell).toContain('e.key === "Escape"');
    expect(bell).toContain("buttonRef.current?.focus()");
    expect(bell).toContain("aria-expanded={open}");
    expect(bell).toContain('aria-controls="notifications-panel"');
    expect(bell).toContain('id="notifications-panel"');
    expect(bell).toContain('aria-haspopup="true"');
    expect(bell).toContain("غير مقروءة");
    expect(bell).toContain('className="absolute -top-1 -right-1 grid place-items-center');
  });

  it("11 — requests breadcrumb is a real breadcrumb nav with aria-current", () => {
    const nav = readSrc("src/components/portal/StudentRequestsNav.tsx");
    expect(nav).toContain('aria-label="مسار التنقل"');
    expect(nav).toContain("<ol");
    expect(nav.match(/<nav\b/g)).toHaveLength(1);
    expect(nav).toContain('aria-current="page"');
    // Existing contract preserved: hard link back to the student portal
    expect(nav).toContain('to="/student"');
    expect(nav).toContain("العودة إلى بوابة الطالب");
  });

  it("12 — all icon-only shell buttons keep accessible names", () => {
    const header = readSrc("src/components/site/Header.tsx");
    // menu toggle
    expect(header).toMatch(/<button[\s\S]*?aria-label/);
    const bell = readSrc("src/components/portal/NotificationsBell.tsx");
    expect(bell).toContain("aria-label={");
    const shell = readSrc("src/components/portal/PortalShell.tsx");
    expect(shell).toContain('aria-label="تسجيل الخروج"');
    const mobileLayout = readSrc("src/routes/mobile.student.tsx");
    expect(mobileLayout).toContain('aria-label="تسجيل الخروج"');
    expect(mobileLayout).toContain('aria-label="التنقل السفلي"');
  });

  it("13 — study-plan failures stay explicit and never become an empty state or raw backend text", () => {
    const page = readSrc("src/routes/student.study-plan.tsx");
    expect(page).toContain("programError || planError");
    expect(page).toContain("تعذّر تحميل الخطة الدراسية");
    expect(page).toContain('role="alert"');
    expect(page).not.toMatch(/error\.message|\.message\s*}/);
    expect(page).toContain("!programError && !planError && !isLoading");
  });

  it("14 — shell stays Arabic RTL; no English aria labels on reviewed nav surfaces", () => {
    const root = readSrc("src/routes/__root.tsx");
    expect(root).toContain('lang="ar" dir="rtl"');
    const about = readSrc("src/routes/about.tsx");
    expect(about).not.toContain('aria-label="Breadcrumb"');
    expect(about).toContain('aria-label="مسار التنقل"');
  });
});
