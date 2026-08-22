/**
 * PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D
 *
 * Central typed live read adapter for the staff self-service read side.
 * Rules enforced here:
 *  - strict, minimal column projections (never `select *`)
 *  - Zod validation of every row before it reaches React
 *  - no sensitive/unneeded fields (request payload, outbox last_error, ...)
 *  - no direct client writes to business tables: receipts go through RPCs
 *  - fail-closed: RLS denials surface as safe Arabic messages
 */

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const STAFF_SELF_SERVICE_READ_SIDE_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_LIVE_READ_SIDE_02D";

/** Strict projections — the single source of truth used by tests and queries. */
export const staffReadProjections = {
  leaveBalances:
    "id,leave_type,balance_year,entitled_days,carried_days,consumed_days,reserved_days,updated_at",
  payrollStatements:
    "id,staff_profile_id,period_start,period_end,currency_code,basic_salary,allowances_total,deductions_total,net_amount,published_at",
  payrollComponents:
    "id,statement_id,component_type,component_code,label_ar,amount,display_order",
  careerHistory:
    "id,event_type,effective_on,grade,job_title,decision_reference,notes",
  correspondence:
    "id,reference_no,title,body,importance,archive_category,published_at,sender_department_id",
  correspondenceRecipients:
    "id,correspondence_id,received_at,read_at,acknowledged_at",
  custody:
    "id,asset_name,asset_tag,serial_number,condition,delivered_on,returned_on",
  events:
    "id,request_id,event_type,actor_role,from_status,to_status,reason,occurred_at",
  notifications:
    "id,request_id,channel,template_key,status,available_at,sent_at,created_at",
  requests:
    "id,request_no,service_type,status,current_step,decision_reason,submitted_at,decided_at,department_id,staff_profile_id",
  approvalSteps:
    "id,request_id,step_order,required_role,status,decision_reason,decided_at",
  readAudit:
    "id,actor_user_id,subject_kind,subject_id,event_type,occurred_at",
} as const;

/** Sensitive columns that must never appear in a read-side projection. */
export const staffReadForbiddenColumns = [
  "payload",
  "last_error",
  "idempotency_key",
  "sha256",
  "object_path",
  "pdf_object_path",
  "source_reference",
] as const;

const numericLike = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_NUMERIC");
  return parsed;
});

const isoTimestamp = z.string().min(1);
const isoDate = z.string().min(1);

export const staffLeaveBalanceSchema = z.object({
  id: z.string().uuid(),
  leave_type: z.enum(["annual", "sick", "emergency", "unpaid", "other"]),
  balance_year: z.number().int(),
  entitled_days: numericLike,
  carried_days: numericLike,
  consumed_days: numericLike,
  reserved_days: numericLike,
  updated_at: isoTimestamp,
});

export const staffPayrollComponentSchema = z.object({
  id: z.string().uuid(),
  statement_id: z.string().uuid(),
  component_type: z.enum(["allowance", "deduction"]),
  component_code: z.string().min(1),
  label_ar: z.string().min(1),
  amount: numericLike,
  display_order: z.number().int(),
});

export const staffPayrollStatementSchema = z.object({
  id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  period_start: isoDate,
  period_end: isoDate,
  currency_code: z.literal("YER"),
  basic_salary: numericLike,
  allowances_total: numericLike,
  deductions_total: numericLike,
  net_amount: numericLike,
  published_at: isoTimestamp.nullable(),
});

export const staffCareerEventSchema = z.object({
  id: z.string().uuid(),
  event_type: z.enum([
    "appointment",
    "grade_change",
    "title_change",
    "promotion",
    "adjustment",
    "transfer",
  ]),
  effective_on: isoDate,
  grade: z.string().nullable(),
  job_title: z.string().nullable(),
  decision_reference: z.string().nullable(),
  notes: z.string().nullable(),
});

