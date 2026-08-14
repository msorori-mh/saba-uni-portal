import { useEffect, useState } from "react";

/**
 * Adaptive live polling for academic-council session data.
 *
 * - Live session (meeting `in_session`): 2s
 * - Council-level live indicators: 5s
 * - No polling while the tab/page is hidden.
 */
export const LIVE_SESSION_INTERVAL_MS = 2000;
export const COUNCIL_LIVE_INDICATORS_INTERVAL_MS = 5000;

/** True while the document is visible (SSR-safe: defaults to true). */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const sync = () => setVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return visible;
}

/**
 * Returns the interval to hand to React Query's `refetchInterval`,
 * or `false` when polling must be off (inactive or page hidden).
 */
export function useLivePollInterval(active: boolean, intervalMs: number): number | false {
  const visible = usePageVisible();
  return active && visible ? intervalMs : false;
}

/** Convenience: query options for a live-polled query. */
export function liveQueryOptions(interval: number | false) {
  return {
    refetchInterval: interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  } as const;
}

export const AGENDA_SESSION_STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار المناقشة",
  in_discussion: "قيد المناقشة",
  voting_open: "التصويت مفتوح",
  voting_closed: "انتهى التصويت",
  resolved: "تم البت",
};

export function agendaSessionStatusLabel(status: string | null | undefined): string {
  if (!status) return "بانتظار المناقشة";
  return AGENDA_SESSION_STATUS_LABELS[status] ?? status;
}

/** Semantic visual treatment per agenda item state. */
export function agendaSessionStatusTone(
  status: string | null | undefined,
): "active" | "success" | "neutral" {
  if (status === "voting_open" || status === "in_discussion") return "active";
  if (status === "resolved") return "success";
  return "neutral";
}
