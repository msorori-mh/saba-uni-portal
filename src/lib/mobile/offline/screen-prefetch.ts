/**
 * Background download of an offline-capable screen's data.
 *
 * Each of those routes declares a `loader` that calls this with the SAME query
 * (key + fetcher) its component uses. The mobile layout already preloads these
 * routes shortly after launch while the offline mode is active, so their data
 * is fetched — and then saved by the persistence layer — without the student
 * having to open every screen by hand.
 *
 * Inert unless the offline mode is active on this device and the server is
 * reachable; never on the server; never blocks or fails a navigation.
 */

import type { QueryClient } from "@tanstack/react-query";
import { MOBILE_QUERY_GC_TIME_MS } from "@/lib/mobile/query-cache";
import { isMobileOfflineActive } from "./config";
import { isMobileOnline } from "./connectivity";

/**
 * Same freshness window and in-memory lifetime the screens themselves use:
 * fresh data is not refetched, and the result stays in memory like any other
 * mobile query.
 */
export const MOBILE_OFFLINE_PREFETCH_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: MOBILE_QUERY_GC_TIME_MS,
} as const;

export function prefetchMobileOfflineScreen(
  queryClient: QueryClient,
  run: (queryClient: QueryClient) => Promise<unknown>,
): void {
  if (typeof window === "undefined") return;
  if (!isMobileOfflineActive() || !isMobileOnline()) return;
  try {
    void run(queryClient).catch(() => undefined);
  } catch {
    /* a prefetch must never break the navigation that triggered it */
  }
}
