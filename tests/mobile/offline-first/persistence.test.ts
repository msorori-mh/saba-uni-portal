/**
 * OFFLINE-FIRST-01 — on-device persistence rules (real modules, fake Storage):
 * allow-list, per-user namespacing, schema buster, 7-day max age, size guard,
 * wipe on sign-out, offline session read and the stale-asset recovery guard.
 */
import { describe, expect, test } from "bun:test";
import {
  MOBILE_OFFLINE_MAX_AGE_MS,
  MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS,
  MOBILE_OFFLINE_QUERY_SEGMENTS,
  MOBILE_OFFLINE_SCHEMA_VERSION,
  MOBILE_OFFLINE_WARM_ROUTES,
  classifyMobileOfflineScreen,
  isMobileOfflineCacheName,
  isMobileOfflineScope,
  isPersistableMobileQueryKey,
} from "../../../src/lib/mobile/offline/config";
import {
  mobileOfflineIdentityKey,
  mobileOfflineSnapshotKey,
  readMobileOfflineSnapshot,
  readPersistedMobileIdentity,
  wipeMobileOfflineData,
  writeMobileOfflineSnapshot,
  writePersistedMobileIdentity,
} from "../../../src/lib/mobile/offline/offline-store";
import {
  readStoredSupabaseSession,
  storedSessionNeedsRefresh,
} from "../../../src/lib/mobile/offline/stored-session";
import { clearSessionArtifacts } from "../../../src/lib/auth/clear-session-artifacts";
import {
  STALE_ASSET_RELOAD_COOLDOWN_MS,
  STALE_ASSET_RELOAD_KEY,
  recoverFromStaleAssets,
} from "../../../src/lib/route-error-recovery";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
  keys() {
    return Array.from(this.map.keys());
  }
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const NOW = 1_800_000_000_000;

describe("allow-list of persisted queries", () => {
  test("exactly the offline screens' queries are persistable", () => {
    expect([...MOBILE_OFFLINE_QUERY_SEGMENTS]).toEqual([
      "context",
      "short-profile",
      "academic-record",
      "program-id",
      "study-plan",
      "schedule",
      "grades",
    ]);
    for (const key of [
      ["mobile-student", "context"],
      ["mobile-student", "short-profile", USER_A],
      ["mobile-student", "academic-record", "profile-1"],
      ["mobile-student", "program-id"],
      ["mobile-student", "study-plan", "program-1"],
      ["mobile-student", "schedule"],
      ["mobile-student", "grades"],
    ]) {
      expect(isPersistableMobileQueryKey(key)).toBe(true);
    }
  });

  test.each([
    [["mobile-student", "documents"]],
    [["mobile-official-document", "doc-1"]],
    [["mobile-student", "finance"]],
    [["mobile-student", "requests"]],
    [["mobile-student", "request-types"]],
    [["mobile-student", "notifications"]],
    [["mobile-student", "notifications", "unread-count", USER_A]],
    [["mobile-student", "materials", "courses"]],
    [["mobile-student", "materials", "course", "s1"]],
    [["mobile-student", "graduates-affairs", "self"]],
    [["mobile-student", "reports-catalog"]],
    [["mobile-student", "academic-self-summary"]],
    [["student", "schedule"]],
    [["mobile-student"]],
    [["mobile-student", "schedule", { signedUrl: "https://x" }]],
    [["mobile-student", "schedule", "a", "b"]],
    ["mobile-student"],
    [null],
  ])("never persisted: %j", (key) => {
    expect(isPersistableMobileQueryKey(key)).toBe(false);
  });

  test("non-allow-listed entries are dropped on write AND on read", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [
        { key: ["mobile-student", "schedule"], data: { rows: [1] }, updatedAt: NOW },
        { key: ["mobile-student", "finance"], data: { balance: 5 }, updatedAt: NOW },
        { key: ["mobile-student", "documents"], data: [{ signed: "url" }], updatedAt: NOW },
        { key: ["mobile-student", "notifications"], data: [1], updatedAt: NOW },
      ],
      { storage, now: NOW },
    );
    const raw = storage.getItem(mobileOfflineSnapshotKey(USER_A))!;
    expect(raw).not.toContain("finance");
    expect(raw).not.toContain("documents");
    expect(raw).not.toContain("notifications");

    // Even a tampered payload cannot bring a foreign key back into the cache.
    const tampered = JSON.parse(raw);
    tampered.queries.push({ key: ["mobile-student", "finance"], data: 1, updatedAt: NOW });
    storage.setItem(mobileOfflineSnapshotKey(USER_A), JSON.stringify(tampered));
    const snapshot = readMobileOfflineSnapshot(USER_A, { storage, now: NOW })!;
    expect(snapshot.queries.map((query) => query.key[1])).toEqual(["schedule"]);
  });
});

