/**
 * Assemble PR246 + PR249 synthetic fixtures and add integration-only pages.
 */
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dir, "../..");
const outDir = join(import.meta.dir, "pages");
mkdirSync(outDir, { recursive: true });

function runGenerator(rel: string) {
  const script = join(root, rel);
  const r = spawnSync("bun", ["run", script], {
    cwd: root,
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`generator failed ${rel}: ${r.stderr || r.stdout}`);
  }
}

runGenerator("tests/student-requests/banner-browser-smoke/generate-pages.ts");
runGenerator("tests/student-portal/nav-browser-smoke/generate-pages.ts");

const bannerPages = join(root, "tests/student-requests/banner-browser-smoke/pages");
const navPages = join(root, "tests/student-portal/nav-browser-smoke/pages");

for (const dir of [bannerPages, navPages]) {
  if (!existsSync(dir)) throw new Error(`missing pages dir: ${dir}`);
  cpSync(dir, outDir, { recursive: true });
}

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
a,button{min-height:44px;display:inline-flex;align-items:center;gap:.35rem;padding:0 .75rem;border-radius:.5rem;border:1px solid #d9e0dc;background:#fff;color:inherit;text-decoration:none;font-weight:700;cursor:pointer}
.panel{border:1px solid #d9e0dc;background:#fff;border-radius:.75rem;padding:.75rem;margin-top:.5rem}
.muted{color:#667;font-size:.875rem}
</style>
</head>
<body>
<main id="app">${body}<div id="smoke-flag" data-smoke-json="${escapeAttr(smoke)}"></div></main>
<script>${script}</script>
</body>
</html>`;

writeFileSync(
  join(outDir, "portal-home.html"),
  shell(
    "Student portal home",
    `<h1 data-testid="portal-title">بوابة الطالب</h1>
     <p class="muted">سطح اصطناعي لتجربة الطالب بعد دمج تحذير إفادة القيد وتنقل البوابة.</p>
     <nav aria-label="اختصارات" class="panel">
       <a href="./menu-keyboard.html">القائمة</a>
       <a href="./normal-open.html" data-testid="link-enrollment">إفادة قيد</a>
       <a href="./study-plan-states.html">الخطة الدراسية</a>
     </nav>`,
    `
    document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
      portalOpen: !!document.querySelector('[data-testid="portal-title"]'),
      hasEnrollmentLink: !!document.querySelector('[data-testid="link-enrollment"]'),
      dir: document.documentElement.getAttribute('dir'),
      noPublicFooter: !document.body.innerText.includes('Footer العام'),
    }));
    `,
    { interactive: true },
  ),
  "utf8",
);

writeFileSync(
  join(outDir, "identity-switch.html"),
  shell(
    "Identity switch no stale cache",
    `<h1>تبديل هوية اصطناعية</h1>
     <div class="panel" data-testid="session-box">لا جلسة</div>
     <button type="button" id="login-a">دخول طالب أ</button>
     <button type="button" id="login-b">دخول طالب ب</button>
     <button type="button" id="logout">تسجيل الخروج</button>`,
    `
    const box = document.querySelector('[data-testid="session-box"]');
    const store = { identity: null, cacheKey: null };
    const show = () => {
      box.textContent = store.identity
        ? ('الجلسة: ' + store.identity + ' | مفتاح: ' + store.cacheKey)
        : 'لا جلسة';
    };
    document.getElementById('login-a').onclick = () => {
      store.identity = 'student-a';
      store.cacheKey = 'cache-a-' + Date.now();
      show();
    };
    document.getElementById('login-b').onclick = () => {
      // Clear previous identity cache before binding the new one.
      store.identity = null;
      store.cacheKey = null;
      show();
      store.identity = 'student-b';
      store.cacheKey = 'cache-b-' + Date.now();
      show();
      const text = box.textContent || '';
      document.getElementById('smoke-flag').setAttribute('data-smoke-json', JSON.stringify({
        switched: store.identity === 'student-b',
        noStaleCache: !text.includes('cache-a') && text.includes('cache-b'),
        noPriorIdentity: !text.includes('student-a') && text.includes('student-b'),
      }));
    };
    document.getElementById('logout').onclick = () => {
      store.identity = null;
      store.cacheKey = null;
      show();
    };
    document.getElementById('login-a').click();
    document.getElementById('login-b').click();
    `,
    { interactive: true },
  ),
  "utf8",
);

writeFileSync(
  join(outDir, "index.html"),
  shell(
    "PR246+PR249 integration smoke index",
    `<h1>Student experience integration smoke</h1>
     <ul>
       <li><a href="./portal-home.html">portal-home</a></li>
       <li><a href="./menu-keyboard.html">menu-keyboard</a></li>
       <li><a href="./normal-open.html">normal-open</a></li>
       <li><a href="./violation-true.html">violation-true</a></li>
       <li><a href="./types-load-failure.html">types-load-failure</a></li>
       <li><a href="./network-failure.html">network-failure</a></li>
       <li><a href="./lifecycle-cancelled.html">lifecycle-cancelled</a></li>
       <li><a href="./lifecycle-rejected.html">lifecycle-rejected</a></li>
       <li><a href="./lifecycle-returned.html">lifecycle-returned</a></li>
       <li><a href="./study-plan-states.html">study-plan-states</a></li>
       <li><a href="./identity-switch.html">identity-switch</a></li>
       <li><a href="./bottom-nav-nested.html">bottom-nav-nested</a></li>
       <li><a href="./mobile-rtl.html">mobile-rtl</a></li>
     </ul>`,
    "",
    { index: true },
  ),
  "utf8",
);

console.log(`Integration smoke pages ready in ${outDir}`);
