import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { currentTermLabel } from "../../src/lib/current-term";
import { requiresInitialPasswordChange } from "../../src/lib/mobile/initial-password";

const read = (path: string) => readFileSync(path, "utf8");
describe("student review closure on current main", () => {
  test.each([
    [{ year: "2026-2027", semester: "الفصل الأول 2026-2027" }, "الفصل الأول 2026-2027"],
    [{ year: "2026-2027", semester: "الفصل الأول" }, "الفصل الأول — 2026-2027"],
    [{ year: null, semester: null }, ""],
  ])("current term label is not repeated", (input, expected) => {
    expect(currentTermLabel(input)).toBe(expected);
  });
  test("first-login flag fails closed for pending or legacy snapshots", () => {
    expect(requiresInitialPasswordChange(true)).toBe(true);
    expect(requiresInitialPasswordChange(undefined)).toBe(true);
    expect(requiresInitialPasswordChange(false)).toBe(false);
  });
  test("all password screens use the verified Auth helper preserved from #479", () => {
    for (const path of ["mobile.student.settings", "student.change-password", "staff.change-password", "faculty-portal.change-password"]) {
      const src = read(`src/routes/${path}.tsx`);
      expect(src).toContain("changeMobilePassword(supabase.auth, currentPassword, pwd, confirm)");
      expect(src).toContain('autoComplete="current-password"');
      expect(src).not.toContain("supabase.auth.updateUser({ password: pwd");
    }
  });
  test("student verification accepts opaque codes only and retains automatic QR handling", () => {
    const sql = read("supabase/migrations/20261011013000_verify_official_document_by_opaque_code_only.sql");
    expect(sql).toContain("WHERE upper(verification_code) = v_q");
    expect(sql).not.toMatch(/WHERE upper\(document_number\)\s*=/);
    const route = read("src/routes/verify-document.tsx");
    expect(route).toContain("search.code");
    expect(route).toContain("useEffect");
    expect(route).not.toContain("student_name_ar");
    expect(route).not.toContain("academic_number");
  });
});
