import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FORBIDDEN_PWA_STORAGE_KEYS,
  PWA_INSTALL_DISMISS_KEY,
  clearDismissedAt,
  invokeDeferredInstallPrompt,
  isDismissCooldownActive,
  isIosBrowser,
  isStandaloneDisplay,
  readDismissedAt,
  shouldShowAndroidInstallPrompt,
  shouldShowIosInstallFallback,
  writeDismissedAt,
  type BeforeInstallPromptEventLike,
} from "@/lib/pwa/install-prompt-state";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("portal-wide PWA manifest", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest")) as Record<string, unknown>;

  test("uses portal-wide identity (not student-only)", () => {
    expect(manifest.name).toBe("بوابة كلية تكنولوجيا المعلومات وعلوم الحاسوب");
    expect(manifest.short_name).toBe("بوابة الكلية");
    expect(String(manifest.description)).toContain("البوابة الإلكترونية");
    expect(manifest.short_name).not.toBe("بوابة الطالب");
  });

  test("start_url is the shared portal gateway", () => {
    expect(manifest.start_url).toBe("/portal-login");
    expect(manifest.start_url).not.toBe("/mobile/student");
  });

  test("display standalone with RTL Arabic metadata", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.dir).toBe("rtl");
    expect(manifest.lang).toBe("ar");
    expect(manifest.scope).toBe("/");
    expect(manifest.theme_color).toBe("#061F33");
    expect(manifest.background_color).toBe("#F8FAFC");
  });

  test("includes id, categories, and required icons including maskable", () => {
    expect(manifest.id).toBe("/");
    expect(Array.isArray(manifest.categories)).toBe(true);
    expect((manifest.categories as string[]).length).toBeGreaterThan(0);

    const icons = manifest.icons as Array<{ src: string; sizes: string; purpose?: string }>;
    const bySrc = Object.fromEntries(icons.map((i) => [i.src, i]));
    expect(bySrc["/icon-192.png"]?.sizes).toBe("192x192");
    expect(bySrc["/icon-512.png"]?.sizes).toBe("512x512");
    expect(bySrc["/icon-maskable-512.png"]?.purpose).toBe("maskable");
  });

  test("icon files exist on disk", () => {
    expect(existsSync(join(ROOT, "public/icon-192.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/icon-512.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public/icon-maskable-512.png"))).toBe(true);
  });

  test("does not fabricate screenshots when none are shipped", () => {
    expect(manifest.screenshots).toBeUndefined();
  });
});

describe("portal service worker security", () => {
  const sw = read("public/sw.js");

  test("service worker file exists and is portal-scoped", () => {
    expect(existsSync(join(ROOT, "public/sw.js"))).toBe(true);
    expect(sw).toContain('const VERSION = "v2"');
    expect(sw).toContain('OFFLINE_URL = "/offline.html"');
  });

  test("sensitive paths remain uncached", () => {
    const required = [
      "mobile",
      "api",
      "_serverFn",
      "auth",
      "faculty-portal",
      "official",
    ];
    const policy = read("public/sw-cache-policy.js");
    for (const needle of required) expect(policy).toMatch(new RegExp(needle, "i"));
    expect(sw).toContain("isProtectedPath");
    expect(sw).toContain("url.origin !== self.location.origin");
  });

  test("does not cache navigate HTML responses into Cache Storage", () => {
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain("fetch(request).catch");
    expect(sw).not.toMatch(/navigate[\s\S]{0,400}cache\.put/);
  });

  test("preserves SKIP_WAITING message handling without forced reload loops", () => {
    expect(sw).toContain('event.data === "SKIP_WAITING"');
    expect(sw).toContain("self.skipWaiting()");
    expect(sw).not.toContain("location.reload()");
    expect(sw).not.toContain("clients.claim()");
    expect(sw.indexOf("self.skipWaiting()"))
      .toBeGreaterThan(sw.indexOf('addEventListener("message"'));
  });
});

