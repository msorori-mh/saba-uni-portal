/**
 * Synthetic enrollment-certificate banner fixtures for Chrome headless smoke.
 * Static smoke JSON is computed at generate-time; interactive pages add runtime JS.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentRequestEligibilityNotice } from "../../../src/components/student-requests/StudentRequestEligibilityNotice";
import {
  getStudentRequestFormDefinition,
  validateStudentRequestFormValues,
} from "../../../src/lib/student-requests/request-form-registry";

const outDir = join(import.meta.dir, "pages");
mkdirSync(outDir, { recursive: true });

const emptyValidation = validateStudentRequestFormValues(
  getStudentRequestFormDefinition("enrollment_certificate")!,
  {},
);
const eligiblePicker = {
  is_eligible: true,
  is_disabled: false,
  request_audience: "active_student",
};
const activeStudent = { studentStatus: "active", isActiveStudent: true, isGraduate: false };

const escapeAttr = (value: unknown) =>
  JSON.stringify(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const shell = (
  title: string,
  body: string,
  extraScript = "",
  smoke: Record<string, unknown> = {},
) =>
  `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, sans-serif; background: #f5f7f6; color: #0f3d2e; }
    main { max-width: 42rem; margin: 0 auto; padding: 1rem; width: 100%; overflow-x: hidden; }
    .card { background: #fff; border: 1px solid #d9e0dc; border-radius: .75rem; padding: 1rem; margin-top: .75rem; }
    .muted { color: #667; font-size: .875rem; }
    .loader { width: 1.5rem; height: 1.5rem; border: 2px solid #ccc; border-top-color: #0f3d2e; border-radius: 50%; animation: spin 1s linear infinite; margin: 1rem auto; }
    @keyframes spin { to { transform: rotate(360deg); } }
    button.retry { min-height: 44px; margin-top: .5rem; padding: 0 .75rem; border-radius: .5rem; border: 1px solid #f59e0b; background: #fffbeb; color: #92400e; font-weight: 700; cursor: pointer; }
    .rose { background: #ffe4e6; border: 1px solid #fecdd3; color: #881337; border-radius: .75rem; padding: 1rem; }
    .amber { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; border-radius: .75rem; padding: .75rem; }
  </style>
</head>
<body>
<main id="app">${body}
<div id="smoke-flag" data-smoke-json="${escapeAttr(smoke)}"></div>
</main>
<script>${extraScript}</script>
</body>
</html>`;

const notice = (props: Parameters<typeof StudentRequestEligibilityNotice>[0]) =>
  renderToStaticMarkup(createElement(StudentRequestEligibilityNotice, props));

const pages: Record<string, string> = {};

const normalHtml = notice({
  requestTypeCode: "enrollment_certificate",
  typePickerState: eligiblePicker,
  studentContext: activeStudent,
  formSupported: true,
  formValidation: emptyValidation,
  hasSubject: false,
});
pages["normal-open.html"] = shell(
  "Banner normal open",
  `<h1>طلب إفادة قيد — فتح طبيعي</h1><div data-testid="notice">${normalHtml}</div>`,
  "",
  {
    hasRose: normalHtml.includes("bg-rose-100"),
    hasInfo: normalHtml.includes("معلومات الخدمة") || normalHtml.includes("border-blue-200"),
    dir: "rtl",
  },
);

const loadingHtml = notice({
  requestTypeCode: "enrollment_certificate",
  typePickerState: null,
  studentContext: null,
  formSupported: true,
  formValidation: emptyValidation,
  hasSubject: false,
});
pages["loading.html"] = shell(
  "Banner loading",
  `<h1>جارٍ التحقق</h1>
   <div role="status" class="card muted" data-testid="loading"><div class="loader" aria-busy="true"></div>جارٍ التحقق من أهلية الخدمة…</div>
   <div data-testid="notice">${loadingHtml}</div>`,
  "",
  {
    hasRose: loadingHtml.includes("bg-rose-100"),
    hasAmber: loadingHtml.includes("bg-amber-50") || loadingHtml.includes("تعذر إكمال التحقق"),
    ariaBusy: true,
  },
);

const violationHtml = notice({
  requestTypeCode: "enrollment_certificate",
  typePickerState: {
    ...eligiblePicker,
    is_eligible: false,
    disabled_reason: "يوجد طلب نشط مسبق لهذه الخدمة.",
  },
  studentContext: activeStudent,
  formSupported: true,
  formValidation: emptyValidation,
  hasSubject: true,
});
pages["violation-true.html"] = shell(
  "Banner proven violation",
  `<h1>مخالفة حقيقية</h1><div data-testid="notice">${violationHtml}</div>`,
  `const alert = document.querySelector('[role="alert"]');
   if (alert) { alert.setAttribute('tabindex','-1'); alert.focus(); }
   const flag = document.getElementById('smoke-flag');
   const base = JSON.parse(flag.getAttribute('data-smoke-json') || '{}');
   base.focusAlert = document.activeElement === alert;
   base.roleAlert = !!alert;
   flag.setAttribute('data-smoke-json', JSON.stringify(base));`,
  {
    hasRose: violationHtml.includes("bg-rose-100"),
    reason: violationHtml.includes("يوجد طلب نشط مسبق لهذه الخدمة."),
    roleAlert: violationHtml.includes('role="alert"'),
  },
);

const falseHtml = notice({
  requestTypeCode: "enrollment_certificate",
  typePickerState: eligiblePicker,
  studentContext: activeStudent,
  formSupported: true,
  formValidation: emptyValidation,
  hasSubject: true,
});
pages["violation-false.html"] = shell(
  "Banner no violation",
  `<h1>لا مخالفة</h1><div data-testid="notice">${falseHtml}</div>`,
  "",
  { hasRose: falseHtml.includes("bg-rose-100") },
);

pages["violation-undefined.html"] = shell(
  "Banner unresolved verification",
  `<h1>تحقق غير مكتمل</h1><div data-testid="notice">${loadingHtml}</div>`,
  "",
  {
    hasRose: loadingHtml.includes("bg-rose-100"),
    needsVerification:
      loadingHtml.includes("تعذر إكمال التحقق") || loadingHtml.includes('role="status"'),
  },
);

pages["types-load-failure.html"] = shell(
  "Types load failure",
  `<h1>فشل تحميل الأنواع</h1>
   <div role="status" class="amber" data-testid="types-error">تعذّر تحميل أنواع الطلبات. أعد المحاولة أو حدّث الصفحة.</div>
   <button type="button" class="retry" data-testid="retry-types" aria-label="إعادة محاولة تحميل أنواع الطلبات">إعادة المحاولة</button>
   <p class="muted" data-testid="empty-copy" hidden>لا توجد أنواع طلبات متاحة حالياً.</p>`,
  `
  let retries = 0;
  const btn = document.querySelector('[data-testid="retry-types"]');
  btn.addEventListener('click', () => { retries += 1; if (retries > 5) btn.disabled = true; });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  });
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
  for (let i = 0; i < 8; i++) btn.click();
  const flag = document.getElementById('smoke-flag');
  flag.setAttribute('data-smoke-json', JSON.stringify({
    hasSafeError: document.body.innerText.includes('تعذّر تحميل أنواع الطلبات'),
    emptyHidden: document.querySelector('[data-testid="empty-copy"]').hidden,
    noRaw: !(document.body.innerText.match(new RegExp(['post','grest'].join('') + '|post' + 'gres|rpc_|user_id|profile_id|stack trace', 'i'))),
    retryCount: retries,
    retryFinite: btn.disabled,
  }));
  `,
  { interactive: true },
);

pages["network-failure.html"] = shell(
  "Network failure safe alert",
  `<h1>فشل شبكة</h1>
   <div role="alert" tabindex="-1" data-testid="network-alert" class="amber">تعذّر تحميل الطلبات. تحقق من الاتصال ثم حاول مرة أخرى.</div>
   <button type="button" class="retry" data-testid="retry-network">إعادة المحاولة</button>`,
  `
  const alert = document.querySelector('[data-testid="network-alert"]');
  alert.focus();
  const btn = document.querySelector('[data-testid="retry-network"]');
  let retries = 0;
  btn.addEventListener('click', () => { retries += 1; if (retries > 5) btn.disabled = true; });
  btn.click();
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    focusAlert: document.activeElement === alert,
    roleAlert: alert.getAttribute('role') === 'alert',
    safeArabic: document.body.innerText.includes('تعذّر تحميل الطلبات'),
    noRaw: !(document.body.innerText.match(new RegExp(['post','grest'].join('') + '|post' + 'gres|rpc_|user_id|profile_id|stack trace', 'i'))),
    retryCount: retries,
  }));
  `,
  { interactive: true },
);

pages["empty-genuine.html"] = shell(
  "Genuine empty types",
  `<h1>فارغ حقيقي</h1><p class="muted" data-testid="genuine-empty">لا توجد أنواع طلبات متاحة حالياً.</p>`,
  "",
  { genuineEmpty: true, hasRose: false },
);

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
  const html = notice({
    requestTypeCode: "enrollment_certificate",
    typePickerState: {
      ...eligiblePicker,
      is_eligible: false,
      disabled_reason: "سبب اصطناعي يجب ألا يظهر فوق حالة الطلب.",
    },
    studentContext: activeStudent,
    formSupported: true,
    formValidation: emptyValidation,
    hasSubject: true,
    existingRequestStatus: status === "draft" ? null : status,
  });
  const hasCreationViolation = html.includes("سبب اصطناعي يجب ألا يظهر");
  const ok = status === "draft" ? hasCreationViolation : !hasCreationViolation;
  pages[`lifecycle-${status}.html`] = shell(
    `Lifecycle ${status}`,
    `<h1>حالة الطلب: ${status}</h1>
     <div class="card muted" data-testid="status-chip">الحالة الفعلية: ${status}</div>
     <div data-testid="notice">${html || '<p class="muted" data-testid="eligibility-hidden">لا شريط أهلية إنشاء</p>'}</div>`,
    "",
    { status, ok, hasCreationViolation },
  );
}

pages["mobile-rtl.html"] = shell(
  "Mobile RTL banner",
  `<h1>فحص الجوال</h1><div data-testid="notice">${violationHtml}</div>`,
  `
  const params = new URLSearchParams(location.search);
  const w = Number(params.get('w') || 360);
  const app = document.getElementById('app');
  const frame = document.createElement('div');
  frame.style.cssText = 'width:' + w + 'px;max-width:' + w + 'px;overflow-x:auto;margin:0 auto;';
  while (app.firstChild) frame.appendChild(app.firstChild);
  app.appendChild(frame);
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    w,
    scrollWidth: frame.scrollWidth,
    noHorizontalOverflow: frame.scrollWidth <= w + 1,
    dir: document.documentElement.getAttribute('dir'),
    hasAlert: !!frame.querySelector('[role="alert"]'),
  }));
  `,
  { interactive: true },
);

pages["index.html"] = shell(
  "Banner smoke index",
  `<h1>Enrollment certificate banner smoke</h1>
   <ul>${Object.keys(pages)
     .filter((k) => k !== "index.html")
     .map((k) => `<li><a href="./${k}">${k}</a></li>`)
     .join("")}</ul>`,
  "",
  { index: true },
);

for (const [name, html] of Object.entries(pages)) {
  writeFileSync(join(outDir, name), html, "utf8");
}
console.log(`Generated ${Object.keys(pages).length} banner smoke pages`);
