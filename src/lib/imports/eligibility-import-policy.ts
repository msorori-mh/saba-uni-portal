import type { ImportType } from "./types";

/** Preview for student_eligibility must not emit client lifecycle audit RPC writes. */
export function shouldSkipEligibilityClientLifecycleAudit(type: ImportType): boolean {
  return type === "student_eligibility";
}

/** Dry-run path for student_eligibility is fully read-only (no client lifecycle audit). */
export function isEligibilityReadOnlyDryRun(type: ImportType, dryRun: boolean): boolean {
  return type === "student_eligibility" && dryRun;
}

/** Server finalize (import_logs + log_audit) must not run for eligibility dry-run. */
export function shouldSkipEligibilityFinalizeServer(type: ImportType, dryRun: boolean): boolean {
  return isEligibilityReadOnlyDryRun(type, dryRun);
}
