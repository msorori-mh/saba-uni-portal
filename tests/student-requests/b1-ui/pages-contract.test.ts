import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { B1_CANONICAL_CODES } from "@/lib/student-requests/request-service-adapter";
import { getStudentRequestFormDefinition } from "@/lib/student-requests/request-form-registry";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const studentForm = read("src/components/student-requests/b1/B1StudentRequestForm.tsx");
const serviceList = read("src/components/student-requests/b1/B1StudentServiceList.tsx");
const staff = read("src/components/student-requests/b1/B1StaffWorkspace.tsx");
const revenue = read("src/components/student-requests/b1/B1RevenueReceiptCard.tsx");
const studentRoute = read("src/routes/student.requests.b1.$service.tsx");
const staffRoute = read("src/routes/staff.b1-requests.tsx");

describe("B1 student pages contract", () => {
  it("supports exactly the five frozen form definitions through one shared form", () => {
    expect(B1_CANONICAL_CODES).toEqual([
      "enrollment_suspension",
      "excused_absence",
      "department_transfer",
      "final_chance",
      "file_withdrawal",
    ]);
    for (const code of B1_CANONICAL_CODES) {
      expect(getStudentRequestFormDefinition(code)).toBeDefined();
    }
    expect(studentForm).toContain("validateB1FormValues(serviceCode, validationValues)");
    expect(studentForm).toContain("B1SubmissionConfirmation");
    expect(studentForm).toContain("B1AttachmentUploader");
  });

  it("hides unavailable services and gates direct routes through the adapter", () => {
    expect(serviceList).toContain("row.studentVisible && row.runtimeAvailable");
    expect(studentForm).toContain("item.studentVisible && item.runtimeAvailable");
    expect(studentRoute).toContain("isB1ServiceCode(service)");
  });

  it("implements draft save, stale-safe submit and a double-submit lock", () => {
    expect(studentForm).toContain("saveB1RequestDraft");
    expect(studentForm).toContain("saved.updatedAt");
    expect(studentForm).toContain("submitLock.current");
    expect(studentForm).toContain('setSaveState("save_failed")');
  });

  it("keeps the enrollment certificate route untouched by B1 routing", () => {
    expect(studentRoute).not.toContain("enrollment_certificate");
    expect(read("src/lib/student-requests/request-form-registry.ts")).toContain(
      'code: "enrollment_certificate"',
    );
  });
});

describe("B1 staff pages contract", () => {
  it("provides assigned inbox, details, timeline and adapter-only actions", () => {
    expect(staff).toContain("getAssignedB1Requests");
    expect(staff).toContain("getAssignedB1RequestDetails");
    expect(staff).toContain("B1WorkflowTimeline");
    expect(staff).toContain("B1EmployeeActionPanel");
    expect(staffRoute).toContain('createFileRoute("/staff/b1-requests")');
    expect(staff).not.toMatch(/from\s+["'][^"']*supabase/i);
  });

  it("re-reads inbox and details after success with no optimistic mutation", () => {
    expect(staff).toContain("refreshAfterAction");
    expect(staff).toContain("await loadInbox()");
    expect(staff).toContain("await adapter.getAssignedB1RequestDetails");
  });

  it("renders the dedicated revenue card as the only payment action", () => {
    expect(staff).toContain('details.allowedAction === "confirm_payment"');
    expect(staff).toContain("B1RevenueReceiptCard");
    expect(revenue.match(/تأكيد استلام الرسوم/g)?.length).toBeGreaterThanOrEqual(2);
    expect(revenue).toContain("onConfirm(stepId, note.trim() || undefined)");
  });

  it("contains no financial fields, actor or timestamp payloads", () => {
    const forbidden =
      /\b(amount|currency|invoice|gateway|wallet|balance|confirmed_by|confirmed_at)\b/i;
    expect(revenue).not.toMatch(forbidden);
    expect(staff).not.toMatch(forbidden);
  });

  it("uses RTL, responsive grids and accessible error states", () => {
    expect(studentForm).toContain('dir="rtl"');
    expect(studentForm).toContain("sm:grid-cols-2");
    expect(staff).toContain('dir="rtl"');
    expect(staff).toContain("lg:grid-cols-");
    expect(revenue).toContain('role="alert"');
  });
});
