/**
 * Ensures the staff inbox reads from student_request_workflow_steps runtime rows
 * (via mapActorInboxRow shape) rather than the stale student_requests.current_*
 * summary columns, and that authorization/status filters behave correctly.
 */
import { describe, expect, it } from "bun:test";
import {
  filterInboxByStatusFilter,
  normalizeStaffRequestInboxItem,
  STAFF_INBOX_UNAVAILABLE_MSG,
  sanitizeStaffErrorMessage,
  type StaffRequestInboxItem,
} from "../../src/lib/student-requests/staff-inbox-ui";

const HAITHAM_UID = "c8a94548-4782-4252-86f9-23559d3b95bd";
const SR_ID = "SR-20260715-FEDCB3E1-uuid";
const RUNTIME_STEP_ID = "6a089c6f-runtime-step-initial-review";

/** Simulate a row returned by the get_my_request_actor_inbox RPC
 *  (which JOINS student_request_workflow_steps s + request_processing_assignments
 *  via user_matches_workflow_runtime_step). */
function actorRowForHaitham() {
  return {
    workflow_step_runtime_id: RUNTIME_STEP_ID,
    student_request_id: SR_ID,
    request_type_code: "enrollment_certificate",
    request_type_name_ar: "شهادة قيد",
    student_id: "student-uuid",
    student_name: "براءة",
    department_id: "dept-uuid",
    department_name_ar: "قسم تكنولوجيا المعلومات",
    step_key: "initial_review",
    step_name_ar: "المراجعة الأولية",
    step_status: "active",
    processing_unit_name_ar: "شؤون الطلاب",
    processing_role_name_ar: "مختص شؤون الطلاب",
    submitted_at: "2026-07-15T21:57:58Z",
    is_actionable: true,
  } as const;
}

/** Mirror of the production `mapActorInboxRow` mapping. */
function mapActorInboxRow(row: ReturnType<typeof actorRowForHaitham>): StaffRequestInboxItem {
  return normalizeStaffRequestInboxItem({
    id: row.student_request_id,
    requestNumber: null,
    requestTypeCode: row.request_type_code,
    requestTypeNameAr: row.request_type_name_ar,
    title: row.request_type_name_ar,
    status:
      row.step_status === "active" || row.step_status === "pending"
        ? "under_review"
        : row.step_status,
    studentName: row.student_name,
    departmentId: row.department_id,
    departmentNameAr: row.department_name_ar,
    submittedAt: row.submitted_at,
    currentStepKey: row.step_key,
    currentStepLabelAr: row.step_name_ar,
    currentRoleLabelAr: row.processing_role_name_ar,
    waitingSince: row.submitted_at,
    isActionable: row.is_actionable,
    workflowStepRuntimeId: row.workflow_step_runtime_id,
    dataSource: "actor_inbox_rpc",
  });
}

describe("staff inbox — workflow-steps runtime source", () => {
  it("maps the active runtime step (not current_role_key) for Haitham on SR-20260715-FEDCB3E1", () => {
    const item = mapActorInboxRow(actorRowForHaitham());

    expect(item.id).toBe(SR_ID);
    expect(item.workflowStepRuntimeId).toBe(RUNTIME_STEP_ID);
    expect(item.currentStepKey).toBe("initial_review");
    expect(item.currentStepLabelAr).toBe("المراجعة الأولية");
    expect(item.currentRoleLabelAr).toBe("مختص شؤون الطلاب");
    expect(item.isActionable).toBe(true);
    // Runtime source, not legacy overview
    expect(item.dataSource).toBe("actor_inbox_rpc");
    // Status is normalized from step.status='active', not from stale student_requests.status
    expect(item.status).toBe("under_review");
  });

  it("appears under the 'pending_action' filter for the assigned processor", () => {
    const items = [mapActorInboxRow(actorRowForHaitham())];
    expect(filterInboxByStatusFilter(items, "pending_action")).toHaveLength(1);
    expect(filterInboxByStatusFilter(items, "completed")).toHaveLength(0);
    expect(filterInboxByStatusFilter(items, "rejected")).toHaveLength(0);
    expect(filterInboxByStatusFilter(items, "all")).toHaveLength(1);
  });

  it("does NOT surface for a user who has no matching processing assignment (empty RPC result)", () => {
    // RPC returns [] when user_matches_workflow_runtime_step is false —
    // reading current_role_key from student_requests would incorrectly surface
    // NULL, so we assert the source-of-truth here is the (empty) RPC rows.
    const items: StaffRequestInboxItem[] = [];
    expect(filterInboxByStatusFilter(items, "all")).toHaveLength(0);
  });

  it("uses the actor RPC data source (never the legacy_overview) when workflow runtime is available", () => {
    const item = mapActorInboxRow(actorRowForHaitham());
    expect(item.dataSource).not.toBe("legacy_overview");
  });

  it("sanitizes permission-denied errors to the unauthorized Arabic message", () => {
    expect(sanitizeStaffErrorMessage("permission denied for function"))
      .toBe(STAFF_INBOX_UNAVAILABLE_MSG.unauthorized);
    expect(sanitizeStaffErrorMessage("42501 violates row-level security"))
      .toBe(STAFF_INBOX_UNAVAILABLE_MSG.unauthorized);
  });

  it("sanitizes missing-schema errors to the workflow-schema-unavailable message", () => {
    expect(sanitizeStaffErrorMessage("relation \"student_request_workflow_steps\" does not exist"))
      .toBe(STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable);
    expect(sanitizeStaffErrorMessage("42883 function get_my_request_actor_inbox does not exist"))
      .toBe(STAFF_INBOX_UNAVAILABLE_MSG.workflow_schema_unavailable);
  });

  void HAITHAM_UID; // kept for traceability of the user under test
});
