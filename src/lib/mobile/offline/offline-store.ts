/**
 * On-device store for the allow-listed mobile student data.
 *
 * Storage: localStorage (synchronous, so the cache is hydrated before the
 * first paint; payloads are a few hundred KB at most and are size-guarded).
 *
 * Rules enforced here, not by callers:
 *  - every key is namespaced by the auth user id, and a payload is only
 *    returned when the user id stored INSIDE it matches as well;
 *  - only allow-listed query keys are written or read back;
 *  - entries older than MOBILE_OFFLINE_MAX_AGE_MS are dropped;
 *  - a different schema version invalidates the payload;
 *  - writing one student's snapshot removes any other student's data;
 *  - no token or credential is ever written — only query results and the
 *    `{ userId, studentProfileId }` pair.
 */

import {
  MOBILE_OFFLINE_MAX_AGE_MS,
  MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS,
  MOBILE_OFFLINE_SCHEMA_VERSION,
  MOBILE_OFFLINE_STORAGE_PREFIX,
  isMobileQueryKeyOwnedBy,
  isPersistableMobileQueryKey,
} from "./config";

export type PersistedMobileQuery = {
  key: readonly unknown[];
  data: unknown;
  /** When the data was fetched from the server (ms since epoch). */
  updatedAt: number;
};

export type MobileOfflineSnapshot = {
  v: number;
  userId: string;
  savedAt: number;
  queries: PersistedMobileQuery[];
};

export type PersistedMobileIdentity = { userId: string; studentProfileId: string };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export type MobileOfflineStoreOptions = {
  storage?: StorageLike | null;
  now?: number;
};

const VERSION_TAG = `v${MOBILE_OFFLINE_SCHEMA_VERSION}`;
const USER_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function resolveStorage(options?: MobileOfflineStoreOptions): StorageLike | null {
  if (options && options.storage !== undefined) return options.storage;
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function isValidUserId(userId: unknown): userId is string {
  return typeof userId === "string" && USER_ID_PATTERN.test(userId);
}

export function mobileOfflineSnapshotKey(userId: string): string {
  return `${MOBILE_OFFLINE_STORAGE_PREFIX}${VERSION_TAG}:data:${userId}`;
}

export function mobileOfflineIdentityKey(userId: string): string {
  return `${MOBILE_OFFLINE_STORAGE_PREFIX}${VERSION_TAG}:identity:${userId}`;
}

function isFresh(updatedAt: unknown, now: number): updatedAt is number {
  return (
    typeof updatedAt === "number" &&
    Number.isFinite(updatedAt) &&
    updatedAt > 0 &&
    updatedAt <= now + 60_000 &&
    now - updatedAt <= MOBILE_OFFLINE_MAX_AGE_MS
  );
}

function sanitizeQueries(queries: unknown, userId: string, now: number): PersistedMobileQuery[] {
  if (!Array.isArray(queries)) return [];
  const byKey = new Map<string, PersistedMobileQuery>();
  for (const entry of queries as Array<Partial<PersistedMobileQuery> | null>) {
    if (!entry || !isPersistableMobileQueryKey(entry.key)) continue;
    if (!isMobileQueryKeyOwnedBy(entry.key, userId)) continue;
    if (entry.data === undefined || !isFresh(entry.updatedAt, now)) continue;
    byKey.set(JSON.stringify(entry.key), {
      key: entry.key,
      data: entry.data,
      updatedAt: entry.updatedAt,
    });
  }
  return Array.from(byKey.values());
}

function allOwnedKeys(storage: StorageLike): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(MOBILE_OFFLINE_STORAGE_PREFIX)) keys.push(key);
  }
  return keys;
}

