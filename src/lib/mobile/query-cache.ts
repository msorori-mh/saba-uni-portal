/**
 * How long an unmounted mobile student query stays in memory.
 *
 * The app-wide QueryClient default is 5 minutes (src/router.tsx) and is shared
 * with the staff/admin portals, so it is not changed. Mobile screens opt in
 * per query: going back to a screen visited in the last 30 minutes paints the
 * cached data immediately. Freshness is unchanged — `staleTime` still decides
 * when a background refetch happens, and sign-out / account switch still
 * clears the whole cache.
 */
export const MOBILE_QUERY_GC_TIME_MS = 30 * 60_000;
