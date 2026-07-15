/**
 * Guards that the staff inbox surfaces only runtime steps with status='active'
 * for the current user, never 'pending' (upcoming) steps.
 *
 * Motivation: Haitham (student_affairs specialist) is assigned to both
 * `initial_review` (step_order=1) and `document_issuance` (step_order=6) via
 * request_processing_assignments. Without an explicit status filter, the
 * `get_my_request_actor_inbox` RPC defaults to ['pending','active'] and would
 * show `document_issuance` for SR-20260715-FEDCB3E1 (and for the untouched
 * request 93807768-a281-42de-bfb4-0c0c03786b20) long before that step is
 * activated. The staff-inbox server fn must pin `status: ['active']`.
 */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const SOURCE = readFileSync(
  join(ROOT, "src/lib/student-requests/staff-inbox.functions.ts"),
  "utf-8",
);

describe("staff inbox — active-only status filter", () => {
  it("pins rpcFilters.status to ['active'] before calling get_my_request_actor_inbox", () => {
    // Whitespace-tolerant match for: status: ["active"]
    const activeOnly = /status\s*:\s*\[\s*["']active["']\s*\]/;
    expect(SOURCE).toMatch(activeOnly);
  });

  it("does NOT leave rpcFilters empty (which would default to pending+active on the server)", () => {
    // The old bug: `const rpcFilters: Record<string, unknown> = {};`
    const emptyInit = /const\s+rpcFilters\s*:\s*Record<[^>]+>\s*=\s*\{\s*\}\s*;/;
    expect(SOURCE).not.toMatch(emptyInit);
  });

  it("does not include 'pending' in the initial status filter set", () => {
    // Make sure nobody widens the default status filter back.
    const initBlock = SOURCE.match(
      /const\s+rpcFilters[^;]*;\s*(?:if[^\n]*\n\s*)*/,
    )?.[0] ?? "";
    expect(initBlock).not.toMatch(/["']pending["']/);
  });
});

describe("staff inbox — client-side status filter mapping", () => {
  it("maps runtime 'active' step_status onto 'under_review' so the pending_action filter shows it", async () => {
    const { normalizeStaffRequestInboxItem, filterInboxByStatusFilter } =
      await import("../../src/lib/student-requests/staff-inbox-ui");

    // Simulate the two runtime rows Haitham is joined to.
    const active = normalizeStaffRequestInboxItem({
      id: "SR-FEDCB3E1",
      requestTypeCode: "enrollment_certificate",
      status: "under_review", // active → under_review (see mapActorInboxRow)
      currentStepKey: "initial_review",
      isActionable: true,
      workflowStepRuntimeId: "runtime-initial-review",
      dataSource: "actor_inbox_rpc",
    });

    // If the server ever leaked a 'pending' step through, it would still
    // normalize to a non-actionable row we must NOT count as pending_action.
    const upcoming = normalizeStaffRequestInboxItem({
      id: "SR-FEDCB3E1",
      requestTypeCode: "enrollment_certificate",
      status: "pending",
      currentStepKey: "document_issuance",
      isActionable: false,
      workflowStepRuntimeId: "runtime-document-issuance",
      dataSource: "actor_inbox_rpc",
    });

    const pendingActionOnly = filterInboxByStatusFilter(
      [active, upcoming],
      "pending_action",
    );
    expect(pendingActionOnly.map((i) => i.currentStepKey)).toEqual([
      "initial_review",
    ]);
  });
});