describe("per-user namespacing", () => {
  test("the storage key contains the auth user id and the schema version", () => {
    expect(mobileOfflineSnapshotKey(USER_A)).toBe(
      `mobile-offline:v${MOBILE_OFFLINE_SCHEMA_VERSION}:data:${USER_A}`,
    );
    expect(mobileOfflineIdentityKey(USER_A)).toBe(
      `mobile-offline:v${MOBILE_OFFLINE_SCHEMA_VERSION}:identity:${USER_A}`,
    );
  });

  test("user B never reads user A's data — not even from a copied payload", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [{ key: ["mobile-student", "grades"], data: { a: 1 }, updatedAt: NOW }],
      {
        storage,
        now: NOW,
      },
    );
    expect(readMobileOfflineSnapshot(USER_B, { storage, now: NOW })).toBeNull();
    // A's payload placed under B's key is rejected because the inner user id differs.
    storage.setItem(
      mobileOfflineSnapshotKey(USER_B),
      storage.getItem(mobileOfflineSnapshotKey(USER_A))!,
    );
    expect(readMobileOfflineSnapshot(USER_B, { storage, now: NOW })).toBeNull();
    expect(storage.getItem(mobileOfflineSnapshotKey(USER_B))).toBeNull();
  });

  test("writing for one student removes every other student's data and identity", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [{ key: ["mobile-student", "grades"], data: 1, updatedAt: NOW }],
      { storage, now: NOW },
    );
    writePersistedMobileIdentity(
      { userId: USER_A, studentProfileId: "sp-a" },
      { storage, now: NOW },
    );
    writeMobileOfflineSnapshot(
      USER_B,
      [{ key: ["mobile-student", "grades"], data: 2, updatedAt: NOW }],
      { storage, now: NOW },
    );
    expect(storage.keys()).toEqual([mobileOfflineSnapshotKey(USER_B)]);
  });

  test("a header profile keyed by another user id is not accepted", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [
        {
          key: ["mobile-student", "short-profile", USER_B],
          data: { full_name_ar: "x" },
          updatedAt: NOW,
        },
        {
          key: ["mobile-student", "short-profile", USER_A],
          data: { full_name_ar: "a" },
          updatedAt: NOW,
        },
      ],
      { storage, now: NOW },
    );
    const snapshot = readMobileOfflineSnapshot(USER_A, { storage, now: NOW })!;
    expect(snapshot.queries).toHaveLength(1);
    expect(snapshot.queries[0].key[2]).toBe(USER_A);
  });

  test("an invalid user id stores nothing", () => {
    const storage = new MemoryStorage();
    expect(
      writeMobileOfflineSnapshot(
        "",
        [{ key: ["mobile-student", "grades"], data: 1, updatedAt: NOW }],
        { storage, now: NOW },
      ),
    ).toBe(false);
    expect(storage.length).toBe(0);
  });
});

