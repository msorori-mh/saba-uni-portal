import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("mobile student session isolation", () => {
  const loginSource = read("src/routes/mobile.student-login.tsx");
  const shellSource = read("src/routes/mobile.student.tsx");

  test("clears cached queries and invalidates route matches before mobile navigation", () => {
    const clearAt = loginSource.indexOf("queryClient.clear();");
    const invalidateAt = loginSource.indexOf("await router.invalidate();", clearAt);
    const navigateAt = loginSource.indexOf("navigate({ to: REDIRECT_AFTER_LOGIN", invalidateAt);

    expect(clearAt).toBeGreaterThan(-1);
    expect(invalidateAt).toBeGreaterThan(clearAt);
    expect(navigateAt).toBeGreaterThan(invalidateAt);
  });

  test("keys the mobile header profile by the authenticated student id", () => {
    expect(shellSource).toContain(
      'queryKey: ["mobile-student", "short-profile", authUserId]',
    );
    expect(shellSource).toContain("queryFn: () => fetchShortProfile(authUserId!)");
    expect(shellSource).toContain("enabled: Boolean(authUserId)");
    expect(shellSource).toContain('.eq("user_id", userId)');
  });

  test("fails closed when the authenticated identity changes inside the WebView", () => {
    expect(shellSource).toContain(
      "authUserIdRef.current !== nextUserId",
    );
    expect(shellSource).toContain("queryClient.clear();");
    expect(shellSource).toContain("void router.invalidate();");
  });

  test("removes all visible and browser-side identity state on mobile logout", () => {
    expect(shellSource).toContain('signOut({ scope: "global" })');
    expect(shellSource).toContain("clearReportsLocalPreferences();");
    expect(shellSource).toContain("clearSessionArtifacts();");
    expect(shellSource).toContain('navigate({ to: "/mobile/student-login", replace: true })');
  });
});
