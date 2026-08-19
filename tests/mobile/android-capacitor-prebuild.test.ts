import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { classifyExternalUrl, isSafeExternalUrl } from "../../src/lib/native/external-links";
import { resolveBackAction } from "../../src/lib/native/back-button";
import {
  ANDROID_APPLICATION_ID,
  ANDROID_APP_DISPLAY_NAME,
  NATIVE_HOME_ROUTE,
  NATIVE_LOGIN_ROUTE,
  isNativePlatform,
  isNativeRootRoute,
  normalizeRoutePath,
} from "../../src/lib/native/platform";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("native platform detection", () => {
  test("is false outside a Capacitor shell", () => {
    expect(isNativePlatform()).toBe(false);
  });

  test("identity constants match the frozen Play contract", () => {
    expect(ANDROID_APPLICATION_ID).toBe("ye.edu.usr.fitcs.portal");
    expect(ANDROID_APP_DISPLAY_NAME).toBe("ITCS Portal");
  });

  test("root routes are the student-first entry points", () => {
    expect(NATIVE_HOME_ROUTE).toBe("/mobile/student");
    expect(NATIVE_LOGIN_ROUTE).toBe("/mobile/student-login");
    expect(isNativeRootRoute("/mobile/student/")).toBe(true);
    expect(isNativeRootRoute("/mobile/student/requests")).toBe(false);
    expect(normalizeRoutePath("/mobile/student/")).toBe("/mobile/student");
  });
});

describe("android back-button helper", () => {
  const now = 10_000;
  test("nested page goes back one page", () => {
    expect(
      resolveBackAction({ pathname: "/mobile/student/requests", canGoBack: true, lastRootBackAtMs: null, nowMs: now }),
    ).toBe("navigate_back");
  });

  test("root first press only confirms, never exits or redirects", () => {
    expect(
      resolveBackAction({ pathname: "/mobile/student", canGoBack: true, lastRootBackAtMs: null, nowMs: now }),
    ).toBe("confirm_exit");
  });

  test("root second press within the window exits", () => {
    expect(
      resolveBackAction({ pathname: "/mobile/student", canGoBack: true, lastRootBackAtMs: now - 500, nowMs: now }),
    ).toBe("exit_app");
  });

  test("stale confirmation re-asks instead of exiting", () => {
    expect(
      resolveBackAction({ pathname: "/mobile/student-login", canGoBack: false, lastRootBackAtMs: now - 9_000, nowMs: now }),
    ).toBe("confirm_exit");
  });
});

describe("safe external URL handling", () => {
  test("portal hosts stay inside the WebView", () => {
    expect(classifyExternalUrl("https://saba-uni-portal.lovable.app/verify-document").kind).toBe("internal");
    expect(classifyExternalUrl("https://quboolye.com/news").kind).toBe("internal");
  });

  test("https/mailto/tel are allowed to leave the app", () => {
    expect(classifyExternalUrl("https://usr.edu.ye").kind).toBe("external");
    expect(isSafeExternalUrl("mailto:it@usr.edu.ye")).toBe(true);
    expect(isSafeExternalUrl("tel:+967000000")).toBe(true);
  });

  test("untrusted schemes are blocked", () => {
    for (const url of ["javascript:alert(1)", "file:///etc/passwd", "intent://x#Intent;end", "data:text/html,x"]) {
      expect(isSafeExternalUrl(url)).toBe(false);
    }
  });
});