describe("version buster, max age and size guard", () => {
  const entry = (updatedAt: number) => ({
    key: ["mobile-student", "schedule"],
    data: { rows: [] },
    updatedAt,
  });

  test("data older than 7 days is never returned", () => {
    expect(MOBILE_OFFLINE_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(USER_A, [entry(NOW)], { storage, now: NOW });
    expect(
      readMobileOfflineSnapshot(USER_A, { storage, now: NOW + MOBILE_OFFLINE_MAX_AGE_MS - 1000 }),
    ).not.toBeNull();
    expect(
      readMobileOfflineSnapshot(USER_A, { storage, now: NOW + MOBILE_OFFLINE_MAX_AGE_MS + 1000 }),
    ).toBeNull();
  });

  test("max age is per result: only the expired one is dropped", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [
        entry(NOW),
        { key: ["mobile-student", "grades"], data: 1, updatedAt: NOW - 6 * 24 * 3600 * 1000 },
      ],
      { storage, now: NOW },
    );
    const later = readMobileOfflineSnapshot(USER_A, { storage, now: NOW + 2 * 24 * 3600 * 1000 })!;
    expect(later.queries.map((query) => query.key[1])).toEqual(["schedule"]);
  });

  test("a payload written by another schema version is ignored and removed", () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(USER_A, [entry(NOW)], { storage, now: NOW });
    const payload = JSON.parse(storage.getItem(mobileOfflineSnapshotKey(USER_A))!);
    payload.v = MOBILE_OFFLINE_SCHEMA_VERSION + 1;
    storage.setItem(mobileOfflineSnapshotKey(USER_A), JSON.stringify(payload));
    expect(readMobileOfflineSnapshot(USER_A, { storage, now: NOW })).toBeNull();
    expect(storage.getItem(mobileOfflineSnapshotKey(USER_A))).toBeNull();
  });

  test("the size guard drops the oldest results instead of exceeding the limit", () => {
    const storage = new MemoryStorage();
    const big = "x".repeat(Math.floor(MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS * 0.6));
    const stored = writeMobileOfflineSnapshot(
      USER_A,
      [
        { key: ["mobile-student", "academic-record", "p"], data: big, updatedAt: NOW - 5000 },
        { key: ["mobile-student", "schedule"], data: big, updatedAt: NOW },
      ],
      { storage, now: NOW },
    );
    expect(stored).toBe(true);
    const raw = storage.getItem(mobileOfflineSnapshotKey(USER_A))!;
    expect(raw.length).toBeLessThanOrEqual(MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS);
    expect(
      readMobileOfflineSnapshot(USER_A, { storage, now: NOW })!.queries.map(
        (query) => query.key[1],
      ),
    ).toEqual(["schedule"]);
  });

  test("a single oversized result is not stored at all", () => {
    const storage = new MemoryStorage();
    const huge = "x".repeat(MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS + 10);
    expect(
      writeMobileOfflineSnapshot(
        USER_A,
        [{ key: ["mobile-student", "schedule"], data: huge, updatedAt: NOW }],
        { storage, now: NOW },
      ),
    ).toBe(false);
    expect(storage.getItem(mobileOfflineSnapshotKey(USER_A))).toBeNull();
  });

  test("corrupt JSON or blocked storage degrade to 'no saved data'", () => {
    const storage = new MemoryStorage();
    storage.setItem(mobileOfflineSnapshotKey(USER_A), "{not json");
    expect(readMobileOfflineSnapshot(USER_A, { storage, now: NOW })).toBeNull();
    expect(readMobileOfflineSnapshot(USER_A, { storage: null, now: NOW })).toBeNull();
    expect(writeMobileOfflineSnapshot(USER_A, [entry(NOW)], { storage: null, now: NOW })).toBe(
      false,
    );
  });
});

describe("persisted identity for the offline guard", () => {
  test("round-trips only { userId, studentProfileId } for the same user, 7 days max", () => {
    const storage = new MemoryStorage();
    writePersistedMobileIdentity(
      { userId: USER_A, studentProfileId: "sp-a" },
      { storage, now: NOW },
    );
    expect(readPersistedMobileIdentity(USER_A, { storage, now: NOW })).toEqual({
      userId: USER_A,
      studentProfileId: "sp-a",
    });
    expect(readPersistedMobileIdentity(USER_B, { storage, now: NOW })).toBeNull();
    expect(
      readPersistedMobileIdentity(USER_A, { storage, now: NOW + MOBILE_OFFLINE_MAX_AGE_MS + 1 }),
    ).toBeNull();
    const raw = JSON.parse(storage.getItem(mobileOfflineIdentityKey(USER_A)) ?? "null");
    expect(raw).toBeNull(); // expired entry was removed
  });

  test("nothing this feature writes looks like a credential", () => {
    const storage = new MemoryStorage();
    writePersistedMobileIdentity(
      { userId: USER_A, studentProfileId: "sp-a" },
      { storage, now: NOW },
    );
    writeMobileOfflineSnapshot(
      USER_A,
      [{ key: ["mobile-student", "context"], data: { profile: { id: "sp-a" } }, updatedAt: NOW }],
      { storage, now: NOW },
    );
    for (const key of storage.keys()) {
      expect(key.startsWith("mobile-offline:")).toBe(true);
      expect(storage.getItem(key)!).not.toMatch(
        /access_token|refresh_token|eyJ[A-Za-z0-9_-]{10,}|password|apikey/i,
      );
    }
  });
});

