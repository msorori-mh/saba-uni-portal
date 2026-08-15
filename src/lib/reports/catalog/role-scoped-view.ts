/**
 * Role-scoped report projection for the faculty / department-head portal.
 *
 * Task: PORTAL_DR_RAMZI_ROLE_SCOPED_REPORTS_GP_COUNCILS_FIX_05
 *
 * Contract (fail-closed, server-derived roles only):
 * - A report is presented ONLY when the viewer's own facets cover it
 *   (`faculty_supervisor` for self reports, `dept_head_coordinator` for
 *   department reports). Dean / academic-affairs / VP / presidency /
 *   global-admin facets never project into this view.
 * - Only `LIVE` entries are presented as active reports. Preparation /
 *   under-development entries are not advertised with an "open" affordance.
 * - Only a destination the viewer is actually allowed to open is used:
 *   `/admin/*` routes are never handed to a non-admin viewer, and
 *   parameterized routes (`$param`) are not operational destinations.
 * - University-wide (global) aggregates are excluded for this viewer.
 *
 * Pure TypeScript: no React, no I/O — directly unit testable.
 */

import type { ReportEntry } from "./types";
import { canSeeReportForViewer } from "./visibility";
import type { CatalogViewerFacts } from "./viewer-scope";

export const SELF_SECTION_TITLE_AR = "تقاريري الأكاديمية";
export const DEPARTMENT_SECTION_TITLE_PREFIX_AR = "تقارير";

/** Facets a faculty member / department head is allowed to consume. */
export const ROLE_SCOPED_ALLOWED_BENEFICIARIES = [
  "faculty_supervisor",
  "dept_head_coordinator",
] as const;

/** Facets that must never project into the faculty / dept-head view. */
export const ROLE_SCOPED_FORBIDDEN_BENEFICIARIES = [
  "dean",
  "academic_affairs",
  "vp_academic_affairs",
  "vp_student_affairs",
  "university_presidency_council",
] as const;

export type ScopedReportSectionKey = "self" | "department";

export interface ScopedReportItem {
  readonly entry: ReportEntry;
  /** Operational destination the viewer may actually open. */
  readonly route: string;
}

export interface ScopedReportSection {
  readonly key: ScopedReportSectionKey;
  readonly titleAr: string;
  readonly items: readonly ScopedReportItem[];
}

function isPrivileged(roles: readonly string[]): boolean {
  return roles.some((role) => role === "admin" || role === "system_admin");
}

function scopeTokens(entry: ReportEntry): Set<string> {
  return new Set(
    entry.data_scope
      .toLowerCase()
      .split(/[\/,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

/**
 * Pick the destination this viewer is allowed to open, or `null` when the
 * entry has no valid operational destination for them.
 */
export function resolveViewerReportRoute(
  entry: ReportEntry,
  roles: readonly string[],
): string | null {
  if (!entry.route) return null;
  const privileged = isPrivileged(roles);
  const candidates = entry.route
    .split("|")
    .map((route) => route.trim())
    .filter(Boolean)
    .filter((route) => route.startsWith("/"))
    .filter((route) => !route.includes("$"))
    .filter((route) => privileged || !route.startsWith("/admin"));
  return candidates[0] ?? null;
}

function isPresentable(
  entry: ReportEntry,
  viewer: CatalogViewerFacts,
): boolean {
  if (entry.status !== "LIVE") return false;
  if (!canSeeReportForViewer(entry, viewer)) return false;
  const beneficiaries = new Set<string>(entry.beneficiaries);
  const allowedFacet = ROLE_SCOPED_ALLOWED_BENEFICIARIES.some((facet) =>
    beneficiaries.has(facet),
  );
  if (!allowedFacet) return false;
  const tokens = scopeTokens(entry);
  // No global / university-wide aggregation for this viewer.
  if (!isPrivileged(viewer.roles) && tokens.has("university")) return false;
  return true;
}

function sectionForEntry(
  entry: ReportEntry,
  roles: readonly string[],
): ScopedReportSectionKey | null {
  const beneficiaries = new Set<string>(entry.beneficiaries);
  const tokens = scopeTokens(entry);
  const selfish =
    beneficiaries.has("faculty_supervisor") &&
    (tokens.has("self") || tokens.has("assigned") || tokens.has("course_section"));
  if (selfish) return "self";
  if (
    roles.includes("department_head") &&
    beneficiaries.has("dept_head_coordinator") &&
    tokens.has("department")
  ) {
    return "department";
  }
  if (beneficiaries.has("faculty_supervisor")) return "self";
  return null;
}

/**
 * Two clean presentation groups for a faculty member / department head.
 * Sections with no presentable report are omitted entirely.
 */
export function buildRoleScopedReportSections(
  entries: readonly ReportEntry[],
  viewer: CatalogViewerFacts,
  options: { readonly departmentNameAr?: string | null } = {},
): ScopedReportSection[] {
  const self: ScopedReportItem[] = [];
  const department: ScopedReportItem[] = [];

  for (const entry of entries) {
    if (!isPresentable(entry, viewer)) continue;
    const route = resolveViewerReportRoute(entry, viewer.roles);
    if (!route) continue;
    const section = sectionForEntry(entry, viewer.roles);
    if (section === "self") self.push({ entry, route });
    else if (section === "department") department.push({ entry, route });
  }

  const departmentTitle = options.departmentNameAr
    ? `${DEPARTMENT_SECTION_TITLE_PREFIX_AR} ${options.departmentNameAr}`
    : "تقارير القسم";

  const sections: ScopedReportSection[] = [];
  if (self.length > 0) {
    sections.push({ key: "self", titleAr: SELF_SECTION_TITLE_AR, items: self });
  }
  if (department.length > 0) {
    sections.push({ key: "department", titleAr: departmentTitle, items: department });
  }
  return sections;
}
