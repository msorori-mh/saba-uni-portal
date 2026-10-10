/**
 * Persists an explicit allow-list of mobile student query results and restores
 * them before the first paint (stale-while-revalidate):
 *
 *   cold start → hydrate from the device → render → refetch in the background.
 *
 * It is NOT a whole-cache persister: only keys accepted by
 * `isPersistableMobileQueryKey` are ever written, and only after the result
 * was confirmed to come from a reachable server. That confirmation matters
 * because several fetchers deliberately fail closed to an EMPTY result when a
 * read fails (e.g. the schedule when the current term cannot be resolved); an
 * unreachable network must never replace good saved data with "nothing".
 */

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import {
  isMobileOfflineActive,
  isMobileQueryKeyOwnedBy,
  isPersistableMobileQueryKey,
  type MobileOfflineQuerySegment,
} from "./config";
import { probeMobileConnectivity } from "./connectivity";
import {
  readMobileOfflineSnapshot,
  removeMobileOfflineSnapshot,
  wipeMobileOfflineData,
  writeMobileOfflineSnapshot,
  type PersistedMobileQuery,
} from "./offline-store";

const PERSIST_DEBOUNCE_MS = 800;

type PersistenceState = {
  getUserId: () => string | null;
  /** queryHash → dataUpdatedAt of results confirmed while the server was reachable. */
  verified: Map<string, number>;
  timer: ReturnType<typeof setTimeout> | null;
  unsubscribe: () => void;
};

const states = new WeakMap<QueryClient, PersistenceState>();

/**
 * Puts the student's saved results into the query cache (never over data that
 * is already there). Synchronous, so it can run in the route guard before
 * anything renders. Returns the number of restored queries.
 */
export function hydrateMobileOfflineQueries(queryClient: QueryClient, userId: string): number {
  if (!isMobileOfflineActive()) return 0;
  const snapshot = readMobileOfflineSnapshot(userId);
  if (!snapshot) return 0;
  let restored = 0;
  for (const entry of snapshot.queries) {
    if (queryClient.getQueryData(entry.key as QueryKey) !== undefined) continue;
    // `updatedAt` is the original fetch time, so the query is stale and is
    // revalidated in the background as soon as a screen uses it.
    queryClient.setQueryData(entry.key as QueryKey, entry.data, { updatedAt: entry.updatedAt });
    restored += 1;
  }
  return restored;
}

/**
 * Guard-side entry point. Runs on every navigation inside the app: restoring
 * is a synchronous read of one small localStorage entry and it only fills
 * queries that are missing, so a result that was garbage-collected from memory
 * (unmounted for a while) still paints immediately — online or offline.
 */
export function ensureMobileOfflineHydrated(queryClient: QueryClient, userId: string): void {
  if (!isMobileOfflineActive()) return;
  hydrateMobileOfflineQueries(queryClient, userId);
}

function collectVerified(queryClient: QueryClient, state: PersistenceState, userId: string) {
  const entries: PersistedMobileQuery[] = [];
  for (const query of queryClient.getQueryCache().getAll()) {
    const key = query.queryKey;
    if (!isPersistableMobileQueryKey(key) || !isMobileQueryKeyOwnedBy(key, userId)) continue;
    if (query.state.status !== "success" || query.state.data === undefined) continue;
    if (state.verified.get(query.queryHash) !== query.state.dataUpdatedAt) continue;
    entries.push({ key, data: query.state.data, updatedAt: query.state.dataUpdatedAt });
  }
  return entries;
}

function persistNow(queryClient: QueryClient): void {
  const state = states.get(queryClient);
  if (!state) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const userId = state.getUserId();
  if (!userId) return;
  const fresh = collectVerified(queryClient, state, userId);
  if (fresh.length === 0) return;
  // Keep saved results of screens that are not in memory right now.
  const freshKeys = new Set(fresh.map((entry) => JSON.stringify(entry.key)));
  const retained = (readMobileOfflineSnapshot(userId)?.queries ?? []).filter(
    (entry) => !freshKeys.has(JSON.stringify(entry.key)),
  );
  writeMobileOfflineSnapshot(userId, [...fresh, ...retained]);
}

function schedulePersist(queryClient: QueryClient): void {
  const state = states.get(queryClient);
  if (!state || state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    persistNow(queryClient);
  }, PERSIST_DEBOUNCE_MS);
}

/** Puts the last good result back after a fetch that never reached the server. */
function restoreLastGood(queryClient: QueryClient, key: QueryKey, hash: string): void {
  const state = states.get(queryClient);
  const userId = state?.getUserId();
  if (!userId) return;
  const saved = readMobileOfflineSnapshot(userId)?.queries.find(
    (entry) => JSON.stringify(entry.key) === JSON.stringify(key),
  );
  if (saved) {
    queryClient.setQueryData(key, saved.data, { updatedAt: saved.updatedAt });
    return;
  }
  // Nothing saved: at least clear an error state when data is still in memory.
  const query = queryClient.getQueryCache().get(hash);
  if (query && query.state.status === "error" && query.state.data !== undefined) {
    queryClient.setQueryData(key, query.state.data, { updatedAt: query.state.dataUpdatedAt });
  }
}

