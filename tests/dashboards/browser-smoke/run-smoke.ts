/**
 * Chrome headless browser smoke for PR #240 dashboard truthfulness.
 * Uses system Chrome (no Playwright launch dependency). Synthetic fixtures only.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const PORT = Number(process.env.PR240_SMOKE_PORT || 4177);
const BASE = `http://127.0.0.1:${PORT}`;
const artifactDir = join(import.meta.dir, "../../../.tmp/pr240-browser-smoke");
mkdirSync(artifactDir, { recursive: true });

const CHROME_CANDIDATES = [
  process.env.PR240_SMOKE_EXECUTABLE,
  "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe",
  "C:\\\\Program Files\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe",
].filter(Boolean) as string[];

const chrome =
  CHROME_CANDIDATES.find((p) => existsSync(p)) ||
  (() => {
    throw new Error("No Chrome/Edge executable found for browser smoke");
  })();

type Check = { name: string; ok: boolean; detail?: string };
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: string) => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const PRIVACY_FORBIDDEN =
  /user_id|profile_id|postgrest|permission denied|stack trace|supabase\.co|postgres|relation "|column "|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

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
  if (r.status !== 0 && !r.stdout) {
    throw new Error(`dump-dom failed for ${url}: ${r.stderr}`);
  }
  return r.stdout || "";
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
    { encoding: "utf8" },
  );
  // Chrome prints "bytes written" to stderr; status may still be 0.
  if (!existsSync(path) || readFileSync(path).byteLength < 1000) {
    throw new Error(`screenshot missing for ${name}: ${r.stderr || r.stdout}`);
  }
  return path;
}

function extractSmokeJson(html: string): Record<string, unknown> | null {
  const m = html.match(/data-smoke-json="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/&quot;/g, '"'));
  } catch {
    return null;
  }
}

function main() {
  // Student loading
  screenshot(`${BASE}/student-loading.html`, "student-loading", 1366, 768);
  {
    const html = dumpDom(`${BASE}/student-loading.html`);
    record("student-loading-busy", html.includes('aria-busy="true"'));
    record(
      "student-loading-no-zero-metric",
      !/data-testid="metric-students"[^>]*>[^<]*[0٠]/.test(html),
    );
    record("privacy:student-loading", !PRIVACY_FORBIDDEN.test(html));
  }

  // Student error + in-page interaction harness
  screenshot(`${BASE}/student-error.html`, "student-error", 1366, 768);
  {
    const html = dumpDom(`${BASE}/student-error.html`);
    const smoke = extractSmokeJson(html);
    record("student-error-focus-alert", smoke?.focusAlert === true, JSON.stringify(smoke));
    record("student-retry-keyboard", Number(smoke?.retryCount ?? 0) >= 1);
    record("student-retry-finite", smoke?.retryFinite === true);
    record("student-error-not-empty-copy", !html.includes("لم يتم تسجيلك في أي مجموعة دراسية بعد"));
    record("privacy:student-error", !PRIVACY_FORBIDDEN.test(html));
  }

  screenshot(`${BASE}/student-empty.html`, "student-empty", 1366, 768);
  {
    const html = dumpDom(`${BASE}/student-empty.html`);
    record("student-empty-genuine", html.includes("لا توجد درجات معتمدة حالياً"));
  }

  screenshot(`${BASE}/student-success.html`, "student-success", 1366, 768);
  {
    const html = dumpDom(`${BASE}/student-success.html`);
    const smoke = extractSmokeJson(html);
    record("logout-clears-cache", smoke?.cacheCleared === true, JSON.stringify(smoke));
    record("second-identity-no-stale", smoke?.noStale === true, JSON.stringify(smoke));
    record("success-no-skeleton", !html.includes('class="skeleton"'));
  }

  screenshot(`${BASE}/faculty-error.html`, "faculty-error", 1366, 768);
  {
    const html = dumpDom(`${BASE}/faculty-error.html`);
    record("faculty-rtl", html.includes('dir="rtl"'));
    record("faculty-error-alert", html.includes('role="alert"'));
    record("privacy:faculty-error", !PRIVACY_FORBIDDEN.test(html));
  }

  screenshot(`${BASE}/faculty-success.html`, "faculty-success", 1366, 768);
  {
    const html = dumpDom(`${BASE}/faculty-success.html`);
    record("faculty-no-cross-dept", html.includes("لا بيانات قسم آخر"));
  }

  screenshot(`${BASE}/admin-loading-metrics.html`, "admin-loading-metrics", 1366, 768);
  {
    const html = dumpDom(`${BASE}/admin-loading-metrics.html`);
    record("admin-loading-shows-dash", html.includes("—") && html.includes("القيمة غير متاحة"));
    record(
      "admin-loading-not-zero",
      !/data-testid="metric-students"[\s\S]{0,120}>[0٠]</.test(html),
    );
    const readiness = html.includes('data-testid="readiness-pending"')
      ? html.slice(html.indexOf('data-testid="readiness-pending"'))
      : "";
    record(
      "admin-readiness-pending-not-fail",
      readiness.includes("WARNING") && !readiness.includes("FAIL"),
    );
  }

  screenshot(`${BASE}/admin-partial-error.html`, "admin-partial-error", 1366, 768);
  {
    const html = dumpDom(`${BASE}/admin-partial-error.html`);
    record("admin-partial-error-banner", html.includes("admin-dashboard-partial-error"));
    record("admin-error-shows-dash", html.includes("—"));
    record(
      "admin-readiness-error-warning",
      html.includes("تعذّر التحقق") && html.includes("WARNING"),
    );
  }

  screenshot(`${BASE}/admin-real-zero.html`, "admin-real-zero-metrics", 1366, 768);
  {
    const html = dumpDom(`${BASE}/admin-real-zero.html`);
    record("admin-real-zero", /data-testid="metric-zero"[\s\S]{0,80}>[0٠]</.test(html));
  }

  // Viewports — screenshot + dump for overflow marker written by page script
  for (const vp of [
    { w: 360, h: 800, name: "mobile-360", shot: "mobile-rtl" },
    { w: 768, h: 1024, name: "tablet-768", shot: null as string | null },
    { w: 1366, h: 768, name: "desktop-1366", shot: null as string | null },
  ]) {
    const url = `${BASE}/mobile-rtl.html?w=${vp.w}&h=${vp.h}`;
    if (vp.shot) screenshot(url, vp.shot, vp.w, vp.h);
    const html = dumpDom(url, vp.w, vp.h);
    const smoke = extractSmokeJson(html);
    record(
      `viewport-no-overflow:${vp.name}`,
      smoke?.noHorizontalOverflow === true,
      JSON.stringify(smoke),
    );
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
  console.log(`\nBrowser smoke: ${report.passed}/${report.total} passed`);
  console.log(`Artifacts: ${artifactDir}`);
  if (failed.length) process.exit(1);
}

main();
