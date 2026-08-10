/**
 * Server-side preflight: verify the service-specific `*_details` row exists
 * before any forward B1 staff action reaches the atomic RPC.
 *
 * Read-only (admin read for a single existence check); never writes.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeStudentRequestTypeCode } from "@/lib/student-requests/request-type-registry";
import {
  b1ActionRequiresDetails,
  buildB1DetailsPreflightMessage,
  getB1DetailsTableSpec,
} from "@/lib/student-requests/b1-details-preflight";

/**
 * Read-only probe: reports whether the service details row exists for the
 * request owning `stepId`. Never throws for a missing row.
 */
export async function inspectB1DetailsRowForStep(params: { stepId: string }): Promise<{
  ready: boolean;
  table: string | null;
  serviceLabelAr: string | null;
  requestNumber: string | null;
  messageAr: string | null;
}> {
  const { data: stepRow, error: stepErr } = await supabaseAdmin
    .from("student_request_workflow_steps")
    .select("id, student_request_id, request:student_requests!inner(id, request_type, request_number)")
    .eq("id", params.stepId)
    .maybeSingle();
  if (stepErr) throw new Error(stepErr.message);
  if (!stepRow) throw new Error("B1_ACTIVE_STEP_REQUIRED");

  const request =
    (stepRow as {
      request?: { id?: string | null; request_type?: string | null; request_number?: string | null } | null;
    }).request ?? null;
  const requestId =
    request?.id ?? (stepRow as { student_request_id?: string | null }).student_request_id ?? null;
  if (!requestId) throw new Error("B1_ACTIVE_STEP_REQUIRED");

  const canonical = normalizeStudentRequestTypeCode(request?.request_type ?? null);
  const spec = getB1DetailsTableSpec(canonical);
  const requestNumber = request?.request_number ? String(request.request_number) : null;
  if (!spec) {
    return { ready: true, table: null, serviceLabelAr: null, requestNumber, messageAr: null };
  }

  const { data: detailRow, error: detailErr } = await supabaseAdmin
    .from(spec.table as never)
    .select("id")
    .eq(spec.requestColumn, requestId)
    .maybeSingle();
  if (detailErr) throw new Error(detailErr.message);

  if (detailRow) {
    return {
      ready: true,
      table: spec.table,
      serviceLabelAr: spec.serviceLabelAr,
      requestNumber,
      messageAr: null,
    };
  }

  return {
    ready: false,
    table: spec.table,
    serviceLabelAr: spec.serviceLabelAr,
    requestNumber,
    messageAr: buildB1DetailsPreflightMessage({ spec, requestNumber, actionLabelAr: null }),
  };
}

/**
 * Throws an explicit Arabic error when the request's details row is missing.
 * No-op for non-B1 requests and for `return` / `reject` actions.
 */
export async function assertB1DetailsRowPresentForStep(params: {
  stepId: string;
  action: string;
  actionLabelAr?: string | null;
}): Promise<void> {
  if (!b1ActionRequiresDetails(params.action)) return;

  const { data: stepRow, error: stepErr } = await supabaseAdmin
    .from("student_request_workflow_steps")
    .select("id, student_request_id, request:student_requests!inner(id, request_type, request_number)")
    .eq("id", params.stepId)
    .maybeSingle();
  if (stepErr) throw new Error(stepErr.message);
  if (!stepRow) throw new Error("B1_ACTIVE_STEP_REQUIRED");

  const request =
    (stepRow as {
      request?: { id?: string | null; request_type?: string | null; request_number?: string | null } | null;
    }).request ?? null;
  const requestId = request?.id ?? (stepRow as { student_request_id?: string | null }).student_request_id ?? null;
  if (!requestId) throw new Error("B1_ACTIVE_STEP_REQUIRED");

  const canonical = normalizeStudentRequestTypeCode(request?.request_type ?? null);
  const spec = getB1DetailsTableSpec(canonical);
  if (!spec) return; // not a B1 service — nothing to preflight

  const { data: detailRow, error: detailErr } = await supabaseAdmin
    .from(spec.table as never)
    .select("id")
    .eq(spec.requestColumn, requestId)
    .maybeSingle();
  if (detailErr) throw new Error(detailErr.message);

  if (!detailRow) {
    throw new Error(
      buildB1DetailsPreflightMessage({
        spec,
        requestNumber: request?.request_number ?? null,
        actionLabelAr: params.actionLabelAr ?? null,
      }),
    );
  }
}
