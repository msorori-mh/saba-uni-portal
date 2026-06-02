// Phase PERF-01: lazy-load the xlsx library on demand.
// xlsx is ~400KB minified. Keeping it out of the initial bundle and
// loading it only when the user clicks an export/import action.
let cached: Promise<typeof import("xlsx")> | null = null;

export function loadXLSX(): Promise<typeof import("xlsx")> {
  if (!cached) cached = import("xlsx");
  return cached;
}
