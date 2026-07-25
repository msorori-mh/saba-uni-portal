# PORTAL-ADMIN-PORTAL-NAVIGATION-RTL-A11Y-CONSISTENCY-QA-01 — تقرير مراجعة الجودة (SOURCE-ONLY)

مراجعة تنقّل لوحة الإدارة واتساق RTL وإمكانية الوصول (360px وسطح المكتب)، مع إصلاحات واختبارات regression وsmoke حقيقي عبر Chrome headless وبيانات اصطناعية فقط. جميع التغييرات على مستوى المصدر؛ لا migrations ولا بيانات ولا backend ولا authorization ولا نشر. بدأ العمل من أحدث `origin/main` في worktree وفرع مستقلين (`review/admin-portal-navigation-rtl-a11y-qa-01`) ولم يُمسّ فرع PR #251.

## الملفات المعدلة

ملفات جديدة:
- `src/lib/use-admin-logout.ts` — hook تسجيل خروج مركزي آمن: `try/catch/finally`، يمسح `queryClient.clear()`، وينتقل إلى `/admin/login` بـ `replace: true` دائماً حتى لو فشل `signOut()`.
- `tests/admin/admin-navigation-rtl-a11y-consistency-01.test.ts` — 72 اختبار regression على مستوى المصدر (بنمط المستودع).
- `scripts/admin-portal-navigation-smoke-01/run.ts` — harness الـ smoke (خادم Supabase وهمي + مشغّل Chrome CDP بدون أي تبعيات خارجية).

ملفات معدّلة:
- `src/components/admin/AdminShell.tsx`:
  - `aria-current="page"` على رابط التنقّل النشط (مشتق من `useRouterState`، وليس prop يدوي) — التمييز البصري القائم (شريط ذهبي موضعي + خلفية) يبقى كمؤشر غير لوني فقط.
  - قائمة الجوال: زر الهامبرغر حصل على `aria-expanded` + `aria-controls="admin-sidebar"` والـ `<aside>` حصل على `id="admin-sidebar"`؛ زر إغلاق موسوم (`aria-label="إغلاق القائمة"`) داخل الشريط؛ Escape يغلق ويعيد التركيز للهامبرغر؛ التركيز ينتقل لزر الإغلاق عند الفتح؛ الـ backdrop أصبح `aria-hidden="true"`.
  - أزرار المجموعات القابلة للطي: `aria-controls` مربوط بـ `id` لحاوية القائمة الفرعية (`admin-nav-group-<id>`).
  - `nav` الشريط الجانبي موسوم `aria-label="التنقل الرئيسي"`.
  - breadcrumbs مشتقة من إعداد التنقّل: `nav aria-label="مسار التنقل"` واحدة فقط («لوحة الإدارة / المجموعة / الصفحة»)، العنصر الأخير `aria-current="page"`، فواصل chevron بـ `aria-hidden`؛ لا تظهر في الصفحة الرئيسية.
  - جرس الإشعارات المشترك أضيف إلى ترويسة الإدارة (لم يكن هناك أي واجهة إشعارات).
  - تسجيل الخروج عبر `useAdminLogout` (مسح كاش + انتقال مضمون) بدل `handleLogout` المحلي.
  - `aria-hidden` على الأيقونات الزخرفية (الشعار، الأفاتار، أيقونات الروابط)؛ حلقات `focus-visible` على كل الروابط والأزرار في الشريط والترويسة؛ عنوان الترحيب `min-w-0 truncate` لمنع أي فيض أفقي عند 360px؛ تحويل `pr-3 mr-1 border-r` إلى الخصائص المنطقية `ps-3 ms-1 border-s` (نفس المخرجات البصرية في RTL).
