// FACULTY_ACCOUNTS_EXISTING_EMAIL_UPDATE_IMPORTER_REMEDIATION_01 — G8 tests
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyEmailUpdate,
  emailDomainAllowed,
  isValidEmailFormat,
  maskEmail,
  normalizeEmail,
  isReadyOutcome,
} from "../../src/lib/faculty-accounts-email-update.core";

const ROOT = join(import.meta.dir, "../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const baseProfile = {
  id: "profile-1",
  user_id: "user-1",
  employee_number: "F2025028",
  full_name_ar: "يوسف عبدالواحد الهجري",
};

describe("faculty account email-update classifier", () => {
  it("normalises and validates email format", () => {
    expect(normalizeEmail("  A@B.com  ")).toBe("a@b.com");
    expect(isValidEmailFormat("a@b.co")).toBe(true);
    expect(isValidEmailFormat("no-at")).toBe(false);
  });

  it("enforces university domain by default", () => {
    expect(emailDomainAllowed("x@usr.edu.ye")).toBe(true);
    expect(emailDomainAllowed("x@faculty.usr.edu.ye")).toBe(true);
    expect(emailDomainAllowed("x@gmail.com")).toBe(false);
  });

  it("masks email safely", () => {
    expect(maskEmail("ywsfalhwlndy@usr.edu.ye")).toBe("y***y@usr.edu.ye");
    expect(maskEmail("ab@usr.edu.ye")).toBe("a***@usr.edu.ye");
    expect(maskEmail(null)).toBe("—");
  });

  it("rejects invalid email format", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "not-an-email",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "old@usr.edu.ye" },
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("INVALID_EMAIL");
    expect(isReadyOutcome(r.outcome)).toBe(false);
  });

  it("rejects non-university domain by default", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "user@gmail.com",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "old@usr.edu.ye" },
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("INVALID_EMAIL");
  });

  it("FACULTY_NOT_FOUND when no profile matches", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025032",
      newEmailRaw: "any@usr.edu.ye",
      profiles: [],
      linkedAuth: null,
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("FACULTY_NOT_FOUND");
  });

  it("FACULTY_DUPLICATE when >1 profile shares employee_number", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "new@usr.edu.ye",
      profiles: [baseProfile, { ...baseProfile, id: "profile-2" }],
      linkedAuth: null,
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("FACULTY_DUPLICATE");
  });

  it("ACCOUNT_LINK_AMBIGUOUS when profile has no user_id (never uses name to match)", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "new@usr.edu.ye",
      profiles: [{ ...baseProfile, user_id: null }],
      linkedAuth: null,
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("ACCOUNT_LINK_AMBIGUOUS");
  });

  it("AUTH_USER_NOT_FOUND when profile.user_id references missing Auth user", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "new@usr.edu.ye",
      profiles: [baseProfile],
      linkedAuth: null,
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("AUTH_USER_NOT_FOUND");
  });

  it("EMAIL_CONFLICT when new email owned by a DIFFERENT auth user", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "new@usr.edu.ye",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "old@usr.edu.ye" },
      emailOwnerAuth: { id: "user-999", email: "new@usr.edu.ye" },
      emailOwnerProfile: { id: "profile-999", employee_number: "F2025099" },
      facultyTableEmail: "old@usr.edu.ye",
    });
    expect(r.outcome).toBe("EMAIL_CONFLICT");
    expect(r.message).toContain("F2025099");
  });

  it("ALREADY_MATCHED when Auth and faculty already equal the requested email", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "same@usr.edu.ye",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "same@usr.edu.ye" },
      emailOwnerAuth: { id: "user-1", email: "same@usr.edu.ye" },
      emailOwnerProfile: null,
      facultyTableEmail: "same@usr.edu.ye",
    });
    expect(r.outcome).toBe("ALREADY_MATCHED");
    expect(r.needsAuthUpdate).toBe(false);
    expect(r.needsFacultyUpdate).toBe(false);
  });

  it("READY_FACULTY_EMAIL_BACKFILL_ONLY when Auth already correct but faculty.email empty", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "same@usr.edu.ye",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "same@usr.edu.ye" },
      emailOwnerAuth: { id: "user-1", email: "same@usr.edu.ye" },
      emailOwnerProfile: null,
      facultyTableEmail: null,
    });
    expect(r.outcome).toBe("READY_FACULTY_EMAIL_BACKFILL_ONLY");
    expect(r.needsAuthUpdate).toBe(false);
    expect(r.needsFacultyUpdate).toBe(true);
    expect(isReadyOutcome(r.outcome)).toBe(true);
  });

  it("READY_AUTH_AND_FACULTY_EMAIL_UPDATE when new email owned by same auth user (rename case)", () => {
    const r = classifyEmailUpdate({
      employeeNumberRaw: "F2025028",
      newEmailRaw: "new@usr.edu.ye",
      profiles: [baseProfile],
      linkedAuth: { id: "user-1", email: "old@usr.edu.ye" },
      emailOwnerAuth: null,
      emailOwnerProfile: null,
      facultyTableEmail: "old@usr.edu.ye",
    });
    expect(r.outcome).toBe("READY_AUTH_AND_FACULTY_EMAIL_UPDATE");
    expect(r.needsAuthUpdate).toBe(true);
    expect(r.needsFacultyUpdate).toBe(true);
  });
});