describe("PWA registration surfaces", () => {
  const registerPortal = read("src/lib/pwa/register-portal-pwa.ts");
  const registerAlias = read("src/lib/pwa/register-student-sw.ts");
  const root = read("src/routes/__root.tsx");
  const mobileStudent = read("src/routes/mobile.student.tsx");
  const portalLogin = read("src/routes/portal-login.tsx");

  test("registerPortalPWA exists and skips unsafe preview/iframe hosts", () => {
    expect(registerPortal).toContain("export function registerPortalPWA");
    expect(registerPortal).toContain('register("/sw.js", { scope: "/" })');
    expect(registerPortal).toContain("id-preview--");
    expect(registerPortal).toContain(".lovableproject.com");
    expect(registerPortal).toContain("unregister");
    expect(registerPortal).toContain("[portal-pwa] SW registration failed");
  });

  test("legacy registerStudentMobileSW remains as compatibility alias", () => {
    expect(registerAlias).toContain("registerPortalPWA as registerStudentMobileSW");
  });

  test("root layout registers portal PWA and mounts install prompt", () => {
    expect(root).toContain('import { registerPortalPWA } from "@/lib/pwa/register-portal-pwa"');
    expect(root).toContain("registerPortalPWA();");
    expect(root).toContain("PortalInstallPrompt");
    expect(root).toContain('rel: "manifest", href: "/manifest.webmanifest"');
    expect(root).toContain('name: "theme-color", content: "#061F33"');
    expect(root).toContain('name: "apple-mobile-web-app-capable", content: "yes"');
    expect(root).toContain('name: "apple-mobile-web-app-title", content: "بوابة الكلية"');
    expect(root).toContain('rel: "apple-touch-icon", href: "/icon-192.png"');
  });

  test("portal-login remains the gateway and carries PWA head metadata", () => {
    expect(portalLogin).toContain('createFileRoute("/portal-login")');
    expect(portalLogin).toContain('rel: "manifest", href: "/manifest.webmanifest"');
    expect(portalLogin).toContain('apple-mobile-web-app-title", content: "بوابة الكلية"');
  });

  test("existing /mobile/student relies on the root registration without duplicating it", () => {
    expect(mobileStudent).toContain('createFileRoute("/mobile/student")');
    expect(root).toContain("registerPortalPWA();");
    expect(mobileStudent).not.toContain("registerPortalPWA");
    expect(mobileStudent).toContain('rel: "manifest", href: "/manifest.webmanifest"');
    expect(mobileStudent).toContain("/mobile/student-login");
  });
});

describe("install prompt UI source", () => {
  const prompt = read("src/components/pwa/PortalInstallPrompt.tsx");
  const hook = read("src/lib/pwa/use-pwa-install.ts");

  test("Arabic RTL copy and actions are present", () => {
    expect(prompt).toContain("ثبّت بوابة الكلية على جهازك");
    expect(prompt).toContain("تثبيت التطبيق");
    expect(prompt).toContain("لاحقاً");
    expect(prompt).toContain("إضافة إلى الشاشة الرئيسية");
    expect(prompt).toContain('dir="rtl"');
  });

  test("hook captures beforeinstallprompt in memory only", () => {
    expect(hook).toContain("beforeinstallprompt");
    expect(hook).toContain("appinstalled");
    expect(hook).toContain("deferredRef");
    expect(hook).toContain("never localStorage/sessionStorage");
    expect(hook).toContain("promptInstall");
    expect(hook).not.toContain("JSON.stringify(deferred");
  });
});

