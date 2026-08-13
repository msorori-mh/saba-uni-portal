import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const MOBILE_ROUTE_FILES = readdirSync(join(ROOT, "src/routes"))
  .filter((f) => f.startsWith("mobile.") && f.endsWith(".tsx"))
  .map((f) => `src/routes/${f}`);

describe("mobile app shell isolation", () => {
  test("mobile route files exist", () => {
    expect(MOBILE_ROUTE_FILES.length).toBeGreaterThan(10);
  });

  test("/mobile renders no public Header/Footer, back button or install prompt", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("isMobileAppPath(pathname)");
    expect(root).toContain("const bare = isAdmin || isMobileApp");
    expect(root).toContain("{!isMobileApp && <GlobalBackButton />}");
    expect(root).toContain("{!isMobileApp && <PortalInstallPrompt />}");
  });

  test("native PWA registration is disabled and caches cleaned on /mobile", () => {
    const root = read("src/routes/__root.tsx");
    expect(root).toContain("disablePwaInNativeShell()");
    expect(root).toMatch(/if \(isMobileApp\) \{[\s\S]*disablePwaInNativeShell\(\)[\s\S]*return;/);
    const layout = read("src/routes/mobile.student.tsx");
    expect(layout).toContain("disablePwaInNativeShell");
    const cleanup = read("src/lib/pwa/native-pwa-cleanup.ts");
    expect(cleanup).toContain("isPwaAllowedHere");
    expect(cleanup).toContain("unregister");
  });
});

describe("mobile containment — no escape to other portal surfaces", () => {
  const FORBIDDEN = [
    "/student",
    "/faculty-portal",
    "/staff",
    "/admin",
    "/portal-login",
    "/news",
    "/events",
    "/departments",
    "/contact",
    "/about",
  ];

  test("no Link/href/navigate/window.location/window.open escape", () => {
    const offenders: string[] = [];
    for (const file of MOBILE_ROUTE_FILES) {
      const src = read(file);
      const targets = [...src.matchAll(/["'`](\/[a-zA-Z0-9\-_/$.]*)["'`]/g)].map(
        (m) => m[1],
      );
      for (const target of targets) {
        if (target.startsWith("/mobile")) continue;
        if (
          FORBIDDEN.some((p) => target === p || target.startsWith(`${p}/`))
        ) {
          offenders.push(`${file} -> ${target}`);
        }
      }
      expect(src).not.toContain("window.open(");
      expect(src).not.toMatch(/window\.location\.(href|assign|replace)\s*=?\s*\(?["'`]\/(student|admin|staff|faculty-portal)/);
    }
    expect(offenders).toEqual([]);
  });
});

describe("mobile student home cards", () => {
  const home = read("src/routes/mobile.student.index.tsx");

  test("no finance card", () => {
    expect(home).not.toContain("/mobile/student/finance");
    expect(home).not.toContain("الرسوم");
    expect(home).not.toContain("المالية");
  });

  test("no academic-progress card", () => {
    expect(home).not.toContain("/mobile/student/progress");
    expect(home).not.toContain("التقدم الأكاديمي");
  });

  test("no disabled «قريباً» card", () => {
    expect(home).not.toContain("قريباً");
    expect(home).not.toContain("disabled");
  });

  test("L1/L2/L3 get zero graduation project surface; canonical L4 gate is used", () => {
    // The gate now lives in one shared context module consumed by every mobile
    // screen, so eligibility can never be evaluated differently per screen.
    expect(home).toContain("useMobileStudentContext");
    expect(home).toContain("gpEligible");
    const ctx = read("src/lib/mobile/student-context.ts");
    expect(ctx).toContain("resolveCanonicalCurrentFourthLevelEligibility");
    expect(ctx).toContain("shouldShowStudentGpNav");
    for (const file of MOBILE_ROUTE_FILES) {
      const src = read(file);
      // Never a portal (browser) graduation-project link from the mobile shell.
      expect(src).not.toMatch(/(?<!\/mobile)\/student\/graduation-projects/);
    }
  });
});

describe("mobile request flow stays under /mobile/student/*", () => {
  test("request routes are mobile-scoped", () => {
    for (const file of [
      "src/routes/mobile.student.requests.tsx",
      "src/routes/mobile.student.requests.index.tsx",
      "src/routes/mobile.student.requests.new.tsx",
      "src/routes/mobile.student.requests.$id.tsx",
      "src/routes/mobile.student.requests.b1.$service.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain('createFileRoute("/mobile/student/requests');
      expect(src).not.toMatch(/["'`]\/student\/requests/);
    }
  });
});