export const staffCorrespondenceSchema = z.object({
  id: z.string().uuid(),
  reference_no: z.string().min(1),
  title: z.string().min(1),
  importance: z.enum(["normal", "important", "urgent"]),
  body: z.string(),
  archive_category: z.string().min(1),
  published_at: isoTimestamp.nullable(),
  sender_department_id: z.string().uuid().nullable(),
});

export const staffCorrespondenceReceiptSchema = z.object({
  id: z.string().uuid(),
  correspondence_id: z.string().uuid(),
  received_at: isoTimestamp.nullable(),
  read_at: isoTimestamp.nullable(),
  acknowledged_at: isoTimestamp.nullable(),
});

export const staffCustodySchema = z.object({
  id: z.string().uuid(),
  asset_name: z.string().min(1),
  asset_tag: z.string().min(1),
  serial_number: z.string().nullable(),
  condition: z.enum([
    "new",
    "good",
    "needs_maintenance",
    "damaged",
    "returned",
  ]),
  delivered_on: isoDate,
  returned_on: isoDate.nullable(),
});

export const staffTimelineEventSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  request_id: z.string().uuid(),
  event_type: z.string().min(1),
  actor_role: z.string().nullable(),
  from_status: z.string().nullable(),
  to_status: z.string().nullable(),
  reason: z.string().nullable(),
  occurred_at: isoTimestamp,
});

export const staffNotificationSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  request_id: z.string().uuid().nullable(),
  channel: z.enum(["in_app", "email", "mobile"]),
  template_key: z.string().min(1),
  status: z.enum(["pending", "processing", "sent", "failed", "cancelled"]),
  available_at: isoTimestamp,
  sent_at: isoTimestamp.nullable(),
  created_at: isoTimestamp,
});

export const staffRequestRowSchema = z.object({
  id: z.string().uuid(),
  request_no: z.string().min(1),
  service_type: z.string().min(1),
  status: z.enum([
    "draft",
    "submitted",
    "in_review",
    "approved",
    "rejected",
    "cancelled",
  ]),
  current_step: z.number().int(),
  decision_reason: z.string().nullable(),
  submitted_at: isoTimestamp,
  decided_at: isoTimestamp.nullable(),
  department_id: z.string().uuid().nullable(),
  staff_profile_id: z.string().uuid(),
});

export const staffApprovalStepSchema = z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  step_order: z.number().int(),
  required_role: z.enum(["direct_manager", "hr", "finance", "administrator"]),
  status: z.enum(["pending", "approved", "rejected", "skipped"]),
  decision_reason: z.string().nullable(),
  decided_at: isoTimestamp.nullable(),
});

export const payrollDownloadContractSchema = z.object({
  statement_id: z.string().uuid(),
  access_mode: z.enum(["owner", "finance", "administrator"]),
  expires_in_seconds: z.literal(300),
  staff_name_ar: z.string().min(1),
  employee_number: z.string().nullable(),
  period_start: isoDate,
  period_end: isoDate,
  currency_code: z.literal("YER"),
  basic_salary: numericLike,
  allowances_total: numericLike,
  deductions_total: numericLike,
  net_amount: numericLike,
  components: z.array(
    z.object({
      component_type: z.enum(["allowance", "deduction"]),
      label_ar: z.string().min(1),
      amount: numericLike,
    }),
  ),
});

export const correspondenceReceiptResultSchema = z.object({
  correspondence_id: z.string().uuid(),
  received_at: isoTimestamp.nullable(),
  read_at: isoTimestamp.nullable(),
  acknowledged_at: isoTimestamp.nullable(),
});

export type StaffLeaveBalance = z.infer<typeof staffLeaveBalanceSchema>;
export type StaffPayrollStatement = z.infer<typeof staffPayrollStatementSchema>;
export type StaffPayrollComponent = z.infer<typeof staffPayrollComponentSchema>;
export type StaffCareerEvent = z.infer<typeof staffCareerEventSchema>;
export type StaffCorrespondence = z.infer<typeof staffCorrespondenceSchema>;
export type StaffCorrespondenceReceipt = z.infer<
  typeof staffCorrespondenceReceiptSchema
