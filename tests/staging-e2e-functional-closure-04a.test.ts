// STAGING-E2E-FUNCTIONAL-CLOSURE-04A — source-level contract tests.
// No network, no database, no secrets: they read the promoted source files and
// assert the six 04A contracts survive future edits.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf-8");

describe("04A-1 — /messages is profile-bound with a fixed portal home", () => {
  const src = read("src/routes/messages.tsx");

  it("resolves student/faculty/staff profiles in beforeLoad", () => {
    expect(src).toContain('from("student_profiles")');
    expect(src).toContain('from("faculty_profiles")');
    expect(src).toContain('from("staff_profiles")');
  });

  it("exposes a fixed portalHome map instead of history-based back", () => {
    expect(src).toContain("MESSAGES_PORTAL_HOME");
    expect(src).toContain('student: "/student"');
    expect(src).toContain('faculty: "/faculty-portal"');
    expect(src).toContain('staff: "/staff"');
    expect(src).not.toContain("history.back");
    expect(src).not.toContain("useRouter()");
  });

  it("still falls back to the admin route tree for administrative roles", () => {
    expect(src).toContain("firstAccessibleAdminRoute");
    expect(src).toContain('redirect({ to: "/portal-login" })');
  });

  it("04A-R1 — exposes a pure resolveMessagesPortalHome helper", () => {
    expect(src).toContain("export function resolveMessagesPortalHome");
    expect(src).toContain("resolveMessagesPortalHome({");
    expect(src).toContain("hasStudentProfile");
    expect(src).toContain("hasFacultyProfile");
    expect(src).toContain("hasStaffProfile");
  });

  it("04A-R1 — faculty+department_head resolves to the faculty portal before admin", () => {
    const facultyIdx = src.indexOf('return MESSAGES_PORTAL_HOME.faculty;\n  }\n  if (canAccessAdminPanel(roles))');
    expect(facultyIdx).toBeGreaterThan(-1);
    expect(src).toContain('"department_head"');
    expect(src).toContain('"faculty_member"');
    // academic check precedes the admin fallback in the helper body
    const helper = src.slice(src.indexOf("export function resolveMessagesPortalHome"));
    expect(helper.indexOf("MESSAGES_ACADEMIC_ROLES")).toBeLessThan(helper.indexOf("canAccessAdminPanel(roles)"));
    expect(helper.indexOf("canAccessAdminPanel(roles)")).toBeLessThan(helper.indexOf("hasStudentProfile)"));
    expect(helper.indexOf("hasStudentProfile)")).toBeLessThan(helper.lastIndexOf("hasStaffProfile"));
  });
});

describe("04A-2 — server-side send enforcement", () => {
  const authz = read("src/lib/messaging-authz.server.ts");
  const fns = read("src/lib/communications.functions.ts");

  it("shares one authorization module between search and send", () => {
    expect(authz).toContain("export async function resolveMessagingCapability");
    expect(authz).toContain("export async function assertCanSendMessageTo");
    expect(fns).toContain("resolveMessagingCapability");
    expect(fns).toContain("assertCanSendMessageTo");
  });

  it("guards sendMessage before the insert", () => {
    const guardAt = fns.indexOf("assertCanSendMessageTo(userId, data.recipient_user_id)");
    const insertAt = fns.indexOf('from("internal_messages")\n      .insert(');
    expect(guardAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(guardAt);
  });

  it("restricts faculty senders to their own enrolled students", () => {
    expect(authz).toContain("facultyTaughtStudentProfileIds");
    expect(authz).toContain('from("course_sections")');
    expect(authz).toContain('from("student_enrollments")');
    expect(fns).toContain("facultyTaughtStudentProfileIds");
  });

  it("fails closed on lookup errors", () => {
    expect(authz).toContain("failClosed");
    expect(authz).toContain("MESSAGE_SEND_DENIED_AR");
  });
});

describe("04A-3 — staff graduates-affairs link behind a capability probe", () => {
  const src = read("src/components/staff-portal/StaffEmployeePortal.tsx");

  it("probes searchGraduateRecordsFn before showing the link", () => {
    expect(src).toContain("searchGraduateRecordsFn");
    expect(src).toContain("graduates-affairs-capability");
    expect(src).toContain("showGraduatesAffairs");
  });

  it("never shows the link on the feature flag alone", () => {
    expect(src).toContain(
      "portalFeatures.staffGraduatesAffairs && graduatesProbe.data === true",
    );
  });
});

describe("04A-4 — reports pages expose loading, error and retry", () => {
  for (const file of [
    "src/routes/student.reports.tsx",
    "src/routes/faculty-portal.reports.tsx",
  ]) {
    it(`${file} has a retry control`, () => {
      const src = read(file);
      expect(src).toContain("إعادة المحاولة");
      expect(src).toContain("refetch()");
      expect(src).toContain("تعذر تحميل التقارير");
    });
  }

  it("student reports combine both reads into one state", () => {
    const src = read("src/routes/student.reports.tsx");
    expect(src).toContain("summaryQuery.isLoading || catalogQuery.isLoading");
    expect(src).toContain("summaryQuery.error ?? catalogQuery.error");
  });

  it("04A-R1 — faculty reports combine summary/scope/department queries", () => {
    const src = read("src/routes/faculty-portal.reports.tsx");
    expect(src).toContain("const summaryQuery = useQuery({");
    expect(src).toContain("const scopeQuery = useQuery({");
    expect(src).toContain("const departmentQuery = useQuery({");
    expect(src).toContain("enabled: isDepartmentHead");
    // combined loading covers all three required reads
    expect(src).toContain("summaryQuery.isLoading ||");
    expect(src).toContain("scopeQuery.isLoading ||");
    expect(src).toContain("(isDepartmentHead && departmentQuery.isLoading)");
    // combined error covers all three required reads
    expect(src).toContain("summaryQuery.error ??");
    expect(src).toContain("scopeQuery.error ??");
    expect(src).toContain("(isDepartmentHead ? departmentQuery.error : null)");
    // retry refetches all three, department only for heads
    expect(src).toContain("void summaryQuery.refetch()");
    expect(src).toContain("void scopeQuery.refetch()");
    expect(src).toContain("if (isDepartmentHead) void departmentQuery.refetch()");
    // background refetch must not be treated as a full loading screen
    expect(src).not.toContain("isLoading || isFetching");
  });
});

describe("04A-5 — /student route has a pending component", () => {
  const src = read("src/routes/student.tsx");

  it("declares pendingComponent with immediate feedback", () => {
    expect(src).toContain("pendingComponent: StudentPending");
    expect(src).toContain("pendingMs: 0");
    expect(src).toContain("student-route-pending");
  });
});

describe("04A-6 — portal entry points link to /messages", () => {
  it("student home, faculty shell and staff nav expose the inbox", () => {
    expect(read("src/routes/student.index.tsx")).toContain('to: "/messages" as const');
    expect(read("src/components/portal/FacultyPortalShell.tsx")).toContain('to="/messages"');
    expect(read("src/components/staff-portal/StaffEmployeePortal.tsx")).toContain('to="/messages"');
  });
});
