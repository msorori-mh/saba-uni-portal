/**
 * Chrome headless smoke for enrollment-certificate violation banner Final RC.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PORT = Number(process.env.PR246_SMOKE_PORT || 4178);
const BASE = `http://127.0.0.1:${PORT}`;
const artifactDir = join(import.meta.dir, "../../../.tmp/pr246-banner-smoke");
mkdirSync(artifactDir, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.PR246_SMOKE_EXECUTABLE,
  "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
].filter(Boolean) as string[];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) throw new Error("No Chrome/Edge executable for banner smoke");

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const PRIVACY =
  /\buser_id\b|\bprofile_id\b|postgrest|permission denied for|stack trace|supabase\.co|\bpostgres\b|relation "|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

function dumpDom(url: string, width = 1366, height = 768): string {
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
    throw new Error(`screenshot missing: ${name}`);
  }
}

function smoke(html: string): Record<string, unknown> | null {
  const m = html.match(/data-smoke-json="([^"]*)"/);
  if (!m) return null;
  try {
    const raw = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#x27;/g, "'");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function main() {
  const scenarios: Array<{
    page: string;
    shot?: string;
    assert: (s: Record<string, unknown> | null, html: string) => void;
  }> = [
    {
      page: "normal-open.html",
      shot: "normal-open",
      assert: (s) => {
        record("normal-no-rose", s?.hasRose === false, JSON.stringify(s));
        record("normal-rtl", s?.dir === "rtl");
      },
    },
    {
      page: "loading.html",
      shot: "loading",
      assert: (s) => record("loading-no-violation", s?.hasRose === false, JSON.stringify(s)),
    },
    {
      page: "violation-true.html",
      shot: "violation-true",
      assert: (s) => {
        record("violation-rose", s?.hasRose === true && s?.reason === true, JSON.stringify(s));
        record("violation-focus-alert", s?.focusAlert === true && s?.roleAlert === true);
      },
    },
    {
      page: "violation-false.html",
      shot: "violation-false",
      assert: (s) => record("violation-false-no-rose", s?.hasRose === false),
    },
    {
      page: "violation-undefined.html",
      shot: "violation-undefined",
      assert: (s) =>
        record(
          "violation-undefined-needs-verification",
          s?.hasRose === false && s?.needsVerification === true,
          JSON.stringify(s),
        ),
    },
    {
      page: "types-load-failure.html",
      shot: "types-load-failure",
      assert: (s) => {
        record("types-failure-safe-error", s?.hasSafeError === true && s?.emptyHidden === true);
        record("types-failure-no-raw", s?.noRaw === true);
        record(
          "types-failure-retry-keyboard",
          Number(s?.retryCount ?? 0) >= 1 && s?.retryFinite === true,
        );
      },
    },
    {
      page: "network-failure.html",
      shot: "network-failure",
      assert: (s) => {
        record("network-focus-alert", s?.focusAlert === true && s?.roleAlert === true);
        record("network-safe-arabic", s?.safeArabic === true && s?.noRaw === true);
      },
    },
    {
      page: "empty-genuine.html",
      shot: "empty-genuine",
      assert: (s) => record("genuine-empty", s?.genuineEmpty === true && s?.hasRose === false),
    },
  ];

  for (const sc of scenarios) {
    const url = `${BASE}/${sc.page}`;
    if (sc.shot) screenshot(url, sc.shot, 1366, 768);
    const html = dumpDom(url);
    // Ignore inline harness scripts when scanning for leaked technical tokens.
    const privacyHtml = html.replace(/<script[\s\S]*?<\/script>/gi, "");
    record(`privacy:${sc.page}`, !PRIVACY.test(privacyHtml));
    sc.assert(smoke(html), html);
  }

  for (const status of [
    "draft",
    "submitted",
    "processing",
    "completed",
    "archived",
    "cancelled",
    "rejected",
    "returned",
    "returned_for_completion",
  ]) {
    const html = dumpDom(`${BASE}/lifecycle-${status}.html`);
    const s = smoke(html);
    record(`lifecycle:${status}`, s?.ok === true, JSON.stringify(s));
  }

  screenshot(`${BASE}/mobile-rtl.html?w=360`, "mobile-rtl", 360, 800);
  {
    const html = dumpDom(`${BASE}/mobile-rtl.html?w=360`, 360, 800);
    const s = smoke(html);
    record("mobile-360-no-overflow", s?.noHorizontalOverflow === true, JSON.stringify(s));
    record("mobile-rtl-alert", s?.dir === "rtl" && s?.hasAlert === true);
  }

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
  console.log(`\nBanner browser smoke: ${report.passed}/${report.total} passed`);
  if (failed.length) process.exit(1);
}

main();
