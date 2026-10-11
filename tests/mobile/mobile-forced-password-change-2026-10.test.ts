import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");
const identity = read("src/lib/mobile/student-identity.ts");
const guard = read("src/routes/mobile.student.tsx");
const settings = read("src/routes/mobile.student.settings.tsx");

describe("mobile app enforces the forced first-login password change", () => {
  it("reads must_change_password with the profile id and caches it", () => {
    expect(identity).toContain('.select("id, must_change_password")');
    expect(identity).toContain("const mustChangePassword = row?.must_change_password === true;");
    // the flag is only ever present when true (older shapes stay identical)
    expect(identity).toContain("cached.mustChangePassword === true");
  });

  it("the /mobile/student guard redirects only on an explicit true", () => {
    const block = guard.slice(guard.indexOf("beforeLoad:"), guard.indexOf("pendingComponent:"));
    expect(block).toContain("identity.mustChangePassword === true && location.pathname !== MOBILE_SETTINGS_PATH");
    expect(block).toContain("throw redirect({ to: MOBILE_SETTINGS_PATH });");
    expect(guard).toContain('const MOBILE_SETTINGS_PATH = "/mobile/student/settings";');
    // the redirect comes after the non-student sign-out branch
    expect(block.indexOf("identity.mustChangePassword")).toBeGreaterThan(block.indexOf("if (!identity) {"));
  });

  it("offline identities never carry the flag (no lock-out offline)", () => {
    expect(identity).toContain("writePersistedMobileIdentity({ userId, studentProfileId })");
  });

  it("settings explains the requirement and drops the cached identity after success", () => {
    expect(settings).toContain('data-testid="mobile-forced-password-change"');
    expect(settings).toContain('if (mustChangePassword) navigate({ to: "/mobile/student", replace: true });');
    for (const src of [settings]) {
      const rpc = src.indexOf('rpc("complete_student_password_change")');
      const clear = src.indexOf("clearMobileStudentIdentity();");
      expect(rpc).toBeGreaterThan(0);
      expect(clear).toBeGreaterThan(rpc);
    }
  });
});
