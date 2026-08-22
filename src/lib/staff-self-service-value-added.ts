/**
 * PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E
 *
 * Typed live adapter for the 02E value-added modules:
 * issued documents + QR verification, annual performance evaluation,
 * attendance, overtime/assignments, training, promotions/settlements and
 * electronic clearance.
 *
 * Same rules as 02D: strict projections (never `select *`), Zod validation,
 * RPC-only writes, fail-closed Arabic error surfaces, no sensitive columns.
 */

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toSafeReadError } from "@/lib/staff-self-service-read";

export const STAFF_SELF_SERVICE_VALUE_ADDED_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_VALUE_ADDED_02E";

/** Strict projections — single source of truth for tests and queries. */
export const staffValueAddedProjections = {
  issuedDocuments:
    "id,reference_no,document_type,staff_profile_id,language_code,purpose,destination,status,issued_at,expires_at,revoked_at,revoke_reason",
  performanceCycles: "id,cycle_year,title_ar,opens_on,closes_on,status",
  evaluations:
    "id,cycle_id,staff_profile_id,overall_rating,rating_band,goals,strengths,improvements,status,finalized_at,acknowledged_at,employee_comment",
  attendanceDays:
    "id,staff_profile_id,attendance_date,check_in_at,check_out_at,worked_minutes,late_minutes,overtime_minutes,day_state",
  overtimeClaims:
    "id,claim_no,staff_profile_id,claim_kind,starts_on,ends_on,total_hours,reason,status,manager_decided_at,manager_reason,hr_decided_at,hr_reason",
  overtimeFinancialImpact:
    "claim_id,currency_code,hourly_rate,gross_amount,settled_at",
  trainingCourses:
    "id,code,title_ar,provider,starts_on,ends_on,total_hours,active",
  trainingEnrollments:
    "id,course_id,staff_profile_id,status,decided_at,decision_reason,completed_at",
  promotionCases:
    "id,case_no,staff_profile_id,case_kind,current_grade,proposed_grade,status,effective_on,notes",
  promotionFinancialImpact:
    "case_id,currency_code,current_basic,proposed_basic,retroactive_amount",
  clearanceCases:
    "id,case_no,staff_profile_id,status,reason,completed_at,custody_override,custody_override_reason",
  clearanceCheckpoints:
    "id,case_id,checkpoint_kind,required_role,status,decided_at,decision_reason",
  valueAddedAudit:
    "id,actor_user_id,module,subject_id,event_type,reason,occurred_at",
} as const;

/**
 * Columns that must never be projected client-side. The verification token
 * digest in particular stays server-side only.
 */
export const staffValueAddedForbiddenColumns = [
  "verification_token_digest",
  "certificate_object_path",
  "certificate_sha256",
  "object_path",
  "idempotency_key",
] as const;

const numericLike = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_NUMERIC");
  return parsed;
});

const isoTimestamp = z.string().min(1);
const isoDate = z.string().min(1);

type QueryLike = {
  select: (columns: string) => QueryLike;
  eq: (column: string, value: unknown) => QueryLike;
  in: (column: string, values: readonly unknown[]) => QueryLike;
  order: (column: string, options: { ascending: boolean }) => QueryLike;
  limit: (count: number) => QueryLike;
  then: <R>(
    resolve: (value: { data: unknown; error: unknown }) => R,
  ) => Promise<R>;
};

