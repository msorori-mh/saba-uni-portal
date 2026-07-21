/**
 * Catalog invariants — structural validation for the canonical reports
 * catalog. Pure functions returning human-readable violation strings; an empty
 * result means the catalog is valid.
 */

import {
  REPORT_BENEFICIARIES,
  REPORT_OUTPUT_TYPES,
  REPORT_SENSITIVITIES,
  REPORT_STATUSES,
  type ReportEntry,
} from "./types";

const isNonEmpty = (value: string | null | undefined): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Validate a single entry; returns a list of violations (empty = valid). */
export function validateReportEntry(entry: ReportEntry): string[] {
  const violations: string[] = [];
  const code = isNonEmpty(entry.report_code) ? entry.report_code : "<missing-code>";

  if (!isNonEmpty(entry.report_code)) {
    violations.push("entry has an empty report_code");
  }
  if (!isNonEmpty(entry.name_ar)) {
    violations.push(`${code}: name_ar must be non-empty`);
  }
  if (!isNonEmpty(entry.description)) {
    violations.push(`${code}: description must be non-empty`);
  }

  // Every report must declare at least one beneficiary.
  if (entry.beneficiaries.length === 0) {
    violations.push(`${code}: a report must have at least one beneficiary`);
  }
  for (const beneficiary of entry.beneficiaries) {
    if (!(REPORT_BENEFICIARIES as readonly string[]).includes(beneficiary)) {
      violations.push(`${code}: unknown beneficiary "${beneficiary}"`);
    }
  }

  // Every report must declare a source or an explicit dependency.
  if (!isNonEmpty(entry.source) && entry.dependencies.length === 0) {
    violations.push(`${code}: a report must declare a source or a dependency`);
  }

  if (!isNonEmpty(entry.data_scope)) {
    violations.push(`${code}: data_scope must be non-empty`);
  }

  if (!(REPORT_SENSITIVITIES as readonly string[]).includes(entry.sensitivity)) {
    violations.push(`${code}: invalid sensitivity "${entry.sensitivity}"`);
  }
  for (const output of entry.output_types) {
    if (!(REPORT_OUTPUT_TYPES as readonly string[]).includes(output)) {
      violations.push(`${code}: invalid output type "${output}"`);
    }
  }

  if (!(REPORT_STATUSES as readonly string[]).includes(entry.status)) {
    violations.push(`${code}: invalid status "${entry.status}"`);
  }

  // LIVE requires proof of every pillar: route + permission + source + tests.
  if (entry.status === "LIVE") {
    if (entry.route === null) {
      violations.push(`${code}: LIVE requires a non-null route`);
    }
    if (entry.required_role.length === 0) {
      violations.push(`${code}: LIVE requires at least one required_role`);
    }
    if (!isNonEmpty(entry.source)) {
      violations.push(`${code}: LIVE requires a non-empty source`);
    }
    if (entry.tests.length === 0) {
      violations.push(`${code}: LIVE requires at least one automated test`);
    }
    if (entry.evidence.length === 0) {
      violations.push(`${code}: LIVE requires file-path evidence`);
    }
  }

  // SOURCE_READY must not claim a UI surface.
  if (entry.status === "SOURCE_READY" && entry.route !== null) {
    violations.push(`${code}: SOURCE_READY requires route = null (no UI claim)`);
  }

  // BLOCKED requires a textual blocker.
  if (entry.status === "BLOCKED" && !isNonEmpty(entry.blocker)) {
    violations.push(`${code}: BLOCKED requires a non-empty blocker`);
  }

  return violations;
}

/** Validate the whole catalog; returns violations (empty = valid). */
export function validateCatalog(entries: readonly ReportEntry[]): string[] {
  const violations: string[] = [];

  // No duplicated report_code.
  const seen = new Map<string, number>();
  for (const entry of entries) {
    seen.set(entry.report_code, (seen.get(entry.report_code) ?? 0) + 1);
  }
  for (const [code, count] of seen) {
    if (count > 1) {
      violations.push(`duplicated report_code "${code}" (${count} occurrences)`);
    }
  }

  for (const entry of entries) {
    violations.push(...validateReportEntry(entry));
  }
  return violations;
}

/** Convenience: true when the catalog has no violations. */
export function isCatalogValid(entries: readonly ReportEntry[]): boolean {
  return validateCatalog(entries).length === 0;
}

/** Throws an Error listing every violation when the catalog is invalid. */
export function assertCatalogValid(entries: readonly ReportEntry[]): void {
  const violations = validateCatalog(entries);
  if (violations.length > 0) {
    throw new Error(
      `Invalid reports catalog (${violations.length} violation(s)):\n- ${violations.join("\n- ")}`,
    );
  }
}
