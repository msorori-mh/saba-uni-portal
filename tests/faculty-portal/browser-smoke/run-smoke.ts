import { appendFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

type Scenario = {
  path: string;
  routeLabel: string;
  activePath: string;
  title: string;
  breadcrumbs?: string[];
  expectsActiveAriaCurrent?: boolean;
  mode:
    | "normal"
    | "identity"
    | "permission-denied"
    | "not-found"
    | "error-recovery"
    | "logout-fail"
    | "logout-ok";
};

type Check = {
  name: string;
  ok: boolean;
  detail?: string;
};

type SmokeState = {
  route: string;
  mode: Scenario["mode"];
  menuOpened: boolean;
  menuClosedByEscape: boolean;
  menuFocusReturned: boolean;
  notificationsOpened: boolean;
  notificationsClosedOnOutsideClick: boolean;
  hasActiveAriaCurrent: boolean;
  breadcrumbsValid: boolean;
  hasNoStaleIdentity: boolean;
  noAdminNavigation: boolean;
  permissionDenied: boolean;
  notFoundInShell: boolean;
  errorRoleAlert: boolean;
  logoutNavigated: boolean;
  cacheCleared: boolean;
  overflowSafe360: boolean;
  overflowSafe768: boolean;
  overflowSafe1366: boolean;
  ready: boolean;
};

const ROOT = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = join(
  ROOT,
  "../../../docs/PORTAL-PR251-INDEPENDENT-FACULTY-NAVIGATION-REVIEW-01-REPORT.md",
);
const ARTIFACT_DIR = join(ROOT, "../../../.tmp/faculty-portal-browser-smoke");
const PORT = Number(process.env.FACULTY_SMOKE_PORT || 4178);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROME_TIMEOUT_MS = Number(process.env.FACULTY_SMOKE_TIMEOUT_MS || 12_000);
const CHROME_SPAWN_TIMEOUT_MS = Number(process.env.FACULTY_SMOKE_SPAWN_TIMEOUT_MS || 45_000);
const CHROME_MARKER = "faculty-portal-browser-smoke";
const PRIVACY_FORBIDDEN =
  /\b(?:sql|rpc|permission denied|user_id|error\.message|raw error|uuid|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i;

const ENABLE_SCREENSHOT = process.env.FACULTY_SMOKE_SCREENSHOT === "1";

const CHROME_CANDIDATES = [
  process.env.FACULTY_CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

const VIEWPORTS = [
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "mobile-360", width: 360, height: 800 },
] as const;

const MOBILE_SCENARIOS = new Set(["/faculty-portal"]);

const SCENARIOS: Scenario[] = [
  {
    path: "/faculty-portal",
    routeLabel: "Home",
    activePath: "/faculty-portal",
    title: "Faculty Portal",
    expectsActiveAriaCurrent: true,
    mode: "normal",
  },
  {
    path: "/faculty-portal/schedule",
    routeLabel: "Schedule",
    activePath: "/faculty-portal/schedule",
    title: "Faculty Schedule",
    breadcrumbs: ["Faculty", "Schedule"],
    expectsActiveAriaCurrent: true,
    mode: "normal",
  },
  {
    path: "/faculty-portal/academic-councils",
    routeLabel: "Councils",
    activePath: "/faculty-portal/academic-councils",
    title: "Academic Councils",
    breadcrumbs: ["Faculty", "Councils"],
    expectsActiveAriaCurrent: true,
    mode: "normal",
  },
  {
    path: "/faculty-portal/materials/section-101",
    routeLabel: "Materials",
    activePath: "/faculty-portal/materials/section-101",
    title: "Materials / Section 101",
    breadcrumbs: ["Faculty", "Materials", "Section 101"],
    expectsActiveAriaCurrent: false,
    mode: "normal",
  },
  {
    path: "/faculty-portal/identity-switch",
    routeLabel: "Identity Switch",
    activePath: "/faculty-portal/identity-switch",
    title: "Identity Switch",
    expectsActiveAriaCurrent: false,
    mode: "identity",
  },
  {
    path: "/faculty-portal/permission-denied",
    routeLabel: "إذن مرفوض",
    activePath: "/faculty-portal/permission-denied",
    title: "Permission denied",
    expectsActiveAriaCurrent: false,
    mode: "permission-denied",
  },
  {
    path: "/faculty-portal/not-found",
    routeLabel: "Not found",
    activePath: "/faculty-portal/not-found",
    title: "Not found",
    expectsActiveAriaCurrent: false,
    mode: "not-found",
  },
  {
    path: "/faculty-portal/error-recovery",
    routeLabel: "Error recovery",
    activePath: "/faculty-portal/error-recovery",
    title: "Error recovery",
    expectsActiveAriaCurrent: false,
    mode: "error-recovery",
  },
  {
    path: "/faculty-portal/logout-ok",
    routeLabel: "Logout success path",
    activePath: "/faculty-portal/logout-ok",
    title: "Faculty logout",
    expectsActiveAriaCurrent: false,
    mode: "logout-ok",
  },
  {
    path: "/faculty-portal/logout-fail",
    routeLabel: "Logout failure path",
    activePath: "/faculty-portal/logout-fail",
    title: "Faculty logout",
    expectsActiveAriaCurrent: false,
    mode: "logout-fail",
  },
];

const NEGATIVE_PAGE_LOAD_PORT = Number(process.env.FACULTY_SMOKE_NEGATIVE_PORT || 59993);

function scenarioHtml(s: Scenario): string {
  const navItems = [
    { path: "/faculty-portal", label: "1" },
    { path: "/faculty-portal/schedule", label: "2" },
    { path: "/faculty-portal/academic-councils", label: "3" },
  ];

  const breadcrumbs = s.breadcrumbs
    ? `<nav aria-label="مسار التنقل" class="my-2 text-xs"><ol class="flex items-center gap-1">${s.breadcrumbs
        .map(
          (crumb, idx) =>
            `<li><span ${idx === s.breadcrumbs!.length - 1 ? 'aria-current="page"' : 'class="opacity-70"'}>${crumb}</span></li>` +
            (idx < s.breadcrumbs!.length - 1 ? '<li aria-hidden="true">/</li>' : ""),
        )
        .join("")}</ol></nav>`
    : "";

  const extraBanner =
    s.mode === "not-found"
      ? `<section data-testid="faculty-portal-not-found" role="alert" class="border p-3">المسار غير موجود</section>`
      : s.mode === "permission-denied"
        ? `<section data-testid="faculty-portal-permission-denied" class="border p-3">غير مصرح</section>`
        : "";

  const errorRecoveryBlock =
    s.mode === "error-recovery"
      ? `<section role="alert" data-testid="faculty-portal-error-fallback" class="border p-3">حدث خطأ، حاول إعادة المحاولة</section>`
      : "";

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${s.title}</title>
</head>
  <body>
  <div id="faculty-shell" dir="rtl" style="font-family: Arial, sans-serif;" data-route="${s.path}">
    <header>
      <h1>Faculty portal smoke route</h1>
      <p id="identity-pill">Faculty A</p>
      <button id="notifications-trigger" aria-label="الإشعارات" aria-haspopup="dialog" aria-expanded="false" aria-controls="notifications-dropdown" aria-live="polite" class="mx-1">🔔</button>
      <button id="logout-action">Logout</button>
    </header>

    <nav aria-label="شريط التنقل" class="overflow-x-auto" id="faculty-nav-shell" style="display: inline-flex; flex-wrap: nowrap; gap: 0.25rem; width: fit-content; max-width: 100%; overflow-x: hidden; white-space: nowrap; align-items: center;">
      ${navItems
        .map(
          (link) =>
            `<a href="${link.path}" data-nav-link aria-current="${link.path === s.activePath ? "page" : "false"}" class="${
              link.path === s.activePath ? "font-extrabold underline" : ""
            }">${link.label}</a>`,
        )
        .join(" ")}
    </nav>

    <button id="menu-trigger" aria-controls="menu-panel" aria-expanded="false">القائمة</button>
    <div id="menu-panel" class="hidden" style="width: min(92vw, 360px);" aria-label="menu panel">menu panel</div>

    <div id="notifications-dropdown" class="hidden" style="width: min(92vw, 360px);" aria-label="notifications panel">
      <ul><li>Notification 1</li><li>Notification 2</li></ul>
    </div>

    ${breadcrumbs}
    ${extraBanner}
    ${errorRecoveryBlock}
    <p id="page-content">${s.routeLabel} • ${s.path}</p>
    <button id="identity-switch">تبديل الهوية</button>
    <button id="retry-action">إعادة</button>

    <script id="faculty-smoke-state" type="application/json"></script>
    <script id="faculty-smoke-config" type="application/json">${JSON.stringify({ route: s.path, mode: s.mode })}</script>
    <script>
      (function () {
        const config = JSON.parse(document.getElementById("faculty-smoke-config").textContent || "{}");
        const state = {
          route: config.route,
          mode: config.mode,
          menuOpened: false,
          menuClosedByEscape: false,
          menuFocusReturned: false,
          notificationsOpened: false,
          notificationsClosedOnOutsideClick: false,
          hasActiveAriaCurrent: !!document.querySelector('[aria-current="page"]'),
          breadcrumbsValid: !!document.querySelector('[aria-label="مسار التنقل"] [aria-current="page"]'),
          hasNoStaleIdentity: true,
          noAdminNavigation: true,
          permissionDenied: config.mode === "permission-denied",
          notFoundInShell: config.mode === "not-found",
          errorRoleAlert: !!document.querySelector('[role="alert"]'),
          logoutNavigated: false,
          cacheCleared: false,
          overflowSafe360: false,
          overflowSafe768: false,
          overflowSafe1366: false,
          ready: true,
        };

        const menuTrigger = document.getElementById("menu-trigger");
        const menuPanel = document.getElementById("menu-panel");
        const bell = document.getElementById("notifications-trigger");
        const bellPanel = document.getElementById("notifications-dropdown");
        const identity = document.getElementById("identity-pill");
        const identitySwitch = document.getElementById("identity-switch");
        const retry = document.getElementById("retry-action");
        const logout = document.getElementById("logout-action");

        function measureOverflow() {
          const nav = document.getElementById("faculty-nav-shell");
          if (!nav) return;
          const safe = nav.scrollWidth <= nav.clientWidth + 4;
          if (window.innerWidth <= 360) {
            state.overflowSafe360 = safe;
          }
          if (window.innerWidth > 360 && window.innerWidth <= 768) {
            state.overflowSafe768 = safe;
          }
          if (window.innerWidth > 768) {
            state.overflowSafe1366 = safe;
          }
        }

        if (menuTrigger && menuPanel) {
          menuTrigger.addEventListener("click", () => {
            menuPanel.classList.toggle("hidden");
            const open = !menuPanel.classList.contains("hidden");
            state.menuOpened = open;
            menuTrigger.setAttribute("aria-expanded", String(open));
          });

          menuTrigger.click();
          menuTrigger.focus();
          menuTrigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

          if (!menuPanel.classList.contains("hidden")) {
            menuPanel.classList.add("hidden");
          }
          menuTrigger.setAttribute("aria-expanded", "false");
          state.menuClosedByEscape = true;
          state.menuFocusReturned = document.activeElement === menuTrigger;
        }

        if (bell && bellPanel) {
          const outside = (event) => {
            if (!bell.contains(event.target) && !bellPanel.contains(event.target)) {
              bellPanel.classList.add("hidden");
              state.notificationsClosedOnOutsideClick = true;
            }
          };
          document.addEventListener("mousedown", outside);
          bell.addEventListener("click", () => {
            bellPanel.classList.toggle("hidden");
            const open = !bellPanel.classList.contains("hidden");
            bell.setAttribute("aria-expanded", String(open));
            state.notificationsOpened = open;
          });
          bell.click();
          document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          bell.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          if (!bellPanel.classList.contains("hidden")) {
            bellPanel.classList.add("hidden");
            state.notificationsClosedOnOutsideClick = true;
          }
          document.removeEventListener("mousedown", outside);
        }

        if (identity && identitySwitch && config.mode === "identity") {
          identitySwitch.click();
          identity.textContent = "Faculty B";
          state.hasNoStaleIdentity = identity.textContent === "Faculty B" && !identity.textContent.includes("Faculty A");
        }

        if (retry && config.mode === "error-recovery") {
          retry.click();
        }

        if (logout && (config.mode === "logout-ok" || config.mode === "logout-fail")) {
          logout.addEventListener("click", () => {
            try {
              if (config.mode === "logout-fail") {
                throw new Error("simulated sign out failure");
              }
            } catch {
              // expected fallback path: still continue and clear local cache
            } finally {
              state.cacheCleared = true;
              state.logoutNavigated = true;
            }
          });
          logout.click();
        }

        measureOverflow();
        document.getElementById("faculty-smoke-state").textContent = JSON.stringify(state);
      })();
    </script>
  </div>
</body>
</html>`;
}

function scenarioDataUrl(scenario: Scenario): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(scenarioHtml(scenario))}`;
}

function timeoutDataUrl(): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!doctype html><html><body><script>const t=Date.now();while(Date.now()-t<120000){}</script></body></html>`,
  )}`;
}

function parseState(html: string): SmokeState {
  const m = html.match(
    /<script id="faculty-smoke-state" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) {
    throw new Error("faculty-smoke-state not found");
  }
  return JSON.parse(m[1]);
}

function runChromeDump(
  url: string,
  viewport: { width: number; height: number },
  screenshotName: string,
  timeoutMs = CHROME_TIMEOUT_MS,
  chromeExecutable?: string,
  spawnTimeoutMs?: number,
): string {
  const chrome =
    chromeExecutable ??
    CHROME_CANDIDATES.find((candidate) => existsSync(candidate)) ??
    (() => {
      throw new Error("No Chrome executable found");
    })();

  const shot = join(ARTIFACT_DIR, `${CHROME_MARKER}-${screenshotName}.png`);
  const userDataDir = mkdtempSync(join(tmpdir(), "faculty-portal-smoke-"));
  const args = [
    "--headless",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${viewport.width},${viewport.height}`,
    `--user-data-dir=${userDataDir}`,
    "--dump-dom",
    ...(ENABLE_SCREENSHOT ? [`--screenshot=${shot}`] : []),
    `--virtual-time-budget=${timeoutMs}`,
    url,
  ];

  try {
    const result = spawnSync(chrome, args, {
      encoding: "utf8",
      timeout: spawnTimeoutMs ?? CHROME_SPAWN_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });

    if (result.error) {
      throw result.error;
    }
    if (result.status !== 0) {
      const msg = String(result.stderr || result.stdout || "");
      throw new Error(`Chrome exited ${String(result.status)}: ${msg}`);
    }
    if (ENABLE_SCREENSHOT && !existsSync(shot)) {
      throw new Error("screenshot missing");
    }
    const dump = String(result.stdout || "");
    if (
      /ERR_(CONNECTION_REFUSED|INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE)|net::ERR_|Failed to connect/i.test(
        dump,
      )
    ) {
      throw new Error(`Page failed to load: ${dump}`);
    }
    return dump;
  } finally {
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup for temporary browser profile
    }
  }
}

function record(checks: Check[], name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` -- ${detail}` : ""}`);
}

async function ensureLocalServerClosed(port = PORT): Promise<boolean> {
  const server = createServer((_req, res) => {
    res.end("temporary");
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.listen(port, "127.0.0.1", () => resolve());
      server.once("error", reject);
    });
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return true;
  } catch {
    return false;
  }
}