describe("wipe on sign-out", () => {
  const seed = () => {
    const storage = new MemoryStorage();
    writeMobileOfflineSnapshot(
      USER_A,
      [{ key: ["mobile-student", "grades"], data: 1, updatedAt: NOW }],
      { storage, now: NOW },
    );
    writePersistedMobileIdentity(
      { userId: USER_A, studentProfileId: "sp-a" },
      { storage, now: NOW },
    );
    storage.setItem("mobile-offline:v0:data:legacy", "{}"); // older schema
    storage.setItem("portal_pwa_install_dismissed_at", "1");
    return storage;
  };

  test("wipeMobileOfflineData removes every user's payloads, all schema versions, nothing else", () => {
    const storage = seed();
    wipeMobileOfflineData({ storage });
    expect(storage.keys()).toEqual(["portal_pwa_install_dismissed_at"]);
    expect(() => wipeMobileOfflineData({ storage: null })).not.toThrow();
  });

  test("clearSessionArtifacts (shared by every portal sign-out) wipes them too", () => {
    const storage = seed();
    storage.setItem("sb-wpmicqriltrowwonknox-auth-token", "{}");
    clearSessionArtifacts({ local: storage, session: new MemoryStorage(), doc: null });
    expect(storage.keys()).toEqual(["portal_pwa_install_dismissed_at"]);
  });
});

describe("offline session read", () => {
  const session = (expiresAtSeconds: number) =>
    JSON.stringify({
      access_token: "eyJhbGciOi.secret.signature",
      refresh_token: "refresh-secret",
      expires_at: expiresAtSeconds,
      user: { id: USER_A, email: "s@students.usr.edu.ye" },
    });

  test("returns only the user id and expiry of the stored session — never a token", () => {
    const storage = new MemoryStorage();
    storage.setItem("sb-wpmicqriltrowwonknox-auth-token", session(NOW / 1000 + 3600));
    const stored = readStoredSupabaseSession(storage)!;
    expect(stored).toEqual({ userId: USER_A, expiresAtMs: NOW + 3_600_000 });
    expect(JSON.stringify(stored)).not.toContain("secret");
  });

  test("an EXPIRED stored session still identifies the student (offline cold start)", () => {
    const storage = new MemoryStorage();
    storage.setItem("sb-wpmicqriltrowwonknox-auth-token", session(NOW / 1000 - 86_400));
    const stored = readStoredSupabaseSession(storage)!;
    expect(stored.userId).toBe(USER_A);
    expect(storedSessionNeedsRefresh(stored, NOW)).toBe(true);
    expect(storedSessionNeedsRefresh({ userId: USER_A, expiresAtMs: NOW + 3_600_000 }, NOW)).toBe(
      false,
    );
  });

  test("no stored session, a signed-out state or junk means 'not signed in'", () => {
    const storage = new MemoryStorage();
    expect(readStoredSupabaseSession(storage)).toBeNull();
    storage.setItem("sb-x-auth-token", "not json");
    storage.setItem("sb-y-auth-token", JSON.stringify({ user: { id: USER_A } })); // no refresh token
    storage.setItem(
      "mobile-offline:v1:identity:" + USER_A,
      JSON.stringify({ user: { id: USER_B }, refresh_token: "r" }),
    );
    expect(readStoredSupabaseSession(storage)).toBeNull();
    expect(readStoredSupabaseSession(null)).toBeNull();
  });
});

