import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const portal = read("src/components/staff-portal/StaffEmployeePortal.tsx");
const home = read("src/components/staff-portal/StaffEmployeeHome.tsx");
const workspace = read("src/components/student-requests/b1/B1StaffWorkspace.tsx");
const legacyRoute = read("src/routes/staff.b1-requests.tsx");
const ci = read(".github/workflows/ci.yml");

const FORBIDDEN = [/مناقصة/, /المناقصة/, /العطاء/, /tender/i, /\bRFP\b/i, /بيانات تجريبية/];

describe("PORTAL_STAFF_STUDENT_REQUESTS_OPERATIONAL_INTEGRATION_02Q", () => {
  test("workspace supports an embedded mode without a nested <main> or duplicate header", () => {
    expect(workspace).toContain("embedded = false");
    expect(workspace).toContain('embedded ? "section" : "main"');
    expect(workspace).toContain("{!embedded && (");
    // No unconditional <main> wrapper remains; the standalone route keeps it.
    expect(workspace).not.toContain("<main\n");
    expect(workspace).not.toMatch(/<main\s+dir=/);
    // Portal mounts the embedded variant.
    expect(portal).toContain("<B1StaffWorkspace embedded />");
  });

  test("workspace exposes an operational bar with real counts and a real refresh", () => {
    expect(workspace).toContain('data-testid="b1-ops-bar"');
    expect(workspace).toContain("الطلبات المسندة:");
    expect(workspace).toContain("تتطلب إجراءً:");
    expect(workspace).toContain("تأكيد رسوم:");
    expect(workspace).toContain('"confirm_payment"');
    expect(workspace).toContain("تحديث الطلبات المسندة");
    // Refresh re-reads the inbox — no optimistic counter mutation.
    expect(workspace).toContain("await loadInbox();");
  });

  test("workspace adds safe local search and an authorized-derived service filter", () => {
    expect(workspace).toContain('data-testid="b1-inbox-filters"');
    expect(workspace).toContain('aria-label="بحث في الطلبات المسندة"');
    expect(workspace).toContain('aria-label="تصفية حسب الخدمة"');
    expect(workspace).toContain("row.requestNumber");
    expect(workspace).toContain("row.studentNameAr");
    expect(workspace).toContain("row.studentNumber");
    expect(workspace).toContain("row.serviceTitleAr");
    expect(workspace).toContain("serviceOptions");
    // Clear no-search-results state.
    expect(workspace).toContain("لا توجد نتائج مطابقة");
  });

  test("request cards are RTL/mobile friendly with aria-label and aria-current", () => {
    expect(workspace).toContain('aria-current={selectedId === request.requestId ? "true" : undefined}');
    expect(workspace).toContain("aria-label={`طلب ${request.requestNumber}");
    expect(workspace).toContain('dir="rtl"');
  });

  test("post-action refresh invalidates the shared count cache from the trusted source", () => {
    expect(workspace).toContain("B1_ASSIGNED_REQUESTS_QUERY_KEY");
    expect(workspace).toContain('queryClient.invalidateQueries({ queryKey: B1_ASSIGNED_REQUESTS_QUERY_KEY })');
    expect(workspace).toContain('["b1-assigned-requests"]');
  });

  test("home shows the assigned-requests card from the same source and an attention alert", () => {
    expect(home).toContain("B1_ASSIGNED_REQUESTS_QUERY_KEY");
    expect(home).toContain("getB1UiAdapter().getAssignedB1Requests()");
    expect(home).toContain("طلبات طلابية مسندة");
    expect(home).toContain('onOpen("student-requests")');
    expect(home).toContain("طلبات طلابية مسندة إليك");
    // Loading/error are folded into page state without a fake number.
    expect(home).toContain("assignedStudentRequests.isError");
    expect(home).toContain("assignedStudentRequests.isLoading");
    // Quick action preserved.
    expect(home).toContain('"معالجة الطلبات الطلابية", "student-requests"');
  });

  test("portal navigation shows a count badge sharing the same query cache", () => {
    expect(portal).toContain('data-testid="b1-assigned-nav-badge"');
    expect(portal).toContain("B1_ASSIGNED_REQUESTS_QUERY_KEY");
    expect(portal).toContain("getB1UiAdapter().getAssignedB1Requests()");
    expect(portal).toContain('item.id === "student-requests"');
  });

  test("preserves the legacy route and the backend-authoritative adapter contract", () => {
    expect(legacyRoute).toContain('createFileRoute("/staff/b1-requests")');
    expect(legacyRoute).toContain("component: B1StaffWorkspace");
    expect(workspace).toContain("getAssignedB1Requests");
    expect(workspace).toContain("getAssignedB1RequestDetails");
    expect(workspace).toContain("actOnB1RequestStep");
    expect(workspace).toContain("confirmB1RevenueReceipt");
    expect(workspace).toContain("details.allowedAction");
    // No React component imports Supabase directly.
    for (const source of [portal, home, workspace]) {
      expect(source).not.toMatch(/from\s+["'][^"']*supabase/i);
    }
  });

  test("keeps the Docker-backed PG17 closure gate active for every pull request", () => {
    expect(ci).toContain("pull_request:");
    expect(ci).toContain('- "tests/**"');
    expect(ci).toContain("docker pull postgres:17");
    expect(ci).toContain("docker image inspect postgres:17");
    expect(ci).toContain("Run all bun test suites (fail-closed)");
    expect(ci).toContain('bun test "${TEST_FILES[@]}"');
    expect(ci).toMatch(/services:\\n\\s+postgres:\\n\\s+image: postgres:17/);
  });

  test("no tender references or demo-data wording in the integrated surfaces", () => {
    for (const source of [portal, home, workspace]) {
      for (const pattern of FORBIDDEN) {
        expect(source).not.toMatch(pattern);
      }
    }
  });
});
