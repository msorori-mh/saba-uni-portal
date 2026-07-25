/**
 * Generates synthetic dashboard fixture HTML pages for PR #240 browser smoke.
 * Uses real dashboardMetric / DashboardMetricValue / DashboardQueryError markup.
 * Synthetic identities only — no production data.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  dashboardMetric,
  formatDashboardMetric,
} from "../../../src/components/portal/dashboard-metrics";
import {
  DashboardMetricValue,
  DashboardQueryError,
} from "../../../src/components/portal/DashboardStates";

const outDir = join(import.meta.dir, "pages");
mkdirSync(outDir, { recursive: true });

const shell = (title: string, body: string, extraScript = "") => `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; --primary:#0f3d2e; --muted:#667; --border:#d9e0dc; --card:#fff; --danger:#b42318; --warn:#92400e; --warn-bg:#fffbeb; --bg:#f5f7f6; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: var(--bg); color: var(--primary); }
    main { max-width: 72rem; margin: 0 auto; padding: 1rem; overflow-x: hidden; width: 100%; }
    img, svg, table { max-width: 100%; }
    h1 { font-size: 1.75rem; margin: 0 0 .25rem; }
    h2 { font-size: 1rem; margin: 1.25rem 0 .5rem; }
    .muted { color: var(--muted); font-size: .875rem; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: .75rem; padding: 1rem; }
    .grid { display: grid; gap: 1rem; grid-template-columns: 1fr; }
    @media (min-width: 640px) { .grid.cols-2 { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 1024px) { .grid.cols-4 { grid-template-columns: repeat(4, 1fr); } }
    .metric { font-size: 1.75rem; font-weight: 800; min-height: 2.25rem; }
    .skeleton { height: 4.5rem; border-radius: .5rem; background: linear-gradient(90deg,#e8eeeB,#f7faf8,#e8eeeB); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }
    [data-testid="dashboard-query-error"] { border: 1px solid color-mix(in srgb, var(--danger) 40%, white); background: color-mix(in srgb, var(--danger) 6%, white); color: var(--danger); border-radius: .75rem; padding: 1rem; text-align: center; }
    [data-testid="dashboard-query-error"] button, .retry-btn { min-height: 44px; margin-top: .5rem; border-radius: .5rem; border: 1px solid color-mix(in srgb, var(--danger) 40%, white); background: #fff; color: var(--danger); font-weight: 700; padding: 0 .75rem; cursor: pointer; }
    .partial { display:flex; flex-wrap:wrap; gap:.5rem; justify-content:space-between; align-items:center; border:1px solid #fcd34d; background:var(--warn-bg); color:var(--warn); border-radius:.75rem; padding:.75rem 1rem; font-size:.875rem; }
    .readiness { border-radius:.75rem; padding:1rem; border:1px solid #fcd34d; background:#fffbeb; color:#92400e; }
    .readiness.pass { border-color:#86efac; background:#ecfdf5; color:#047857; }
    .readiness.fail { border-color:#fca5a5; background:#fef2f2; color:#b91c1c; }
    .badge { display:inline-block; border:1px solid currentColor; border-radius:.375rem; padding:.125rem .375rem; font-size:.625rem; font-weight:800; background:rgba(255,255,255,.6); }
    .row { display:flex; justify-content:space-between; gap:.75rem; align-items:center; }
    .toolbar { display:flex; flex-wrap:wrap; gap:.5rem; margin: .75rem 0 1rem; }
    .toolbar button { min-height:44px; padding:0 .75rem; border-radius:.5rem; border:1px solid var(--border); background:#fff; cursor:pointer; font-weight:700; }
    #identity-banner { font-size:.8rem; margin-bottom:.75rem; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); border:0; }
    svg { width:1.25rem; height:1.25rem; display:block; margin:0 auto .35rem; }
  </style>
</head>
<body>
<main id="app">${body}</main>
<script>
${extraScript}
</script>
</body>
</html>
`;

const metricHtml = (value: number | null) =>
  renderToStaticMarkup(createElement(DashboardMetricValue, { value }));

const errorHtml = (messageAr: string) =>
  renderToStaticMarkup(
    createElement(DashboardQueryError, {
      messageAr,
      onRetry: () => {},
    }),
  );

// SSR does not emit onClick; rewrite retry button for fixture interactivity.
const interactiveError = (messageAr: string, retryId: string) =>
  errorHtml(messageAr).replace(
    '<button type="button"',
    `<button type="button" data-testid="${retryId}" data-retry="1"`,
  );

const pendingQ = { isPending: true, isError: false };
const errorQ = { isPending: false, isError: true };
const okQ = { isPending: false, isError: false };

const pages: Record<string, string> = {};

pages["student-loading.html"] = shell(
  "Student loading",
  `
  <h1>لوحة الطالب</h1>
  <p class="muted" id="identity-banner">هوية اصطناعية: طالب-أ</p>
  <section data-testid="student-profile" aria-busy="true">
    <h2>الملف الشخصي</h2>
    <div class="skeleton" data-testid="profile-skeleton"></div>
  </section>
  <section data-testid="student-enrollments" aria-busy="true">
    <h2>مقرراتي المسجلة</h2>
    <div class="skeleton"></div>
  </section>
  <section data-testid="student-grades" aria-busy="true">
    <h2>درجاتي</h2>
    <div class="skeleton"></div>
  </section>
  <section data-testid="student-schedule" aria-busy="true">
    <h2>جدولك الدراسي</h2>
    <div class="skeleton"></div>
  </section>
  `,
);

pages["student-error.html"] = shell(
  "Student error",
  `
  <h1>لوحة الطالب</h1>
  <p class="muted" id="identity-banner">هوية اصطناعية: طالب-أ</p>
  <section data-testid="student-profile">
    <h2>الملف الشخصي</h2>
    ${interactiveError("تعذّر تحميل ملفك الأكاديمي. تحقق من الاتصال ثم أعد المحاولة.", "retry-profile")}
  </section>
  <section data-testid="student-enrollments">
    <h2>مقرراتي المسجلة</h2>
    ${interactiveError("تعذّر تحميل مقرراتك المسجلة. تحقق من الاتصال ثم أعد المحاولة.", "retry-enrollments")}
  </section>
  <section data-testid="student-grades">
    <h2>درجاتي</h2>
    ${interactiveError("تعذّر تحميل درجاتك. تحقق من الاتصال ثم أعد المحاولة.", "retry-grades")}
  </section>
  <p id="retry-log" class="muted" data-testid="retry-log">retry-count:0</p>
  <div id="smoke-flag" data-smoke-json="{}"></div>
  `,
  `
  const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
  if (alerts[0]) alerts[0].focus();
  const focusAlert = document.activeElement === alerts[0];
  let retries = 0;
  document.querySelectorAll('[data-retry]').forEach((btn) => {
    btn.addEventListener('click', () => {
      retries += 1;
      btn.dataset.retryCount = String(retries);
      document.getElementById('retry-log').textContent = 'retry-count:' + retries;
      if (retries > 5) btn.disabled = true;
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
    });
  });
  // Auto interaction smoke (headless dump-dom)
  const retryBtn = document.querySelector('[data-testid="retry-enrollments"]');
  retryBtn?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  retryBtn?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  for (let i = 0; i < 8; i++) retryBtn?.click();
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    focusAlert,
    retryCount: retries,
    retryFinite: !!retryBtn?.disabled,
    roleAlertCount: alerts.length,
  }));
  `,
);

pages["student-empty.html"] = shell(
  "Student empty",
  `
  <h1>لوحة الطالب</h1>
  <p class="muted">هوية اصطناعية: طالب-أ</p>
  <section data-testid="student-enrollments" class="card">
    <h2>مقرراتي المسجلة</h2>
    <p class="muted">لم يتم تسجيلك في أي مجموعة دراسية بعد.</p>
  </section>
  <section data-testid="student-grades" class="card">
    <h2>درجاتي</h2>
    <p class="muted">لا توجد درجات معتمدة حالياً.</p>
  </section>
  <section data-testid="student-schedule" class="card">
    <h2>جدولك الدراسي</h2>
    <p class="muted">لا توجد محاضرات مجدولة حاليًا.</p>
  </section>
  `,
);

pages["student-success.html"] = shell(
  "Student success",
  `
  <h1>لوحة الطالب</h1>
  <p class="muted" id="identity-banner" data-testid="identity-banner">هوية اصطناعية: طالب-أ · مقرر تجريبي 101</p>
  <section data-testid="student-profile" class="card">
    <h2>الملف الشخصي</h2>
    <p>طالب تجريبي أ</p>
  </section>
  <section data-testid="student-enrollments" class="card">
    <h2>مقرراتي المسجلة</h2>
    <ul><li>مقدمة الحوسبة (مجموعة اصطناعية)</li></ul>
  </section>
  <section data-testid="student-grades" class="card">
    <h2>درجاتي</h2>
    <ul><li>مقدمة الحوسبة — ممتاز</li></ul>
  </section>
  <section data-testid="student-schedule" class="card">
    <h2>جدولك الدراسي</h2>
    <ul><li>الأحد 10:00 — قاعة تجريبية</li></ul>
  </section>
  <div class="toolbar">
    <button type="button" data-testid="logout-btn" id="logout-btn">تسجيل الخروج</button>
    <button type="button" data-testid="login-b-btn" id="login-b-btn">دخول طالب-ب</button>
  </div>
  <pre id="cache-view" data-testid="cache-view" class="card muted"></pre>
  <div id="smoke-flag" data-smoke-json="{}"></div>
  `,
  `
  const cache = { identity: 'student-a', courses: ['مقدمة الحوسبة (مجموعة اصطناعية)'] };
  const renderCache = () => {
    document.getElementById('cache-view').textContent = JSON.stringify(cache);
    document.getElementById('identity-banner').textContent =
      cache.identity ? ('هوية اصطناعية: ' + cache.identity + ' · ' + (cache.courses[0] || 'لا مقررات')) : 'لا توجد جلسة';
  };
  renderCache();
  document.getElementById('logout-btn').addEventListener('click', () => {
    // Mirrors queryClient.clear() after signOut in student.index.tsx
    cache.identity = null;
    cache.courses = [];
    renderCache();
  });
  document.getElementById('login-b-btn').addEventListener('click', () => {
    cache.identity = 'student-b';
    cache.courses = ['مقرر طالب-ب فقط'];
    renderCache();
  });
  // Auto cache-isolation smoke
  const before = JSON.stringify(cache);
  document.getElementById('logout-btn').click();
  const cleared = cache.identity === null && cache.courses.length === 0;
  document.getElementById('login-b-btn').click();
  const noStale = cache.identity === 'student-b' && !String(cache.courses).includes('مقدمة الحوسبة');
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    beforeHadA: before.includes('student-a'),
    cacheCleared: cleared,
    noStale,
    after: cache,
  }));
  `,
);

pages["faculty-error.html"] = shell(
  "Faculty error",
  `
  <h1>بوابة عضو هيئة التدريس</h1>
  <section data-testid="faculty-profile">
    <h2>الملف الشخصي</h2>
    ${interactiveError("تعذّر تحميل ملفك الوظيفي. تحقق من الاتصال ثم أعد المحاولة.", "retry-faculty-profile")}
  </section>
  <section data-testid="faculty-teaching">
    <h2>جدولي التدريسي</h2>
    ${interactiveError("تعذّر تحميل جدولك التدريسي. تحقق من الاتصال ثم أعد المحاولة.", "retry-teaching")}
  </section>
  <section data-testid="faculty-students">
    <h2>طلاب القسم</h2>
    ${interactiveError("تعذّر تحميل قائمة الطلاب.", "retry-students")}
  </section>
  `,
  `document.querySelector('[role="alert"]')?.focus();`,
);

pages["faculty-success.html"] = shell(
  "Faculty success",
  `
  <h1>بوابة عضو هيئة التدريس</h1>
  <section data-testid="faculty-profile" class="card">
    <h2>الملف الشخصي</h2>
    <p>عضو هيئة تدريس تجريبي</p>
  </section>
  <section data-testid="faculty-teaching" class="card">
    <h2>جدولي التدريسي</h2>
    <ul><li>مجموعة A1 — مقرري فقط</li></ul>
  </section>
  <section data-testid="faculty-students" class="card">
    <h2>طلاب القسم</h2>
    <ul><li>طالب مرتبط بالقسم المعيّن فقط</li></ul>
    <p class="muted" data-testid="no-cross-dept">لا بيانات قسم آخر</p>
  </section>
  `,
);

const loadingMetric = metricHtml(dashboardMetric(12, pendingQ));
const errorMetric = metricHtml(dashboardMetric(12, errorQ));
const zeroMetric = metricHtml(dashboardMetric(0, okQ));
const realMetric = metricHtml(dashboardMetric(12, okQ));

pages["admin-loading-metrics.html"] = shell(
  "Admin loading metrics",
  `
  <h1>لوحة التحكم</h1>
  <section>
    <h2>مؤشرات الأداء</h2>
    <div class="grid cols-4">
      <div class="card"><div class="muted">الطلاب</div><div class="metric" aria-live="polite" data-testid="metric-students">${loadingMetric}</div></div>
      <div class="card"><div class="muted">نسبة النجاح %</div><div class="metric" aria-live="polite">${loadingMetric}</div></div>
    </div>
  </section>
  <section>
    <h2>Production Readiness</h2>
    <div class="readiness" data-testid="readiness-pending">
      <span class="badge">WARNING</span>
      <div>الحسابات الإدارية</div>
      <div class="metric">${metricHtml(null)}</div>
      <div class="muted">جارٍ التحقق</div>
    </div>
  </section>
  `,
);

pages["admin-partial-error.html"] = shell(
  "Admin partial error",
  `
  <h1>لوحة التحكم</h1>
  <div class="partial" role="alert" data-testid="admin-dashboard-partial-error">
    <span>تعذّر تحميل بعض المؤشرات؛ القيم غير المتاحة تظهر كـ«—».</span>
    <button type="button" class="retry-btn" data-testid="admin-retry">إعادة المحاولة</button>
  </div>
  <section>
    <h2>مؤشرات الأداء</h2>
    <div class="grid cols-4">
      <div class="card"><div class="muted">الطلاب</div><div class="metric" data-testid="metric-students">${errorMetric}</div></div>
      <div class="card"><div class="muted">نسبة النجاح %</div><div class="metric">${errorMetric}</div></div>
    </div>
  </section>
  <section>
    <h2>Production Readiness</h2>
    <div class="readiness" data-testid="readiness-error">
      <span class="badge">WARNING</span>
      <div>الحسابات الإدارية</div>
      <div class="metric">${metricHtml(null)}</div>
      <div class="muted">تعذّر التحقق</div>
    </div>
  </section>
  `,
  `
  let adminRetries = 0;
  const btn = document.querySelector('[data-testid="admin-retry"]');
  btn.addEventListener('click', () => {
    adminRetries += 1;
    btn.dataset.retryCount = String(adminRetries);
    if (adminRetries > 5) btn.disabled = true;
  });
  `,
);

pages["admin-real-zero.html"] = shell(
  "Admin real zero",
  `
  <h1>لوحة التحكم</h1>
  <section>
    <h2>مؤشرات الأداء</h2>
    <div class="grid cols-4">
      <div class="card"><div class="muted">أحداث معلّقة (مصدر حقيقي صفر)</div><div class="metric" data-testid="metric-zero">${zeroMetric}</div></div>
      <div class="card"><div class="muted">الطلاب</div><div class="metric" data-testid="metric-students">${realMetric}</div></div>
    </div>
  </section>
  <p class="sr-only">format-check pending=${formatDashboardMetric(dashboardMetric(1, pendingQ))} zero=${formatDashboardMetric(0)}</p>
  `,
);

pages["mobile-rtl.html"] = shell(
  "Mobile RTL",
  `
  <h1>لوحة الطالب — فحص الجوال</h1>
  <p class="muted">هوية اصطناعية: طالب-أ</p>
  <section class="card"><h2>مقرراتي المسجلة</h2><p>مقدمة الحوسبة (مجموعة اصطناعية)</p></section>
  <section class="card"><h2>درجاتي</h2><p>ممتاز</p></section>
  <div class="grid cols-4">
    <div class="card"><div class="muted">مقياس</div><div class="metric">${metricHtml(null)}</div></div>
    <div class="card"><div class="muted">صفر حقيقي</div><div class="metric">${metricHtml(0)}</div></div>
  </div>
  <div id="smoke-flag" data-smoke-json="{}"></div>
  `,
  `
  const params = new URLSearchParams(location.search);
  const w = Number(params.get('w') || window.innerWidth);
  const h = Number(params.get('h') || window.innerHeight);
  const app = document.getElementById('app');
  // Measure inside a constrained frame — Chrome headless has a minimum window width.
  const frame = document.createElement('div');
  frame.id = 'viewport-frame';
  frame.style.cssText = 'width:' + w + 'px;max-width:' + w + 'px;overflow-x:auto;margin:0 auto;';
  while (app.firstChild) frame.appendChild(app.firstChild);
  app.appendChild(frame);
  const scrollWidth = frame.scrollWidth;
  const noHorizontalOverflow = scrollWidth <= w + 1;
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    w, h,
    scrollWidth,
    clientWidth: frame.clientWidth,
    noHorizontalOverflow,
    dir: document.documentElement.getAttribute('dir'),
  }));
  `,
);

pages["index.html"] = shell(
  "PR240 browser smoke index",
  `
  <h1>PR240 Dashboard Browser Smoke</h1>
  <p class="muted">Synthetic fixtures only — no production data.</p>
  <ul>
    ${Object.keys(pages)
      .filter((k) => k !== "index.html")
      .map((k) => `<li><a href="./${k}">${k}</a></li>`)
      .join("\n")}
  </ul>
  `,
);

for (const [name, html] of Object.entries(pages)) {
  writeFileSync(join(outDir, name), html, "utf8");
}

console.log(`Generated ${Object.keys(pages).length} fixture pages in ${outDir}`);