const fromTable = supabase.from as unknown as (table: string) => QueryLike;
const rpc = supabase.rpc as unknown as (
  fn: string,
  params: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

async function readRows<T>(
  build: () => QueryLike,
  schema: z.ZodType<T>,
): Promise<T[]> {
  const { data, error } = await build().then((result) => result);
  if (error) throw toSafeReadError(error);
  return z.array(schema).parse(data ?? []);
}

async function callRpc<T>(
  fn: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await rpc(fn, params);
  if (error) throw toSafeReadError(error);
  return schema.parse(data);
}

/* ------------------------------------------------------------------ */
/* 1) Issued documents + QR verification                               */
/* ------------------------------------------------------------------ */

export const staffIssuedDocumentSchema = z.object({
  id: z.string().uuid(),
  reference_no: z.string().min(1),
  document_type: z.enum([
    "employment_statement",
    "experience_certificate",
    "training_certificate",
    "clearance_certificate",
  ]),
  staff_profile_id: z.string().uuid(),
  language_code: z.enum(["ar", "en"]),
  purpose: z.string().nullable(),
  destination: z.string().nullable(),
  status: z.enum(["issued", "revoked"]),
  issued_at: isoTimestamp,
  expires_at: isoTimestamp.nullable(),
  revoked_at: isoTimestamp.nullable(),
  revoke_reason: z.string().nullable(),
});

export type StaffIssuedDocument = z.infer<typeof staffIssuedDocumentSchema>;

export async function fetchStaffIssuedDocuments(): Promise<
  StaffIssuedDocument[]
> {
  return readRows(
    () =>
      fromTable("staff_issued_documents")
        .select(staffValueAddedProjections.issuedDocuments)
        .order("issued_at", { ascending: false }),
    staffIssuedDocumentSchema,
  );
}

const requestResultSchema = z
  .object({
    id: z.string().uuid(),
    request_no: z.string().min(1),
    service_type: z.string().min(1),
    status: z.string().min(1),
  })
  .passthrough();

export async function requestEmploymentStatement(input: {
  documentType: "employment_statement" | "experience_certificate";
  languageCode?: "ar" | "en";
  purpose?: string | null;
  destination?: string | null;
  notes?: string | null;
  idempotencyKey?: string;
}) {
  return callRpc(
    "staff_service_request_employment_statement",
    {
      p_document_type: input.documentType,
      p_language_code: input.languageCode ?? "ar",
      p_purpose: input.purpose ?? null,
      p_destination: input.destination ?? null,
      p_notes: input.notes ?? null,
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
    },
    requestResultSchema,
  );
}

const issueResultSchema = z.object({
  document_id: z.string().uuid(),
  reference_no: z.string().min(1),
  document_type: z.string().min(1),
  issued_at: isoTimestamp,
  expires_at: isoTimestamp.nullable(),
  /** Returned exactly once to the issuing HR actor; never persisted client-side. */
  verification_token: z.string().regex(/^[a-f0-9]{64}$/),
});

export async function issueStaffDocument(input: {
  requestId: string;
  validDays?: number;
}) {
  return callRpc(
    "staff_service_issue_document",
    {
      p_request_id: z.string().uuid().parse(input.requestId),
      p_valid_days: input.validDays ?? 180,
    },
    issueResultSchema,
  );
}

export async function revokeStaffDocument(input: {
  documentId: string;
  reason: string;
}) {
  return callRpc(
    "staff_service_revoke_issued_document",
    {
      p_document_id: z.string().uuid().parse(input.documentId),
      p_reason: input.reason,
    },
    z.object({
      document_id: z.string().uuid(),
      status: z.literal("revoked"),
      revoked_at: isoTimestamp,
    }),
  );
}

export const staffDocumentVerificationSchema = z.union([
  z.object({ result: z.literal("invalid") }),
  z.object({
    result: z.enum(["valid", "revoked", "expired"]),
    issuer_ar: z.string().min(1),
    document_type: z.string().min(1),
    holder_label: z.string().min(1),
    reference_no: z.string().min(1),
    issued_at: isoTimestamp,
    expires_at: isoTimestamp.nullable(),
  }),
]);

export type StaffDocumentVerification = z.infer<
  typeof staffDocumentVerificationSchema
>;

/** Public authenticity check — the only 02E surface reachable without a session. */
export async function verifyIssuedDocument(
  token: string,
): Promise<StaffDocumentVerification> {
  return callRpc(
    "staff_service_verify_issued_document",
    { p_token: token.trim().toLowerCase() },
    staffDocumentVerificationSchema,
  );
}

/* ------------------------------------------------------------------ */
/* 2) Performance evaluation                                           */
/* ------------------------------------------------------------------ */

export const staffPerformanceCycleSchema = z.object({
  id: z.string().uuid(),
  cycle_year: z.number().int(),
  title_ar: z.string().min(1),
  opens_on: isoDate,
  closes_on: isoDate,
  status: z.enum(["draft", "open", "closed"]),
});

export const staffPerformanceEvaluationSchema = z.object({
  id: z.string().uuid(),
  cycle_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  overall_rating: numericLike.nullable(),
  rating_band: z
    .enum(["excellent", "very_good", "good", "acceptable", "weak"])
    .nullable(),
  goals: z.string().nullable(),
  strengths: z.string().nullable(),
  improvements: z.string().nullable(),
  status: z.enum(["draft", "finalized"]),
  finalized_at: isoTimestamp.nullable(),
  acknowledged_at: isoTimestamp.nullable(),
  employee_comment: z.string().nullable(),
});

export type StaffPerformanceCycle = z.infer<typeof staffPerformanceCycleSchema>;
export type StaffPerformanceEvaluation = z.infer<
  typeof staffPerformanceEvaluationSchema
>;

export const RATING_BAND_AR: Record<string, string> = {
  excellent: "ممتاز",
  very_good: "جيد جدًا",
  good: "جيد",
  acceptable: "مقبول",
  weak: "ضعيف",
};

export async function fetchStaffPerformanceCycles(): Promise<
  StaffPerformanceCycle[]
> {
  return readRows(
    () =>
      fromTable("staff_performance_cycles")
        .select(staffValueAddedProjections.performanceCycles)
        .order("cycle_year", { ascending: false }),
    staffPerformanceCycleSchema,
  );
}

export async function fetchStaffEvaluations(): Promise<
  StaffPerformanceEvaluation[]
> {
  return readRows(
    () =>
      fromTable("staff_performance_evaluations")
        .select(staffValueAddedProjections.evaluations)
        .order("created_at", { ascending: false }),
    staffPerformanceEvaluationSchema,
  );
}

export async function finalizeEvaluation(evaluationId: string) {
  return callRpc(
    "staff_service_finalize_evaluation",
    { p_evaluation_id: z.string().uuid().parse(evaluationId) },
    z.object({
      evaluation_id: z.string().uuid(),
      status: z.literal("finalized"),
    }),
  );
}

export async function acknowledgeEvaluation(
  evaluationId: string,
  comment?: string | null,
) {
  return callRpc(
    "staff_service_acknowledge_evaluation",
    {
      p_evaluation_id: z.string().uuid().parse(evaluationId),
      p_comment: comment ?? null,
    },
    z.object({
      evaluation_id: z.string().uuid(),
      acknowledged_at: isoTimestamp,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* 3) Attendance                                                       */
/* ------------------------------------------------------------------ */

export const staffAttendanceDaySchema = z.object({
  id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  attendance_date: isoDate,
  check_in_at: isoTimestamp.nullable(),
  check_out_at: isoTimestamp.nullable(),
  worked_minutes: z.number().int(),
  late_minutes: z.number().int(),
  overtime_minutes: z.number().int(),
  day_state: z.enum([
    "present",
    "absent",
    "late",
    "leave",
    "holiday",
    "mission",
  ]),
});

export type StaffAttendanceDay = z.infer<typeof staffAttendanceDaySchema>;

export const staffAttendanceSummarySchema = z.object({
  staff_profile_id: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int(),
  present_days: z.number().int(),
  absent_days: z.number().int(),
  late_days: z.number().int(),
  leave_days: z.number().int(),
  worked_hours: numericLike,
  late_minutes: z.number().int(),
  overtime_hours: numericLike,
});

export type StaffAttendanceSummary = z.infer<
  typeof staffAttendanceSummarySchema
>;

export async function fetchStaffAttendanceDays(
  limit = 62,
): Promise<StaffAttendanceDay[]> {
  return readRows(
    () =>
      fromTable("staff_attendance_days")
        .select(staffValueAddedProjections.attendanceDays)
        .order("attendance_date", { ascending: false })
        .limit(limit),
    staffAttendanceDaySchema,
  );
}

export async function fetchStaffAttendanceSummary(input: {
  staffProfileId: string;
  year: number;
  month: number;
}): Promise<StaffAttendanceSummary> {
  return callRpc(
    "staff_service_get_attendance_summary",
    {
      p_staff_profile_id: z.string().uuid().parse(input.staffProfileId),
      p_year: input.year,
      p_month: input.month,
    },
    staffAttendanceSummarySchema,
  );
}

/* ------------------------------------------------------------------ */
/* 4) Overtime / assignments                                           */
/* ------------------------------------------------------------------ */

export const staffOvertimeClaimSchema = z.object({
  id: z.string().uuid(),
  claim_no: z.string().min(1),
  staff_profile_id: z.string().uuid(),
  claim_kind: z.enum(["overtime", "assignment"]),
  starts_on: isoDate,
  ends_on: isoDate,
  total_hours: numericLike,
  reason: z.string().min(1),
  status: z.enum([
    "submitted",
    "manager_approved",
    "hr_approved",
    "rejected",
    "cancelled",
  ]),
  manager_decided_at: isoTimestamp.nullable(),
  manager_reason: z.string().nullable(),
  hr_decided_at: isoTimestamp.nullable(),
  hr_reason: z.string().nullable(),
});

/**
 * Finance-safe overtime surface.
 *
 * Finance has NO access to `staff_overtime_claims` (reason, manager_reason,
 * hr_reason, staff_profile_id, workflow state). It reads money only through
 * this narrow server projection.
 */
export const staffOvertimeFinancialImpactSchema = z
  .object({
    claim_id: z.string().uuid(),
    claim_no: z.string().min(1),
    claim_kind: z.enum(["overtime", "assignment"]),
    financial_status: z.enum(["approved_for_settlement", "not_settleable"]),
    approved_total_hours: numericLike.nullable(),
    currency_code: z.literal("YER"),
    hourly_rate: numericLike,
    gross_amount: numericLike,
    settled_at: isoTimestamp.nullable(),
  })
  .strict();

export type StaffOvertimeClaim = z.infer<typeof staffOvertimeClaimSchema>;
export type StaffOvertimeFinancialImpact = z.infer<
  typeof staffOvertimeFinancialImpactSchema
>;

export async function fetchStaffOvertimeClaims(): Promise<
  StaffOvertimeClaim[]
> {
  return readRows(
    () =>
      fromTable("staff_overtime_claims")
        .select(staffValueAddedProjections.overtimeClaims)
        .order("created_at", { ascending: false }),
    staffOvertimeClaimSchema,
  );
}

/** Finance/Administrator only: narrow money projection, never the base row. */
export async function fetchStaffOvertimeFinancialImpact(): Promise<
  StaffOvertimeFinancialImpact[]
> {
  return callRpc(
    "staff_service_list_overtime_financial_projection",
    {},
    z.array(staffOvertimeFinancialImpactSchema),
  );
}

export async function submitOvertimeClaim(input: {
  claimKind: "overtime" | "assignment";
  startsOn: string;
  endsOn: string;
  totalHours: number;
  reason: string;
  idempotencyKey?: string;
}) {
  return callRpc(
    "staff_service_submit_overtime_claim",
    {
      p_claim_kind: input.claimKind,
      p_starts_on: input.startsOn,
      p_ends_on: input.endsOn,
      p_total_hours: input.totalHours,
      p_reason: input.reason,
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
    },
    staffOvertimeClaimSchema.passthrough(),
  );
}

export async function decideOvertimeClaim(input: {
  claimId: string;
  decision: "approved" | "rejected";
  reason?: string | null;
}) {
  return callRpc(
    "staff_service_decide_overtime_claim",
    {
      p_claim_id: z.string().uuid().parse(input.claimId),
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    },
    staffOvertimeClaimSchema.passthrough(),
  );
}

/* ------------------------------------------------------------------ */
/* 5) Training                                                         */
/* ------------------------------------------------------------------ */

export const staffTrainingCourseSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  title_ar: z.string().min(1),
  provider: z.string().min(1),
  starts_on: isoDate,
  ends_on: isoDate,
  total_hours: numericLike,
  active: z.boolean(),
});

export const staffTrainingEnrollmentSchema = z.object({
  id: z.string().uuid(),
  course_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  status: z.enum([
    "requested",
    "approved",
    "rejected",
    "completed",
    "cancelled",
  ]),
  decided_at: isoTimestamp.nullable(),
  decision_reason: z.string().nullable(),
  completed_at: isoTimestamp.nullable(),
});

export type StaffTrainingCourse = z.infer<typeof staffTrainingCourseSchema>;
export type StaffTrainingEnrollment = z.infer<
  typeof staffTrainingEnrollmentSchema
>;

export async function fetchStaffTrainingCourses(): Promise<
  StaffTrainingCourse[]
> {
  return readRows(
    () =>
      fromTable("staff_training_courses")
        .select(staffValueAddedProjections.trainingCourses)
        .order("starts_on", { ascending: false }),
    staffTrainingCourseSchema,
  );
}

export async function fetchStaffTrainingEnrollments(): Promise<
  StaffTrainingEnrollment[]
> {
  return readRows(
    () =>
      fromTable("staff_training_enrollments")
        .select(staffValueAddedProjections.trainingEnrollments)
        .order("created_at", { ascending: false }),
    staffTrainingEnrollmentSchema,
  );
}

export async function requestTrainingEnrollment(courseId: string) {
  return callRpc(
    "staff_service_request_training_enrollment",
    { p_course_id: z.string().uuid().parse(courseId) },
    staffTrainingEnrollmentSchema.passthrough(),
  );
}

export async function decideTrainingEnrollment(input: {
  enrollmentId: string;
  decision: "approved" | "rejected";
  reason?: string | null;
}) {
  return callRpc(
    "staff_service_decide_training_enrollment",
    {
      p_enrollment_id: z.string().uuid().parse(input.enrollmentId),
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    },
    staffTrainingEnrollmentSchema.passthrough(),
  );
}

/* ------------------------------------------------------------------ */
/* 6) Promotions / settlements                                         */
/* ------------------------------------------------------------------ */

export const staffPromotionCaseSchema = z.object({
  id: z.string().uuid(),
  case_no: z.string().min(1),
  staff_profile_id: z.string().uuid(),
  case_kind: z.enum(["promotion", "settlement", "grade_adjustment"]),
  current_grade: z.string().nullable(),
  proposed_grade: z.string().nullable(),
  status: z.enum([
    "under_study",
    "hr_review",
    "approved",
    "rejected",
    "implemented",
  ]),
  effective_on: isoDate.nullable(),
  notes: z.string().nullable(),
});

export const staffPromotionFinancialImpactSchema = z.object({
  case_id: z.string().uuid(),
  currency_code: z.literal("YER"),
  current_basic: numericLike,
  proposed_basic: numericLike,
  retroactive_amount: numericLike,
});

export type StaffPromotionCase = z.infer<typeof staffPromotionCaseSchema>;
export type StaffPromotionFinancialImpact = z.infer<
  typeof staffPromotionFinancialImpactSchema
>;

export async function fetchStaffPromotionCases(): Promise<
  StaffPromotionCase[]
> {
  return readRows(
    () =>
      fromTable("staff_promotion_cases")
        .select(staffValueAddedProjections.promotionCases)
        .order("created_at", { ascending: false }),
    staffPromotionCaseSchema,
  );
}

/** Finance-only projection; RLS returns nothing for other roles. */
export async function fetchStaffPromotionFinancialImpact(): Promise<
  StaffPromotionFinancialImpact[]
> {
  return readRows(
    () =>
      fromTable("staff_promotion_financial_impact")
        .select(staffValueAddedProjections.promotionFinancialImpact)
        .order("updated_at", { ascending: false }),
    staffPromotionFinancialImpactSchema,
  );
}

/* ------------------------------------------------------------------ */
/* 7) Clearance                                                        */
/* ------------------------------------------------------------------ */

export const staffClearanceCaseSchema = z.object({
  id: z.string().uuid(),
  case_no: z.string().min(1),
  staff_profile_id: z.string().uuid(),
  status: z.enum(["in_progress", "completed", "cancelled"]),
  reason: z.string().min(1),
  completed_at: isoTimestamp.nullable(),
  custody_override: z.boolean(),
  custody_override_reason: z.string().nullable(),
});

export const staffClearanceCheckpointSchema = z.object({
  id: z.string().uuid(),
  case_id: z.string().uuid(),
  checkpoint_kind: z.enum([
    "direct_manager",
    "hr",
    "finance",
    "it_custody",
    "administration",
  ]),
  required_role: z.enum(["direct_manager", "hr", "finance", "administrator"]),
  status: z.enum(["pending", "cleared", "blocked"]),
  decided_at: isoTimestamp.nullable(),
  decision_reason: z.string().nullable(),
});

export type StaffClearanceCase = z.infer<typeof staffClearanceCaseSchema>;
export type StaffClearanceCheckpoint = z.infer<
  typeof staffClearanceCheckpointSchema
>;

export const CHECKPOINT_KIND_AR: Record<string, string> = {
  direct_manager: "المدير المباشر",
  hr: "الموارد البشرية",
  finance: "الشؤون المالية",
  it_custody: "عهدة تقنية المعلومات",
  administration: "الشؤون الإدارية",
};

export async function fetchStaffClearanceCases(): Promise<
  StaffClearanceCase[]
> {
  return readRows(
    () =>
      fromTable("staff_clearance_cases")
        .select(staffValueAddedProjections.clearanceCases)
        .order("created_at", { ascending: false }),
    staffClearanceCaseSchema,
  );
}

export async function fetchStaffClearanceCheckpoints(): Promise<
  StaffClearanceCheckpoint[]
> {
  return readRows(
    () =>
      fromTable("staff_clearance_checkpoints")
        .select(staffValueAddedProjections.clearanceCheckpoints)
        .order("created_at", { ascending: true }),
    staffClearanceCheckpointSchema,
  );
}

export async function decideClearanceCheckpoint(input: {
  checkpointId: string;
  decision: "cleared" | "blocked";
  reason?: string | null;
}) {
  return callRpc(
    "staff_service_decide_clearance_checkpoint",
    {
      p_checkpoint_id: z.string().uuid().parse(input.checkpointId),
      p_decision: input.decision,
      p_reason: input.reason ?? null,
    },
    staffClearanceCheckpointSchema.passthrough(),
  );
}

export async function completeClearanceCase(input: {
  caseId: string;
  custodyOverride?: boolean;
  overrideReason?: string | null;
}) {
  return callRpc(
    "staff_service_complete_clearance_case",
    {
      p_case_id: z.string().uuid().parse(input.caseId),
      p_custody_override: input.custodyOverride ?? false,
      p_override_reason: input.overrideReason ?? null,
    },
    staffClearanceCaseSchema.passthrough(),
  );
}

/* ------------------------------------------------------------------ */
/* 8) Audit + capabilities                                             */
/* ------------------------------------------------------------------ */

export const staffValueAddedAuditEventSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  actor_user_id: z.string().uuid().nullable(),
  module: z.enum([
    "issued_document",
    "performance",
    "attendance",
    "overtime",
    "training",
    "promotion",
    "clearance",
  ]),
  subject_id: z.string().uuid(),
  event_type: z.string().min(1),
  reason: z.string().nullable(),
  occurred_at: isoTimestamp,
});

