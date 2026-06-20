/**
 * PERFORMANCE-DIAGNOSIS-02 — temporary diagnostic probe.
 *
 * Mount this hook at the top of a page route to log to the browser console:
 *  - route name
 *  - total React Query fetches observed while the page was mounted
 *  - slowest single fetch (ms)
 *  - any fetch over 800 ms (flagged inline)
 *  - time-to-first-content (first successful query)
 *  - total time on page until unmount (or 10s timeout snapshot)
 *
 * Logs only when `import.meta.env.DEV` is true. Safe to leave in until the
 * diagnosis phase ends; remove with `rg -l usePagePerf src/routes`.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

type FetchRecord = { key: string; duration: number; startedAt: number };

export function usePagePerf(routeName: string) {
  const qc = useQueryClient();
  const startedRef = useRef<number>(0);
  const firstContentRef = useRef<number | null>(null);
  const fetchesRef = useRef<FetchRecord[]>([]);
  const startTimesRef = useRef<Map<string, number>>(new Map());
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    startedRef.current = performance.now();
    // eslint-disable-next-line no-console
    console.log(`[perf] ▶ enter ${routeName} @ ${new Date().toISOString()}`);

    const cache = qc.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      const q = event.query;
      const key = JSON.stringify(q.queryKey);
      if (event.type === "updated") {
        const action = (event as { action?: { type?: string } }).action;
        if (action?.type === "fetch") {
          startTimesRef.current.set(key, performance.now());
        } else if (action?.type === "success" || action?.type === "error") {
          const start = startTimesRef.current.get(key);
          if (start !== undefined) {
            const duration = performance.now() - start;
            startTimesRef.current.delete(key);
            fetchesRef.current.push({ key, duration, startedAt: start });
            if (firstContentRef.current === null && action.type === "success") {
              firstContentRef.current = performance.now();
            }
            if (duration > 800) {
              // eslint-disable-next-line no-console
              console.warn(
                `[perf] ⚠ slow query in ${routeName} — ${duration.toFixed(0)}ms — ${key}`,
              );
            }
          }
        }
      }
    });

    const snapshot = (label: string) => {
      if (reportedRef.current) return;
      const total = performance.now() - startedRef.current;
      const ttfc =
        firstContentRef.current !== null
          ? firstContentRef.current - startedRef.current
          : null;
      const fetches = fetchesRef.current;
      const sorted = [...fetches].sort((a, b) => b.duration - a.duration);
      const slowest = sorted[0];
      const uniqueKeys = new Set(fetches.map((f) => f.key)).size;
      const repeats = fetches.length - uniqueKeys;
      // eslint-disable-next-line no-console
      console.log(
        `[perf] ${label} ${routeName} — total=${total.toFixed(0)}ms ttfc=${ttfc?.toFixed(0) ?? "n/a"}ms ` +
          `queries=${fetches.length} unique=${uniqueKeys} repeated=${repeats} ` +
          `slowest=${slowest ? `${slowest.duration.toFixed(0)}ms ${slowest.key}` : "n/a"}`,
      );
      if (sorted.length > 0) {
        // eslint-disable-next-line no-console
        console.table(
          sorted.slice(0, 8).map((f) => ({
            duration_ms: Math.round(f.duration),
            key: f.key,
          })),
        );
      }
    };

    const timeoutId = window.setTimeout(() => snapshot("⏱ 10s snapshot"), 10_000);

    return () => {
      window.clearTimeout(timeoutId);
      snapshot("◀ leave");
      reportedRef.current = true;
      unsubscribe();
    };
  }, [qc, routeName]);
}
