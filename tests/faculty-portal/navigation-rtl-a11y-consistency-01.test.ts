/**
 * Faculty portal — navigation, RTL and accessibility consistency guards.
 *
 * SOURCE-LEVEL. No DB, no real render (repo convention: bun:test +
 * readFileSync + regex assertions).
 *
 * Covers:
 *  1. Every /faculty-portal page renders the shared FacultyPortalShell
 *     (no page renders a raw PortalShell or a hand-rolled header anymore).
 *  2. The nav strip marks the active route with aria-current="page" plus a
 *     non-color-only affordance (underline + bold), driven by the router
 *     pathname — it cannot drift from a manually-passed prop.
 *  3. Breadcrumbs expose aria-label="مسار التنقل" and aria-current="page" on
 *     the last item, with an aria-hidden chevron separator.
 *  4. NotificationsBell: Escape closes and returns focus to the trigger,
 *     aria-expanded/aria-haspopup/aria-controls are wired, the unread count
 *     is announced via aria-live, and the dropdown positioning can never
 *     overflow horizontally at 360px or on RTL desktop (no sm:right-0).
 *  5. The centralized logout hook always navigates (finally), clears the
 *     React Query cache, and replaces history to /portal-login.
 *  6. The /faculty-portal route registers error + notFound components that
 *     never render error.message / stack / technical details.
 *  7. No faculty-portal source links to /admin (privilege-escalation guard).
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

const SHELL_SRC = read("src/components/portal/FacultyPortalShell.tsx");
const BELL_SRC = read("src/components/portal/NotificationsBell.tsx");
const LOGOUT_SRC = read("src/lib/faculty-portal/use-faculty-logout.ts");
const LAYOUT_SRC = read("src/routes/faculty-portal.tsx");
const ERROR_SRC = read("src/components/portal/FacultyPortalError.tsx");

// Every page under /faculty-portal that must use the shared shell.
// (change-password is intentionally excluded: it is a forced, standalone
// pre-portal flow with its own minimal layout.)
const FACULTY_PAGES = [
  "src/routes/faculty-portal.index.tsx",
  "src/routes/faculty-portal.schedule.tsx",
  "src/routes/faculty-portal.academic-councils.tsx",
  "src/routes/faculty-portal.materials.index.tsx",
  "src/routes/faculty-portal.materials.$sectionId.tsx",
  "src/routes/faculty-portal.processing-requests.tsx",
  "src/routes/faculty-portal.student-progress.$studentId.tsx",
] as const;

describe("shared FacultyPortalShell — used by every faculty page", () => {
  it("exists and wraps PortalShell (keeps the shared visual language)", () => {
    expect(SHELL_SRC).toMatch(/from\s+["']@\/components\/portal\/PortalShell["']/);
    expect(SHELL_SRC).toMatch(/<PortalShell/);
  });

  for (const page of FACULTY_PAGES) {
    it(`${page} renders FacultyPortalShell, never a raw PortalShell`, () => {
      const src = read(page);
      expect(src).toMatch(/from\s+["']@\/components\/portal\/FacultyPortalShell["']/);
      expect(src).toMatch(/<FacultyPortalShell/);
      expect(src).not.toMatch(/<PortalShell[\s>/]/);
      expect(src).not.toMatch(/from\s+["']@\/components\/portal\/PortalShell["']/);
    });

    it(`${page} has no duplicated hand-rolled logout`, () => {
      const src = read(page);
      expect(src).not.toMatch(/auth\.signOut\(\)/);
    });
  }
});

describe("nav strip — active route indication", () => {
  it('sets aria-current="page" on the active link', () => {
    expect(SHELL_SRC).toMatch(/aria-current=\{active\s*\?\s*"page"/);
  });

  it("derives the active link from the router pathname (no manual prop)", () => {
    expect(SHELL_SRC).toMatch(
      /useRouterState\(\{\s*select:\s*\(s\)\s*=>\s*s\.location\.pathname\s*\}\)/,
    );
  });

  it("active state is not color-only (underline + bold)", () => {
    expect(SHELL_SRC).toMatch(/underline/);
    expect(SHELL_SRC).toMatch(/font-extrabold/);
  });

  it("nav strip is horizontally scrollable and non-wrapping (360px safe)", () => {
    expect(SHELL_SRC).toMatch(/overflow-x-auto/);
    expect(SHELL_SRC).toMatch(/whitespace-nowrap/);
  });

  it("processing-requests nav link is gated by hasActiveProcessingAssignment", () => {
    expect(SHELL_SRC).toMatch(
      /from\s+["']@\/lib\/faculty-portal\/processing-access\.functions["']/,
    );
    expect(SHELL_SRC).toMatch(/hasAssignment[\s\S]*isAdmin/);
  });

  it("materials nav link is gated by portalFeatures.facultyCourseMaterials", () => {
    expect(SHELL_SRC).toMatch(/portalFeatures\.facultyCourseMaterials/);
  });
});

describe("breadcrumbs", () => {
  it('uses aria-label="مسار التنقل"', () => {
    expect(SHELL_SRC).toMatch(/aria-label="مسار التنقل"/);
  });

  it('marks the last item with aria-current="page"', () => {
    expect(SHELL_SRC).toMatch(/aria-current="page"/);
  });

  it("separator chevron is aria-hidden (not conveyed by color alone)", () => {
    expect(SHELL_SRC).toMatch(/<ChevronLeft[^>]*aria-hidden/);
  });
});

describe("NotificationsBell — dropdown accessibility", () => {
  it("closes on Escape", () => {
    expect(BELL_SRC).toMatch(/e\.key\s*===\s*"Escape"/);
  });

  it("returns focus to the trigger on Escape", () => {
    expect(BELL_SRC).toMatch(/triggerRef\.current\?\.focus\(\)/);
  });

  it("wires aria-expanded, aria-haspopup and aria-controls", () => {
    expect(BELL_SRC).toMatch(/aria-expanded=\{open\}/);
    expect(BELL_SRC).toMatch(/aria-haspopup="dialog"/);
    expect(BELL_SRC).toMatch(/aria-controls="notifications-bell-dropdown"/);
    expect(BELL_SRC).toMatch(/id="notifications-bell-dropdown"/);
  });

  it("announces the unread count via aria-live polite (sr-only)", () => {
    expect(BELL_SRC).toMatch(/aria-live="polite"/);
    expect(BELL_SRC).toMatch(/sr-only/);
  });

  it("dropdown positioning can never overflow horizontally (no sm:right-0 in RTL)", () => {
    expect(BELL_SRC).not.toMatch(/sm:right-0/);
    expect(BELL_SRC).not.toMatch(/sm:left-auto/);
    // Anchored to the near (left) viewport edge with a bounded width.
    expect(BELL_SRC).toMatch(/absolute left-0/);
    expect(BELL_SRC).toMatch(/w-\[min\(92vw,360px\)\]/);
  });

  it("trigger has a focus-visible ring", () => {
    expect(BELL_SRC).toMatch(/focus-visible:ring-2/);
  });
});

describe("centralized faculty logout", () => {
  it("clears the React Query cache", () => {
    expect(LOGOUT_SRC).toMatch(/queryClient\.clear\(\)/);
  });

  it("always navigates (navigation inside finally, sign-out failure cannot strand the user)", () => {
    expect(LOGOUT_SRC).toMatch(
      /finally\s*\{[\s\S]*queryClient\.clear\(\)[\s\S]*navigate\(\{\s*to:\s*"\/portal-login",\s*replace:\s*true\s*\}\)/,
    );
  });

  it("swallows signOut errors instead of throwing past finally", () => {
    expect(LOGOUT_SRC).toMatch(/catch\s*\{[\s\S]*\}\s*finally/);
  });
});

describe("/faculty-portal route — error + notFound boundaries", () => {
  it("registers errorComponent and notFoundComponent on the layout route", () => {
    expect(LAYOUT_SRC).toMatch(/errorComponent:\s*FacultyPortalError/);
    expect(LAYOUT_SRC).toMatch(/notFoundComponent:\s*FacultyPortalNotFound/);
  });

  it("error fallback never renders error.message / stack / technical details", () => {
    expect(ERROR_SRC).not.toMatch(/error\.message/);
    expect(ERROR_SRC).not.toMatch(/error\.stack/);
    expect(ERROR_SRC).not.toMatch(/\{error\}/);
  });

  it("error fallback offers retry (reset) and a link back to /faculty-portal", () => {
    expect(ERROR_SRC).toMatch(/reset/);
    expect(ERROR_SRC).toMatch(/to="\/faculty-portal"/);
  });

  it("keeps the user inside the portal (role=alert, Arabic, dir=rtl)", () => {
    expect(ERROR_SRC).toMatch(/dir="rtl"/);
    expect(ERROR_SRC).toMatch(/role="alert"/);
  });
});

describe("privilege scope — no links to wider-privilege areas", () => {
  const ALL_FACULTY_SOURCES = [
    ...FACULTY_PAGES,
    "src/routes/faculty-portal.tsx",
    "src/routes/faculty-portal.change-password.tsx",
    "src/components/portal/FacultyPortalShell.tsx",
    "src/components/portal/FacultyPortalError.tsx",
  ] as const;

  for (const src of ALL_FACULTY_SOURCES) {
    it(`${src} never links to /admin`, () => {
      const content = read(src);
      expect(content).not.toMatch(/to=["']\/admin/);
    });
  }

  it("student-progress denial stays in-portal (generic message + link back, no error.message)", () => {
    const src = read("src/routes/faculty-portal.student-progress.$studentId.tsx");
    expect(src).not.toMatch(/error\s+as\s+any/);
    expect(src).not.toMatch(/\.message\}/);
    expect(src).toMatch(/لا تملك صلاحية الوصول إلى هذه الصفحة/);
    expect(src).toMatch(/to="\/faculty-portal"/);
  });
});
