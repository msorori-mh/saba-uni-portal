/**
 * Visibility + indexing helpers for the canonical reports catalog.
 *
 * Fail-closed contract: a viewer whose role list is empty, or whose roles do
 * not exactly match at least one `required_role` token of the entry, does NOT
 * see the report. Authorization tokens that are pending/undecided (e.g.
 * `pending:*`, Arabic placeholders) match no real role by construction.
 *
 * HARDENING-03: optional CatalogViewerFacts / bindings apply the full
 * ActorScope contract (identity + org bindings), not only five hub codes.
 */

import type {
  ReportBeneficiary,
  ReportEntry,
  ReportStatus,
} from "./types";
import type { ExplicitOrgBindings } from "../scope/org-identity";
import {
  actorSatisfiesReportScope,
  emptyCatalogViewer,
  type CatalogViewerFacts,
} from "./viewer-scope";

/**
 * Fail-closed visibility check.
 * - `viewerRoles` empty/undefined ⇒ false.
 * - unknown roles never match ⇒ false.
 */
export function canSeeReport(
  entry: ReportEntry,
  viewerRoles: readonly string[] | null | undefined,
): boolean {
  if (!viewerRoles || viewerRoles.length === 0) {
    return false;
  }
  const roles = new Set(viewerRoles);
  return entry.required_role.some((required) => roles.has(required));
}

function factsFromBindings(
  viewerRoles: readonly string[] | null | undefined,
  bindings: ExplicitOrgBindings | null | undefined,
): CatalogViewerFacts {
  return {
    roles: viewerRoles ?? [],
    bindings: bindings ?? emptyCatalogViewer().bindings,
    studentProfileId: null,
    facultyProfileId: null,
    departmentId: null,
    denied: false,
    denyReasonAr: null,
  };
}

/**
 * Role match + full ActorScope binding/identity gate.
 * When `bindings` is omitted, only role matching applies (pure unit tests).
 * Server / ReportsCenter MUST pass bindings or CatalogViewerFacts.
 */
export function canSeeReportWithBindings(
  entry: ReportEntry,
  viewerRoles: readonly string[] | null | undefined,
  bindings: ExplicitOrgBindings | null | undefined,
): boolean {
  if (!canSeeReport(entry, viewerRoles)) return false;
  if (!bindings) return true;
  return actorSatisfiesReportScope(entry, factsFromBindings(viewerRoles, bindings));
}

/**
 * Full ActorScope-aware visibility (preferred for hubs and server catalog).
 */
export function canSeeReportForViewer(
  entry: ReportEntry,
  viewer: CatalogViewerFacts | null | undefined,
): boolean {
  if (!viewer || !canSeeReport(entry, viewer.roles)) return false;
  return actorSatisfiesReportScope(entry, viewer);
}

/** Entries visible to a viewer with the given roles (fail-closed). */
export function visibleReports(
  entries: readonly ReportEntry[],
  viewerRoles: readonly string[] | null | undefined,
): ReportEntry[] {
  return entries.filter((entry) => canSeeReport(entry, viewerRoles));
}

/** Role + binding aware visibility (server catalog). */
export function visibleReportsWithBindings(
  entries: readonly ReportEntry[],
  viewerRoles: readonly string[] | null | undefined,
  bindings: ExplicitOrgBindings | null | undefined,
): ReportEntry[] {
  return entries.filter((entry) =>
    canSeeReportWithBindings(entry, viewerRoles, bindings),
  );
}

/** Full viewer-facts visibility (identity + bindings + denied-safe gates). */
export function visibleReportsForViewer(
  entries: readonly ReportEntry[],
  viewer: CatalogViewerFacts | null | undefined,
): ReportEntry[] {
  return entries.filter((entry) => canSeeReportForViewer(entry, viewer));
}

/** Group entries by beneficiary (an entry may appear under several). */
export function groupByBeneficiary(
  entries: readonly ReportEntry[],
): Map<ReportBeneficiary, ReportEntry[]> {
  const groups = new Map<ReportBeneficiary, ReportEntry[]>();
  for (const entry of entries) {
    for (const beneficiary of entry.beneficiaries) {
      const bucket = groups.get(beneficiary);
      if (bucket) {
        bucket.push(entry);
      } else {
        groups.set(beneficiary, [entry]);
      }
    }
  }
  return groups;
}

/** Group entries by lifecycle status. */
export function groupByStatus(
  entries: readonly ReportEntry[],
): Map<ReportStatus, ReportEntry[]> {
  const groups = new Map<ReportStatus, ReportEntry[]>();
  for (const entry of entries) {
    const bucket = groups.get(entry.status);
    if (bucket) {
      bucket.push(entry);
    } else {
      groups.set(entry.status, [entry]);
    }
  }
  return groups;
}