/** The student's snapshot, or null when absent / foreign / outdated / expired. */
export function readMobileOfflineSnapshot(
  userId: string,
  options?: MobileOfflineStoreOptions,
): MobileOfflineSnapshot | null {
  const storage = resolveStorage(options);
  if (!storage || !isValidUserId(userId)) return null;
  const now = options?.now ?? Date.now();
  try {
    const raw = storage.getItem(mobileOfflineSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MobileOfflineSnapshot> | null;
    if (!parsed || parsed.v !== MOBILE_OFFLINE_SCHEMA_VERSION || parsed.userId !== userId) {
      storage.removeItem(mobileOfflineSnapshotKey(userId));
      return null;
    }
    const queries = sanitizeQueries(parsed.queries, userId, now);
    if (queries.length === 0) return null;
    return {
      v: MOBILE_OFFLINE_SCHEMA_VERSION,
      userId,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : now,
      queries,
    };
  } catch {
    return null;
  }
}

/**
 * Writes the student's snapshot (allow-listed, fresh entries only) and removes
 * every other student's data from the device. Returns false when nothing was
 * stored (blocked storage, quota, or payload over the size guard).
 */
export function writeMobileOfflineSnapshot(
  userId: string,
  queries: readonly PersistedMobileQuery[],
  options?: MobileOfflineStoreOptions,
): boolean {
  const storage = resolveStorage(options);
  if (!storage || !isValidUserId(userId)) return false;
  const now = options?.now ?? Date.now();
  try {
    removeOtherUsers(storage, userId);
    // Newest first, so the size guard drops the oldest results.
    const kept = sanitizeQueries(queries, userId, now).sort((a, b) => b.updatedAt - a.updatedAt);
    while (kept.length > 0) {
      const snapshot: MobileOfflineSnapshot = {
        v: MOBILE_OFFLINE_SCHEMA_VERSION,
        userId,
        savedAt: now,
        queries: kept,
      };
      const serialized = JSON.stringify(snapshot);
      if (serialized.length <= MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS) {
        storage.setItem(mobileOfflineSnapshotKey(userId), serialized);
        return true;
      }
      kept.pop();
    }
    storage.removeItem(mobileOfflineSnapshotKey(userId));
    return false;
  } catch {
    // Quota / blocked storage: never leave a half-trusted payload behind.
    try {
      storage.removeItem(mobileOfflineSnapshotKey(userId));
    } catch {
      /* ignore */
    }
    return false;
  }
}

function removeOtherUsers(storage: StorageLike, userId: string): void {
  const mine = new Set([mobileOfflineSnapshotKey(userId), mobileOfflineIdentityKey(userId)]);
  for (const key of allOwnedKeys(storage)) {
    if (!mine.has(key)) storage.removeItem(key);
  }
}

/** Drops only the query snapshot (kept identity) — used by the render-error self-heal. */
export function removeMobileOfflineSnapshot(
  userId: string,
  options?: MobileOfflineStoreOptions,
): void {
  const storage = resolveStorage(options);
  if (!storage || !isValidUserId(userId)) return;
  try {
    storage.removeItem(mobileOfflineSnapshotKey(userId));
  } catch {
    /* ignore */
  }
}

/** Minimal identity used by the route guard when the profile check cannot reach the server. */
export function readPersistedMobileIdentity(
  userId: string,
  options?: MobileOfflineStoreOptions,
): PersistedMobileIdentity | null {
  const storage = resolveStorage(options);
  if (!storage || !isValidUserId(userId)) return null;
  const now = options?.now ?? Date.now();
  try {
    const raw = storage.getItem(mobileOfflineIdentityKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: number;
      userId?: string;
      studentProfileId?: string;
      savedAt?: number;
    } | null;
    if (
      !parsed ||
      parsed.v !== MOBILE_OFFLINE_SCHEMA_VERSION ||
      parsed.userId !== userId ||
      typeof parsed.studentProfileId !== "string" ||
      !parsed.studentProfileId ||
      !isFresh(parsed.savedAt, now)
    ) {
      storage.removeItem(mobileOfflineIdentityKey(userId));
      return null;
    }
    return { userId, studentProfileId: parsed.studentProfileId };
  } catch {
    return null;
  }
}

export function writePersistedMobileIdentity(
  identity: PersistedMobileIdentity,
  options?: MobileOfflineStoreOptions,
): void {
  const storage = resolveStorage(options);
  if (!storage || !isValidUserId(identity.userId) || !identity.studentProfileId) return;
  try {
    removeOtherUsers(storage, identity.userId);
    storage.setItem(
      mobileOfflineIdentityKey(identity.userId),
      JSON.stringify({
        v: MOBILE_OFFLINE_SCHEMA_VERSION,
        userId: identity.userId,
        studentProfileId: identity.studentProfileId,
        savedAt: options?.now ?? Date.now(),
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Removes EVERYTHING this feature stored on the device, for every user and
 * every schema version. Called on every sign-out path. Never throws.
 */
export function wipeMobileOfflineData(options?: MobileOfflineStoreOptions): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  try {
    for (const key of allOwnedKeys(storage)) storage.removeItem(key);
  } catch {
    /* private mode / blocked storage */
  }
}
