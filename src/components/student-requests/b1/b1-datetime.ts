/**
 * Shared B1 UI date/time formatting. Arabic (Egypt) locale, safe against
 * invalid ISO strings (returns the raw value instead of throwing).
 */
export function formatB1DateTimeAr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("ar-EG");
}