- `src/components/portal/NotificationsBell.tsx` — نفس إصلاحات PR #251 حرفياً (المحتوى مطابق تماماً لتفادي تعارض الدمج لاحقاً): Escape يغلق ويعيد التركيز للزر، `aria-expanded/haspopup/controls`، إعلان عدد غير المقروء عبر `aria-live="polite"` sr-only، نص sr-only «إشعار غير مقروء»، حلقات focus-visible، وإصلاح تموضع القائمة: حذف `sm:left-auto sm:right-0` التي تسبب فيضاً أفقياً في RTL (الجرس عند الحافة اليسرى) — الآن `left-0` ثابت مع عرض `min(92vw,360px)`.
- `src/routes/admin.tsx` — تسجيل `notFoundComponent: AdminNotFoundComponent` (عربي عام، «العودة إلى لوحة الإدارة»، بدون أي تفاصيل تقنية) لحالات `notFound()` المرمية داخل فرع /admin. لم تُمسّ بوابة RBAC في `beforeLoad` ولا `AdminErrorComponent` القائم (تحققنا أنه لا يعرض `error.message`).
- `src/routes/__root.tsx` — `NotFoundComponent` الجذري أصبح حساساً للمسار: أي `/admin/*` غير معروف (لا يطابق أي مسار) يعرض 404 بصياغة الإدارة ورابط «العودة إلى لوحة الإدارة» بدل 404 الموقع العام الذي كان يخرج الإداري إلى الصفحة الرئيسية العامة. سلوك بقية المسارات لم يتغير. (اختير هذا بدل مسار catch-all جديد حتى لا تتغير شجرة المسارات — يوجد pin لثباتها في `tests/student-requests/tanstack-register-stable-augmentation-01.test.ts` يمنع أي تغيير غير مقصود، وبقي أخضر دون لمسه.)

ملاحظة تنسيق: ملفات `admin.tsx` و`AdminShell.tsx` و`__root.tsx` لم تكن مطابقة لـ prettier في الشجرة النظيفة (CRLF/لفّ). لأن eslint على الملفات المعدّلة بوابة إلزامية، طُبّق `prettier --write` على الملفات الملموسة فقط — الـ diff يحتوي إعادة لفّ تنسيقية دون تغيير سلوكي.

## مطابقة قائمة الفحص (16 بنداً)

1. **لا روابط ميتة/يتيمة** — حارس regression يستخرج كل `to:` من إعداد الشريط الجانبي ويؤكد تسجيلها في `routeTree.gen.ts` (روابط Link ديناميكية لا يمسكها tsc). النتيجة: 43/43 هدفاً مسجلاً. صفحات مسجلة غير ظاهرة في الشريط (`/admin/faculty-accounts`, `/admin/graduation-candidates`, `/admin/messages`, `/admin/programs`, `/admin/schedules`) موجودة في `NAV_ITEM_ROLES` وتُفترض وصولاً من صفحات أخرى — سُجّلت كملاحظة ولم تُعاد هيكلة القائمة (خارج نطاق التصميم).
2. **aria-current** — على الرابط النشط في الشريط وعنصر الـ breadcrumb الأخير (مؤكَّد باختبار + smoke).
3. **لا تمييز باللون فقط** — الشريط الذهبي الموضعي + الخلفية + الوزن، و`aria-current` برمجياً.
4. **القائمة على 360px** — off-canvas بعرض 288px ضمن الشاشة؛ smoke يؤكد الفتح/الإغلاق وعدم الفيض.
5. **Escape** — يغلق قائمة الجوال ويعيد التركيز للهامبرغر (اختبار + smoke).
6. **aria-expanded/aria-controls** — الهامبرغر ↔ `admin-sidebar`، وأزرار المجموعات ↔ حاويات القوائم الفرعية.
7. **أسماء ميسّرة** — «فتح القائمة»/«إغلاق القائمة»/«الإشعارات»/«تسجيل الخروج»؛ الأيقونات الزخرفية `aria-hidden`.
8. **breadcrumbs دلالية** — nav واحدة موسومة «مسار التنقل»، وnav الشريط موسومة «التنقل الرئيسي» — لا nav متداخلة ملتبسة.
9. **RTL ولا فيض** — `dir="rtl"` محفوظ؛ خصائص منطقية؛ smoke يقيس `scrollWidth` عند 360px.
10. **logout يمسح الكاش** — `queryClient.clear()` في `useAdminLogout` (مؤكَّد باختبار)؛ smoke يؤكد غياب `sb-*-auth-token` من localStorage بعد الخروج.
11. **فشل signOut لا يعلّق** — الانتقال في `finally` (مؤكَّد باختبار).
12. **error recovery داخل /admin** — `AdminErrorComponent` القائم (إعادة محاولة + «العودة إلى لوحة الإدارة»)؛ smoke يستدعي الحدود فعلياً بإسقاط تحميل lazy chunk ويؤكد الرسالة العربية والعودة إلى /admin.
13. **permission denied بلا صلاحيات أوسع** — التوجيه عبر `firstAccessibleAdminRoute` (مسارات مسموحة للدور فقط) + لافتة `?accessDenied=1`؛ smoke بدور `finance_officer` يؤكد البقاء داخل /admin.
14. **لا error.message/UUID/SQL** — الحدود لا تعرض شيئاً تقنياً (حارس مصدر) + فحص DOM للخصوصية في الـ smoke (UUID/PostgREST/PGRST/RLS/SQL/stack).
15. **لا روابط غير مصرّح بها عبر fallback عام** — عناصر الشريط تُرشَّح بـ `filterNavGroups`/RBAC؛ حارس يؤكد عدم وجود روابط لبوابتي الطالب/الأكاديمي في صدفة الإدارة.
16. **Notifications بالكيبورد** — فتح/إغلاق/Escape/إعادة تركيز (حارس + smoke ببيانات اصطناعية).

