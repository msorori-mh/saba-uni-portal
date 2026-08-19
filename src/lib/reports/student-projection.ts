/**
 * Student-safe report projection (Phase H).
 *
 * The generic multi-beneficiary catalog card leaks internal metadata
 * (report_code, sensitivity, data_scope, beneficiaries, required roles,
 * internal route strings, source/dependencies/evidence). The student surface
 * must never receive any of that: the server projects a concise, self-only
 * list of openable student destinations and nothing else.
 *
 * Pure TypeScript: no server imports, no React, no I/O.
 */

import type { ReportEntry } from "./catalog/types";
import type { CatalogViewerFacts } from "./catalog/viewer-scope";
import { visibleReportsForViewer } from "./catalog/visibility";

/** The ONLY shape a student client is allowed to receive. */
export type StudentReportItem = {
  /** Opaque, non-reversible id — never the catalog report_code. */
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  /** Student-surface route from the allowlist below — never an internal route. */
  readonly to: string;
};

export type StudentReportSurface = "web" | "mobile";

type AllowlistItem = {
  readonly title: string;
  readonly summary: string;
  readonly webTo: string;
  readonly mobileTo: string | null;
  /** Requires the canonical current fourth-level gate (graduation project). */
  readonly requiresFourthLevel: boolean;
};

/**
 * Curated student destinations. Keys are internal catalog codes (server-side
 * only); nothing from the key or from the catalog entry is ever emitted.
 */
const STUDENT_SAFE_ALLOWLIST: Readonly<Record<string, AllowlistItem>> = {
  "STU-SELF-SERVICE-VIEWS": {
    title: "بياناتي الأكاديمية",
    summary: "بياناتك الأساسية ووضعك الأكاديمي ومؤشرات مقرراتك وطلباتك ووثائقك.",
    webTo: "/student",
    mobileTo: "/mobile/student/profile",
    requiresFourthLevel: false,
  },
};

/** Deterministic, non-reversible short id (djb2) — hides the catalog code. */
function opaqueId(code: string): string {
  let h = 5381;
  for (let i = 0; i < code.length; i += 1) {
    h = ((h << 5) + h + code.charCodeAt(i)) >>> 0;
  }
  return `r-${h.toString(36)}`;
}

export type StudentProjectionOptions = {
  readonly surface?: StudentReportSurface;
  /** Canonical L4 eligibility; L1/L2/L3 get zero graduation-project surface. */
  readonly fourthLevelEligible?: boolean;
};

/**
 * Projects the catalog into the student-safe list.
 * Only entries that are (a) visible to this viewer, (b) student-beneficiary,
 * (c) LIVE with a real route, and (d) present in the allowlist survive.
 */
export function projectStudentSelfReports(
  entries: readonly ReportEntry[],
  viewer: CatalogViewerFacts | null | undefined,
  options: StudentProjectionOptions = {},
): StudentReportItem[] {
  const surface = options.surface ?? "web";
  const gpOk = options.fourthLevelEligible === true;

  // Self-only: without a resolved student identity nothing is projected.
  if (!viewer?.studentProfileId) return [];

  const visible = visibleReportsForViewer(entries, viewer);
  const items: StudentReportItem[] = [];
  const seen = new Set<string>();

  for (const entry of visible) {
    if (entry.status !== "LIVE") continue;
    if (!entry.beneficiaries.includes("student")) continue;
    const allow = STUDENT_SAFE_ALLOWLIST[entry.report_code];
    if (!allow) continue;
    if (allow.requiresFourthLevel && !gpOk) continue;
    const to = surface === "mobile" ? allow.mobileTo : allow.webTo;
    if (!to) continue;
    const id = opaqueId(entry.report_code);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, title: allow.title, summary: allow.summary, to });
  }

  return items;
}

/** Field names that must never appear in a student report payload. */
export const STUDENT_FORBIDDEN_REPORT_FIELDS = [
  "report_code",
  "sensitivity",
  "data_scope",
  "beneficiaries",
  "required_role",
  "source",
  "dependencies",
  "evidence",
  "tests",
  "blocker",
  "filters",
  "output_types",
  "route",
  "status",
] as const;
