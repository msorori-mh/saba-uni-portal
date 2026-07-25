/**
 * Unified Chrome headless smoke for PR246 + PR249 student experience preflight.
 * Hard-fails on missing Chrome, page load failure, empty DOM, or assertion misses.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PORT = Number(process.env.PR246_PR249_SMOKE_PORT || 4180);
const BASE = `http://127.0.0.1:${PORT}`;
const artifactDir = join(import.meta.dir, "../../.tmp/pr246-pr249-integration-smoke");
mkdirSync(artifactDir, { recursive: true });

const chrome = [
  process.env.PR246_PR249_SMOKE_EXECUTABLE,
  "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
]
  .filter(Boolean)
  .find((p) => existsSync(p as string)) as string;

if (!chrome) {
  console.error("FAIL chrome-available — no Chrome/Edge executable");
  process.exit(2);
}

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const PRIVACY =
  /\buser_id\b|\bprofile_id\b|postgrest|permission denied for|stack trace|supabase\.co|\bpostgres\b|relation "|rpc_|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

async function assertServerAlive() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`health ${res.status}`);
    record("server-alive", true);
  } catch (e) {
    record("server-alive", false, String(e));
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function dumpDom(url: string, width = 1366, height = 768): string {
  const r = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--window-size=${width},${height}`,
      "--virtual-time-budget=4000",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 30_000 },
  );
  if (r.error) throw new Error(`chrome spawn error: ${r.error.message}`);
  if (r.signal) throw new Error(`chrome killed by signal ${r.signal}`);
  if (r.status !== 0 && !r.stdout) {
    throw new Error(`dump-dom failed status=${r.status}: ${r.stderr}`);
  }
  const html = r.stdout || "";
  if (html.length < 200 || !html.includes("<html")) {
    throw new Error(`page load/empty DOM for ${url} (len=${html.length})`);
  }
  return html;
}

function screenshot(url: string, name: string, width: number, height: number) {
  const path = join(artifactDir, `${name}.png`);
  const r = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--window-size=${width},${height}`,
      `--screenshot=${path}`,
      url,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (r.error || (r.status !== 0 && !existsSync(path))) {
    throw new Error(`screenshot failed ${name}: ${r.stderr || r.error?.message}`);
  }
  if (!existsSync(path) || readFileSync(path).byteLength < 800) {
    throw new Error(`screenshot missing/too small: ${name}`);
  }
}

function smoke(html: string): Record<string, unknown> | null {
  const m = html.match(/data-smoke-json="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(
      m[1]
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'"),
    );
  } catch {
    return null;
  }
}

async function main() {
  await assertServerAlive();
  record("chrome-available", true, chrome);

  const scenarios: Array<{
    id: string;
    page: string;
    shot?: string;
    w?: number;
    h?: number;
    assert: (s: Record<string, unknown> | null, html: string) => void;
  }> = [
    {
      id: "01-portal-open",
      page: "portal-home.html",
      shot: "portal-home",
      assert: (s) =>
        record("01-portal-open", s?.portalOpen === true && s?.dir === "rtl", JSON.stringify(s)),
    },
    {
      id: "02-03-menu-escape-focus",
      page: "menu-keyboard.html",
      shot: "menu-keyboard",
      assert: (s) =>
        record(
          "02-03-menu-escape-focus",
          s?.opened === true &&
            s?.closed === true &&
            s?.focusBack === true &&
            s?.ariaControls === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "04-05-enrollment-normal",
      page: "normal-open.html",
      shot: "normal-open",
      assert: (s) =>
        record(
          "04-05-enrollment-normal-no-rose",
          s?.hasRose === false && s?.dir === "rtl",
          JSON.stringify(s),
        ),
    },
    {
      id: "06-violation-true",
      page: "violation-true.html",
      shot: "violation-true",
      assert: (s) =>
        record(
          "06-violation-true",
          s?.hasRose === true && s?.reason === true && s?.roleAlert === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "07-permission-denied",
      page: "types-load-failure.html",
      shot: "types-load-failure",
      assert: (s) =>
        record(
          "07-permission-or-types-failure-not-empty",
          s?.hasSafeError === true && s?.emptyHidden === true && s?.noRaw === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "08-network-failure",
      page: "network-failure.html",
      shot: "network-failure",
      assert: (s) =>
        record(
          "08-network-failure",
          s?.safeArabic === true && s?.noRaw === true && s?.roleAlert === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "09-cancelled",
      page: "lifecycle-cancelled.html",
      assert: (s) => record("09-cancelled-protected", s?.ok === true, JSON.stringify(s)),
    },
    {
      id: "10-rejected",
      page: "lifecycle-rejected.html",
      assert: (s) => record("10-rejected-protected", s?.ok === true, JSON.stringify(s)),
    },
    {
      id: "11-returned",
      page: "lifecycle-returned.html",
      assert: (s) => record("11-returned-protected", s?.ok === true, JSON.stringify(s)),
    },
    {
      id: "12-13-study-plan-logout",
      page: "study-plan-states.html",
      shot: "study-plan-states",
      assert: (s) =>
        record(
          "12-13-study-plan-logout",
          s?.errorNoEmpty === true &&
            s?.emptyOk === true &&
            s?.successOk === true &&
            s?.logoutWorks === true &&
            s?.noRaw === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "14-identity-switch",
      page: "identity-switch.html",
      shot: "identity-switch",
      assert: (s) =>
        record(
          "14-identity-switch-no-stale",
          s?.switched === true && s?.noStaleCache === true && s?.noPriorIdentity === true,
          JSON.stringify(s),
        ),
    },
    {
      id: "15-nested-active",
      page: "bottom-nav-nested.html",
      shot: "bottom-nav-nested",
      assert: (s) =>
        record(
          "15-nested-mobile-active",
          s?.nestedKeepsRequests === true && s?.count === 5,
          JSON.stringify(s),
        ),
    },
    {
      id: "16-360-rtl",
      page: "mobile-rtl.html?w=360",
      shot: "mobile-rtl",
      w: 360,
      h: 800,
      assert: (s) =>
        record(
          "16-360-rtl-no-overflow",
          s?.noHorizontalOverflow === true && s?.dir === "rtl",
          JSON.stringify(s),
        ),
    },
  ];

  for (const sc of scenarios) {
    await assertServerAlive();
    const url = `${BASE}/${sc.page}`;
    if (sc.shot) screenshot(url, sc.shot, sc.w || 1366, sc.h || 768);
    const html = dumpDom(url, sc.w || 1366, sc.h || 768);
    const privacyHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    record(`17-privacy:${sc.page.split("?")[0]}`, !PRIVACY.test(privacyHtml));
    const s = smoke(html);
    if (!s) {
      record(sc.id, false, "missing data-smoke-json");
      continue;
    }
    sc.assert(s, html);
  }

  // Extra a11y contracts carried from PR249.
  {
    const html = dumpDom(`${BASE}/notifications.html`);
    const s = smoke(html);
    record(
      "bell-aria-controls",
      s?.ariaControls === true && s?.panelId === true && s?.focusBack === true,
      JSON.stringify(s),
    );
  }
  {
    const html = dumpDom(`${BASE}/error-recovery.html`);
    const s = smoke(html);
    record(
      "error-recovery-stays-student",
      s?.staysInStudent === true && s?.backHref === "/student",
      JSON.stringify(s),
    );
  }

  await assertServerAlive();

  const failed = checks.filter((c) => !c.ok);
  const report = {
    harness: "chrome-headless-dump-dom",
    chrome,
    base: BASE,
    artifactDir,
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.map((f) => f.name),
    checks,
  };
  writeFileSync(join(artifactDir, "smoke-results.json"), JSON.stringify(report, null, 2));
  console.log(`\nIntegration browser smoke: ${report.passed}/${report.total} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("FAIL harness-exception", err);
  process.exit(2);
});