## الاختبارات والنتائج

| الأمر | النتيجة |
|---|---|
| `bun install --frozen-lockfile` | نجاح (595 حزمة) |
| `bun test tests/admin` | 254 ناجح / 0 فاشل (16 ملفاً) |
| `bun test tests` | **1613 ناجح / 1 فاشل** — الفاشل الوحيد `tests/documents/enrollment-certificate-arabic-pdf-worker-runtime.test.ts` (G4، timeout في إقلاع wrangler/Miniflare): **سابق الوجود وبيئي** — أُعيد تشغيله على الشجرة النظيفة (git stash) ففشل بنفس الشكل، ولا علاقة له بتغييراتنا (enrollment_certificate خارج النطاق أصلاً) |
| `bunx tsc --noEmit` | نجاح |
| `bunx eslint` على الملفات المعدلة | 0 أخطاء |
| `bun run build` | نجاح (vite + validate-tanstack-route-tree-register) |
| `git diff --check` | نظيف |

### Browser smoke (Chrome headless + بيانات اصطناعية)

- البنية: `scripts/admin-portal-navigation-smoke-01/run.ts` — خادم Supabase وهمي محلي (127.0.0.1:4391) يقدّم جلستين اصطناعيتين (admin + finance_officer) وإشعارين اصطناعيين، وبناء إنتاجي (`NITRO_PRESET=node-server`) بمتغيرات بيئة موجهة للوهمي فقط يُخدم عبر node محلياً، وChrome headless عبر CDP (بدون puppeteer/playwright).
- يفشل الـsmoke عند: فشل تشغيل Chrome، فشل تحميل الصفحة، أي timeout، أو أي فحص فاشل — ويقتل الخادم والمتصفح ويتحقق أن المنافذ (4390/4391/4392) حرة بعد الانتهاء.
- **النتيجة النهائية: 24/24 PASS** (خروج 0)، والمنافذ الثلاثة حرة بعد الإيقاف:
  - Desktop 1280px: تحميل الصفحة والشريط، RTL، aria-current بعد التنقل، breadcrumbs دلالية، لوحة الإشعارات ببيانات اصطناعية، Escape وإعادة التركيز للجرس، فحص خصوصية DOM.
  - Mobile 360px: لا فيض أفقي، الهامبرغر، فتح القائمة (aria-expanded + انتقال التركيز)، إغلاق تلقائي بعد التنقل، Escape وإعادة التركيز للهامبرغر.
  - Logout: انتقال إلى /admin/login + غياب auth-token من localStorage + استحالة فتح /admin بالهوية السابقة.
  - Permission denied: بدور `finance_officer` اصطناعي، `/admin/users` توجّه إلى صفحة مسموحة داخل /admin مع لافتة.
  - Not found: `/admin/definitely-not-a-real-page` يعرض 404 الإدارة والرابط يعيد إلى /admin.
  - Error recovery: خطأ render مفتعل (حمولة إشعارات مشوهة من الـmock) يُظهر حدود خطأ /admin العربية العامة، ورابط الاسترداد يستهدف /admin، وreload يعيد الصدفة — دون أي تسريب تقني (فحص خصوصية).

## الافتراضات