>;
export type StaffCustodyItem = z.infer<typeof staffCustodySchema>;
export type StaffTimelineEvent = z.infer<typeof staffTimelineEventSchema>;
export type StaffNotification = z.infer<typeof staffNotificationSchema>;
export type StaffRequestRow = z.infer<typeof staffRequestRowSchema>;
export type StaffApprovalStep = z.infer<typeof staffApprovalStepSchema>;
export type StaffPayrollDownloadContract = z.infer<
  typeof payrollDownloadContractSchema
>;

export type StaffPayrollStatementWithComponents = StaffPayrollStatement & {
  components: StaffPayrollComponent[];
};

export type StaffCorrespondenceWithReceipt = StaffCorrespondence & {
  receipt: StaffCorrespondenceReceipt | null;
};

const SAFE_READ_ERRORS: Record<string, string> = {
  STAFF_SERVICE_AUTH_REQUIRED: "يلزم تسجيل الدخول إلى بوابة الموظفين.",
  STAFF_SERVICE_CORRESPONDENCE_ACCESS_DENIED:
    "لا تملك صلاحية الوصول إلى هذا التعميم.",
  STAFF_SERVICE_PAYROLL_ACCESS_DENIED:
    "لا تملك صلاحية الاطلاع على هذا الكشف المالي.",
  STAFF_SERVICE_PAYROLL_STATEMENT_NOT_FOUND: "كشف الراتب غير متاح.",
  STAFF_SERVICE_PAYROLL_STATEMENT_NOT_PUBLISHED:
    "كشف الراتب لم يُعتمد للنشر بعد.",
};

export const STAFF_READ_GENERIC_ERROR =
  "تعذر تحميل البيانات بأمان. حاول مرة أخرى أو تواصل مع الدعم.";

export function toSafeReadError(error: unknown): Error {
  const raw =
    typeof error === "object" && error !== null
      ? `${(error as { code?: string }).code ?? ""} ${
          (error as { message?: string }).message ?? ""
        }`
      : String(error ?? "");
  const matched = Object.keys(SAFE_READ_ERRORS).find((key) => raw.includes(key));
  return new Error(matched ? SAFE_READ_ERRORS[matched] : STAFF_READ_GENERIC_ERROR);
}

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

export async function fetchStaffLeaveBalances(): Promise<StaffLeaveBalance[]> {
  return readRows(
    () =>
      fromTable("staff_leave_balances")
        .select(staffReadProjections.leaveBalances)
        .order("balance_year", { ascending: false }),
    staffLeaveBalanceSchema,
  );
}

export async function fetchStaffPayrollStatements(): Promise<
  StaffPayrollStatementWithComponents[]
> {
  const statements = await readRows(
    () =>
      fromTable("staff_payroll_statements")
        .select(staffReadProjections.payrollStatements)
        .order("period_start", { ascending: false }),
    staffPayrollStatementSchema,
  );

  if (statements.length === 0) return [];

  const components = await readRows(
    () =>
      fromTable("staff_payroll_components")
        .select(staffReadProjections.payrollComponents)
        .in(
          "statement_id",
          statements.map((statement) => statement.id),
        )
        .order("display_order", { ascending: true }),
    staffPayrollComponentSchema,
  );

  return statements.map((statement) => ({
    ...statement,
    components: components.filter(
      (component) => component.statement_id === statement.id,
    ),
  }));
}

export async function fetchStaffCareerHistory(): Promise<StaffCareerEvent[]> {
  return readRows(
    () =>
      fromTable("staff_career_history")
        .select(staffReadProjections.careerHistory)
        .order("effective_on", { ascending: false }),
    staffCareerEventSchema,
  );
}

