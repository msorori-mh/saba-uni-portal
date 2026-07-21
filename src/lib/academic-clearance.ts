// Approved comparison vocabulary (D-10, resolved): exactly seven values.
export const EQUIVALENCY_DECISIONS = [
  "equivalent",
  "partially_equivalent",
  "general_requirement",
  "supporting_requirement",
  "not_equivalent",
  "needs_review",
  "committee_decision_required",
] as const;

export type EquivalencyDecision = (typeof EQUIVALENCY_DECISIONS)[number];

// Decisions that map to a specific target-plan course (target required).
export const TARGET_MAPPED_DECISIONS: readonly EquivalencyDecision[] = [
  "equivalent",
  "partially_equivalent",
];

// Decisions that carry accepted credit hours (mirror of the SQL credit guard).
export const CREDIT_BEARING_DECISIONS: readonly EquivalencyDecision[] = [
  "equivalent",
  "partially_equivalent",
  "general_requirement",
  "supporting_requirement",
];

// Decisions that block submission until resolved.
export const UNRESOLVED_DECISIONS: readonly EquivalencyDecision[] = [
  "needs_review",
  "committee_decision_required",
];

// The seven clearance case statuses. Mirrors public.academic_clearance_status:
// six values from the foundation draft plus 'returned' from the
// ACADEMIC-CLEARANCE-COMPLETION-01 draft (both DRAFT ONLY — DO NOT APPLY).
export const CLEARANCE_STATUSES = [
  "draft",
  "department_review",
  "academic_affairs_review",
  "returned",
  "approved",
  "rejected",
  "superseded",
] as const;

export type ClearanceStatus = (typeof CLEARANCE_STATUSES)[number];

export const CLEARANCE_STATUS_LABELS: Record<ClearanceStatus, string> = {
  draft: "مسودة",
  department_review: "مراجعة القسم",
  academic_affairs_review: "مراجعة الشؤون الأكاديمية",
  returned: "معادة إلى القسم",
  approved: "معتمدة",
  rejected: "مرفوضة",
  superseded: "مستبدلة بالتصحيح",
};

// Same wording as the chair comparison table so every surface agrees.
export const EQUIVALENCY_DECISION_LABELS: Record<EquivalencyDecision, string> = {
  equivalent: "معادل",
  partially_equivalent: "معادل جزئياً",
  general_requirement: "متطلب عام",
  supporting_requirement: "متطلب مساند",
  not_equivalent: "غير معادل",
  needs_review: "يحتاج مراجعة",
  committee_decision_required: "يتطلب قرار لجنة",
};

export type ClearanceApprovalStage = "target_department" | "academic_affairs" | "correction";
export type ClearanceApprovalDecision = "approved" | "rejected" | "returned" | "superseded";

export const CLEARANCE_APPROVAL_STAGE_LABELS: Record<ClearanceApprovalStage, string> = {
  target_department: "القسم المستهدف",
  academic_affairs: "الشؤون الأكاديمية",
  correction: "تصحيح",
};

export const CLEARANCE_APPROVAL_DECISION_LABELS: Record<ClearanceApprovalDecision, string> = {
  approved: "اعتماد",
  rejected: "رفض",
  returned: "إعادة إلى القسم",
  superseded: "استبدال بالتصحيح",
};

export interface CourseSnapshot {
  id: string;
  code: string;
  name: string;
  creditHours: number;
  levelNumber?: number | null;
}

export interface EquivalencyRow {
  sourceCourseId: string;
  sourceCreditHours: number;
  targetCourseId?: string | null;
  decision: EquivalencyDecision;
  acceptedCreditHours: number;
  rationale: string;
}

export interface ClearanceSummary {
  acceptedCredits: number;
  remainingCredits: number;
  proposedLevel: number | null;
  unresolvedCount: number;
  canSubmitDepartmentDecision: boolean;
}

