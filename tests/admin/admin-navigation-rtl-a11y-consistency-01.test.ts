/**
 * Admin portal — navigation, RTL and accessibility consistency guards.
 *
 * SOURCE-LEVEL. No DB, no real render (repo convention: bun:test +
 * readFileSync + regex assertions).
 *
 * Covers:
 *  1. Sidebar nav links are never dead: every `to:` in the AdminShell groups
 *     config exists as a registered route in routeTree.gen.ts (the Link `to`
 *     props are dynamic strings, so tsc cannot catch a dead target).
 *  2. Active route indication: aria-current="page" on active links, derived
 *     from the router pathname, plus a non-color-only affordance (the gold
 *     side bar indicator is positional, not color-only).
 *  3. Mobile sidebar: hamburger has aria-expanded + aria-controls, the aside
 *     has the matching id, a labelled close button exists inside the sidebar,
 *     Escape closes and returns focus to the hamburger, and the backdrop is
 *     aria-hidden.
 *  4. Collapsible groups pair aria-expanded with aria-controls and the
 *     submenu container carries the matching id.
 *  5. Landmarks: sidebar nav aria-label="التنقل الرئيسي", exactly one
 *     breadcrumbs nav aria-label="مسار التنقل" with aria-current="page" on
 *     the last crumb — no ambiguous nested navs.
 *  6. Logout: centralized hook clears the React Query cache and always
 *     navigates (finally) to /admin/login with replace; AdminShell has no
 *     direct auth.signOut().
 *  7. NotificationsBell (rendered in the admin header): Escape + focus
 *     return, aria-expanded/haspopup/controls, aria-live unread count, and
 *     dropdown positioning that cannot overflow horizontally in RTL.
 *  8. /admin route registers error + notFound components that never render
 *     error.message / stack / technical details, and keep the admin inside
 *     /admin.
 *  9. The admin shell never links to other portals (/student, /faculty-portal).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SHELL_SRC = read("src/components/admin/AdminShell.tsx");
const NAV_CONFIG_SRC = read("src/lib/admin-navigation-config.ts");
const BELL_SRC = read("src/components/portal/NotificationsBell.tsx");
const LOGOUT_SRC = read("src/lib/use-admin-logout.ts");
const LAYOUT_SRC = read("src/routes/admin.tsx");
const ROUTE_TREE_SRC = read("src/routeTree.gen.ts");

describe("sidebar links — no dead targets", () => {
  const NAV_TARGETS = [
    ...NAV_CONFIG_SRC.matchAll(/\{\s*to:\s*"((?:\/admin|\/messages)[^"]*)"/g),
  ].map((m) => m[1]);

  it("exposes a non-empty set of nav targets", () => {
    expect(NAV_TARGETS.length).toBeGreaterThan(30);
  });

  for (const target of new Set(NAV_TARGETS)) {
    it(`${target} is a registered route`, () => {
      // The index route is registered as "/admin/" while the nav uses "/admin".
      const registered =
        ROUTE_TREE_SRC.includes(`'${target}'`) ||
        (target === "/admin" && ROUTE_TREE_SRC.includes("'/admin/'"));
      expect(registered).toBe(true);
    });
  }
});

describe("active route indication", () => {
  it('sets aria-current="page" on the active link', () => {
    expect(SHELL_SRC).toMatch(/aria-current=\{active\s*\?\s*"page"\s*:\s*undefined\}/);
  });

  it("derives the active link from the router pathname (no manual prop)", () => {
    expect(SHELL_SRC).toMatch(
      /useRouterState\(\{\s*select:\s*\(s\)\s*=>\s*s\.location\.pathname\s*\}\)/,
    );
  });

  it("active state is not color-only (positional gold bar indicator)", () => {
    expect(SHELL_SRC).toMatch(/absolute right-0 top-1\/2 h-[67] w-1/);
    expect(SHELL_SRC).toMatch(/bg-gold-gradient/);
  });
});

describe("mobile sidebar — keyboard and focus management", () => {
  it("hamburger wires aria-expanded and aria-controls to the sidebar id", () => {
    expect(SHELL_SRC).toMatch(/aria-expanded=\{mobileOpen\}/);
    expect(SHELL_SRC).toMatch(/aria-controls="admin-sidebar"/);
    expect(SHELL_SRC).toMatch(/id="admin-sidebar"/);
  });

  it("has a labelled close button inside the sidebar", () => {
    expect(SHELL_SRC).toMatch(/aria-label="إغلاق القائمة"/);
    expect(SHELL_SRC).toMatch(/closeButtonRef/);
  });

  it("hamburger keeps its accessible name", () => {
    expect(SHELL_SRC).toMatch(/aria-label="فتح القائمة"/);
  });

  it("Escape closes the sidebar and returns focus to the hamburger", () => {
    expect(SHELL_SRC).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(SHELL_SRC).toMatch(/setMobileOpen\(false\)/);
    expect(SHELL_SRC).toMatch(/menuButtonRef\.current\?\.focus\(\)/);
  });

  it("moves focus into the sidebar when it opens", () => {
    expect(SHELL_SRC).toMatch(/if \(mobileOpen\) closeButtonRef\.current\?\.focus\(\)/);
  });

  it("backdrop is aria-hidden (not a keyboard trap)", () => {
    expect(SHELL_SRC).toMatch(/aria-hidden="true"/);
  });

  it("sidebar is off-canvas (no layout squeeze) and the shell keeps min-w-0", () => {
    expect(SHELL_SRC).toMatch(/fixed lg:sticky/);
    expect(SHELL_SRC).toMatch(/flex-1 min-w-0/);
  });
});

describe("collapsible nav groups", () => {
  it("pairs aria-expanded with aria-controls and a matching container id", () => {
    expect(SHELL_SRC).toMatch(/aria-expanded=\{isOpen\}/);
    expect(SHELL_SRC).toMatch(/aria-controls=\{`admin-nav-group-\$\{group\.id\}`\}/);
    expect(SHELL_SRC).toMatch(/id=\{`admin-nav-group-\$\{group\.id\}`\}/);
  });
});

describe("landmarks and breadcrumbs", () => {
  it("sidebar nav is labelled distinctly from the breadcrumbs nav", () => {
    expect(SHELL_SRC).toMatch(/aria-label="التنقل الرئيسي"/);
  });

  it("renders exactly one breadcrumbs nav with a labelled last crumb", () => {
    const matches = SHELL_SRC.match(/aria-label="مسار التنقل"/g) ?? [];
    expect(matches.length).toBe(1);
    expect(SHELL_SRC).toMatch(/aria-current="page"/);
  });

  it("breadcrumb separator chevron is aria-hidden", () => {
    expect(SHELL_SRC).toMatch(/<ChevronLeft[^>]*aria-hidden/);
  });
});

describe("centralized admin logout", () => {
  it("clears the React Query cache", () => {
    expect(LOGOUT_SRC).toMatch(/queryClient\.clear\(\)/);
  });

  it("always navigates (navigation inside finally, sign-out failure cannot strand the user)", () => {
    expect(LOGOUT_SRC).toMatch(
      /finally\s*\{[\s\S]*queryClient\.clear\(\)[\s\S]*navigate\(\{\s*to:\s*"\/admin\/login",\s*replace:\s*true\s*\}\)/,
    );
  });

  it("swallows signOut errors instead of throwing past finally", () => {
    expect(LOGOUT_SRC).toMatch(/catch\s*\{[\s\S]*\}\s*finally/);
  });

  it("AdminShell uses the hook and never calls auth.signOut() directly", () => {
    expect(SHELL_SRC).toMatch(/useAdminLogout/);
    expect(SHELL_SRC).not.toMatch(/auth\.signOut\(\)/);
  });
});

describe("notifications in the admin header", () => {
  it("AdminShell renders the shared NotificationsBell", () => {
    expect(SHELL_SRC).toMatch(/<NotificationsBell/);
  });

  it("bell closes on Escape and returns focus to the trigger", () => {
    expect(BELL_SRC).toMatch(/e\.key\s*===\s*"Escape"/);
    expect(BELL_SRC).toMatch(/triggerRef\.current\?\.focus\(\)/);
  });

  it("bell wires aria-expanded, aria-haspopup and aria-controls", () => {
    expect(BELL_SRC).toMatch(/aria-expanded=\{open\}/);
    expect(BELL_SRC).toMatch(/aria-haspopup="dialog"/);
    expect(BELL_SRC).toMatch(/aria-controls="notifications-bell-dropdown"/);
    expect(BELL_SRC).toMatch(/id="notifications-bell-dropdown"/);
  });

  it("bell announces the unread count via aria-live polite (sr-only)", () => {
    expect(BELL_SRC).toMatch(/aria-live="polite"/);
    expect(BELL_SRC).toMatch(/sr-only/);
  });

  it("dropdown positioning can never overflow horizontally (no sm:right-0 in RTL)", () => {
    expect(BELL_SRC).not.toMatch(/sm:right-0/);
    expect(BELL_SRC).not.toMatch(/sm:left-auto/);
    expect(BELL_SRC).toMatch(/absolute left-0/);
    expect(BELL_SRC).toMatch(/w-\[min\(92vw,360px\)\]/);
  });
});

describe("/admin route — error + notFound boundaries", () => {
  it("registers errorComponent and notFoundComponent on the layout route", () => {
    expect(LAYOUT_SRC).toMatch(/errorComponent:\s*AdminErrorComponent/);
    expect(LAYOUT_SRC).toMatch(/notFoundComponent:\s*AdminNotFoundComponent/);
  });

  it("error + notFound fallbacks never render error.message / stack / technical details", () => {
    expect(LAYOUT_SRC).not.toMatch(/error\.message/);
    expect(LAYOUT_SRC).not.toMatch(/error\.stack/);
    expect(LAYOUT_SRC).not.toMatch(/\{error\}/);
  });

  it("both fallbacks keep the admin inside /admin", () => {
    const links = [...LAYOUT_SRC.matchAll(/to="(\/admin[^"]*)"/g)].map((m) => m[1]);
    expect(links).toContain("/admin");
  });

  it("unknown /admin/* paths get an admin-scoped 404 at the root (stays in-portal)", () => {
    const root = read("src/routes/__root.tsx");
    // Conditional on the pathname inside the root notFoundComponent — no new
    // route file, so the route tree (and its stability pin) is untouched.
    expect(root).toMatch(/pathname\.startsWith\("\/admin"\)/);
    expect(root).toMatch(/data-testid="admin-not-found"/);
    expect(root).toMatch(/العودة إلى لوحة الإدارة/);
    // The admin-scoped 404 links to /admin, never to the public site.
    const adminBlock = root.slice(
      root.indexOf('pathname.startsWith("/admin")'),
      root.indexOf("bg-hero-gradient"),
    );
    expect(adminBlock).toMatch(/to="\/admin"/);
    expect(adminBlock).not.toMatch(/to="\/"/);
  });
});

describe("portal isolation", () => {
  it("admin shell never links to the student or faculty portals", () => {
    expect(SHELL_SRC).not.toMatch(/to=["']\/student/);
    expect(SHELL_SRC).not.toMatch(/to=["']\/faculty-portal/);
  });

  it("logout target is /admin/login, not another portal", () => {
    expect(LOGOUT_SRC).toMatch(/to:\s*"\/admin\/login"/);
    expect(LOGOUT_SRC).not.toMatch(/portal-login/);
  });
});