describe("capacitor config contract", () => {
  const config = read("capacitor.config.ts");

  test("frozen identity and HTTPS-only transport", () => {
    expect(config).toContain('appId: "ye.edu.usr.fitcs.portal"');
    expect(config).toContain('appName: "ITCS Portal"');
    expect(config).toContain("cleartext: false");
    expect(config).toContain("allowMixedContent: false");
    expect(config).not.toContain("cleartext: true");
  });

  test("native entry is the student login surface on the official origin", () => {
    expect(config).toContain("https://quboolye.com/mobile/student-login");
    expect(config).not.toContain("/admin");
    expect(config).not.toContain("/staff");
    expect(config).not.toContain("/faculty-portal");
  });

  test("navigation allowlist is minimal and drops the lovable.app fallback", () => {
    expect(config).not.toContain("lovable.app");
    expect(config).not.toContain('"*.quboolye.com"');
    expect(config).toContain('"quboolye.com"');
    expect(config).toContain('"www.quboolye.com"');
    expect(config).toContain('"wpmicqriltrowwonknox.supabase.co"');
  });
});

describe("android student app scope guard — student only", () => {
  const routes = readdirSync(join(ROOT, "src/routes")).filter((f) => f.startsWith("mobile."));

  test("every /mobile route is a student surface", () => {
    expect(routes.length).toBeGreaterThan(0);
    for (const file of routes) {
      expect(file.startsWith("mobile.student")).toBe(true);
    }
  });

  test("no mobile screen links into faculty, staff or admin portals", () => {
    for (const file of routes) {
      const source = read(join("src/routes", file));
      const links = source.match(/to="\/(faculty-portal|staff|admin)[^"]*"/g) ?? [];
      expect({ file, links }).toEqual({ file, links: [] });
    }
  });
});

describe("android identity script", () => {
  const script = read("scripts/mobile/apply-android-identity.mjs");
  test("freezes identity, version and the permission allowlist", () => {
    expect(script).toContain('APPLICATION_ID = "ye.edu.usr.fitcs.portal"');
    expect(script).toContain("VERSION_CODE = 2");
    expect(script).toContain('VERSION_NAME = "0.2.0"');
    expect(script).toContain('ALLOWED_PERMISSIONS = ["android.permission.INTERNET"]');
    expect(script).toContain("cleartext traffic is enabled");
  });
});

describe("git safety — signing material is never committed", () => {
  const ignore = read(".gitignore");
  for (const pattern of ["*.jks", "*.keystore", "key.properties", "/android/local.properties"]) {
    test(`gitignore blocks ${pattern}`, () => {
      expect(ignore).toContain(pattern);
    });
  }
});

describe("native shell is wired to the student surface only", () => {
  test("mobile student layout uses the canonical native shell hook", () => {
    const src = read("src/routes/mobile.student.tsx");
    expect(src).toContain("useNativeAppShell");
  });

  test("no admin/staff route imports the native shell hook", () => {
    for (const file of ["src/routes/admin.tsx", "src/routes/staff.tsx"]) {
      expect(read(file)).not.toContain("useNativeAppShell");
    }
  });
});


describe("android release signing contract", () => {
  const gradle = read("android/app/build.gradle");
  const workflow = read(".github/workflows/android-build.yml");
  const docs = read("docs/android-build.md");

  test("Gradle accepts release signing material only from the environment", () => {
    for (const name of [
      "ANDROID_KEYSTORE_PATH",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ]) {
      expect(gradle).toContain(`System.getenv("${name}")`);
    }
    expect(gradle).toContain("if (releaseSigningReady)");
    expect(gradle).toContain("signingConfig signingConfigs.release");
    expect(gradle).not.toContain("storePassword \"");
    expect(gradle).not.toContain("keyPassword \"");
  });

  test("Actions rejects partial signing configuration and cleans temporary material", () => {
    expect(workflow).toContain("Prepare release signing (all-or-none)");
    expect(workflow).toContain('elif [ "$present" -ne 4 ]');
    expect(workflow).toContain("Partial Android signing configuration detected");
    expect(workflow).toContain("Remove temporary signing material");
    expect(workflow).not.toContain("continue-on-error: true");
  });

  test("build guide matches the frozen Android identity and production origin", () => {
    expect(docs).toContain("ye.edu.usr.fitcs.portal");
    expect(docs).toContain("https://quboolye.com/mobile/student-login");
    expect(docs).not.toContain("usr.student");
    expect(docs).not.toContain("lovable.app");
  });
});
