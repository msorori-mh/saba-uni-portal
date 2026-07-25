/**
 * Synthetic student-portal navigation fixtures for Chrome headless smoke.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(import.meta.dir, "pages");
mkdirSync(outDir, { recursive: true });

const escapeAttr = (value: unknown) =>
  JSON.stringify(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const shell = (title: string, body: string, script = "", smoke: Record<string, unknown> = {}) =>
  `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Tahoma,Arial,sans-serif;background:#f5f7f6;color:#0f3d2e}
main{max-width:48rem;margin:0 auto;padding:1rem;width:100%;overflow-x:hidden}
button,a{min-height:44px;display:inline-flex;align-items:center;gap:.35rem;padding:0 .75rem;border-radius:.5rem;border:1px solid #d9e0dc;background:#fff;color:inherit;text-decoration:none;font-weight:700;cursor:pointer}
.panel{border:1px solid #d9e0dc;background:#fff;border-radius:.75rem;padding:.75rem;margin-top:.5rem}
.bottom{position:fixed;inset-inline:0;bottom:0;display:grid;grid-template-columns:repeat(5,1fr);background:#fff;border-top:1px solid #d9e0dc}
.bottom a{flex-direction:column;justify-content:center;font-size:.7rem;position:relative;border:0;border-radius:0}
.bottom a[aria-current="page"]::before{content:"";position:absolute;top:0;height:2px;width:2.5rem;background:#c9a227;border-radius:999px}
.alert{border:1px solid #fecdd3;background:#fff1f2;color:#9f1239;border-radius:.75rem;padding:.75rem}
.muted{color:#667;font-size:.875rem}
.crumb ol{display:flex;gap:.35rem;list-style:none;padding:0;margin:0;flex-wrap:wrap}
</style>
</head>
<body>
<main id="app">${body}<div id="smoke-flag" data-smoke-json="${escapeAttr(smoke)}"></div></main>
<script>${script}</script>
</body>
</html>`;

const pages: Record<string, string> = {};

pages["menu-keyboard.html"] = shell(
  "Menu keyboard",
  `<h1>قائمة الطالب</h1>
   <button type="button" id="menu-btn" aria-expanded="false" aria-controls="site-mobile-menu" aria-label="فتح القائمة">القائمة</button>
   <div id="site-mobile-menu" hidden class="panel" role="navigation" aria-label="قائمة الجوال">
     <a href="#grades">درجاتي</a>
     <a href="#plan">خطتي</a>
   </div>`,
  `
  const btn = document.getElementById('menu-btn');
  const menu = document.getElementById('site-mobile-menu');
  const setOpen = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    menu.hidden = !open;
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      btn.focus();
    }
  });
  btn.click();
  const opened = btn.getAttribute('aria-expanded') === 'true' && !menu.hidden;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const closed = btn.getAttribute('aria-expanded') === 'false' && menu.hidden;
  const focusBack = document.activeElement === btn;
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    opened, closed, focusBack,
    ariaControls: btn.getAttribute('aria-controls') === 'site-mobile-menu',
    dir: document.documentElement.getAttribute('dir'),
  }));
  `,
  { interactive: true },
);

pages["notifications.html"] = shell(
  "Notifications bell",
  `<h1>جرس الإشعارات</h1>
   <button type="button" id="bell" aria-expanded="false" aria-controls="notifications-panel" aria-haspopup="true" aria-label="الإشعارات">🔔</button>
   <div id="notifications-panel" class="panel" hidden>لا إشعارات اصطناعية</div>`,
  `
  const btn = document.getElementById('bell');
  const panel = document.getElementById('notifications-panel');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      btn.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      btn.focus();
    }
  });
  btn.click();
  const openOk = btn.getAttribute('aria-expanded') === 'true' && !panel.hidden;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    openOk,
    closed: btn.getAttribute('aria-expanded') === 'false' && panel.hidden,
    focusBack: document.activeElement === btn,
    ariaControls: btn.getAttribute('aria-controls') === 'notifications-panel',
    panelId: panel.id === 'notifications-panel',
  }));
  `,
  { interactive: true },
);

pages["breadcrumb.html"] = shell(
  "Breadcrumb single nav",
  `<h1>مسار الطلبات</h1>
   <nav class="crumb" aria-label="مسار التنقل">
     <ol>
       <li><a href="/student">بوابة الطالب</a></li>
       <li aria-current="page">طلباتي</li>
     </ol>
   </nav>`,
  "",
  {
    singleNav: true,
    ariaCurrent: true,
    nestedNavCount: 1,
  },
);

pages["bottom-nav-nested.html"] = shell(
  "Bottom nav nested active",
  `<h1>تنقل سفلي</h1>
   <nav class="bottom" aria-label="التنقل السفلي" data-current="/mobile/student/requests/abc">
     <a href="/mobile/student" data-to="/mobile/student">الرئيسية</a>
     <a href="/mobile/student/grades" data-to="/mobile/student/grades">درجاتي</a>
     <a href="/mobile/student/requests" data-to="/mobile/student/requests">طلباتي</a>
     <a href="/mobile/student/schedule" data-to="/mobile/student/schedule">جدولي</a>
     <a href="/mobile/student/profile" data-to="/mobile/student/profile">حسابي</a>
   </nav>`,
  `
  const nav = document.querySelector('[aria-label="التنقل السفلي"]');
  const current = nav.getAttribute('data-current');
  nav.querySelectorAll('a').forEach((a) => {
    const to = a.getAttribute('data-to');
    const active = to === '/mobile/student'
      ? current === to
      : current === to || current.startsWith(to + '/');
    if (active) a.setAttribute('aria-current', 'page');
  });
  const active = nav.querySelector('[aria-current="page"]');
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    activeTo: active?.getAttribute('data-to') || null,
    nestedKeepsRequests: active?.getAttribute('data-to') === '/mobile/student/requests',
    count: nav.querySelectorAll('a').length,
  }));
  `,
  { interactive: true },
);

pages["study-plan-states.html"] = shell(
  "Study plan states",
  `<h1>الخطة الدراسية</h1>
   <section data-state="loading" class="panel muted" role="status">جارٍ التحميل…</section>
   <section data-state="error" class="alert" role="alert" hidden>تعذّر تحميل الخطة الدراسية. تحقق من الاتصال ثم أعد المحاولة.</section>
   <section data-state="empty" class="panel muted" hidden>لا توجد خطة دراسية مرتبطة بحسابك حالياً.</section>
   <section data-state="success" class="panel" hidden>خطة اصطناعية — 115 ساعة</section>
   <button type="button" id="fail">محاكاة فشل</button>
   <button type="button" id="empty">محاكاة فارغ</button>
   <button type="button" id="ok">محاكاة نجاح</button>
   <button type="button" id="logout">تسجيل الخروج</button>
   <pre id="route" class="muted"></pre>`,
  `
  const show = (name) => {
    document.querySelectorAll('[data-state]').forEach((el) => { el.hidden = el.getAttribute('data-state') !== name; });
  };
  show('loading');
  const afterLoadingNoEmpty = document.querySelector('[data-state="empty"]').hidden;
  document.getElementById('fail').click?.();
  show('error');
  const errorNoEmpty = document.querySelector('[data-state="error"]').hidden === false
    && document.querySelector('[data-state="empty"]').hidden === true
    && document.querySelector('[data-state="error"]').textContent.includes('تعذّر تحميل الخطة الدراسية');
  show('empty');
  const emptyOk = !document.querySelector('[data-state="empty"]').hidden;
  show('success');
  const successOk = !document.querySelector('[data-state="success"]').hidden;
  let loggedOut = false;
  document.getElementById('logout').addEventListener('click', () => {
    loggedOut = true;
    document.getElementById('route').textContent = '/portal-login';
  });
  document.getElementById('logout').click();
  const body = document.body.innerText;
  document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
    afterLoadingNoEmpty,
    errorNoEmpty,
    emptyOk,
    successOk,
    logoutWorks: loggedOut && document.getElementById('route').textContent === '/portal-login',
    noRaw: !/error\\.message|postgrest|user_id|stack trace|rpc_/i.test(body),
  }));
  `,
  { interactive: true },
);

pages["error-recovery.html"] = shell(
  "Error recovery",
  `<h1>استعادة الخطأ</h1>
   <p class="alert" role="alert">تعذّر تحميل الصفحة</p>
   <a id="back" href="/student">العودة إلى بوابة الطالب</a>`,
  "",
  {
    staysInStudent: true,
    backHref: "/student",
    rtl: true,
  },
);

pages["mobile-rtl.html"] = shell(
  "Mobile RTL nav",
  `<h1>تنقل الجوال</h1>
   <nav class="bottom" aria-label="التنقل السفلي">
     <a href="#" aria-current="page">الرئيسية</a>
     <a href="#">درجاتي</a>
     <a href="#">طلباتي</a>
     <a href="#">جدولي</a>
     <a href="#">حسابي</a>
   </nav>`,
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
  }));
  `,
  { interactive: true },
);

pages["index.html"] = shell(
  "Student nav smoke index",
  `<h1>Student navigation smoke</h1><ul>${[
    "menu-keyboard.html",
    "notifications.html",
    "breadcrumb.html",
    "bottom-nav-nested.html",
    "study-plan-states.html",
    "error-recovery.html",
    "mobile-rtl.html",
  ]
    .map((k) => `<li><a href="./${k}">${k}</a></li>`)
    .join("")}</ul>`,
  "",
  { index: true },
);

for (const [name, html] of Object.entries(pages)) {
  writeFileSync(join(outDir, name), html, "utf8");
}
console.log(`Generated ${Object.keys(pages).length} nav smoke pages`);