describe("screen classification", () => {
  test("the requested screens are available offline", () => {
    for (const path of [
      "/mobile/student",
      "/mobile/student/",
      "/mobile/student/academic-record",
      "/mobile/student/study-plan",
      "/mobile/student/schedule",
      "/mobile/student/grades",
    ]) {
      expect(classifyMobileOfflineScreen(path).kind).toBe("cached");
    }
    expect(classifyMobileOfflineScreen("/mobile/student/academic-record")).toEqual({
      kind: "cached",
      requires: ["context", "academic-record"],
    });
  });

  test("submission and sensitive screens stay online-only", () => {
    for (const path of [
      "/mobile/student/requests",
      "/mobile/student/requests/new",
      "/mobile/student/requests/b1/excused-absence",
      "/mobile/student/documents",
      "/mobile/student/documents/1",
      "/mobile/student/finance",
      "/mobile/student/notifications",
      "/mobile/student/materials",
      "/mobile/student/profile",
      "/mobile/student/reports",
    ]) {
      expect(classifyMobileOfflineScreen(path).kind).toBe("online-only");
    }
    expect(classifyMobileOfflineScreen("/mobile/student/more").kind).toBe("static");
  });

  test("every screen that requires saved data only requires allow-listed queries, and its code is pre-downloaded", () => {
    for (const route of MOBILE_OFFLINE_WARM_ROUTES) {
      const screen = classifyMobileOfflineScreen(route);
      expect(screen.kind).not.toBe("online-only");
      if (screen.kind === "cached") {
        for (const segment of screen.requires)
          expect(MOBILE_OFFLINE_QUERY_SEGMENTS).toContain(segment);
      }
    }
  });

  test("scope and cache-name helpers", () => {
    expect(isMobileOfflineScope("https://quboolye.com/mobile/")).toBe(true);
    expect(isMobileOfflineScope("https://quboolye.com/")).toBe(false);
    expect(isMobileOfflineScope(null)).toBe(false);
    expect(isMobileOfflineCacheName("mobile-offline-v1-build-abc")).toBe(true);
    expect(isMobileOfflineCacheName("portal-pwa-v2")).toBe(false);
  });
});

describe("stale-asset recovery: purge + reload from the network, once", () => {
  const run = async (options: {
    online: boolean;
    storage?: MemoryStorage | null;
    now?: number;
  }) => {
    const calls: string[] = [];
    const storage = options.storage === undefined ? new MemoryStorage() : options.storage;
    const result = await recoverFromStaleAssets({
      isOnline: () => options.online,
      purge: async () => void calls.push("purge"),
      reload: () => void calls.push("reload"),
      storage,
      now: () => options.now ?? NOW,
    });
    return { result, calls, storage };
  };

  test("online: caches are purged BEFORE the reload", async () => {
    const { result, calls, storage } = await run({ online: true });
    expect(result).toBe("reloaded");
    expect(calls).toEqual(["purge", "reload"]);
    expect(storage!.getItem(STALE_ASSET_RELOAD_KEY)).toBe(String(NOW));
  });

  test("offline: the stored app is kept and nothing reloads", async () => {
    const { result, calls } = await run({ online: false });
    expect(result).toBe("offline");
    expect(calls).toEqual([]);
  });

  test("no reload loop: a second attempt inside the cooldown does nothing", async () => {
    const storage = new MemoryStorage();
    await run({ online: true, storage });
    const again = await run({
      online: true,
      storage,
      now: NOW + STALE_ASSET_RELOAD_COOLDOWN_MS - 1,
    });
    expect(again.result).toBe("cooldown");
    expect(again.calls).toEqual([]);
    const later = await run({
      online: true,
      storage,
      now: NOW + STALE_ASSET_RELOAD_COOLDOWN_MS + 1,
    });
    expect(later.result).toBe("reloaded");
  });

  test("without a place to remember the reload there is no automatic reload", async () => {
    const { result, calls } = await run({ online: true, storage: null });
    expect(result).toBe("cooldown");
    expect(calls).toEqual([]);
  });

  test("a failing purge still reloads (the reload is network-first)", async () => {
    const calls: string[] = [];
    const result = await recoverFromStaleAssets({
      isOnline: async () => true,
      purge: async () => {
        throw new Error("cache api blocked");
      },
      reload: () => void calls.push("reload"),
      storage: new MemoryStorage(),
      now: () => NOW,
    });
    expect(result).toBe("reloaded");
    expect(calls).toEqual(["reload"]);
  });
});
