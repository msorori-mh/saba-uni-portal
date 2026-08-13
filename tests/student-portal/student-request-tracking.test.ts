/**
 * Source-level guards for the student-portal request tracking + fee
 * notification changes.
 *
 * Scope: no DB, no RPC calls. We assert the shape of the server-fn
 * modules and the routes to lock in:
 *
 *  1. The student detail page reads the workflow timeline from
 *     `student_request_workflow_steps` (via a new server fn) and NOT the
 *     legacy `student_service_request_steps` / `current_role_key`.
 *  2. The fee summary comes from `student_request_fee_assessments` and
 *     surfaces `requiresPayment` when amount > 0 and status is not paid.
 *  3. `assessStudentRequestFee` emits ONE notification (idempotent) only
 *     when the fee amount is > 0. Amount == 0 never notifies.
 *  4. Ownership is enforced via student_profiles.user_id === auth.uid()
 *     for every student-scoped read; unassigned data cannot leak.
 *  5. The list page renders the current stage from workflow_steps + fee
 *     status, not `current_role_key`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const TRACKING_SRC = readFileSync(
  join(ROOT, "src/lib/student-requests/student-tracking.functions.ts"),
  "utf-8",
);
const FEE_SRC = readFileSync(
  join(ROOT, "src/lib/student-request-fee.functions.ts"),
  "utf-8",
);
const DETAIL_ROUTE_SRC = readFileSync(
  join(ROOT, "src/components/student-requests/StudentRequestDetailsScreen.tsx"),
  "utf-8",
);
const LIST_ROUTE_SRC = readFileSync(
  join(ROOT, "src/routes/student.requests.index.tsx"),
  "utf-8",
);

describe("student tracking fns — workflow timeline", () => {
  it("exports getStudentRequestWorkflowTimelineForStudent under requireSupabaseAuth", () => {
    expect(TRACKING_SRC).toMatch(
      /export\s+const\s+getStudentRequestWorkflowTimelineForStudent\s*=\s*createServerFn/,
    );
    expect(TRACKING_SRC).toMatch(/\.middleware\(\[requireSupabaseAuth\]\)/);
  });

  it("reads from student_request_workflow_steps (not the legacy service-request steps table)", () => {
    expect(TRACKING_SRC).toMatch(/from\(\s*["']student_request_workflow_steps["']\s*\)/);
    expect(TRACKING_SRC).not.toMatch(/student_service_request_steps/);
  });

  it("projects ONLY student-safe columns (no actor / assignee identifiers)", () => {
    const selectMatch = TRACKING_SRC.match(
      /from\(\s*["']student_request_workflow_steps["']\s*\)[\s\S]*?\.select\(\s*"([^"]+)"/,
    );
    expect(selectMatch).not.toBeNull();
    const cols = selectMatch![1];
    // Allowed columns only.
    for (const forbidden of [
      "assigned_user_id",
      "assigned_staff_profile_id",
      "assigned_faculty_profile_id",
      "assigned_position_assignment_id",
      "processing_unit_id",
      "processing_role_id",
      "completed_by",
    ]) {
      expect(cols).not.toContain(forbidden);
    }
    // Required columns present.
    for (const needed of ["step_key", "step_name_ar", "step_order", "status", "entered_at", "completed_at"]) {
      expect(cols).toContain(needed);
    }
  });

  it("asserts ownership via student_profiles.user_id === context.userId before reading", () => {
    expect(TRACKING_SRC).toMatch(
      /assertStudentOwnsRequest[\s\S]*?student_profiles!inner\(user_id\)/,
    );
    expect(TRACKING_SRC).toMatch(/ownerUserId\s*!==\s*userId/);
    expect(TRACKING_SRC).toMatch(/غير مصرح/);
  });

  it("does NOT rely on legacy current_role_key / current_step_index columns", () => {
    expect(TRACKING_SRC).not.toMatch(/current_role_key/);
    expect(TRACKING_SRC).not.toMatch(/current_step_index/);
  });
});

describe("student tracking fns — fee summary", () => {
  it("exports getStudentRequestFeeSummaryForStudent under requireSupabaseAuth", () => {
    expect(TRACKING_SRC).toMatch(
      /export\s+const\s+getStudentRequestFeeSummaryForStudent\s*=\s*createServerFn/,
    );
  });

  it("reads from student_request_fee_assessments and excludes cancelled assessments", () => {
    expect(TRACKING_SRC).toMatch(/from\(\s*["']student_request_fee_assessments["']/);
    expect(TRACKING_SRC).toMatch(/\.neq\(\s*["']payment_status["']\s*,\s*["']cancelled["']\)/);
  });

  it("computes requiresPayment only when status is pending_payment AND amount > 0", () => {
    expect(TRACKING_SRC).toMatch(
      /requiresPayment:\s*status\s*===\s*["']pending_payment["']\s*&&\s*amount\s*>\s*0/,
    );
  });
});

describe("assessStudentRequestFee — fee notification", () => {
  it("inserts a notification via supabaseAdmin only when amount > 0", () => {
    expect(FEE_SRC).toMatch(/insertFeeAssessmentNotificationIfMissing/);
    // The helper's early-return guard checks amount > 0.
    expect(FEE_SRC).toMatch(/if\s*\(\s*!\s*\(\s*params\.amount\s*>\s*0\s*\)\s*\)/);
  });

  it("skips insert when the amount is zero (returns skippedReason='amount_zero')", () => {
    expect(FEE_SRC).toMatch(/skippedReason:\s*["']amount_zero["']/);
  });

  it("is idempotent — pre-checks existing notifications by (user_id, notification_type, reference_id)", () => {
    const start = FEE_SRC.indexOf("async function insertFeeAssessmentNotificationIfMissing");
    const end = FEE_SRC.indexOf("function formatFeeAmount", start) >= 0
      ? FEE_SRC.indexOf("export const assessStudentRequestFee", start)
      : FEE_SRC.length;
    const helperBlock = start >= 0 ? FEE_SRC.slice(start, end > start ? end : FEE_SRC.length) : "";
    expect(helperBlock).not.toEqual("");
    // Pre-check query fingerprint
    expect(helperBlock).toMatch(/from\(\s*["']notifications["']\s*\)/);
    expect(helperBlock).toMatch(/\.eq\(\s*["']user_id["']\s*,\s*ownerUserId\)/);
    expect(helperBlock).toMatch(/\.eq\(\s*["']notification_type["']\s*,\s*FEE_NOTIFICATION_TYPE\)/);
    expect(helperBlock).toMatch(/\.eq\(\s*["']reference_id["']\s*,\s*params\.requestId\)/);
    // Skip path
    expect(helperBlock).toMatch(/skippedReason:\s*["']already_notified["']/);
  });

  it("references the request via reference_type='student_request' + reference_id=<requestId>", () => {
    expect(FEE_SRC).toMatch(/FEE_NOTIFICATION_REF_TYPE\s*=\s*["']student_request["']/);
    expect(FEE_SRC).toMatch(/reference_type:\s*FEE_NOTIFICATION_REF_TYPE/);
    expect(FEE_SRC).toMatch(/reference_id:\s*params\.requestId/);
  });

  it("includes request number and amount in the message", () => {
    expect(FEE_SRC).toMatch(/الطلب \$\{requestLabel\}/);
    expect(FEE_SRC).toMatch(/مطلوب سداد مبلغ \$\{amountLabel\}/);
  });

  it("is called from assessStudentRequestFee AFTER a successful RPC result", () => {
    const handlerBlock =
      FEE_SRC.match(
        /assessStudentRequestFee[\s\S]*?insertFeeAssessmentNotificationIfMissing[\s\S]*?return\s*\{/,
      )?.[0] ?? "";
    expect(handlerBlock).not.toEqual("");
    // Notification must be after the raw.success check.
    expect(handlerBlock).toMatch(/if\s*\(!raw\.success\)[\s\S]*?insertFeeAssessmentNotificationIfMissing/);
  });

  it("does not throw if the notification insert fails (fee assessment stays committed)", () => {
    expect(FEE_SRC).toMatch(/try\s*\{[\s\S]*?insertFeeAssessmentNotificationIfMissing[\s\S]*?\}\s*catch/);
  });
});

describe("student detail page — reads new sources", () => {
  it("uses the new workflow-timeline server fn (not the legacy steps table)", () => {
    expect(DETAIL_ROUTE_SRC).toMatch(/getStudentRequestWorkflowTimelineForStudent/);
    expect(DETAIL_ROUTE_SRC).toMatch(/getStudentRequestFeeSummaryForStudent/);
    // Legacy per-step render block is gone.
    expect(DETAIL_ROUTE_SRC).not.toMatch(/step\.step_title_ar/);
    expect(DETAIL_ROUTE_SRC).not.toMatch(/step\.role_key/);
  });

  it("renders a testable timeline element and a fee section component", () => {
    expect(DETAIL_ROUTE_SRC).toMatch(/data-testid="student-workflow-timeline"/);
    expect(DETAIL_ROUTE_SRC).toMatch(/<FeeStatusSection\s+fee=\{fee\}\s*\/>/);
  });

  it("surfaces the mandatory Arabic payment alert copy when amount>0 & unpaid", () => {
    expect(DETAIL_ROUTE_SRC).toMatch(/مطلوب سداد رسوم الطلب/);
    expect(DETAIL_ROUTE_SRC).toMatch(/مطلوب سداد مبلغ/);
    expect(DETAIL_ROUTE_SRC).toMatch(/خارج البوابة/);
  });

  it("never renders staff / assignee identifiers to the student", () => {
    expect(DETAIL_ROUTE_SRC).not.toMatch(/assigned_user_id/);
    expect(DETAIL_ROUTE_SRC).not.toMatch(/completed_by/);
    expect(DETAIL_ROUTE_SRC).not.toMatch(/staff_profile_id/);
    expect(DETAIL_ROUTE_SRC).not.toMatch(/faculty_profile_id/);
  });
});

describe("student list page — uses enriched progress fn", () => {
  it("switches from getMyStudentServiceRequests to getMyStudentRequestsWithProgress", () => {
    expect(LIST_ROUTE_SRC).toMatch(/getMyStudentRequestsWithProgress/);
    expect(LIST_ROUTE_SRC).not.toMatch(/getMyStudentServiceRequests/);
  });

  it("displays current stage from workflow_steps and fee status, not current_role_key", () => {
    expect(LIST_ROUTE_SRC).toMatch(/request\.currentStageAr/);
    expect(LIST_ROUTE_SRC).toMatch(/formatFeeShort\(request\.fee\)/);
    expect(LIST_ROUTE_SRC).not.toMatch(/formatStudentCurrentProcessingUnitLabel/);
    expect(LIST_ROUTE_SRC).not.toMatch(/current_role_key/);
  });

  it("enriched fn scopes reads to caller — uses rpcGetMyStudentRequests (auth.uid()-scoped) as source-of-truth", () => {
    expect(TRACKING_SRC).toMatch(
      /getMyStudentRequestsWithProgress[\s\S]*?rpcGetMyStudentRequests\(context\.supabase\)/,
    );
  });
});