describe("install visibility helpers", () => {
  test("hides install prompt before eligibility", () => {
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isIOS: false,
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  test("shows Android prompt after eligible beforeinstallprompt signal", () => {
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isIOS: false,
        dismissedAt: null,
      }),
    ).toBe(true);
  });

  test("standalone and installed hide the prompt", () => {
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: true,
        isInstalled: false,
        isStandalone: true,
        isIOS: false,
        dismissedAt: null,
      }),
    ).toBe(false);
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: true,
        isInstalled: true,
        isStandalone: false,
        isIOS: false,
        dismissedAt: null,
      }),
    ).toBe(false);
  });

  test("dismissed cooldown suppresses re-prompt", () => {
    const now = 1_700_000_000_000;
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isIOS: false,
        dismissedAt: now - 60_000,
        now,
      }),
    ).toBe(false);
    expect(isDismissCooldownActive(now - 60_000, now)).toBe(true);
    expect(
      shouldShowAndroidInstallPrompt({
        isInstallable: true,
        isInstalled: false,
        isStandalone: false,
        isIOS: false,
        dismissedAt: now - 8 * 24 * 60 * 60 * 1000,
        now,
      }),
    ).toBe(true);
  });

  test("iOS fallback shows Share instructions only outside standalone", () => {
    expect(
      shouldShowIosInstallFallback({
        isInstallable: false,
        isInstalled: false,
        isStandalone: false,
        isIOS: true,
        dismissedAt: null,
      }),
    ).toBe(true);
    expect(
      shouldShowIosInstallFallback({
        isInstallable: false,
        isInstalled: false,
        isStandalone: true,
        isIOS: true,
        dismissedAt: null,
      }),
    ).toBe(false);
    expect(isIosBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", false)).toBe(true);
    expect(isIosBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true)).toBe(false);
  });
});

describe("deferred install action", () => {
  test("unavailable when no deferred event", async () => {
    expect(await invokeDeferredInstallPrompt(null)).toBe("unavailable");
  });

  test("install action calls prompt() and accepted closes success path", async () => {
    let prompted = false;
    const deferred = {
      platforms: ["web"],
      prompt: async () => {
        prompted = true;
      },
      userChoice: Promise.resolve({ outcome: "accepted" as const, platform: "web" }),
      preventDefault() {},
    } as unknown as BeforeInstallPromptEventLike;

    const outcome = await invokeDeferredInstallPrompt(deferred);
    expect(prompted).toBe(true);
    expect(outcome).toBe("accepted");
  });

  test("userChoice dismissed is reported without faking success", async () => {
    const deferred = {
      platforms: ["web"],
      prompt: async () => {},
      userChoice: Promise.resolve({ outcome: "dismissed" as const, platform: "web" }),
      preventDefault() {},
    } as unknown as BeforeInstallPromptEventLike;

    expect(await invokeDeferredInstallPrompt(deferred)).toBe("dismissed");
  });
});

describe("dismissal preference storage", () => {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v);
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
  };

  beforeEach(() => {
    mem.clear();
  });

  test("stores only harmless dismiss timestamp key", () => {
    writeDismissedAt(12345, storage);
    expect(readDismissedAt(storage)).toBe(12345);
    expect([...mem.keys()]).toEqual([PWA_INSTALL_DISMISS_KEY]);
    clearDismissedAt(storage);
    expect(readDismissedAt(storage)).toBe(null);
  });

  test("no auth/session data stored via PWA preference helpers", () => {
    writeDismissedAt(Date.now(), storage);
    const blob = JSON.stringify([...mem.entries()]);
    for (const forbidden of FORBIDDEN_PWA_STORAGE_KEYS) {
      expect(blob.toLowerCase()).not.toContain(forbidden);
    }
    expect(blob).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // JWT-like
  });
});

describe("standalone detection", () => {
  test("detects display-mode standalone and iOS navigator.standalone", () => {
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: true }) as MediaQueryList,
        navigator: { standalone: false } as Navigator & { standalone?: boolean },
      }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }) as MediaQueryList,
        navigator: { standalone: true } as Navigator & { standalone?: boolean },
      }),
    ).toBe(true);
    expect(
      isStandaloneDisplay({
        matchMedia: () => ({ matches: false }) as MediaQueryList,
        navigator: { standalone: false } as Navigator & { standalone?: boolean },
      }),
    ).toBe(false);
  });
});

describe("offline shell branding", () => {
  test("offline page uses portal-wide branding", () => {
    const offline = read("public/offline.html");
    expect(offline).toContain("بوابة الكلية");
    expect(offline).toContain("#061F33");
    expect(offline).not.toContain("بوابة الطالب — كلية");
  });
});
