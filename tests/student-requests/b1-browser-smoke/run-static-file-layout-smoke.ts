/**
 * STATIC_FILE_LAYOUT_SMOKE only — file:// layout probe.
 * This is NOT BROWSER_SMOKE. Operational browser smoke is run-http-smoke.ts.
 */
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TIMEOUT_MS = Number(process.env.B1_SMOKE_TIMEOUT_MS || 45_000);
const PRIVACY =
  /\b(?:sql|permission denied|user_id|error\.message|raw error|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\b/i;

const SERVICES = [
  "enrollment_suspension",
  "excused_absence",
  "department_transfer",
  "final_chance",
  "file_withdrawal",
] as const;

const VIEWPORTS = [
  { name: "360", width: 360, height: 800 },
  { name: "768", width: 768, height: 1024 },
  { name: "1366", width: 1366, height: 768 },
] as const;

const CHROME_CANDIDATES = [
  process.env.B1_CHROME_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean) as string[];

type PageKind = "student-list" | "student-form" | "student-detail" | "staff-inbox" | "staff-unassigned";

function pageHtml(kind: PageKind, service: string): string {
  const servicesList = SERVICES.map(
    (code) =>
      `<li data-service="${code}"><a href="./student-form-${code}.html">${code}</a></li>`,
  ).join("");

  if (kind === "student-list") {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>B1 Student Services</title>
<style>body{margin:0;font-family:Tahoma,Arial,sans-serif}main{max-width:48rem;margin:0 auto;padding:1rem;box-sizing:border-box}ul{display:grid;gap:.5rem;padding:0;list-style:none}li{border:1px solid #ccc;padding:.75rem;border-radius:.25rem;overflow-wrap:anywhere}</style></head>
<body><main id="shell" dir="rtl"><h1>الخدمات الطلابية</h1><ul data-testid="service-list">${servicesList}</ul>
<p data-testid="user-message">اختر خدمة لبدء طلب جديد.</p></main></body></html>`;
  }

  if (kind === "student-form") {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>نموذج ${service}</title>
<style>body{margin:0;font-family:Tahoma,Arial,sans-serif}main{max-width:40rem;margin:0 auto;padding:1rem;box-sizing:border-box}label{display:block;margin:.5rem 0}.actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:1rem}button{padding:.5rem .75rem}</style></head>
<body><main id="shell" dir="rtl" data-service="${service}">
<h1>طلب ${service}</h1>
<form data-testid="b1-form">
<label>ملاحظات <textarea name="notes" rows="3" style="width:100%;box-sizing:border-box"></textarea></label>
<label>مرفق آمن <input type="file" name="attachment" accept=".pdf,image/png,image/jpeg"/></label>
<div class="actions">
<button type="button" data-testid="save-draft">حفظ مسودة</button>
<button type="button" data-testid="submit">إرسال</button>
</div>
</form>
<p data-testid="user-message">تم حفظ المسودة بنجاح.</p>
</main></body></html>`;
  }

  if (kind === "student-detail") {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>تفاصيل الطلب</title></head>
<body><main id="shell" dir="rtl"><h1>تفاصيل الطلب</h1>
<p data-testid="request-number">B1-MOCK-0001</p>
<p data-testid="status">قيد المراجعة</p>
<ol data-testid="timeline"><li>استلام</li><li>مراجعة</li></ol>
<p data-testid="user-message">لا توجد مخالفة مسجّلة.</p>
</main></body></html>`;
  }

  if (kind === "staff-inbox") {
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>صندوق المهام</title>
<style>body{margin:0;font-family:Tahoma,Arial,sans-serif}main{max-width:48rem;margin:0 auto;padding:1rem;box-sizing:border-box}.row{border:1px solid #ccc;padding:.75rem;margin:.5rem 0;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}.actions button{padding:.4rem .7rem}</style></head>
<body><main id="shell" dir="rtl"><h1>الطلبات المعيّنة</h1>
<section class="row" data-testid="assigned-row" data-service="${service}">
<span>B1-MOCK-0001 — ${service}</span>
<div class="actions">
<button data-testid="action-review">مراجعة</button>
<button data-testid="action-return">إعادة</button>
<button data-testid="action-reject">رفض</button>
</div>
</section>
<p data-testid="user-message">اعرض فقط الطلبات المعيّنة لك.</p>
</main></body></html>`;
  }

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>غير معيّن</title></head>
<body><main id="shell" dir="rtl"><h1>تفاصيل الطلب</h1>
<p data-testid="request-number">B1-MOCK-0002</p>
<p data-testid="access-denied">غير مصرح لك باتخاذ إجراء على هذا الطلب.</p>
<div data-testid="actions-empty"></div>
<p data-testid="user-message">لا توجد أزرار مرحلة متاحة.</p>
</main></body></html>`;
}

function resolveChrome(): string {
  for (const c of CHROME_CANDIDATES) {
    if (c && existsSync(c)) return c;
  }
  throw new Error("Chrome/Edge executable not found");
}

function runChromeDump(fileUrl: string, width: number, height: number): string {
  const chrome = resolveChrome();
  const userData = mkdtempSync(join(tmpdir(), "b1-smoke-"));
  try {
    const out = spawnSync(
      chrome,
      [
        "--headless",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-proxy-server",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${userData}`,
        `--window-size=${width},${height}`,
        "--virtual-time-budget=5000",
        "--dump-dom",
        fileUrl,
      ],
      {
        encoding: "utf8",
        timeout: TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
        windowsHide: true,
      },
    );
    const dump = String(out.stdout || "");
    if (out.error) throw out.error;
    // Accept dump-dom HTML even when Chrome prints non-fatal GCM stderr noise.
    if (!/<html[\s>]/i.test(dump)) {
      throw new Error(`chrome failed status=${String(out.status)}: ${out.stderr || dump}`);
    }
    return dump;
  } finally {
    try {
      rmSync(userData, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function main() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "b1-smoke-pages-"));
  const files: Record<string, string> = {
    "index.html": pageHtml("student-list", "enrollment_suspension"),
    "student-detail.html": pageHtml("student-detail", "enrollment_suspension"),
    "staff-inbox.html": pageHtml("staff-inbox", "department_transfer"),
    "staff-unassigned.html": pageHtml("staff-unassigned", "department_transfer"),
  };
  for (const code of SERVICES) {
    files[`student-form-${code}.html`] = pageHtml("student-form", code);
  }
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(fixtureRoot, name), body, "utf8");
  }

  const checks: Array<{ name: string; ok: boolean }> = [];
  const routes = [
    "index.html",
    "student-form-excused_absence.html",
    "student-detail.html",
    "staff-inbox.html",
    "staff-unassigned.html",
  ] as const;

  try {
    for (const vp of VIEWPORTS) {
      for (const route of routes) {
        const fileUrl = pathToFileURL(join(fixtureRoot, route)).href;
        const dom = runChromeDump(fileUrl, vp.width, vp.height);
        const prefix = `${vp.name}/${route}`;
        checks.push({ name: `${prefix}:loaded`, ok: dom.includes("<html") && /dir=["']rtl["']/i.test(dom) });
        checks.push({ name: `${prefix}:privacy`, ok: !PRIVACY.test(dom) });
        checks.push({
          name: `${prefix}:no-false-violation-banner`,
          ok: !/تحذير مخالفة|violation banner/i.test(dom),
        });
        if (route === "index.html") {
          for (const code of SERVICES) {
            checks.push({ name: `${prefix}:service:${code}`, ok: dom.includes(`data-service="${code}"`) });
          }
        }
        if (route === "staff-inbox.html") {
          checks.push({ name: `${prefix}:assigned-actions`, ok: dom.includes('data-testid="action-review"') });
        }
        if (route === "staff-unassigned.html") {
          checks.push({
            name: `${prefix}:unassigned-no-actions`,
            ok: !dom.includes('data-testid="action-review"') && dom.includes("غير مصرح"),
          });
        }
        if (route.startsWith("student-form-")) {
          checks.push({
            name: `${prefix}:form-actions`,
            ok: dom.includes('data-testid="save-draft"') && dom.includes('data-testid="submit"'),
          });
        }
      }
    }

    const failed = checks.filter((c) => !c.ok);
    const artifactDir = join(process.cwd(), ".tmp/b1-browser-smoke");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "summary.json"),
      JSON.stringify({ total: checks.length, failed: failed.length, checks }, null, 2),
    );

    if (failed.length) {
      console.error("STATIC_FILE_LAYOUT_SMOKE_FAIL", failed.slice(0, 20));
      process.exit(1);
    }
    console.log(`STATIC_FILE_LAYOUT_SMOKE=PASS checks=${checks.length} viewports=360,768,1366`);
    console.log("NOTE=not_equal_to_BROWSER_SMOKE use run-http-smoke.ts");
  } finally {
    try {
      rmSync(fixtureRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
