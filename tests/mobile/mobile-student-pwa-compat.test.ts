import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("mobile student portal remains functional", () => {
  test("mobile student layout route still exists with auth gate", () => {
    const src = read("src/routes/mobile.student.tsx");
    expect(src).toContain('createFileRoute("/mobile/student")');
    expect(src).toContain("student_profiles");
    expect(src).toContain("/mobile/student-login");
    expect(src).toContain("MobileBottomNav");
    expect(src).toContain('to: "/mobile/student/schedule"');
    expect(src).toContain('to: "/mobile/student/requests"');
    expect(src).toContain('to: "/mobile/student/documents"');
  });

  test("mobile student login route still redirects into /mobile/student", () => {
    const src = read("src/routes/mobile.student-login.tsx");
    expect(src).toContain('createFileRoute("/mobile/student-login")');
    expect(src).toContain('const REDIRECT_AFTER_LOGIN = "/mobile/student"');
    expect(src).toContain('rel: "manifest", href: "/manifest.webmanifest"');
  });

  test("sensitive mobile student screens still exist", () => {
    for (const file of [
      "src/routes/mobile.student.finance.tsx",
      "src/routes/mobile.student.documents.index.tsx",
      "src/routes/mobile.student.requests.tsx",
      "src/routes/mobile.student.grades.tsx",
      "src/routes/mobile.student.academic-record.tsx",
      "src/routes/mobile.student.schedule.tsx",
    ]) {
      expect(existsSync(join(ROOT, file))).toBe(true);
    }
  });

  test("service worker still denies caching sensitive mobile student paths", () => {
    const sw = read("public/sw.js");
    const policy = read("public/sw-cache-policy.js");
    expect(sw).toContain("isProtectedPath(url.pathname + url.search)");
    expect(policy).toContain("/^\\/mobile\\/student");
    expect(policy).toContain("PUBLIC_SHELL_ASSETS");
  });
});
