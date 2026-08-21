import { z } from "zod";

export const STAFF_SELF_SERVICE_BACKEND_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_BACKEND_FOUNDATION_02A";

export const staffServiceRoles = [
  "employee",
  "direct_manager",
  "hr",
  "finance",
  "administrator",
] as const;

export type StaffServiceRole = (typeof staffServiceRoles)[number];

export const staffServiceTypes = [
  "leave",
  "permission",
  "custody_transfer",
  "custody_return",
  "employment_certificate",
  "experience_certificate",
  "overtime",
  "training",
  "promotion_adjustment",
  "clearance",
] as const;

export type StaffServiceType = (typeof staffServiceTypes)[number];

export const staffServiceRequestStatuses = [
  "draft",
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type StaffServiceRequestStatus =
  (typeof staffServiceRequestStatuses)[number];

export const staffServiceApprovalStatuses = [
  "pending",
  "approved",
  "rejected",
  "skipped",
] as const;

export const staffServiceDecisionSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(2000).nullable().optional(),
  idempotencyKey: z.string().uuid(),
}).superRefine((value, ctx) => {
  if (value.decision === "rejected" && !value.reason?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["reason"],
      message: "سبب الرفض إلزامي",
    });
  }
});

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const leaveRequestPayloadSchema = z.object({
  leaveType: z.enum(["annual", "sick", "emergency", "unpaid", "other"]),
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  durationDays: z.number().positive().max(365),
  substituteStaffProfileId: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.endsOn < value.startsOn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endsOn"],
      message: "تاريخ النهاية يجب ألا يسبق تاريخ البداية",
    });
  }
});

export const permissionRequestPayloadSchema = z.object({
  permissionDate: isoDateSchema,
  startsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endsAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: z.string().trim().min(3).max(2000),
});

export const staffServiceSubmitSchema = z.object({
  serviceType: z.enum(staffServiceTypes),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().uuid(),
});

export const staffAttachmentIntentSchema = z.object({
  requestId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum([
    "application/pdf",
    "image/jpeg",
    "image/png",
  ]),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
});

export const staffServiceWorkflow: Readonly<
  Record<StaffServiceType, readonly Exclude<StaffServiceRole, "employee">[]>
> = {
  leave: ["direct_manager", "hr"],
  permission: ["direct_manager", "hr"],
  custody_transfer: ["direct_manager", "hr"],
  custody_return: ["direct_manager", "hr"],
  employment_certificate: ["hr"],
  experience_certificate: ["hr"],
  overtime: ["direct_manager", "hr", "finance"],
  training: ["direct_manager", "hr"],
  promotion_adjustment: ["direct_manager", "hr"],
  clearance: ["direct_manager", "hr", "finance", "administrator"],
};

export type StaffServiceCapability =
  | "profile.read.own"
  | "request.submit.own"
  | "request.read.own"
  | "request.approve.scoped"
  | "payroll.read.own"
  | "payroll.manage"
  | "career.read.own"
  | "career.manage"
  | "correspondence.read.assigned"
  | "correspondence.publish"
  | "custody.read.own"
  | "custody.manage"
  | "reports.read.scoped"
  | "audit.read.scoped"
  | "roles.manage";

export const staffServiceAccessMatrix: Readonly<
  Record<StaffServiceRole, readonly StaffServiceCapability[]>
> = {
  employee: [
    "profile.read.own",
    "request.submit.own",
    "request.read.own",
    "payroll.read.own",
    "career.read.own",
    "correspondence.read.assigned",
    "custody.read.own",
  ],
  direct_manager: [
    "profile.read.own",
    "request.submit.own",
    "request.read.own",
    "request.approve.scoped",
    "reports.read.scoped",
  ],
  hr: [
    "profile.read.own",
    "request.submit.own",
    "request.read.own",
    "request.approve.scoped",
    "career.manage",
    "correspondence.publish",
    "custody.manage",
    "reports.read.scoped",
    "audit.read.scoped",
  ],
  finance: [
    "profile.read.own",
    "request.submit.own",
    "request.read.own",
    "request.approve.scoped",
    "payroll.manage",
    "reports.read.scoped",
    "audit.read.scoped",
  ],
  administrator: [
    "profile.read.own",
    "request.submit.own",
    "request.read.own",
    "request.approve.scoped",
    "payroll.manage",
    "career.manage",
    "correspondence.publish",
    "custody.manage",
    "reports.read.scoped",
    "audit.read.scoped",
    "roles.manage",
  ],
};

export const sensitiveStaffServiceModules = [
  "payroll",
  "personal_profile",
  "attachments",
  "audit",
] as const;

export function roleCan(
  role: StaffServiceRole,
  capability: StaffServiceCapability,
): boolean {
  return staffServiceAccessMatrix[role].includes(capability);
}