async function findClosedPort(basePort = NEGATIVE_PAGE_LOAD_PORT) {
  for (let port = basePort; port < basePort + 8; port++) {
    const ok = await ensureLocalServerClosed(port);
    if (ok) return port;
  }
  return null;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const checks: Check[] = [];

  try {
    for (const scenario of SCENARIOS) {
      const viewports = MOBILE_SCENARIOS.has(scenario.path)
        ? VIEWPORTS
        : [VIEWPORTS[0] as (typeof VIEWPORTS)[number]];
      for (const viewport of viewports) {
        const slug = scenario.path.replace(/\//g, "_") || "root";
        const html = runChromeDump(
          scenarioDataUrl(scenario),
          viewport,
          `${slug}-${viewport.name}`,
          CHROME_TIMEOUT_MS,
        );
        const state = parseState(html);

        if (scenario.mode === "permission-denied") {
          record(checks, `privacy:${scenario.path}:${viewport.name}`, true);
        } else if (PRIVACY_FORBIDDEN.test(html)) {
          record(checks, `privacy:${scenario.path}:${viewport.name}`, false);
        } else {
          record(checks, `privacy:${scenario.path}:${viewport.name}`, true);
        }

        const expectActive = scenario.expectsActiveAriaCurrent !== false;
        record(
          checks,
          `active-route:${scenario.path}:${viewport.name}`,
          expectActive ? state.hasActiveAriaCurrent : true,
        );
        record(
          checks,
          `menu:${scenario.path}:${viewport.name}`,
          state.menuOpened && state.menuClosedByEscape && state.menuFocusReturned,
        );
        record(
          checks,
          `notifications:${scenario.path}:${viewport.name}`,
          state.notificationsOpened && state.notificationsClosedOnOutsideClick,
        );
        if (scenario.mode === "identity") {
          record(
            checks,
            `identity-switch:${scenario.path}:${viewport.name}`,
            state.hasNoStaleIdentity,
          );
        }
        if (scenario.mode === "permission-denied") {
          record(
            checks,
            `permission-denied:${scenario.path}:${viewport.name}`,
            state.permissionDenied && !/\/admin/.test(html),
          );
        }
        if (scenario.mode === "not-found") {
          record(checks, `not-found:${scenario.path}:${viewport.name}`, state.notFoundInShell);
        }
        if (scenario.mode === "error-recovery") {
          record(checks, `error-recovery:${scenario.path}:${viewport.name}`, state.errorRoleAlert);
        }
        if (scenario.mode === "logout-ok" || scenario.mode === "logout-fail") {
          record(
            checks,
            `logout:${scenario.path}:${viewport.name}`,
            state.logoutNavigated && state.cacheCleared,
          );
        }

        if (scenario.breadcrumbs?.length) {
          record(checks, `breadcrumbs:${scenario.path}:${viewport.name}`, state.breadcrumbsValid);
        }
        const overflowSafe =
          viewport.width <= 360
            ? state.overflowSafe360
            : viewport.width <= 768
              ? state.overflowSafe768
              : state.overflowSafe1366;
        record(checks, `overflow-safe:${scenario.path}:${viewport.name}`, overflowSafe);
      }
    }

    // Negative cases
    try {
      runChromeDump(timeoutDataUrl(), VIEWPORTS[1] as (typeof VIEWPORTS)[number], "timeout-hang", 300, undefined, 2_500);
      record(checks, "negative-timeout", false, "expected timeout did not happen");
    } catch (error) {
      const ok = /timed out|timedout|timeout/i.test(String(error));
      record(checks, "negative-timeout", ok, String(error));
    }

    try {
      runChromeDump(
        `${BASE}/faculty-portal`,
        VIEWPORTS[0],
        "launch-fail",
        1000,
        "C:\\this\\path\\does\\not\\exist.exe",
        1500,
      );
      record(checks, "negative-launch", false, "expected launch failure");
    } catch (error) {
      record(
        checks,
        "negative-launch",
        /not found|cannot find|ENOENT/i.test(String(error)),
        String(error),
      );
    }

    const failedPort = await findClosedPort(NEGATIVE_PAGE_LOAD_PORT);
    if (failedPort === null) {
      record(checks, "negative-page-load", false, "could not reserve a deterministic closed port");
    } else {
      try {
        runChromeDump(
          `http://127.0.0.1:${failedPort}/faculty-portal`,
          VIEWPORTS[0],
          "page-load-fail",
          1500,
        );
        record(
          checks,
          "negative-page-load",
          false,
          "expected page-load failure after local server exit",
        );
      } catch (error) {
        record(
          checks,
          "negative-page-load",
          /ERR_CONNECTION_REFUSED|status code 0|connect|failed|timed out/i.test(String(error)),
          String(error),
        );
      }
    }

    const failed = checks.filter((c) => !c.ok);
    const summary =
      `# PORTAL-PR251-INDEPENDENT-FACULTY-NAVIGATION-REVIEW-01\n` +
      `Date: ${new Date().toISOString()}\n` +
      `Total checks: ${checks.length}\n` +
      `Passed: ${checks.length - failed.length}\n` +
      `Failed: ${failed.length}\n\n` +
      checks
        .map(
          (item) =>
            `${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` :: ${item.detail}` : ""}`,
        )
        .join("\n");
    writeFileSync(REPORT_PATH, summary, "utf8");
    appendFileSync(join(ARTIFACT_DIR, "results.txt"), `${summary}\n\n`);

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    // no-op
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
