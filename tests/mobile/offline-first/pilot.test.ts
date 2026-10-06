/**
 * OFFLINE-FIRST-01 — pilot rollout.
 *
 * In "pilot" the feature exists only on devices that opted in from Settings.
 * These tests prove the non-opted-in path is inert: the real identity/guard
 * module is executed against a fake Supabase client and must behave exactly
 * like the pre-feature code (one getSession() read, the server profile check,
 * nothing read from or written to the device, no connectivity work).
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MOBILE_OFFLINE_OPT_IN_KEY,
  MOBILE_OFFLINE_ROLLOUT,
  MOBILE_OFFLINE_STORAGE_PREFIX,
  isMobileOfflineActive,
  isMobileOfflinePilot,
  readMobileOfflineOptIn,
  subscribeMobileOfflineActive,
  writeMobileOfflineOptIn,
} from "../../../src/lib/mobile/offline/config";
import {
  mobileOfflineIdentityKey,
  wipeMobileOfflineData,
  writeMobileOfflineSnapshot,
} from "../../../src/lib/mobile/offline/offline-store";
import { clearSessionArtifacts } from "../../../src/lib/auth/clear-session-artifacts";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  reads = 0;
  writes = 0;
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    this.reads += 1;
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    this.reads += 1;
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.writes += 1;
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.writes += 1;
    this.map.set(key, String(value));
  }
  keys() {
    return Array.from(this.map.keys());
  }
  seed(key: string, value: string) {
    this.map.set(key, value);
  }
}

const USER = "11111111-1111-4111-8111-111111111111";
const SESSION_KEY = "sb-wpmicqriltrowwonknox-auth-token";
const expiredSession = JSON.stringify({
  access_token: "a",
  refresh_token: "r",
  expires_at: 1_000,
  user: { id: USER },
});

// ---- fakes for the modules student-identity.ts depends on --------------------
const calls = { getSession: 0, profileQuery: 0, signOut: 0, launch: 0, isOnline: 0 };
let sessionResult: { data: { session: { user: { id: string } } | null }; error: unknown };
let profileResult: { data: { id: string } | null; error: unknown };
let fakeOnline = true;

mock.module("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => {
        calls.getSession += 1;
        return sessionResult;
      },
      signOut: async () => {
        calls.signOut += 1;
        return { error: null };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            calls.profileQuery += 1;
            return profileResult;
          },
        }),
      }),
    }),
  },
}));
mock.module("@/lib/mobile/offline/connectivity", () => ({
  isMobileOnline: () => {
    calls.isOnline += 1;
    return fakeOnline;
  },
  resolveMobileLaunchConnectivity: async () => {
    calls.launch += 1;
  },
}));

const identityModule = await import("../../../src/lib/mobile/student-identity");
const realLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;
let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: Storage }).localStorage = storage;
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) calls[key] = 0;
  sessionResult = { data: { session: { user: { id: USER } } }, error: null };
  profileResult = { data: { id: "sp-1" }, error: null };
  fakeOnline = true;
  identityModule.clearMobileStudentIdentity();
});
afterAll(() => {
  (globalThis as { localStorage?: Storage }).localStorage = realLocalStorage;
});

describe("rollout states", () => {
  test("this release ships as a pilot", () => {
    expect(MOBILE_OFFLINE_ROLLOUT).toBe("pilot");
    expect(isMobileOfflinePilot()).toBe(true);
  });

  test("off: nobody · pilot: opted-in devices only · on: everybody", () => {
    const optedIn = new MemoryStorage();
    optedIn.seed(MOBILE_OFFLINE_OPT_IN_KEY, "1");
    const fresh = new MemoryStorage();
    expect(isMobileOfflineActive(optedIn, "off")).toBe(false);
    expect(isMobileOfflineActive(fresh, "off")).toBe(false);
    expect(isMobileOfflineActive(optedIn, "pilot")).toBe(true);
    expect(isMobileOfflineActive(fresh, "pilot")).toBe(false);
    expect(isMobileOfflineActive(null, "pilot")).toBe(false);
    expect(isMobileOfflineActive(optedIn, "on")).toBe(true);
    expect(isMobileOfflineActive(fresh, "on")).toBe(true);
    // Only the exact value written by the toggle counts.
    fresh.seed(MOBILE_OFFLINE_OPT_IN_KEY, "true");
    expect(isMobileOfflineActive(fresh, "pilot")).toBe(false);
  });

  test("the opt-in is a per-device flag: it survives every sign-out wipe", () => {
    writeMobileOfflineOptIn(true, storage);
    writeMobileOfflineSnapshot(
      USER,
      [{ key: ["mobile-student", "grades"], data: 1, updatedAt: Date.now() }],
      { storage },
    );
    storage.seed(SESSION_KEY, expiredSession);
    expect(MOBILE_OFFLINE_OPT_IN_KEY.startsWith(MOBILE_OFFLINE_STORAGE_PREFIX)).toBe(false);
    expect(MOBILE_OFFLINE_OPT_IN_KEY).not.toMatch(/^(sb-|supabase)/);
    expect(MOBILE_OFFLINE_OPT_IN_KEY).not.toContain(USER);

    wipeMobileOfflineData({ storage });
    clearSessionArtifacts({ local: storage, session: new MemoryStorage(), doc: null });
    expect(storage.keys()).toEqual([MOBILE_OFFLINE_OPT_IN_KEY]);
    expect(readMobileOfflineOptIn(storage)).toBe(true);

    writeMobileOfflineOptIn(false, storage);
    expect(storage.keys()).toEqual([]);
  });

  test("toggling notifies subscribers (Settings switch, layout, gate)", () => {
    let notified = 0;
    const unsubscribe = subscribeMobileOfflineActive(() => void (notified += 1));
    writeMobileOfflineOptIn(true, storage);
    writeMobileOfflineOptIn(false, storage);
    unsubscribe();
    writeMobileOfflineOptIn(true, storage);
    expect(notified).toBe(2);
  });
});

describe("a device that did NOT opt in: the guard behaves exactly as before the feature", () => {
  test("user id = one getSession() read; the stored session is never consulted", async () => {
    storage.seed(SESSION_KEY, expiredSession); // even with an expired stored session
    storage.reads = 0;
    expect(await identityModule.getMobileSessionUserId()).toBe(USER);
    expect(calls.getSession).toBe(1);
    expect(calls.launch).toBe(0);
    expect(calls.isOnline).toBe(0);
    // Only the opt-in flag itself was looked at — no session/identity key.
    expect(storage.reads).toBe(1);
  });

  test("no session ⇒ null, exactly like the original (no local fallback)", async () => {
    storage.seed(SESSION_KEY, expiredSession);
    sessionResult = { data: { session: null }, error: { name: "AuthRetryableFetchError" } };
    expect(await identityModule.getMobileSessionUserId()).toBeNull();
    expect(await identityModule.getMobileStudentIdentity()).toBeNull();
    expect(calls.profileQuery).toBe(0);
  });

  test("the profile check always asks the server and never touches device storage", async () => {
    // A persisted identity left on the device must be ignored without opt-in.
    storage.seed(
      mobileOfflineIdentityKey(USER),
      JSON.stringify({ v: 1, userId: USER, studentProfileId: "stale", savedAt: Date.now() }),
    );
    storage.writes = 0;
    expect(await identityModule.getMobileStudentIdentity()).toEqual({
      userId: USER,
      studentProfileId: "sp-1",
    });
    expect(calls.profileQuery).toBe(1);
    expect(storage.writes).toBe(0);
    expect(calls.launch).toBe(0);
    expect(calls.isOnline).toBe(0);
    // Cached in memory as before: a second call makes no new server request.
    await identityModule.getMobileStudentIdentity();
    expect(calls.profileQuery).toBe(1);
  });

  test("a non-student is reported as null to the guard (which signs out) — synchronously, no background path", async () => {
    storage.seed(
      mobileOfflineIdentityKey(USER),
      JSON.stringify({ v: 1, userId: USER, studentProfileId: "stale", savedAt: Date.now() }),
    );
    profileResult = { data: null, error: null };
    expect(await identityModule.getMobileStudentIdentity()).toBeNull();
    expect(calls.signOut).toBe(0); // the caller signs out, as before
  });

  test("a transient read error still throws (never mistaken for 'not a student'), even 'offline'", async () => {
    fakeOnline = false;
    profileResult = { data: null, error: new Error("Failed to fetch") };
    await expect(identityModule.getMobileStudentIdentity()).rejects.toThrow("Failed to fetch");
    expect(calls.profileQuery).toBe(1);
  });
});

describe("a device that opted in gets the offline guard", () => {
  beforeEach(() => {
    storage.seed(MOBILE_OFFLINE_OPT_IN_KEY, "1");
  });

  test("offline with an expired stored session: signed in from the device, no getSession() wait", async () => {
    storage.seed(SESSION_KEY, expiredSession);
    fakeOnline = false;
    expect(await identityModule.getMobileSessionUserId()).toBe(USER);
    expect(calls.getSession).toBe(0);
    expect(calls.launch).toBe(1);
  });

  test("online: the server-confirmed identity is persisted, then used when offline", async () => {
    storage.seed(SESSION_KEY, expiredSession.replace("1000", String(Date.now() / 1000 + 3600)));
    expect(await identityModule.getMobileStudentIdentity()).toEqual({
      userId: USER,
      studentProfileId: "sp-1",
    });
    expect(storage.keys()).toContain(mobileOfflineIdentityKey(USER));

    identityModule.clearMobileStudentIdentity();
    fakeOnline = false;
    profileResult = { data: null, error: new Error("Failed to fetch") };
    calls.profileQuery = 0;
    expect(await identityModule.getMobileStudentIdentity()).toEqual({
      userId: USER,
      studentProfileId: "sp-1",
    });
    expect(calls.profileQuery).toBe(0);
  });

  test("online: a server 'not a student' answer still signs the account out and wipes the device", async () => {
    storage.seed(SESSION_KEY, expiredSession.replace("1000", String(Date.now() / 1000 + 3600)));
    await identityModule.getMobileStudentIdentity(); // persisted as a student
    identityModule.clearMobileStudentIdentity();
    profileResult = { data: null, error: null }; // profile removed on the server
    await identityModule.getMobileStudentIdentity();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.signOut).toBe(1);
    expect(storage.keys()).not.toContain(mobileOfflineIdentityKey(USER));
  });
});

describe("every entry point is gated on isMobileOfflineActive()", () => {
  const swClient = read("src/lib/mobile/offline/service-worker-client.ts");
  const connectivity = read("src/lib/mobile/offline/connectivity.ts");
  const persistence = read("src/lib/mobile/offline/query-persistence.ts");
  const layout = read("src/routes/mobile.student.tsx");
  const gate = read("src/components/mobile/MobileOfflineGate.tsx");
  const rootRoute = read("src/routes/__root.tsx");
  const cleanup = read("src/lib/pwa/native-pwa-cleanup.ts");

  test("worker: not registered, no listener, no cache/storage access without opt-in", () => {
    const start = swClient.slice(swClient.indexOf("export function startMobileOfflineRuntime"));
    const gateAt = start.indexOf("if (!isMobileOfflineActive()) return;");
    expect(gateAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(start.indexOf("installMobileStaleAssetRecovery();"));
    expect(gateAt).toBeLessThan(start.indexOf(".register(MOBILE_OFFLINE_SW_URL"));
    // The active cleanup (unregister + purge + wipe) runs only for "off".
    expect(start.indexOf("void disableMobileOffline();")).toBeLessThan(gateAt);
    expect(start).toMatch(/if \(MOBILE_OFFLINE_ROLLOUT === "off"\) \{/);
    expect(swClient.match(/\.register\(/g)).toHaveLength(1);
  });

  test("native shell: without opt-in every worker is unregistered, as before", () => {
    expect(cleanup).toContain("return isMobileOfflineActive() && isMobileOfflineScope(scopeUrl);");
  });

  test("connectivity: no probe request, no online-state change, no timers", () => {
    const probe = connectivity.slice(
      connectivity.indexOf("export function probeMobileConnectivity"),
    );
    expect(
      probe.indexOf('if (!isMobileOfflineActive()) return Promise.resolve("unknown");'),
    ).toBeLessThan(probe.indexOf("runProbe()"));
    expect(connectivity).toContain('if (result === "unknown" || !isMobileOfflineActive()) return;');
    expect(connectivity).toContain(
      'if (watchStarted || typeof window === "undefined" || !isMobileOfflineActive()) return;',
    );
    expect(connectivity).toContain(
      'if (!isMobileOfflineActive() || typeof window === "undefined") return;',
    );
    expect(connectivity.match(/onlineManager\.setOnline\(/g)).toHaveLength(2); // apply + reset
  });

  test("persistence: nothing hydrated, observed or written", () => {
    expect(persistence).toContain("if (!isMobileOfflineActive()) return 0;");
    expect(persistence).toContain("if (!isMobileOfflineActive()) return;");
    expect(persistence).toContain(
      'if (!isMobileOfflineActive() || typeof window === "undefined") return () => undefined;',
    );
    expect(persistence).toContain("if (!isMobileOfflineActive()) return false;");
  });

  test("layout: original auth rule, no watch, no persistence, no warm-up", () => {
    expect(layout).toMatch(/event === "SIGNED_OUT" \|\| !isMobileOfflineActive\(\)\s*\? null/);
    expect(layout).toMatch(
      /if \(!offlineActive\) return;\s*startMobileConnectivityWatch\(\);\s*return startMobileOfflinePersistence\(/,
    );
    expect(layout).toContain("if (!offlineActive || !authUserId) return;");
    expect(layout.match(/startMobileConnectivityWatch\(\)/g)).toHaveLength(1);
  });

  test("gate and error screen: screens render untouched, no automatic recovery", () => {
    expect(gate).toContain("const online = !active || measuredOnline;");
    expect(rootRoute).toContain("if (!isMobileApp || !isMobileOfflineActive()) return;");
    expect(swClient).toContain('if (!isMobileOfflineActive()) return Promise.resolve("cooldown");');
    const purge = swClient.slice(
      swClient.indexOf("export async function purgeMobileOfflineCachesIfOnline"),
    );
    expect(purge.indexOf("if (!isMobileOfflineActive()) return;")).toBeLessThan(
      purge.indexOf("probeMobileConnectivity"),
    );
  });
});

describe("Settings toggle", () => {
  const setting = read("src/components/mobile/MobileOfflineModeSetting.tsx");
  const swClient = read("src/lib/mobile/offline/service-worker-client.ts");

  test("clearly labelled, explained, and only shown during the pilot", () => {
    expect(setting).toContain("الوضع بدون إنترنت (تجريبي)");
    expect(setting.replace(/\s+/g, " ")).toContain(
      "يحفظ الصفحة الرئيسية والسجل الأكاديمي والخطة الدراسية والجداول على هذا الجهاز لعرضها بدون اتصال",
    );
    expect(setting).toContain("if (!isMobileOfflinePilot()) return null;");
    expect(setting).toContain('role="switch"');
    expect(read("src/routes/mobile.student.settings.tsx")).toContain(
      "<MobileOfflineModeSetting />",
    );
  });

  test("turning it off unregisters the worker, deletes its caches and wipes data immediately", () => {
    const apply = swClient.slice(
      swClient.indexOf("export async function setMobileOfflineMode"),
      swClient.indexOf("export async function purgeMobileOfflineCachesIfOnline"),
    );
    const off = apply.slice(apply.indexOf("writeMobileOfflineOptIn(false);"));
    expect(off).toContain("resetMobileConnectivity();");
    expect(off).toContain("await disableMobileOffline();");
    const disable = swClient.slice(swClient.indexOf("export async function disableMobileOffline"));
    expect(disable).toContain("wipeMobileOfflineData();");
    expect(disable).toContain("registration.unregister()");
    expect(disable).toContain("deleteMobileOfflineCaches()");
    // Turning it on registers the worker right away.
    expect(apply).toMatch(
      /writeMobileOfflineOptIn\(true\);\s*started = false;\s*startMobileOfflineRuntime\(\);/,
    );
  });
});