const unresolved = new Set<EquivalencyDecision>(UNRESOLVED_DECISIONS);

export function summarizeClearance(
  targetPlanCredits: number,
  rows: readonly EquivalencyRow[],
  targetCourses: readonly CourseSnapshot[],
): ClearanceSummary {
  if (!Number.isFinite(targetPlanCredits) || targetPlanCredits < 0) {
    throw new Error("INVALID_TARGET_PLAN_CREDITS");
  }

  const acceptedCredits = rows.reduce((total, row) => {
    const target = targetCourses.find((course) => course.id === row.targetCourseId);
    if (
      !Number.isFinite(row.acceptedCreditHours) ||
      row.acceptedCreditHours < 0 ||
      row.acceptedCreditHours > row.sourceCreditHours ||
      (target && row.acceptedCreditHours > target.creditHours)
    ) {
      throw new Error("INVALID_ACCEPTED_CREDITS");
    }
    return total + row.acceptedCreditHours;
  }, 0);
  const acceptedTargets = rows.filter((row) => row.targetCourseId).map((row) => row.targetCourseId);
  if (new Set(acceptedTargets).size !== acceptedTargets.length)
    throw new Error("DUPLICATE_TARGET_CREDIT");
  if (acceptedCredits > targetPlanCredits) throw new Error("ACCEPTED_CREDITS_EXCEED_PLAN");
  const unresolvedCount = rows.filter((row) => unresolved.has(row.decision)).length;
  const remainingCredits = Math.max(0, targetPlanCredits - acceptedCredits);

  const unfulfilledLevels = targetCourses
    .filter(
      (course) =>
        !rows.some(
          (row) =>
            row.targetCourseId === course.id && row.acceptedCreditHours >= course.creditHours,
        ),
    )
    .map((course) => course.levelNumber)
    .filter((level): level is number => typeof level === "number" && level > 0);

  return {
    acceptedCredits,
    remainingCredits,
    proposedLevel: unfulfilledLevels.length ? Math.min(...unfulfilledLevels) : null,
    unresolvedCount,
    canSubmitDepartmentDecision:
      rows.length > 0 &&
      unresolvedCount === 0 &&
      rows.every((row) => row.rationale.trim().length > 0),
  };
}

// Client-side mirror of the equivalencies CHECK constraints and the credit
// guard trigger. Standalone validator (not wired into summarizeClearance) so
// callers choose when to enforce the full row shape.
export function assertValidEquivalencyRow(row: EquivalencyRow): void {
  const targetMapped = TARGET_MAPPED_DECISIONS.includes(row.decision);
  if (targetMapped !== (row.targetCourseId != null)) {
    throw new Error("INVALID_EQUIVALENCY_TARGET_COUPLING");
  }
  if (
    (row.decision === "not_equivalent" ||
      row.decision === "needs_review" ||
      row.decision === "committee_decision_required") &&
    row.acceptedCreditHours !== 0
  ) {
    throw new Error("INVALID_EQUIVALENCY_ACCEPTED_HOURS");
  }
  if (CREDIT_BEARING_DECISIONS.includes(row.decision) && row.acceptedCreditHours <= 0) {
    throw new Error("INVALID_EQUIVALENCY_ACCEPTED_HOURS");
  }
}

export type ClearanceAction = "edit" | "submit" | "approve" | "reject" | "return" | "correct";

// Client-side mirror of the state machine the SQL RPCs enforce. Every
// transition the RPCs reject throws INVALID_CLEARANCE_TRANSITION here.
export function nextClearanceStatus(
  status: ClearanceStatus,
  action: ClearanceAction,
): ClearanceStatus {
  switch (action) {
    case "edit":
      // save_academic_clearance_equivalency moves any editable case to department_review.
      if (status === "draft" || status === "department_review" || status === "returned") {
        return "department_review";
      }
      break;
    case "submit":
      if (status === "department_review") return "academic_affairs_review";
      break;
    case "approve":
      if (status === "academic_affairs_review") return "approved";
      break;
    case "reject":
      if (status === "academic_affairs_review") return "rejected";
      break;
    case "return":
      if (status === "academic_affairs_review") return "returned";
      break;
    case "correct":
      if (status === "approved") return "superseded";
      break;
  }
  throw new Error("INVALID_CLEARANCE_TRANSITION");
}