async function onAllowListedFetchSettled(
  queryClient: QueryClient,
  key: QueryKey,
  hash: string,
  outcome: "success" | "error",
  dataUpdatedAt: number,
): Promise<void> {
  const connectivity = await probeMobileConnectivity();
  const state = states.get(queryClient);
  if (!state) return;
  if (connectivity === "online") {
    if (outcome !== "success") return;
    state.verified.set(hash, dataUpdatedAt);
    schedulePersist(queryClient);
  } else if (connectivity === "offline") {
    restoreLastGood(queryClient, key, hash);
  }
  // "unknown": neither persisted nor rolled back.
}

/**
 * Starts writing allow-listed results to the device for the signed-in student.
 * Idempotent per QueryClient; returns a stop function.
 */
export function startMobileOfflinePersistence(
  queryClient: QueryClient,
  getUserId: () => string | null,
): () => void {
  if (!isMobileOfflineActive() || typeof window === "undefined") return () => undefined;
  const existing = states.get(queryClient);
  if (existing) {
    existing.getUserId = getUserId;
    return () => stopMobileOfflinePersistence(queryClient);
  }

  const unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    const { query, action } = event;
    if (!isPersistableMobileQueryKey(query.queryKey)) return;
    if (action.type === "success") {
      // `manual` = setQueryData (hydration / rollback), not a server answer.
      if (action.manual) return;
      void onAllowListedFetchSettled(
        queryClient,
        query.queryKey,
        query.queryHash,
        "success",
        query.state.dataUpdatedAt,
      );
    } else if (action.type === "error") {
      void onAllowListedFetchSettled(
        queryClient,
        query.queryKey,
        query.queryHash,
        "error",
        query.state.dataUpdatedAt,
      );
    }
  });

  const flush = () => {
    if (document.visibilityState === "hidden" && states.get(queryClient)?.timer) {
      persistNow(queryClient);
    }
  };
  document.addEventListener("visibilitychange", flush);

  states.set(queryClient, {
    getUserId,
    verified: new Map(),
    timer: null,
    unsubscribe: () => {
      unsubscribeCache();
      document.removeEventListener("visibilitychange", flush);
    },
  });
  return () => stopMobileOfflinePersistence(queryClient);
}

export function stopMobileOfflinePersistence(queryClient: QueryClient): void {
  const state = states.get(queryClient);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.unsubscribe();
  states.delete(queryClient);
}

/**
 * Sign-out / account switch: cancel any pending write, forget what was
 * verified, and wipe every persisted payload on the device (all users).
 */
export function clearMobileOfflineUserData(queryClient?: QueryClient): void {
  if (queryClient) {
    const state = states.get(queryClient);
    if (state) {
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
      state.verified.clear();
    }
  }
  wipeMobileOfflineData();
}

/** True when every required allow-listed result has data in memory. */
export function hasMobileOfflineData(
  queryClient: QueryClient,
  requires: readonly MobileOfflineQuerySegment[],
): boolean {
  const queries = queryClient.getQueryCache().getAll();
  return requires.every((segment) =>
    queries.some(
      (query) =>
        isPersistableMobileQueryKey(query.queryKey) &&
        query.queryKey[1] === segment &&
        query.state.data !== undefined,
    ),
  );
}

/** Oldest fetch time among the results a screen shows (ms), or null when unknown. */
export function getMobileOfflineLastUpdated(
  queryClient: QueryClient,
  requires: readonly MobileOfflineQuerySegment[],
): number | null {
  let oldest: number | null = null;
  for (const query of queryClient.getQueryCache().getAll()) {
    if (!isPersistableMobileQueryKey(query.queryKey)) continue;
    if (!requires.includes(query.queryKey[1] as MobileOfflineQuerySegment)) continue;
    const at = query.state.dataUpdatedAt;
    if (query.state.data === undefined || !at) continue;
    if (oldest === null || at < oldest) oldest = at;
  }
  return oldest;
}

/**
 * Self-heal after a render error on a mobile screen: if the server is
 * reachable, forget the saved results (they may no longer match what the new
 * code expects) so the retry starts from fresh data. Offline, nothing is
 * dropped — the saved data is all the student has.
 */
export async function discardMobileOfflineQueriesIfOnline(
  queryClient: QueryClient,
  userId: string | null,
): Promise<boolean> {
  if (!isMobileOfflineActive()) return false;
  if ((await probeMobileConnectivity()) !== "online") return false;
  if (userId) removeMobileOfflineSnapshot(userId);
  queryClient.removeQueries({ predicate: (query) => isPersistableMobileQueryKey(query.queryKey) });
  states.get(queryClient)?.verified.clear();
  return true;
}