export async function fetchStaffCorrespondence(): Promise<
  StaffCorrespondenceWithReceipt[]
> {
  const letters = await readRows(
    () =>
      fromTable("staff_correspondence")
        .select(staffReadProjections.correspondence)
        .order("published_at", { ascending: false }),
    staffCorrespondenceSchema,
  );

  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;

  // Only the signed-in recipient's own receipts may drive the employee UI.
  // HR/administrator accounts can read other recipients' rows, so the filter
  // is explicit instead of "first matching row wins".
  const receipts = userId
    ? await readRows(
        () =>
          fromTable("staff_correspondence_recipients")
            .select(staffReadProjections.correspondenceRecipients)
            .eq("recipient_user_id", userId)
            .order("created_at", { ascending: false }),
        staffCorrespondenceReceiptSchema,
      )
    : [];

  return letters.map((letter) => ({
    ...letter,
    receipt:
      receipts.find((receipt) => receipt.correspondence_id === letter.id) ??
      null,
  }));
}

export type StaffCorrespondenceReceiptSummary = {
  correspondence_id: string;
  recipients_total: number;
  read_total: number;
  acknowledged_total: number;
};

/**
 * Aggregated receipt tracking per correspondence, strictly within RLS: an
 * employee only ever aggregates their own row, HR/administrator aggregate the
 * rows the database actually returned. No recipient identity is projected.
 */
export async function fetchStaffCorrespondenceReceiptSummary(): Promise<
  StaffCorrespondenceReceiptSummary[]
> {
  const receipts = await readRows(
    () =>
      fromTable("staff_correspondence_recipients")
        .select(staffReadProjections.correspondenceRecipients)
        .order("created_at", { ascending: false }),
    staffCorrespondenceReceiptSchema,
  );

  const summary = new Map<string, StaffCorrespondenceReceiptSummary>();
  for (const receipt of receipts) {
    const entry = summary.get(receipt.correspondence_id) ?? {
      correspondence_id: receipt.correspondence_id,
      recipients_total: 0,
      read_total: 0,
      acknowledged_total: 0,
    };
    entry.recipients_total += 1;
    if (receipt.read_at) entry.read_total += 1;
    if (receipt.acknowledged_at) entry.acknowledged_total += 1;
    summary.set(receipt.correspondence_id, entry);
  }
  return [...summary.values()];
}

export const staffServiceCapabilitiesSchema = z.object({
  is_employee: z.boolean(),
  is_direct_manager: z.boolean(),
  is_hr: z.boolean(),
  is_finance: z.boolean(),
  is_administrator: z.boolean(),
  can_view_payroll_scope: z.boolean(),
  can_view_hr_scope: z.boolean(),
  can_view_audit_scope: z.boolean(),
});

export type StaffServiceCapabilities = z.infer<
  typeof staffServiceCapabilitiesSchema
>;

export const STAFF_SERVICE_NO_CAPABILITIES: StaffServiceCapabilities = {
  is_employee: false,
  is_direct_manager: false,
  is_hr: false,
  is_finance: false,
  is_administrator: false,
  can_view_payroll_scope: false,
  can_view_hr_scope: false,
  can_view_audit_scope: false,
};

/** Boolean-only capability probe (no names, no rows, no identifiers). */
export async function fetchStaffServiceCapabilities(): Promise<StaffServiceCapabilities> {
  const { data, error } = await rpc(
    "staff_service_get_current_capabilities",
    {},
  );
  if (error) throw toSafeReadError(error);
  return staffServiceCapabilitiesSchema.parse(data);
}

export async function fetchStaffCustody(): Promise<StaffCustodyItem[]> {
  return readRows(
    () =>
      fromTable("staff_custody_assignments")
        .select(staffReadProjections.custody)
        .order("delivered_on", { ascending: false }),
    staffCustodySchema,
  );
}

