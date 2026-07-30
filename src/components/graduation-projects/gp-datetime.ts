/**
 * Shared graduation-projects date/time formatting. Arabic (Egypt) locale,
 * safe against invalid ISO strings (returns the raw value instead of throwing).
 */
export function formatGpDateTimeAr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-EG");
}

/** Human-readable file size (Arabic units). */
export function formatGpFileSizeAr(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} ك.ب`;
  return `${bytes} بايت`;
}
