import { describe, expect, test } from "bun:test";
import { assignedStudentRequestCount } from "../../src/lib/student-requests/assigned-inbox-count";
import type { FetchStaffInboxResult } from "../../src/lib/student-requests/staff-inbox.functions";

function result(overrides: Partial<FetchStaffInboxResult>): FetchStaffInboxResult {
  return {
    available: true,
    items: [],
    reason: null,
    messageAr: null,
    workflowRuntimeAvailable: true,
    dataSource: "actor_inbox_rpc",
    ...overrides,
  };
}

describe("assigned student services count", () => {
  test("includes a certificate assigned in the actor inbox", () => {
    const certificate = { id: "request-1", requestTypeCode: "enrollment_certificate" };
    expect(assignedStudentRequestCount(result({ items: [certificate] as FetchStaffInboxResult["items"] }))).toBe(1);
  });

  test("returns zero for a user with no active processing assignment", () => {
    expect(assignedStudentRequestCount(result({ available: false, reason: "unauthorized" }))).toBe(0);
  });

  test("never presents an RPC failure or admin fallback as an empty inbox", () => {
    expect(assignedStudentRequestCount(result({ reason: "error", items: [] }))).toBeNull();
    expect(assignedStudentRequestCount(result({ dataSource: "legacy_overview", items: [] }))).toBeNull();
  });
});
