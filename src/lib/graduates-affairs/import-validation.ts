import { OFFICIAL_GRADUATION_SOURCE_KINDS } from "./foundation";

/**
 * Fail-closed batch validation for official-decision import rows
 * (source_kind `university_system_of_record_import` in the foundation
 * contract). This is a source contract only — it writes nothing. Nothing is
 * imported unless the entire batch validates; any row error rejects the
 * whole batch, mirroring the SQL import gate GRADUATES-AFFAIRS-AUTHORIZATION-04.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_PAYLOAD_SHA256 = /^[0-9a-f]{64}$/;

export interface OfficialDecisionImportRow {
  studentProfileId: string;
  sourceKind: string;
  sourceReference: string;
  decisionState: string;
  approvedAt: string | null;
  approvedBy: string | null;
  effectiveGraduationDate: string | null;
  programId: string | null;
  departmentId: string | null;
  academicSnapshot: Record<string, unknown> | null;
  sourcePayloadSha256: string;
}

export interface ImportBatchError {
  index: number;
  codes: readonly string[];
}

export type ImportBatchValidation = { ok: true } | { ok: false; errors: readonly ImportBatchError[] };

/**
 * Validates one import row and returns every applicable error code (rows are
 * never short-circuited: the full code list is the contract for the import
 * operator). Only `approved` decisions may be imported.
 */
export function validateOfficialDecisionImportRow(
  row: OfficialDecisionImportRow,
  index: number,
): readonly string[] {
  void index;
  const codes: string[] = [];
  if (!UUID.test(row.studentProfileId)) {
    codes.push("invalid_student_profile_id");
  }
  if (!(OFFICIAL_GRADUATION_SOURCE_KINDS as readonly string[]).includes(row.sourceKind)) {
    codes.push("unapproved_graduation_source");
  }
  if (!row.sourceReference.trim()) {
    codes.push("missing_source_reference");
  }
  if (row.decisionState !== "approved") {
    codes.push("official_decision_not_approved");
  }
  if (
    !row.approvedAt ||
    !row.approvedBy ||
    !Number.isFinite(Date.parse(row.approvedAt))
  ) {
    codes.push("missing_official_approval_provenance");
  }
  if (
    !row.effectiveGraduationDate ||
    !Number.isFinite(Date.parse(row.effectiveGraduationDate))
  ) {
    codes.push("missing_effective_graduation_date");
  }
  if (!row.programId || !row.departmentId) {
    codes.push("missing_academic_snapshot_scope");
  }
  if (!row.academicSnapshot || Object.keys(row.academicSnapshot).length === 0) {
    codes.push("missing_immutable_academic_snapshot");
  }
  if (!SOURCE_PAYLOAD_SHA256.test(row.sourcePayloadSha256)) {
    codes.push("invalid_source_payload_sha256");
  }
  return codes;
}

/**
 * Validates the whole batch fail-closed: any row error makes the batch fail,
 * duplicate (sourceKind, sourceReference) pairs are flagged on the later
 * index(es), and an empty batch is rejected with a single batch-level error.
 */
export function validateOfficialDecisionImportBatch(
  rows: readonly OfficialDecisionImportRow[],
): ImportBatchValidation {
  if (rows.length === 0) {
    return { ok: false, errors: [{ index: -1, codes: ["empty_import_batch"] }] };
  }
  const rowCodes = rows.map((row, index) => validateOfficialDecisionImportRow(row, index));
  const firstSeenAt = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = `${row.sourceKind}\u0000${row.sourceReference}`;
    if (firstSeenAt.has(key)) {
      rowCodes[index].push("duplicate_source_reference");
    } else {
      firstSeenAt.set(key, index);
    }
  });
  const errors = rowCodes
    .map((codes, index) => ({ index, codes }))
    .filter((entry) => entry.codes.length > 0);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