export type StaffValueAddedAuditEvent = z.infer<
  typeof staffValueAddedAuditEventSchema
>;

export async function fetchStaffValueAddedAuditEvents(
  limit = 60,
): Promise<StaffValueAddedAuditEvent[]> {
  return readRows(
    () =>
      fromTable("staff_value_added_audit_events")
        .select(staffValueAddedProjections.valueAddedAudit)
        .order("occurred_at", { ascending: false })
        .limit(limit),
    staffValueAddedAuditEventSchema,
  );
}

export const staffValueAddedCapabilitiesSchema = z
  .object({
    is_employee: z.boolean(),
    is_direct_manager: z.boolean(),
    is_hr: z.boolean(),
    is_finance: z.boolean(),
    is_administrator: z.boolean(),
    can_view_payroll_scope: z.boolean(),
    can_view_hr_scope: z.boolean(),
    can_view_audit_scope: z.boolean(),
    can_issue_documents: z.boolean(),
    can_manage_evaluations: z.boolean(),
    can_view_financial_impact: z.boolean(),
    can_decide_clearance: z.boolean(),
  })
  .strict();

export type StaffValueAddedCapabilities = z.infer<
  typeof staffValueAddedCapabilitiesSchema
>;

export const STAFF_VALUE_ADDED_NO_CAPABILITIES: StaffValueAddedCapabilities = {
  is_employee: false,
  is_direct_manager: false,
  is_hr: false,
  is_finance: false,
  is_administrator: false,
  can_view_payroll_scope: false,
  can_view_hr_scope: false,
  can_view_audit_scope: false,
  can_issue_documents: false,
  can_manage_evaluations: false,
  can_view_financial_impact: false,
  can_decide_clearance: false,
};

/** Boolean-only probe: UI gating never depends on another employee's row. */
export async function fetchStaffValueAddedCapabilities(): Promise<StaffValueAddedCapabilities> {
  return callRpc(
    "staff_service_get_value_added_capabilities",
    {},
    staffValueAddedCapabilitiesSchema,
  );
}
