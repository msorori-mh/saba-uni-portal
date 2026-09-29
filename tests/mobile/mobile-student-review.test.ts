import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentTermLabel } from "@/lib/current-term";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("student mobile review fixes", () => {
  test("current term title does not repeat the year", () => {
    expect(currentTermLabel({ year: "2026-2027", semester: "الفصل الأول 2026-2027" })).toBe("الفصل الأول 2026-2027");
    expect(currentTermLabel({ year: "2026-2027", semester: "الفصل الأول" })).toBe("الفصل الأول — 2026-2027");
  });

  test("public student verification requires an opaque code rather than a sequential document number", () => {
    const sql = read("supabase/migrations/20260929020000_verify_official_document_by_opaque_code_only.sql");
    expect(sql).toContain("WHERE upper(verification_code) = v_q");
    expect(sql).not.toMatch(/WHERE upper\(document_number\)\s*=/);
    const route = read("src/routes/verify-document.tsx");
    expect(route).toContain('documentAudience === "student"');
    expect(route).toContain('search.token !== undefined ? "staff" : "student"');
    expect(route).not.toContain("student_name_ar");
    expect(route).not.toContain("academic_number");
  });

  test("initial password flows provide the current password to Supabase Auth", () => {
    for (const path of [
      "src/routes/mobile.student.settings.tsx",
      "src/routes/student.change-password.tsx",
      "src/routes/staff.change-password.tsx",
      "src/routes/faculty-portal.change-password.tsx",
    ]) {
      const route = read(path);
      expect(route).toContain("current_password: currentPassword");
      expect(route).toContain('autoComplete="current-password"');
    }
    expect(read("src/routes/mobile.student.settings.tsx")).toContain("mustChangePassword");
  });
});
