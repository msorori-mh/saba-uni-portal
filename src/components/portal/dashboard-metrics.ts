/**
 * Truthfulness helpers for dashboard metrics: an unavailable value renders as
 * «—» instead of a fabricated zero.
 */

/** Safe metric value for dashboards: null renders as «—» instead of a lying zero. */
export function dashboardMetric(
  value: number | null | undefined,
  query: { isPending: boolean; isError: boolean },
): number | null {
  if (query.isPending || query.isError || value === null || value === undefined) return null;
  return value;
}

/** Renders a dashboard metric or «—» when the value is unavailable. */
export function formatDashboardMetric(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("ar-EG");
}