export function canActorTransitionClearance(input: {
  status: ClearanceStatus;
  actorRole: string;
  actorDepartmentId?: string | null;
  targetDepartmentId: string;
  action: ClearanceAction;
}): boolean {
  const isTargetChair =
    input.actorRole === "department_head" && input.actorDepartmentId === input.targetDepartmentId;
  if (input.action === "edit" || input.action === "submit") {
    return (
      isTargetChair &&
      (input.status === "draft" ||
        input.status === "department_review" ||
        input.status === "returned")
    );
  }
  if (input.action === "approve" || input.action === "reject" || input.action === "return") {
    return input.actorRole === "academic_affairs" && input.status === "academic_affairs_review";
  }
  return input.actorRole === "academic_affairs" && input.status === "approved";
}

export function canFinalizeDepartmentTransfer(clearanceStatus: ClearanceStatus): boolean {
  return clearanceStatus === "approved";
}

// ---------------------------------------------------------------------------
// Snapshot builders: fail-closed client-side mirror of the SQL binding
// triggers. Original grades are never mutated: snapshots are new, immutable
// rows. The "official successful result" vocabulary (authority config) is
// never hardcoded; callers pass the approved vocabulary.
// ---------------------------------------------------------------------------

export interface ClearanceAuthorityVocabulary {
  approvedCourseResultStatus: string;
}

export interface OfficialResultSnapshotInput {
  studentGradeId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  finalGrade?: string | null;
  passed: boolean;
  resultStatus: string;
  officialResultReference?: string | null;
}

export interface SourceCourseSnapshotRow {
  studentGradeId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  finalGrade: string | null;
  passed: true;
  officialResultReference: string;
}

export function buildSourceCourseSnapshots(
  rows: readonly OfficialResultSnapshotInput[],
  vocabulary: ClearanceAuthorityVocabulary,
): SourceCourseSnapshotRow[] {
  if (!vocabulary.approvedCourseResultStatus.trim()) {
    throw new Error("CLEARANCE_AUTHORITY_VOCABULARY_REQUIRED");
  }
  const seenGrades = new Set<string>();
  const seenCourses = new Set<string>();
  return rows.map((row) => {
    if (!row.studentGradeId || !row.courseId) {
      throw new Error("CLEARANCE_SNAPSHOT_BINDING_REQUIRED");
    }
    if (!Number.isFinite(row.creditHours) || row.creditHours < 0) {
      throw new Error("INVALID_CREDIT_HOURS");
    }
    if (!row.passed) throw new Error("CLEARANCE_SNAPSHOT_NOT_PASSED");
    if (row.resultStatus !== vocabulary.approvedCourseResultStatus) {
      throw new Error("CLEARANCE_SNAPSHOT_NOT_OFFICIAL_RESULT");
    }
    const officialResultReference = row.officialResultReference?.trim() ?? "";
    if (!officialResultReference) {
      throw new Error("CLEARANCE_SNAPSHOT_OFFICIAL_REFERENCE_REQUIRED");
    }
    if (seenGrades.has(row.studentGradeId)) throw new Error("DUPLICATE_SOURCE_SNAPSHOT");
    if (seenCourses.has(row.courseId)) throw new Error("DUPLICATE_SOURCE_SNAPSHOT");
    seenGrades.add(row.studentGradeId);
    seenCourses.add(row.courseId);
    return {
      studentGradeId: row.studentGradeId,
      courseId: row.courseId,
      courseCode: row.courseCode,
      courseName: row.courseName,
      creditHours: row.creditHours,
      finalGrade: row.finalGrade ?? null,
      passed: true,
      officialResultReference,
    };
  });
}

