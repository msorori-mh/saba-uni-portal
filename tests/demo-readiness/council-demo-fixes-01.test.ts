import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { buildB1StepUpPayload } from "../../src/lib/student-requests/student-request-submit-contract";
import { hashStepUpPayload } from "../../src/lib/security/step-up-contract";
import { canAccessAdminRoute } from "../../src/lib/admin-nav";

const read = (p: string) => readFileSync(p, "utf8");
const A = "00000000-0000-4000-8000-00000000000b";
const B = "00000000-0000-4000-8000-00000000000a";

describe("1) step-up payload single source", () => {
  it("legacy stored code absence_excuse normalizes to excused_absence", () => {
    expect(buildB1StepUpPayload("r", "absence_excuse", { excuse_documents: [A] }).canonicalCode).toBe("excused_absence");
  });
  it("attachment ids come from form_data, sorted", () => {
    expect(buildB1StepUpPayload("r", "excused_absence", { excuse_documents: [A, B] }).attachmentIds).toEqual([B, A]);
  });
  it("legacy and canonical stored codes produce the same hash", async () => {
    const fd = { excuse_documents: [A] };
    expect(await hashStepUpPayload(buildB1StepUpPayload("r", "absence_excuse", fd)))
      .toBe(await hashStepUpPayload(buildB1StepUpPayload("r", "excused_absence", fd)));
  });
  it("issuer and submit caller both use the shared builder; legacy table read removed", () => {
    const issuer = read("src/lib/security/device-trust.functions.ts");
    expect(issuer.match(/buildB1StepUpPayload\(/g)?.length).toBe(2);
    expect(issuer).not.toContain('from("student_request_attachments")');
    expect(read("src/lib/student-requests/b1-ui/b1-ui.functions.ts")).toContain("hashStepUpPayload(buildB1StepUpPayload(");
  });
});

describe("2) finance officer processing inbox", () => {
  it("finance_officer still has no access to /admin/student-requests", () => {
    expect(canAccessAdminRoute("/admin/student-requests", ["finance_officer"])).toBe(false);
  });
  it("staff processing page is gated by an active processing assignment", () => {
    const src = read("src/routes/staff.processing-requests.tsx");
    expect(src).toContain("hasActiveProcessingAssignment");
    expect(src).toContain("data.hasAssignment || data.isAdmin");
  });
});

describe("3) enrollment certificate number", () => {
  it("PDF uses the reserved final number, never PENDING", () => {
    const src = read("src/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions.ts");
    expect(src).not.toContain("PENDING-");
    expect(src.indexOf("reserve_enrollment_certificate_document_number")).toBeLessThan(src.indexOf("buildEnrollmentCertificatePdfBytes({"));
  });
  it("issue button invalidates the inbox detail key", () => {
    const src = read("src/components/student-requests/EnrollmentCertificateIssueButton.tsx");
    expect(src).toContain('["staff-inbox-detail", props.requestId]');
    expect(src).not.toContain("staff-request-detail");
  });
});

describe("4/5) narrow name reads", () => {
  it("faculty grades use get_section_student_names instead of a student_profiles embed", () => {
    const src = read("src/components/portal/FacultyGradesManager.tsx");
    expect(src).toContain("get_section_student_names");
    expect(src).not.toContain("student_profiles(");
  });
  for (const p of ["src/routes/student.schedule.tsx", "src/routes/mobile.student.schedule.tsx", "src/routes/student.index.tsx"]) {
    it(`${p} reads lecturer names via get_my_section_faculty_names`, () => {
      const src = read(p);
      expect(src).not.toContain("faculty_profiles(");
      expect(src).toContain("fetchMySectionFacultyNames");
    });
  }
});
