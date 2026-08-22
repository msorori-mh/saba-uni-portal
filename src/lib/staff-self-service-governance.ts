/**
 * PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F
 * Typed, RPC-only client boundary for reports, read-only integration
 * provenance, AAL2 state and the redacted unified audit feed.
 */

import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toSafeReadError } from "@/lib/staff-self-service-read";

export const STAFF_SELF_SERVICE_GOVERNANCE_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_GOVERNANCE_02F";

export const governanceForbiddenFields = [
  "metadata",
  "reason",
  "payload",
  "verification_token",
  "verification_token_digest",
  "object_path",
  "certificate_object_path",
  "certificate_sha256",
  "basic_salary",
  "net_amount",
  "external_record_id",
  "endpoint",
  "secret",
] as const;

const rpc = supabase.rpc as unknown as (
  fn: string,
  params: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

async function callRpc<T>(
  fn: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await rpc(fn, params);
  if (error) throw toSafeReadError(error);
  return schema.parse(data);
}

export const governanceCapabilitiesSchema = z.object({
  mfa_verified: z.boolean(),
  can_view_reports: z.boolean(),
  can_export_reports: z.boolean(),
  can_view_integrations: z.boolean(),
  can_view_unified_audit: z.boolean(),
});

export type GovernanceCapabilities = z.infer<
  typeof governanceCapabilitiesSchema
>;

export const NO_GOVERNANCE_CAPABILITIES: GovernanceCapabilities = {
  mfa_verified: false,
  can_view_reports: false,
  can_export_reports: false,
  can_view_integrations: false,
  can_view_unified_audit: false,
};

export async function fetchGovernanceCapabilities() {
  return callRpc(
    "staff_service_get_governance_capabilities",
    {},
    governanceCapabilitiesSchema,
  );
}

const numberLike = z.union([z.number(), z.string()]).transform((value) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error("INVALID_NUMERIC");
  return parsed;
});

export const governanceDepartmentMetricSchema = z.object({
  department_id: z.string().uuid(),
  department_name_ar: z.string().min(1),
  employees: numberLike,
  leave_requests: numberLike,
  approved_leave_requests: numberLike,
  attendance_days: numberLike,
  late_days: numberLike,
  approved_overtime_hours: numberLike,
  completed_training: numberLike,
  finalized_evaluations: numberLike,
  promotions: numberLike,
  active_custody: numberLike,
  open_clearance: numberLike,
});

export const governanceReportSchema = z.object({
  scope: z.enum(["institution", "department"]),
  period_from: z.string().min(1),
  period_to: z.string().min(1),
  departments: z.array(governanceDepartmentMetricSchema),
});

export type GovernanceReport = z.infer<typeof governanceReportSchema>;

export async function fetchGovernanceReport(input: {
  periodFrom: string;
  periodTo: string;
  departmentId?: string | null;
}) {
  return callRpc(
    "staff_service_list_governance_report",
    {
      p_period_from: z.string().min(1).parse(input.periodFrom),
      p_period_to: z.string().min(1).parse(input.periodTo),
      p_department_id: input.departmentId
        ? z.string().uuid().parse(input.departmentId)
        : null,
    },
    governanceReportSchema,
  );
}

export async function recordGovernanceReportExport(input: {
  periodFrom: string;
  periodTo: string;
  departmentId?: string | null;
}) {
  return callRpc(
    "staff_service_record_governance_report_export",
    {
      p_period_from: z.string().min(1).parse(input.periodFrom),
      p_period_to: z.string().min(1).parse(input.periodTo),
      p_department_id: input.departmentId
        ? z.string().uuid().parse(input.departmentId)
        : null,
    },
    z.object({
      recorded: z.literal(true),
      scope: z.enum(["institution", "department"]),
    }),
  );
}

export const integrationProvenanceSchema = z.object({
  source_system: z.enum(["hr", "finance"]),
  has_snapshot: z.boolean(),
  last_synced_at: z.string().nullable(),
});

export type IntegrationProvenance = z.infer<
  typeof integrationProvenanceSchema
>;

export async function fetchOwnIntegrationProvenance() {
  return callRpc(
    "staff_service_get_own_integration_provenance",
    {},
    z.array(integrationProvenanceSchema),
  );
}

export const integrationHealthSchema = z.object({
  source_system: z.enum(["hr", "finance"]),
  records: numberLike,
  last_synced_at: z.string().nullable(),
  stale_records: numberLike,
});

export type IntegrationHealth = z.infer<typeof integrationHealthSchema>;

export async function fetchIntegrationHealth() {
  return callRpc(
    "staff_service_get_integration_health",
    {},
    z.array(integrationHealthSchema),
  );
}

export const governanceAuditEventSchema = z.object({
  source: z.enum(["workflow", "read_side", "value_added", "governance"]),
  module: z.string().min(1),
  subject_id: z.string().uuid().nullable(),
  event_type: z.string().min(1),
  actor_user_id: z.string().uuid().nullable(),
  occurred_at: z.string().min(1),
});

export type GovernanceAuditEvent = z.infer<typeof governanceAuditEventSchema>;

export async function fetchGovernanceAudit(limit = 100) {
  return callRpc(
    "staff_service_list_governance_audit",
    { p_limit: z.number().int().min(1).max(500).parse(limit) },
    z.array(governanceAuditEventSchema),
  );
}
