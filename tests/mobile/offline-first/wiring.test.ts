/**
 * OFFLINE-FIRST-01 — wiring contracts (source assertions, like the other
 * tests/mobile suites): sign-out wipes, offline guard, the native shell keeps
 * the mobile worker, kill-switch sync, portal-wide worker untouched, CSP.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOBILE_OFFLINE_CACHE_PREFIX,
  MOBILE_OFFLINE_OPT_IN_KEY,
  MOBILE_OFFLINE_ROLLOUT,
  isMobileOfflineActive,
  isMobileOfflinePilot,
  readMobileOfflineOptIn,
  subscribeMobileOfflineActive,
  writeMobileOfflineOptIn,
  MOBILE_OFFLINE_SW_SCOPE,
  MOBILE_OFFLINE_SW_URL,
} from "../../../src/lib/mobile/offline/config";
import { buildReportOnlyCsp } from "../../../src/lib/security-headers";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const layout = read("src/routes/mobile.student.tsx");
const login = read("src/routes/mobile.student-login.tsx");
const identity = read("src/lib/mobile/student-identity.ts");
const rootRoute = read("src/routes/__root.tsx");
const sw = read("public/mobile-sw.js");
const policy = read("public/mobile-offline-policy.js");
const config = read("src/lib/mobile/offline/config.ts");
const persistence = read("src/lib/mobile/offline/query-persistence.ts");
const connectivity = read("src/lib/mobile/offline/connectivity.ts");
const swClient = read("src/lib/mobile/offline/service-worker-client.ts");
const gate = read("src/components/mobile/MobileOfflineGate.tsx");
const cleanup = read("src/lib/pwa/native-pwa-cleanup.ts");

const guard = layout.slice(
  layout.indexOf("beforeLoad"),
  layout.indexOf("component: MobileStudentLayout"),
);

describe("kill switch and shared constants stay in sync", () => {
  test("the worker rollout state equals the app rollout state, and this release is a pilot", () => {
    const workerState = /const MOBILE_OFFLINE_ROLLOUT = "(off|pilot|on)";/.exec(sw)?.[1];
    expect(workerState).toBe(MOBILE_OFFLINE_ROLLOUT);
    expect(config).toMatch(
      /export const MOBILE_OFFLINE_ROLLOUT: MobileOfflineRollout = "(off|pilot|on)";/,
    );
    expect(MOBILE_OFFLINE_ROLLOUT).toBe("pilot");
    // No second, independent on/off flag is left anywhere in the app.
    for (const source of [config, persistence, connectivity, swClient, cleanup, layout, identity]) {
      expect(source).not.toContain("MOBILE_OFFLINE_ENABLED");
    }
  });

  test("worker URL, scope and cache prefix match the policy file", () => {
    expect(existsSync(join(ROOT, "public", MOBILE_OFFLINE_SW_URL))).toBe(true);
    expect(policy).toContain(`const SCOPE_PATH = "${MOBILE_OFFLINE_SW_SCOPE}";`);
    expect(policy).toContain(`const CACHE_PREFIX = "${MOBILE_OFFLINE_CACHE_PREFIX}";`);
    expect(sw).toContain('importScripts("/mobile-offline-policy.js");');
    expect(swClient).toContain(
      'register(MOBILE_OFFLINE_SW_URL, { scope: MOBILE_OFFLINE_SW_SCOPE, updateViaCache: "none" })',
    );
  });

  test("with the switch off the app unregisters the worker, deletes its caches and wipes data", () => {
    const disable = swClient.slice(swClient.indexOf("export async function disableMobileOffline"));
    expect(disable).toContain("wipeMobileOfflineData();");
    expect(disable).toContain("registration.unregister()");
    expect(disable).toContain("deleteMobileOfflineCaches()");
    expect(swClient).toMatch(
      /if \(MOBILE_OFFLINE_ROLLOUT === "off"\) \{[\s\S]*?void disableMobileOffline\(\);\s*return;/,
    );
    expect(persistence).toContain("if (!isMobileOfflineActive()) return 0;");
  });
});

describe("worker lifecycle (versioned caches, takeover, no self-reload)", () => {
  test("takes over immediately and cleans old build caches on activation", () => {
    expect(sw).toContain("self.skipWaiting();");
    expect(sw).toContain("await self.clients.claim();");
    expect(sw).toContain("await cleanupOldBuilds();");
    expect(policy).toContain("const BUILD_CACHE_PREFIX = `${CACHE_PREFIX}${CACHE_SCHEMA}-build-`;");
    // The worker never reloads a page itself; the page does, once, guarded.
    expect(sw).not.toContain("location.reload");
    expect(sw).not.toContain(".navigate(");
  });

  test("the worker has no generic runtime caching: every write goes through the policy", () => {
    const puts = sw.split("\n").filter((line) => line.includes("cache.put("));
    expect(puts.length).toBeGreaterThan(0);
    expect(sw).toContain("policy.canCacheAssetResponse(");
    expect(sw).toContain("policy.canCacheShellResponse(");
    expect(sw).toContain('if (decision.kind === "bypass") return;');
    expect(sw).not.toMatch(/cache\.addAll|caches\.open\(["'`]static/);
  });

  test("shells are fetched without credentials so stored HTML can never be user-specific", () => {
    expect(sw).toContain(
      'new Request(shellPath, { method: "GET", credentials: "omit", cache: "no-store" })',
    );
    expect(sw).toContain('new Request(pathname, { method: "GET", credentials: "omit" })');
  });

  test("the portal-wide worker keeps its closed policy and still ignores /mobile/student", () => {
    const portalSw = read("public/sw.js");
    const portalPolicy = read("public/sw-cache-policy.js");
    expect(portalSw).not.toContain("clients.claim()");
    expect(portalSw).toContain("isProtectedPath(url.pathname + url.search)");
    expect(portalPolicy).toContain("/^\\/mobile\\/student");
    expect(portalSw).not.toContain("mobile-offline");
    expect(read("src/lib/pwa/register-portal-pwa.ts")).toContain(
      'register("/sw.js", { scope: "/" })',
    );
  });
});

describe("native shell: portal PWA still removed, mobile offline worker kept (no new APK)", () => {
  test("the cleanup skips only the /mobile/ registration and only while the feature is enabled", () => {
    expect(cleanup).toContain("isMobileOfflineActive() && isMobileOfflineScope(scopeUrl)");
    expect(cleanup).toContain(
      "regs.filter((r) => !isRegistrationKeptInNativeShell(r.scope)).map((r) => r.unregister())",
    );
    // Portal-owned caches are still deleted; mobile-offline-* is not a portal-owned name.
    expect(cleanup).toContain(
      "names.filter(isPortalOwnedCacheName).map((name) => caches.delete(name))",
    );
    expect(cleanup).toContain('export const PORTAL_OWNED_CACHE_PREFIX = "portal-pwa-";');
    expect("mobile-offline-v1-build-x".startsWith("portal-pwa-")).toBe(false);
  });

  test("the native shell still never registers the portal-wide worker or shows install UI", () => {
    expect(rootRoute).toMatch(
      /if \(isNativeMobileApp\) \{[\s\S]*disablePwaInNativeShell\(\)[\s\S]*return;\s*\}\s*registerPortalPWA\(\);/,
    );
    expect(rootRoute).toContain("{!isNativeMobileApp && <PortalInstallPrompt />}");
    expect(read("src/lib/pwa/register-portal-pwa.ts")).toMatch(
      /if \(isNativePlatform\(\)\) \{\s*void disablePwaInNativeShell\(\);\s*return;/,
    );
  });

  test("the mobile worker is started on every /mobile route, native or browser, from web code", () => {
    expect(rootRoute).toMatch(/if \(isMobileApp\) startMobileOfflineRuntime\(\);/);
    expect(swClient).not.toContain("isNativePlatform");
    // No native project change is part of this feature.
    expect(read("capacitor.config.ts")).toContain(
      'url: "https://quboolye.com/mobile/student-login"',
    );
  });
});

describe("offline guard: a stored session is never treated as signed out", () => {
  test("the guard learns the launch connectivity, reads the session locally and hydrates before render", () => {
    const launch = guard.indexOf("await resolveMobileLaunchConnectivity();");
    const session = guard.indexOf("await getMobileSessionUserId();");
    const hydrate = guard.indexOf("ensureMobileOfflineHydrated(context.queryClient, userId);");
    const identityCheck = guard.indexOf("await getMobileStudentIdentity();");
    expect(launch).toBeGreaterThan(-1);
    expect(session).toBeGreaterThan(launch);
    expect(hydrate).toBeGreaterThan(session);
    expect(identityCheck).toBeGreaterThan(hydrate);
  });

  test("offline, the stored session is used without waiting for a token refresh", () => {
    const fn = identity.slice(
      identity.indexOf("export async function getMobileSessionUserId"),
      identity.indexOf("async function revokeNonStudent"),
    );
    expect(fn).toContain(
      "const stored = isMobileOfflineActive() ? readStoredSupabaseSession() : null;",
    );
    expect(fn).toContain("if (!isMobileOnline()) return stored.userId;");
    expect(fn).toContain("storedSessionNeedsRefresh(stored)");
    expect(fn).toContain("SESSION_REFRESH_WAIT_MS");
    // A refresh that failed because of the network keeps the student signed in …
    expect(fn).toContain("if (!isRetryableAuthError(outcome.result.error)) return null;");
    expect(identity).toContain('candidate.name === "AuthRetryableFetchError"');
    // … while without any stored session the behaviour is exactly the old one.
    expect(fn).toContain("const { data } = await supabase.auth.getSession();");
  });

  test("the profile check has a persisted per-user fallback and still fails closed online", () => {
    const fn = identity.slice(identity.indexOf("export async function getMobileStudentIdentity"));
    expect(fn).toContain(
      "const persisted = offlineActive ? readPersistedMobileIdentity(userId) : null;",
    );
    expect(fn).toMatch(
      /if \(offlineActive && !isMobileOnline\(\)\) \{\s*if \(persisted\) return persisted;\s*throw new Error/,
    );
    expect(fn).toContain("if (error) throw error;");
    expect(fn).toContain("if (!studentProfileId) return null;");
    expect(fn).toContain(
      "if (offlineActive) writePersistedMobileIdentity({ userId, studentProfileId });",
    );
    // A definite "not a student" from the server still signs the account out.
    expect(fn).toContain("if (identity === null) void revokeNonStudent(userId);");
    expect(identity).toMatch(
      /async function revokeNonStudent[\s\S]*wipeMobileOfflineData\(\);[\s\S]*supabase\.auth\.signOut\(\)/,
    );
  });

  test("the guard still signs out a non-student and still tolerates a transient error", () => {
    expect(guard.indexOf("catch")).toBeLessThan(guard.indexOf("supabase.auth.signOut()"));
    expect(guard).toMatch(
      /if \(!identity\) \{\s*clearMobileStudentIdentity\(\);\s*clearMobileOfflineUserData\(context\.queryClient\);\s*await supabase\.auth\.signOut\(\);/,
    );
  });

  test("a null session from a failed offline refresh does not bounce to login; SIGNED_OUT does", () => {
    expect(layout).toMatch(
      /event === "SIGNED_OUT" \|\| !isMobileOfflineActive\(\)\s*\? null\s*: \(readStoredSupabaseSession\(\)\?\.userId \?\? null\)/,
    );
    expect(layout).toMatch(
      /if \(!nextUserId\) \{\s*clearMobileOfflineUserData\(queryClient\);\s*navigate\(\{ to: "\/mobile\/student-login", replace: true \}\);/,
    );
  });

  test("connectivity is measured, not assumed from navigator.onLine (WebView)", () => {
    expect(connectivity).toContain('const PROBE_URL = "/version.json";');
    expect(connectivity).toContain('cache: "no-store"');
    expect(connectivity).toContain("onlineManager.setOnline(online)");
    // Only a definite failure marks the app offline; a slow answer does not.
    expect(connectivity).toContain('return timedOut ? "unknown" : "offline";');
    expect(connectivity).toContain('hint?.source === "cache" && hint.reason === "network-error"');
  });
});

describe("persisted data is wiped on every sign-out path", () => {
  test("mobile layout logout: before the remote call and again in finally", () => {
    const logout = layout.slice(
      layout.indexOf("const handleLogout"),
      layout.indexOf("const displayName"),
    );
    const wipeFirst = logout.indexOf("clearMobileOfflineUserData(queryClient);");
    expect(wipeFirst).toBeGreaterThan(-1);
    expect(wipeFirst).toBeLessThan(logout.indexOf('signOut({ scope: "global" })'));
    const final = logout.slice(logout.indexOf("finally"));
    expect(final).toContain("clearMobileOfflineUserData(queryClient);");
    expect(final).toContain("clearSessionArtifacts();");
  });

  test("auth state change to another user or to signed-out", () => {
    const listener = layout.slice(
      layout.indexOf("onAuthStateChange"),
      layout.indexOf("subscription.unsubscribe()"),
    );
    expect(listener).toMatch(
      /authUserIdRef\.current !== nextUserId\) \{\s*clearMobileStudentIdentity\(\);[\s\S]*?clearMobileOfflineUserData\(queryClient\);\s*queryClient\.clear\(\);/,
    );
  });

  test("login page: a non-student is wiped before sign-out and a fresh sign-in starts clean", () => {
    expect(login).toMatch(
      /if \(!profile\) \{[\s\S]*?wipeMobileOfflineData\(\);\s*await supabase\.auth\.signOut\(\);/,
    );
    expect(login.indexOf("wipeMobileOfflineData();")).toBeLessThan(
      login.indexOf('.from("student_profiles")'),
    );
  });

  test("the remaining sign-out buttons and the shared artifact cleaner", () => {
    expect(read("src/routes/mobile.student.settings.tsx")).toMatch(
      /wipeMobileOfflineData\(\);\s*await supabase\.auth\.signOut\(\);/,
    );
    const security = read("src/components/mobile/MobileSecuritySettings.tsx");
    expect(
      security.match(/wipeMobileOfflineData\(\);\s*await supabase\.auth\.signOut\(/g),
    ).toHaveLength(2);
    expect(read("src/routes/mobile.student.more.tsx")).toContain("clearSessionArtifacts();");
    expect(read("src/lib/auth/clear-session-artifacts.ts")).toContain(
      "wipeMobileOfflineData({ storage: local });",
    );
  });

  test("a pending write is cancelled and can never run for a signed-out user", () => {
    const clear = persistence.slice(
      persistence.indexOf("export function clearMobileOfflineUserData"),
      persistence.indexOf("export function hasMobileOfflineData"),
    );
    expect(clear).toContain("clearTimeout(state.timer)");
    expect(clear).toContain("state.verified.clear();");
    expect(clear).toContain("wipeMobileOfflineData();");
    expect(persistence).toMatch(/const userId = state\.getUserId\(\);\s*if \(!userId\) return;/);
    expect(layout).toContain(
      "startMobileOfflinePersistence(queryClient, () => authUserIdRef.current);",
    );
  });
});

describe("persistence is an allow-list, verified, stale-while-revalidate", () => {
  test("only allow-listed keys are observed and written", () => {
    expect(persistence).toContain("if (!isPersistableMobileQueryKey(query.queryKey)) return;");
    expect(persistence).toContain(
      "if (!isPersistableMobileQueryKey(key) || !isMobileQueryKeyOwnedBy(key, userId)) continue;",
    );
    // No whole-cache dehydration.
    expect(persistence).not.toContain("dehydrate(");
    expect(persistence).not.toContain("persistQueryClient");
  });

  test("a result is persisted only after the server was confirmed reachable", () => {
    expect(persistence).toContain("const connectivity = await probeMobileConnectivity();");
    expect(persistence).toMatch(
      /if \(connectivity === "online"\) \{[\s\S]*?state\.verified\.set\(hash, dataUpdatedAt\);\s*schedulePersist\(queryClient\);/,
    );
    expect(persistence).toContain(
      "if (state.verified.get(query.queryHash) !== query.state.dataUpdatedAt) continue;",
    );
    // Unreachable network: the last good data is put back instead of an empty/failed result.
    expect(persistence).toMatch(
      /else if \(connectivity === "offline"\) \{\s*restoreLastGood\(queryClient, key, hash\);/,
    );
  });

  test("hydration keeps the original fetch time so screens revalidate in the background", () => {
    expect(persistence).toContain(
      "queryClient.setQueryData(entry.key as QueryKey, entry.data, { updatedAt: entry.updatedAt });",
    );
    expect(persistence).toContain(
      "if (queryClient.getQueryData(entry.key as QueryKey) !== undefined) continue;",
    );
  });

  test("schedule and grades keep resolving the canonical term before reading anything", () => {
    for (const file of [
      "src/routes/mobile.student.schedule.tsx",
      "src/routes/mobile.student.grades.tsx",
    ]) {
      const src = read(file);
      const term = src.indexOf("fetchCanonicalCurrentTerm(");
      const enrollments = src.indexOf('.from("student_enrollments")');
      expect(term).toBeGreaterThan(-1);
      expect(enrollments).toBeGreaterThan(term);
    }
  });
});

describe("what the student sees offline", () => {
  test("saved-data notice, needs-internet state, and the gate sits inside the app lock", () => {
    expect(gate).toContain("تعرض بيانات محفوظة — آخر تحديث:");
    expect(gate).toContain("هذه الصفحة تحتاج اتصالاً بالإنترنت");
    expect(gate).toContain("لا توجد بيانات محفوظة لهذه الصفحة بعد");
    const lockOpen = layout.indexOf("<MobileAppLockProvider onSignOut={handleLogout}>");
    const gateOpen = layout.indexOf("<MobileOfflineGate pathname={pathname}>");
    const lockClose = layout.indexOf("</MobileAppLockProvider>");
    expect(lockOpen).toBeGreaterThan(-1);
    expect(gateOpen).toBeGreaterThan(lockOpen);
    expect(lockClose).toBeGreaterThan(gateOpen);
    // The lock renders nothing of its children while locked/covered.
    expect(read("src/components/mobile/MobileAppLockProvider.tsx")).toContain(
      "{visible ? children : null}",
    );
  });

  test("an open screen is never unmounted when the connection drops", () => {
    expect(gate).toContain("{banner}\n      {content}");
    expect(gate).toMatch(/if \(enteredOffline\) \{\s*content = \(\s*<NeedsInternet/);
  });
});

describe("stale-deploy recovery is wired to the existing chunk-error logic", () => {
  test("worker report, failed dynamic import and the error screen all use the guarded recovery", () => {
    expect(swClient).toContain('type === "MOBILE_OFFLINE_ASSET_MISSING"');
    expect(swClient).toContain('window.addEventListener("vite:preloadError"');
    expect(swClient).toContain("isChunkLoadError(event.reason)");
    expect(swClient).toMatch(
      /recoverFromStaleAssets\(\{[\s\S]*?purge: purgeMobileOfflineCaches,[\s\S]*?reload: \(\) => window\.location\.reload\(\),/,
    );
    expect(swClient).toContain('(await probeMobileConnectivity({ force: true })) === "online"');
    expect(rootRoute).toContain(
      "beforeReload: isMobileApp ? purgeMobileOfflineCachesIfOnline : undefined",
    );
    expect(rootRoute).toMatch(
      /if \(isChunkLoadError\(error\)\) \{\s*void recoverMobileStaleAssets\(\);/,
    );
    expect(read("src/lib/route-error-recovery.ts")).toContain("await options.beforeReload();");
  });
});

describe("report-only CSP still matches what the feature does", () => {
  const csp = buildReportOnlyCsp("https://wpmicqriltrowwonknox.supabase.co");
  const directive = (name: string) =>
    csp
      .split(";")
      .map((part) => part.trim().split(/\s+/))
      .find(([key]) => key === name)
      ?.slice(1) ?? [];

  test("the same-origin worker and its same-origin probe/asset requests are covered", () => {
    expect(directive("worker-src")).toContain("'self'");
    expect(directive("connect-src")).toContain("'self'");
    expect(directive("script-src")).toContain("'self'");
    expect(MOBILE_OFFLINE_SW_URL.startsWith("/")).toBe(true);
    expect(connectivity).toContain('const PROBE_URL = "/version.json";');
  });

  test("the only cross-origin hosts the worker handles are the font hosts the policy already lists", () => {
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    expect(policy).toContain('const FONT_CSS_HOST = "fonts.googleapis.com";');
    expect(policy).toContain('const FONT_FILE_HOST = "fonts.gstatic.com";');
    // No new origin, no inline script, no eval introduced by the feature.
    for (const source of [sw, policy, swClient, connectivity, persistence, gate]) {
      expect(source).not.toMatch(/\beval\(|new Function\(|dangerouslySetInnerHTML/);
    }
  });
});

describe("scope discipline", () => {
  test("documentation exists and no dependency was added", () => {
    expect(existsSync(join(ROOT, "docs/mobile/OFFLINE-FIRST-01.md"))).toBe(true);
    const pkg = read("package.json");
    expect(pkg).not.toContain("react-query-persist-client");
    expect(pkg).not.toContain("workbox");
    expect(pkg).not.toMatch(/"idb(-keyval)?"/);
  });
});