- JWT اصطناعي بـ `alg=HS256` بدون `kid`: `getClaims()` في supabase-js يرجع عندها إلى `getUser()` الذي يجيبه الـmock — لا تزوير توقيع ولا اتصال خارجي.
- صفحات الإدارة الداخلية (اللوحات) تُحمَّل ببيانات فارغة من الـmock؛ الـsmoke يستهدف الصدفة والتنقل لا محتوى اللوحات (المملوك لـ PR #240).
- إصلاحات `NotificationsBell` مطابقة حرفياً لمحتوى PR #251 لتفادي تعارض دمج مستقبلي (المكوّن مشترك بين البوابات).
- `bun run security:test` لم يُشغّل (يتطلب بيئة staging آمنة غير متوفرة) وفق اشتراط AGENTS.md «عند توفر بيئة آمنة».

## المخاطر

- إعادة اللفّ التنسيقية (prettier) توسّع الـ diff — لا تغيير سلوكي.
- إضافة الجرس لترويسة الإدارة عنصر واجهة جديد (كان معدوماً) — ضمن النطاق المصرّح (Notifications) وبنفس لغة التصميم.
- **اكتشاف upstream (موثّق، خارج النطاق):** فشل تحميل lazy chunk لمسار كسول (مثل `/admin/executive-dashboard`) يُسقط التطبيق كله (صفحة فارغة) ولا تلتقطه أي حدود خطأ — السبب في `@tanstack/router-core` (`loadRouteChunk` في `load-matches.js`): الـ `_lazyPromise` المرفوض لا يُمسح، ومسار معالجة الخطأ يعيد انتظاره فيعيد رميه خارج معالجة الـ match. وثّقناه بتشخيص CDP مباشر (استثناء render غير ملتقط + وعد مرفوض + unmount كامل). سابق الوجود، يصيب كل البوابات، وإصلاحه يتطلب ترقية/تصحيح router-core أو إلغاء تقسيم المسارات الكسولة — كلاهما خارج نطاق هذه المهمة. حدود الخطأ نفسها تعمل لكل الأخطاء القابلة للالتقاط (مؤكَّد بالـsmoke عبر خطأ render).

## العوائق

- لا بيئة staging لتشغيل `security:test`؛ الاعتماد على الـmock الاصطناعي المحلي فقط.
- اختبار G4 (wrangler) غير قابل للتشغيل في هذه البيئة — سابق الوجود (مؤكَّد على الشجرة النظيفة).

## نقل العمل إلى worktree الصحيح (توثيق)

- ظهر اعتقاد أثناء التنفيذ أن أعمال Admin كُتبت داخل worktree/فرع بوابة الأكاديمي (PR #251). تحققنا بالأدلة (`git status --short --branch`, `git diff --name-only`, `git ls-files --others`, `git log -1`, `git worktree list`): worktree الأكاديمي نظيف تماماً عند `2f6936e` (نفس commit المدفوع لـ PR #251) ولا يحوي أي تغيير Admin، وكل أعمال Admin كانت من البداية داخل `C:/projects/saba-uni-portal-admin-navigation-kimi-01` على الفرع `review/admin-portal-navigation-rtl-a11y-qa-01` المبني من `origin/main`. لم يلزم أي stash/نقل، ولم يُنفَّذ أي commit أو push على فرع Faculty، و**PR #251 بقيت دون أي تغييرات Admin** — PASS_ADMIN_WORK_MOVED_TO_CORRECT_WORKTREE (تحقق، لا نقل).
- ملاحظة: الفرع متأخر عن origin/main الحالي بـ60 commitاً (دُمجت PR #221 بعد بدء المهمة)؛ تحققنا أن تلك الالتزامات لا تلمس أي ملف من ملفاتنا — الدمج نظيف.

## أثر الإنتاج

لا شيء. تغييرات مصدر فقط؛ لا migration، لا اتصال بإنتاج أو staging، لا deploy/publish، لا تغيير authorization أو workflow أو بيانات.

## القرار

**PASS_ADMIN_PORTAL_NAVIGATION_RTL_A11Y_QA_READY** — كل بوابات التحقق خضراء (الفشل الوحيد في المجموعة سابق الوجود وبيئي ومؤكَّد على الشجرة النظيفة)، والـsmoke المتصفحي 24/24 ببيانات اصطناعية فقط، والمنافذ حرة بعد الإيقاف.