describe("email-update importer — server function source guarantees", () => {
  const src = read("src/lib/faculty-accounts-email-update.functions.ts");

  it("uses requireSupabaseAuth and asserts HR/admin write roles", () => {
    expect(src).toContain("requireSupabaseAuth");
    expect(src).toContain("assertAnyRole");
    expect(src).toMatch(/hr_officer/);
  });

  it("never touches password / must_change_password / roles / assignments / employee_number", () => {
    expect(src).not.toContain("password");
    expect(src).not.toContain("must_change_password");
    expect(src).not.toMatch(/user_roles/);
    expect(src).not.toMatch(/position_assignments|processing_assignments/);
    expect(src).not.toMatch(/employee_number:\s*/);
  });

  it("execute path requires explicit confirm=true", () => {
    expect(src).toContain('z.literal(true');
    expect(src).toContain("التنفيذ يتطلب تأكيداً صريحاً");
  });

  it("writes an import_logs row for the email-update run", () => {
    expect(src).toContain('"import_logs"');
    expect(src).toContain("faculty_account_email_update");
  });

  it("re-classifies rows server-side on execute (never trusts client outcome)", () => {
    // both preview and execute call classifyOneRow
    expect(src.match(/classifyOneRow\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("legacy create/link importer path remains intact and untouched", () => {
    const legacy = read("src/lib/faculty-accounts.functions.ts");
    expect(legacy).toContain("importFacultyAccountsRows");
    expect(legacy).toContain("createFacultyAccountManual");
    expect(legacy).toContain("linkFacultyAccountByEmail");
  });

  it("legacy importer now records to import_logs on every outcome (G6)", () => {
    const legacy = read("src/lib/faculty-accounts.functions.ts");
    expect(legacy).toContain('"import_logs"');
    expect(legacy).toContain("all_already_linked");
    expect(legacy).toContain("no_changes");
  });
});

describe("email-update UI — explicit mode, never auto-runs", () => {
  const ui = read("src/routes/admin/faculty-accounts.tsx");
  it("adds an explicit toggle for the email-update panel", () => {
    expect(ui).toContain("تحديث البريد للحسابات المرتبطة");
    expect(ui).toContain("EmailUpdatePanel");
    expect(ui).toContain("previewFacultyAccountEmailUpdates");
    expect(ui).toContain("executeFacultyAccountEmailUpdates");
  });
  it("requires an explicit confirmation checkbox before execution", () => {
    expect(ui).toContain("confirmChecked");
    expect(ui).toContain("سيتم تغيير بريد تسجيل الدخول");
  });
  it("does not expose password / token in the panel", () => {
    // ensure the panel component body doesn't reveal secrets
    const panel = ui.slice(ui.indexOf("function EmailUpdatePanel"));
    expect(panel).not.toMatch(/password/i);
    expect(panel).not.toMatch(/token/i);
    expect(panel).not.toMatch(/service.role/i);
  });
});
