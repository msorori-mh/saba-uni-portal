// STUDENT-PROVISIONING-EMAIL-02T
// Contract guard for the student login provisioning path in /admin/students:
//  1. «إنشاء حساب» opens a review dialog on the first click — it must NOT call
//     the createAccount server function directly.
//  2. Student accounts require an explicit, valid @students.usr.edu.ye email;
//     placeholder/foreign domains (a@b.comt, faculty/staff domains, malformed
//     input) are rejected on client AND server.
//  3. No silent derivation/fallback from the profile email in createAccount,
//     and no hardcoded placeholder email anywhere in the provisioning path.
//  4. Server fails closed on email conflict for students (no silent linking).
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STUDENT_UNIVERSITY_EMAIL_SUFFIX,
  isStudentUniversityEmail,
  validateStudentUniversityEmailInput,
} from "@/lib/university-email-auth";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("STUDENT-PROVISIONING-EMAIL-02T — validation core", () => {
  it("rejects the placeholder a@b.comt and any non-student domain", () => {
    expect(validateStudentUniversityEmailInput("a@b.comt")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("x@faculty.usr.edu.ye")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("x@staff.usr.edu.ye")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("x@usr.edu.ye")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("x@gmail.com")).not.toBeNull();
    expect(isStudentUniversityEmail("a@b.comt")).toBe(false);
  });

  it("rejects malformed and empty input", () => {
    expect(validateStudentUniversityEmailInput("")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("   ")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("not-an-email")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("a@students")).not.toBeNull();
    // Suffix-lookalike that is not exactly the student domain:
    expect(validateStudentUniversityEmailInput("a@students.usr.edu.ye.evil.com")).not.toBeNull();
    expect(validateStudentUniversityEmailInput("a@notstudents.usr.edu.ye")).not.toBeNull();
  });

  it("accepts a valid @students.usr.edu.ye address (normalized)", () => {
    expect(validateStudentUniversityEmailInput("test02q.e2e.20260824@students.usr.edu.ye")).toBeNull();
    expect(validateStudentUniversityEmailInput("  S.Ali@STUDENTS.usr.edu.ye ")).toBeNull();
    expect(isStudentUniversityEmail("s.ali@students.usr.edu.ye")).toBe(true);
    expect(STUDENT_UNIVERSITY_EMAIL_SUFFIX).toBe("@students.usr.edu.ye");
  });
});

describe("STUDENT-PROVISIONING-EMAIL-02T — server function contract", () => {
  const serverFns = read("src/lib/admin-users.functions.ts");
  const start = serverFns.indexOf("export const createAccount");
  const end = serverFns.indexOf("export const ", start + 1);
  const createAccountBody = serverFns.slice(start, end === -1 ? undefined : end);

  it("createAccount accepts university_email and validates it for students", () => {
    expect(createAccountBody).toContain("university_email: z.string().trim().max(160).optional()");
    expect(createAccountBody).toContain("validateStudentUniversityEmailInput(data.university_email");
  });

  it("student email is NEVER derived silently from the profile record", () => {
    // Isolate the student branch: from `if (data.kind === "student") {` up to
    // its closing `} else {` — it must not call resolveProfileLoginEmail.
    const branchStart = createAccountBody.indexOf('if (data.kind === "student") {');
    expect(branchStart).toBeGreaterThan(-1);
    const branchEnd = createAccountBody.indexOf("} else {", branchStart);
    const studentBranch = createAccountBody.slice(branchStart, branchEnd);
    expect(studentBranch).toContain("validateStudentUniversityEmailInput");
    expect(studentBranch).not.toContain("resolveProfileLoginEmail");
    // resolveProfileLoginEmail remains only on the non-student branch.
    expect(createAccountBody).toContain(
      "email = await resolveProfileLoginEmail(data.kind, profile as Record<string, unknown>);",
    );
  });

  it("fails closed on email conflict for students (no silent linking)", () => {
    expect(createAccountBody).toContain('existing && data.kind === "student"');
    expect(createAccountBody).toContain("مستخدم بحساب دخول آخر");
  });

  it("no placeholder email or hardcoded fallback in the provisioning path", () => {
    expect(serverFns).not.toContain("a@b.comt");
    expect(serverFns).not.toContain("@b.comt");
    expect(createAccountBody).not.toMatch(/example\.(com|org|net)/i);
  });
});

describe("STUDENT-PROVISIONING-EMAIL-02T — UI wiring contract", () => {
  const page = read("src/routes/admin/students.lazy.tsx");

  it("first click opens the review dialog and never calls create directly", () => {
    // The row button must only set the dialog target.
    expect(page).toContain("onClick={() => setProvisionTarget(r)}");
    // No direct create() invocation remains inside a row button onClick.
    expect(page).not.toMatch(/onClick=\{\(\) => run\(`create-/);
  });

  it("renders a state-gated confirmation dialog with a disabled-until-valid confirm", () => {
    expect(page).toContain("ProvisionStudentAccountModal");
    expect(page).toContain("provisionTarget && canWrite");
    expect(page).toContain("تأكيد إنشاء الحساب");
    expect(page).toContain("disabled={!canConfirm}");
    expect(page).toContain("validateStudentUniversityEmailInput(email)");
  });

  it("dialog submits the explicit email and never prefills placeholder/foreign emails", () => {
    expect(page).toContain("university_email: email.trim()");
    expect(page).toContain("isStudentUniversityEmail(profileEmail) ? profileEmail : \"\"");
  });

  it("no placeholder email anywhere in the admin students page", () => {
    expect(page).not.toContain("a@b.comt");
    expect(page).not.toContain("@b.comt");
  });
});