export interface TargetPlanCourseInput {
  studyPlanCourseId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  levelId?: string | null;
  isRequired: boolean;
}

export interface TargetCourseSnapshotRow {
  studyPlanCourseId: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  creditHours: number;
  levelId: string | null;
  isRequired: boolean;
}

export function buildTargetCourseSnapshots(
  rows: readonly TargetPlanCourseInput[],
): TargetCourseSnapshotRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    if (!row.studyPlanCourseId || !row.courseId) {
      throw new Error("CLEARANCE_SNAPSHOT_BINDING_REQUIRED");
    }
    if (!Number.isFinite(row.creditHours) || row.creditHours < 0) {
      throw new Error("INVALID_CREDIT_HOURS");
    }
    if (typeof row.isRequired !== "boolean") throw new Error("INVALID_REQUIRED_FLAG");
    if (seen.has(row.studyPlanCourseId)) throw new Error("DUPLICATE_TARGET_SNAPSHOT");
    seen.add(row.studyPlanCourseId);
    return {
      studyPlanCourseId: row.studyPlanCourseId,
      courseId: row.courseId,
      courseCode: row.courseCode,
      courseName: row.courseName,
      creditHours: row.creditHours,
      levelId: row.levelId ?? null,
      isRequired: row.isRequired,
    };
  });
}

// ---------------------------------------------------------------------------
// Minutes (محضر المعادلات): client-side mirror of academic_clearance_minutes.
// ---------------------------------------------------------------------------

export interface ClearanceMinutesEntry {
  sourceCode: string;
  targetCode: string | null;
  decision: EquivalencyDecision;
  decisionLabel: string;
  acceptedHours: number;
  rationale: string;
}

export interface ClearanceMinutes {
  status: ClearanceStatus;
  statusLabel: string;
  acceptedCreditHours: number;
  remainingCreditHours: number;
  approvedAt: string | null;
  equivalencies: readonly ClearanceMinutesEntry[];
}

export function buildClearanceMinutes(input: {
  status: ClearanceStatus;
  acceptedCreditHours: number;
  remainingCreditHours: number;
  approvedAt?: string | null;
  sourceCourses: readonly CourseSnapshot[];
  targetCourses: readonly CourseSnapshot[];
  rows: readonly EquivalencyRow[];
}): ClearanceMinutes {
  const equivalencies = input.rows.map((row): ClearanceMinutesEntry => {
    const source = input.sourceCourses.find((course) => course.id === row.sourceCourseId);
    if (!source) throw new Error("CLEARANCE_MINUTES_SOURCE_MISSING");
    const target = row.targetCourseId
      ? input.targetCourses.find((course) => course.id === row.targetCourseId)
      : undefined;
    if (row.targetCourseId && !target) throw new Error("CLEARANCE_MINUTES_TARGET_MISSING");
    return {
      sourceCode: source.code,
      targetCode: target?.code ?? null,
      decision: row.decision,
      decisionLabel: EQUIVALENCY_DECISION_LABELS[row.decision],
      acceptedHours: row.acceptedCreditHours,
      rationale: row.rationale,
    };
  });
  equivalencies.sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));
  return {
    status: input.status,
    statusLabel: CLEARANCE_STATUS_LABELS[input.status],
    acceptedCreditHours: input.acceptedCreditHours,
    remainingCreditHours: input.remainingCreditHours,
    approvedAt: input.approvedAt ?? null,
    equivalencies,
  };
}

// ---------------------------------------------------------------------------
// Reporting: client-side mirrors of academic_clearance_reporting and
// academic_clearance_course_outcomes (both DRAFT ONLY — DO NOT APPLY).
// ---------------------------------------------------------------------------

