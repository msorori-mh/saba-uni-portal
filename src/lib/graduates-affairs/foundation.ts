export const OFFICIAL_GRADUATION_SOURCE_KINDS = [
  "registrar_approved_decision",
  "university_system_of_record_import",
] as const;

export type OfficialGraduationSourceKind = (typeof OFFICIAL_GRADUATION_SOURCE_KINDS)[number];

export type GraduationDecisionState = "pending" | "approved" | "corrected" | "revoked";

export interface OfficialGraduationDecision {
  decisionId: string;
  studentProfileId: string;
  sourceKind: OfficialGraduationSourceKind;
  sourceReference: string;
  state: GraduationDecisionState;
  approvedAt: string | null;
  approvedBy: string | null;
  effectiveGraduationDate: string | null;
  programId: string | null;
  departmentId: string | null;
  academicSnapshot: Readonly<Record<string, unknown>> | null;
}

export type GraduateRecordReadiness =
  | { ok: true; decisionId: string }
  | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The only source-level gate for creating a graduate record. Profile status,
 * candidate lists, completion percentages and issued documents are
 * intentionally absent from this contract.
 */
export function evaluateGraduateRecordReadiness(
  decision: OfficialGraduationDecision,
): GraduateRecordReadiness {
  if (!UUID.test(decision.decisionId)) {
    return { ok: false, reason: "invalid_official_decision_id" };
  }
  if (!UUID.test(decision.studentProfileId)) {
    return { ok: false, reason: "invalid_student_profile_id" };
  }
  if (!OFFICIAL_GRADUATION_SOURCE_KINDS.includes(decision.sourceKind)) {
    return { ok: false, reason: "unapproved_graduation_source" };
  }
  if (decision.state !== "approved") {
    return { ok: false, reason: "official_decision_not_approved" };
  }
  if (!decision.sourceReference.trim()) {
    return { ok: false, reason: "missing_source_reference" };
  }
  if (!decision.approvedAt || !decision.approvedBy) {
    return { ok: false, reason: "missing_official_approval_provenance" };
  }
  if (!decision.effectiveGraduationDate) {
    return { ok: false, reason: "missing_effective_graduation_date" };
  }
  if (!decision.programId || !decision.departmentId) {
    return { ok: false, reason: "missing_academic_snapshot_scope" };
  }
  if (!decision.academicSnapshot || Object.keys(decision.academicSnapshot).length === 0) {
    return { ok: false, reason: "missing_immutable_academic_snapshot" };
  }
  return { ok: true, decisionId: decision.decisionId };
}

export type ConsentState = "granted" | "withdrawn";

export interface GraduateConsent {
  purposeCode: string;
  noticeVersion: string;
  state: ConsentState;
  grantedAt: string;
  withdrawnAt: string | null;
}

export function hasActivePurposeConsent(
  consents: readonly GraduateConsent[],
  purposeCode: string,
  noticeVersion: string,
): boolean {
  const matching = consents.filter(
    (consent) => consent.purposeCode === purposeCode && consent.noticeVersion === noticeVersion,
  );
  if (
    matching.some(
      (consent) =>
        !Number.isFinite(Date.parse(consent.grantedAt)) ||
        (consent.withdrawnAt !== null && !Number.isFinite(Date.parse(consent.withdrawnAt))),
    )
  ) {
    return false;
  }
  const latest = matching
    .toSorted((left, right) => {
      const leftTime = Date.parse(left.withdrawnAt ?? left.grantedAt);
      const rightTime = Date.parse(right.withdrawnAt ?? right.grantedAt);
      return leftTime - rightTime;
    })
    .at(-1);
  return latest?.state === "granted" && latest.withdrawnAt === null;
}

export type EmploymentStatus =
  | "employed"
  | "self_employed"
  | "seeking_work"
  | "continuing_education"
  | "not_seeking"
  | "not_disclosed";

export type SpecializationRelationship =
  | "directly_related"
  | "partially_related"
  | "not_related"
  | "not_assessed";

export interface EmploymentReportRow {
  status: EmploymentStatus;
  specializationRelationship: SpecializationRelationship;
  verified: boolean;
}

export interface PrivacySafeMetric {
  total: number | null;
  suppressed: boolean;
}

export function privacySafeCount(rows: readonly unknown[], minimumCellSize = 5): PrivacySafeMetric {
  if (!Number.isInteger(minimumCellSize) || minimumCellSize < 3) {
    throw new Error("minimum_cell_size_must_be_at_least_3");
  }
  return rows.length < minimumCellSize
    ? { total: null, suppressed: true }
    : { total: rows.length, suppressed: false };
}

export function buildEmploymentQualitySummary(
  rows: readonly EmploymentReportRow[],
  minimumCellSize = 5,
) {
  const employed = rows.filter(
    (row) => row.status === "employed" || row.status === "self_employed",
  );
  const related = employed.filter(
    (row) =>
      row.specializationRelationship === "directly_related" ||
      row.specializationRelationship === "partially_related",
  );
  const verified = rows.filter((row) => row.verified);

  return {
    population: privacySafeCount(rows, minimumCellSize),
    employed: privacySafeCount(employed, minimumCellSize),
    specializationRelated: privacySafeCount(related, minimumCellSize),
    verified: privacySafeCount(verified, minimumCellSize),
  };
}

export type OpportunityState = "draft" | "in_review" | "published" | "closed" | "archived";

const OPPORTUNITY_TRANSITIONS: Readonly<Record<OpportunityState, readonly OpportunityState[]>> = {
  draft: ["in_review", "archived"],
  in_review: ["draft", "published", "archived"],
  published: ["closed"],
  closed: ["archived"],
  archived: [],
};

export function canTransitionOpportunity(from: OpportunityState, to: OpportunityState): boolean {
  return OPPORTUNITY_TRANSITIONS[from].includes(to);
}
