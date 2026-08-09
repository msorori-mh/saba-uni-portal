/**
 * Canonical portal reports catalog — public surface.
 * Pure TypeScript module: no server imports, no React.
 */

export {
  REPORT_STATUSES,
  REPORT_BENEFICIARIES,
  REPORT_SENSITIVITIES,
  REPORT_OUTPUT_TYPES,
  type ReportStatus,
  type ReportBeneficiary,
  type ReportSensitivity,
  type ReportOutputType,
  type ReportEntry,
} from "./types";
export { REPORT_CATALOG_ENTRIES } from "./entries";
export {
  validateReportEntry,
  validateCatalog,
  isCatalogValid,
  assertCatalogValid,
} from "./invariants";
export {
  canSeeReport,
  visibleReports,
  groupByBeneficiary,
  groupByStatus,
  filterReports,
  searchReports,
  findByCode,
  countByStatus,
  isReportOpenable,
  isReportInPreparation,
  isHiddenFromEndUserCatalog,
  endUserCatalogEntries,
  openableReports,
  type ReportFilter,
} from "./visibility";