export const CLEARANCE_OVERDUE_AFTER_DAYS = 14;

// Active work eligible for the overdue window (mirrors the reporting view).
export const CLEARANCE_ACTIVE_STATUSES: readonly ClearanceStatus[] = [
  "draft",
  "department_review",
  "academic_affairs_review",
  "returned",
];

export interface ClearanceReportingCaseRow {
  targetDepartmentId: string;
  status: ClearanceStatus;
  acceptedCreditHours: number;
  updatedAt: string;
}

export interface ClearanceReportingRow {
  targetDepartmentId: string;
  status: ClearanceStatus;
  statusLabel: string;
  caseCount: number;
  avgAcceptedHours: number;
  overdueCount: number;
}

export function summarizeClearanceReporting(
  cases: readonly ClearanceReportingCaseRow[],
  now: Date,
): ClearanceReportingRow[] {
  const overdueBefore = now.getTime() - CLEARANCE_OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const groups = new Map<string, { row: ClearanceReportingRow; acceptedTotal: number }>();
  for (const item of cases) {
    const key = `${item.targetDepartmentId}::${item.status}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        row: {
          targetDepartmentId: item.targetDepartmentId,
          status: item.status,
          statusLabel: CLEARANCE_STATUS_LABELS[item.status],
          caseCount: 0,
          avgAcceptedHours: 0,
          overdueCount: 0,
        },
        acceptedTotal: 0,
      };
      groups.set(key, group);
    }
    group.row.caseCount += 1;
    group.acceptedTotal += item.acceptedCreditHours;
    const updatedAt = Date.parse(item.updatedAt);
    if (Number.isNaN(updatedAt)) throw new Error("INVALID_REPORTING_TIMESTAMP");
    if (CLEARANCE_ACTIVE_STATUSES.includes(item.status) && updatedAt < overdueBefore) {
      group.row.overdueCount += 1;
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group.row,
      avgAcceptedHours: group.row.caseCount ? group.acceptedTotal / group.row.caseCount : 0,
    }))
    .sort(
      (a, b) =>
        a.targetDepartmentId.localeCompare(b.targetDepartmentId) ||
        a.status.localeCompare(b.status),
    );
}

export interface CourseOutcomeInput {
  sourceCourseId: string;
  sourceCourseCode: string;
  targetCourseId: string | null;
  targetCourseCode: string | null;
  decision: EquivalencyDecision;
}

export interface CourseOutcomeRow {
  sourceCourseId: string;
  sourceCourseCode: string;
  targetCourseId: string | null;
  targetCourseCode: string | null;
  decision: EquivalencyDecision;
  decisionLabel: string;
  decisionCount: number;
}

export function summarizeCourseOutcomes(rows: readonly CourseOutcomeInput[]): CourseOutcomeRow[] {
  const counted: ReadonlySet<EquivalencyDecision> = new Set([
    "equivalent",
    "partially_equivalent",
    "supporting_requirement",
    "not_equivalent",
  ]);
  const groups = new Map<string, CourseOutcomeRow>();
  for (const row of rows) {
    if (!counted.has(row.decision)) continue;
    const key = `${row.sourceCourseId}::${row.targetCourseId ?? ""}::${row.decision}`;
    const existing = groups.get(key);
    if (existing) {
      existing.decisionCount += 1;
    } else {
      groups.set(key, {
        sourceCourseId: row.sourceCourseId,
        sourceCourseCode: row.sourceCourseCode,
        targetCourseId: row.targetCourseId,
        targetCourseCode: row.targetCourseCode,
        decision: row.decision,
        decisionLabel: EQUIVALENCY_DECISION_LABELS[row.decision],
        decisionCount: 1,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.sourceCourseCode.localeCompare(b.sourceCourseCode) ||
      (a.targetCourseCode ?? "").localeCompare(b.targetCourseCode ?? "") ||
      a.decision.localeCompare(b.decision),
  );
}
