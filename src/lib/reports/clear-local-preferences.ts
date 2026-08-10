/**
 * Clears local reports preferences that must not survive logout on a
 * shared browser. Favorites are report codes only (not PII) but still
 * session-isolation sensitive on shared kiosks.
 */
export const REPORTS_FAVORITES_STORAGE_KEY = "portal.reports.favorites.v1";

export function clearReportsLocalPreferences(
  storage: Pick<Storage, "removeItem"> | null | undefined =
    typeof localStorage !== "undefined" ? localStorage : null,
): void {
  try {
    storage?.removeItem(REPORTS_FAVORITES_STORAGE_KEY);
  } catch {
    // private mode / blocked storage — ignore
  }
}