export async function fetchStaffTimelineEvents(
  limit = 60,
): Promise<StaffTimelineEvent[]> {
  return readRows(
    () =>
      fromTable("staff_service_events")
        .select(staffReadProjections.events)
        .order("occurred_at", { ascending: false })
        .limit(limit),
    staffTimelineEventSchema,
  );
}

export async function fetchStaffNotifications(
  limit = 40,
): Promise<StaffNotification[]> {
  return readRows(
    () =>
      fromTable("staff_service_notifications_outbox")
        .select(staffReadProjections.notifications)
        .order("created_at", { ascending: false })
        .limit(limit),
    staffNotificationSchema,
  );
}

export async function fetchStaffServiceRequestRows(): Promise<
  StaffRequestRow[]
> {
  return readRows(
    () =>
      fromTable("staff_service_requests")
        .select(staffReadProjections.requests)
        .order("submitted_at", { ascending: false }),
    staffRequestRowSchema,
  );
}

export async function fetchStaffApprovalSteps(): Promise<StaffApprovalStep[]> {
  return readRows(
    () =>
      fromTable("staff_service_approval_steps")
        .select(staffReadProjections.approvalSteps)
        .order("step_order", { ascending: true }),
    staffApprovalStepSchema,
  );
}

/** Receipt mutations are RPC-only (02D removed the direct UPDATE grant). */
export async function markCorrespondenceRead(correspondenceId: string) {
  const id = z.string().uuid().parse(correspondenceId);
  const { data, error } = await rpc("staff_service_record_correspondence_read", {
    p_correspondence_id: id,
  });
  if (error) throw toSafeReadError(error);
  return correspondenceReceiptResultSchema.parse(data);
}

export async function acknowledgeCorrespondence(correspondenceId: string) {
  const id = z.string().uuid().parse(correspondenceId);
  const { data, error } = await rpc("staff_service_acknowledge_correspondence", {
    p_correspondence_id: id,
  });
  if (error) throw toSafeReadError(error);
  return correspondenceReceiptResultSchema.parse(data);
}

/** Authorization contract for the secure Arabic payroll PDF (no public URL). */
export async function authorizePayrollStatementDownload(statementId: string) {
  const id = z.string().uuid().parse(statementId);
  const { data, error } = await rpc(
    "staff_service_authorize_payroll_statement_download",
    { p_statement_id: id },
  );
  if (error) throw toSafeReadError(error);
  return payrollDownloadContractSchema.parse(data);
}

export const staffReadAuditEventSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  actor_user_id: z.string().uuid(),
  subject_kind: z.enum(["correspondence", "payroll_statement"]),
  subject_id: z.string().uuid(),
  event_type: z.enum([
    "correspondence_received",
    "correspondence_read",
    "correspondence_acknowledged",
    "payroll_download_authorized",
  ]),
  occurred_at: isoTimestamp,
});

export type StaffReadAuditEvent = z.infer<typeof staffReadAuditEventSchema>;

export async function fetchStaffReadAuditEvents(
  limit = 50,
): Promise<StaffReadAuditEvent[]> {
  return readRows(
    () =>
      fromTable("staff_service_read_audit_events")
        .select(staffReadProjections.readAudit)
        .order("occurred_at", { ascending: false })
        .limit(limit),
    staffReadAuditEventSchema,
  );
}

/** Own staff_profiles.id for the signed-in user, or null when not a staff account. */
export async function fetchOwnStaffProfileId(): Promise<string | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const rows = await readRows(
    () => fromTable("staff_profiles").select("id").eq("user_id", userId).limit(1),
    z.object({ id: z.string().uuid() }),
  );
  return rows[0]?.id ?? null;
}

export function remainingLeaveDays(balance: StaffLeaveBalance): number {
  return (
    balance.entitled_days +
    balance.carried_days -
    balance.consumed_days -
    balance.reserved_days
  );
}