export interface ReportFilter {
  readonly status?: ReportStatus;
  readonly beneficiary?: ReportBeneficiary;
  readonly sensitivity?: ReportEntry["sensitivity"];
}

/** Filter entries by status / beneficiary / sensitivity (AND semantics). */
export function filterReports(
  entries: readonly ReportEntry[],
  filter: ReportFilter,
): ReportEntry[] {
  return entries.filter((entry) => {
    if (filter.status !== undefined && entry.status !== filter.status) {
      return false;
    }
    if (
      filter.beneficiary !== undefined &&
      !entry.beneficiaries.includes(filter.beneficiary)
    ) {
      return false;
    }
    if (
      filter.sensitivity !== undefined &&
      entry.sensitivity !== filter.sensitivity
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Case-insensitive substring search over code, Arabic name, and description.
 * Empty/blank query returns all entries.
 */
export function searchReports(
  entries: readonly ReportEntry[],
  query: string,
): ReportEntry[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [...entries];
  }
  return entries.filter((entry) =>
    [entry.report_code, entry.name_ar, entry.description].some((field) =>
      field.toLowerCase().includes(normalized),
    ),
  );
}

/** Lookup a single entry by its unique code; undefined when absent. */
export function findByCode(
  entries: readonly ReportEntry[],
  reportCode: string,
): ReportEntry | undefined {
  return entries.find((entry) => entry.report_code === reportCode);
}

/** Count entries per status (all six statuses always present). */
export function countByStatus(
  entries: readonly ReportEntry[],
): Record<ReportStatus, number> {
  const counts: Record<ReportStatus, number> = {
    LIVE: 0,
    DATA_DEPENDENT: 0,
    SOURCE_READY: 0,
    UNDER_DEVELOPMENT: 0,
    NOT_ACTIVATED: 0,
    BLOCKED: 0,
  };
  for (const entry of entries) {
    counts[entry.status] += 1;
  }
  return counts;
}

/**
 * Openable surface: LIVE or DATA_DEPENDENT with a real route.
 * UI may link only when this returns true — never for BLOCKED/NOT_ACTIVATED.
 */
export function isReportOpenable(entry: ReportEntry): boolean {
  return (
    (entry.status === "LIVE" || entry.status === "DATA_DEPENDENT") &&
    entry.route !== null
  );
}

/**
 * Non-openable "قيد التجهيز" cards (SOURCE_READY / UNDER_DEVELOPMENT).
 * Never pretend data exists.
 */
export function isReportInPreparation(entry: ReportEntry): boolean {
  return (
    entry.status === "SOURCE_READY" || entry.status === "UNDER_DEVELOPMENT"
  );
}

/** Hide BLOCKED / NOT_ACTIVATED from end-user catalog listings by default. */
export function isHiddenFromEndUserCatalog(entry: ReportEntry): boolean {
  return entry.status === "BLOCKED" || entry.status === "NOT_ACTIVATED";
}

/**
 * End-user catalog projection: role-visible, excludes blocked/not-activated.
 * Preparation entries remain visible but are not openable.
 *
 * Prefer `viewer` (CatalogViewerFacts / ActorScope) so cards never advertise
 * reports the server would DENY for missing identity or org binding.
 * Legacy `bindings`-only form remains for older call sites.
 */
export function endUserCatalogEntries(
  entries: readonly ReportEntry[],
  viewerRoles: readonly string[] | null | undefined,
  bindingsOrViewer?: ExplicitOrgBindings | CatalogViewerFacts | null,
): ReportEntry[] {
  let visible: ReportEntry[];
  if (
    bindingsOrViewer &&
    typeof bindingsOrViewer === "object" &&
    "roles" in bindingsOrViewer &&
    "studentProfileId" in bindingsOrViewer
  ) {
    visible = visibleReportsForViewer(
      entries,
      bindingsOrViewer as CatalogViewerFacts,
    );
  } else if (bindingsOrViewer) {
    visible = visibleReportsWithBindings(
      entries,
      viewerRoles,
      bindingsOrViewer as ExplicitOrgBindings,
    );
  } else {
    visible = visibleReports(entries, viewerRoles);
  }
  return visible.filter((entry) => !isHiddenFromEndUserCatalog(entry));
}

/** Filter visible openable reports only (for hubs that list actionable links). */
export function openableReports(
  entries: readonly ReportEntry[],
  viewerRoles: readonly string[] | null | undefined,
  bindingsOrViewer?: ExplicitOrgBindings | CatalogViewerFacts | null,
): ReportEntry[] {
  return endUserCatalogEntries(entries, viewerRoles, bindingsOrViewer).filter(
    isReportOpenable,
  );
}
