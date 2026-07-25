import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PORT = Number(process.env.PR249_SMOKE_PORT || 4179);
const BASE = `http://127.0.0.1:${PORT}`;
const artifactDir = join(import.meta.dir, "../../../.tmp/pr249-nav-smoke");
mkdirSync(artifactDir, { recursive: true });

const chrome = [
  process.env.PR249_SMOKE_EXECUTABLE,
  "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
]
  .filter(Boolean)
  .find((p) => existsSync(p as string)) as string;
if (!chrome) throw new Error("No Chrome/Edge for nav smoke");

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const PRIVACY =
  /\buser_id\b|\bprofile_id\b|postgrest|permission denied for|stack trace|supabase\.co|\bpostgres\b|relation "|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function dumpDom(url: string, width = 1366, height = 768) {
  const r = spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--window-size=${width},${height}`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      url,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (r.status !== 0 && !r.stdout) throw new Error(`dump-dom failed: ${r.stderr}`);
  return r.stdout || "";
}

function screenshot(url: string, name: string, width: number, height: number) {
  const path = join(artifactDir, `${name}.png`);
  spawnSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--window-size=${width},${height}`,
      `--screenshot=${path}`,
      url,
    ],
    { encoding: "utf8" },
  );
  if (!existsSync(path) || readFileSync(path).byteLength < 800) {
    throw new Error(`screenshot missing ${name}`);
  }
}

function smoke(html: string): Record<string, unknown> | null {
  const m = html.match(/data-smoke-json="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
  } catch {
    return null;
  }
}

function main() {
  const cases: Array<{
    page: string;
    shot?: string;
    w?: number;
    h?: number;
    assert: (s: Record<string, unknown> | null) => void;
  }> = [
    {
      page: "menu-keyboard.html",
      shot: "menu-keyboard",
      assert: (s) => {
        record(
          "menu-open-close-escape",
          s?.opened === true && s?.closed === true && s?.focusBack === true,
        );
        record("menu-aria-controls", s?.ariaControls === true && s?.dir === "rtl");
      },
    },
    {
      page: "notifications.html",
      shot: "notifications",
      assert: (s) => {
        record("bell-aria-controls", s?.ariaControls === true && s?.panelId === true);
        record(
          "bell-escape-focus",
          s?.openOk === true && s?.closed === true && s?.focusBack === true,
        );
      },
    },
    {
      page: "breadcrumb.html",
      shot: "breadcrumb",
      assert: (s) =>
        record(
          "breadcrumb-single-nav",
          s?.singleNav === true && s?.nestedNavCount === 1,
          JSON.stringify(s),
        ),
    },
    {
      page: "bottom-nav-nested.html",
      shot: "bottom-nav-nested",
      assert: (s) =>
        record(
          "bottom-nav-nested-active",
          s?.nestedKeepsRequests === true && s?.count === 5,
          JSON.stringify(s),
        ),
    },
    {
      page: "study-plan-states.html",
      shot: "study-plan-states",
      assert: (s) => {
        record("study-plan-error-not-empty", s?.errorNoEmpty === true, JSON.stringify(s));
        record("study-plan-states", s?.emptyOk === true && s?.successOk === true);
        record("study-plan-logout", s?.logoutWorks === true);
        record("study-plan-no-raw", s?.noRaw === true);
      },
    },
    {
      page: "error-recovery.html",
      shot: "error-recovery",
      assert: (s) =>
        record("error-recovery-student", s?.staysInStudent === true && s?.backHref === "/student"),
    },
    {
      page: "mobile-rtl.html?w=360",
      shot: "mobile-rtl",
      w: 360,
      h: 800,
      assert: (s) =>
        record(
          "mobile-360-rtl",
          s?.noHorizontalOverflow === true && s?.dir === "rtl",
          JSON.stringify(s),
        ),
    },
  ];

  for (const c of cases) {
    const url = `${BASE}/${c.page}`;
    if (c.shot) screenshot(url, c.shot, c.w || 1366, c.h || 768);
    const html = dumpDom(url, c.w || 1366, c.h || 768);
    const privacyHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    record(`privacy:${c.page.split("?")[0]}`, !PRIVACY.test(privacyHtml));
    c.assert(smoke(html));
  }

  const failed = checks.filter((x) => !x.ok);
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
  console.log(`\nNav browser smoke: ${report.passed}/${report.total} passed`);
  if (failed.length) process.exit(1);
}

main();
