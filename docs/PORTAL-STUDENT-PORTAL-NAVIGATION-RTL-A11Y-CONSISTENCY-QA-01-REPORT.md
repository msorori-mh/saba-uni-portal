# PORTAL-STUDENT-PORTAL-NAVIGATION-RTL-A11Y-CONSISTENCY-QA-01 — تقرير المراجعة

- **الفرع:** `review/student-portal-navigation-rtl-a11y-qa-01` (من أحدث `origin/main` = `92d51fa`)
- **النطاق:** Header، التنقل على الهاتف، Breadcrumbs، Active route، أسماء عربية، Focus management، Keyboard navigation، عرض empty/error/loading في الـshell العام، route-not-found وpermission-denied الآمنة.
- **لم يُمس:** dashboards (PR #240)، enrollment_certificate (PR #246)، خدمات B1 (PR #221)، Backend/SQL/RPC/workflow، الهوية البصرية.

## الملفات المعدلة

| الملف | التغيير |
|---|---|
| `src/components/site/Header.tsx` | زر القائمة: `aria-expanded`/`aria-controls`، اسم يعكس الحالة («فتح/إغلاق القائمة»)، Escape يغلق القائمة ويعيد التركيز لزر القائمة، `id="site-mobile-menu"` للدرج |
| `src/routes/mobile.student.tsx` | إزالة التبويب الميت «الحساب» (`to: null`) من التنقل السفلي واستبداله بـ«الدرجات» → `/mobile/student/grades` (مسار موجود كان يتيمًا)؛ مؤشر نشط غير لوني (شريط ذهبي علوي) إضافةً إلى `aria-current`؛ `role="status"` لمؤشر التحميل |
| `src/routes/student.study-plan.tsx` | إصلاح عطل تشغيلي: `PortalShell` كان يُستدعى دون `onLogout` المطلوب — زر «تسجيل الخروج» كان يرمي `onLogout is not a function`. أُضيف `handleLogout` بنمط بقية الصفحات |
| `src/routes/student.progress.tsx` | إزالة عرض `error.message` الخام (خطر تسرّب رسائل Postgres/UUID) واستبداله برسالة عربية عامة مع `role="alert"` |
| `src/routes/student.tsx` | مؤشر تحميل بوابة الدخول: `role="status"` + `aria-label="جارٍ التحميل"` |
| `src/routes/__root.tsx` | (1) استبعاد `/mobile/student` وما تحته من Header/Footer العام — كان الـshell العام يلتف حول غلاف التطبيق ذي الترويسة الثابتة والتنقل السفلي (ازدواج chrome على الهاتف). صفحة الدخول `/mobile/student-login` تبقى بالغلاف العام. (2) تسمية زر الاسترجاع «العودة إلى بوابة الطالب» |
| `src/lib/route-error-recovery.ts` | فشل تحت `/student` أو `/mobile/student` يعود إلى `/student` بدل إخراج الطالب إلى الصفحة العامة `/` (سلوك admin والعام دون تغيير) |
| `src/lib/error-page.ts` | صفحة الخطأ الأخيرة (last-resort HTML) كانت إنجليزية `lang="en"` — تُرجمت إلى العربية RTL |
| `src/components/portal/NotificationsBell.tsx` | Escape يغلق القائمة ويعيد التركيز للجرس؛ `aria-expanded`/`aria-haspopup`؛ عدّاد غير المقروء ضمن `aria-label` بدل كونه شارة صامتة |
| `src/components/portal/StudentRequestsNav.tsx` | مسار التنقل كان `<p>` — أصبح `<nav aria-label="مسار التنقل"><ol>` مع `aria-current="page"` (الرابط الصلب إلى `/student` محفوظ) |
| `src/routes/about.tsx` | `aria-label="Breadcrumb"` الإنجليزية → «مسار التنقل» |
| `tests/student-portal/navigation-rtl-a11y-consistency-qa-01.test.ts` | 13 اختبار منع رجوع جديدًا (انظر أدناه) |

## نتائج التحقق من قائمة المتطلبات

- **لا روابط ميتة:** أُزيل التبويب المعطّل الدائم «الحساب (قريباً)» من التنقل السفلي الأساسي؛ كل عناصر التنقل الخمسة تشير لمسارات موجودة في `routeTree.gen.ts`.
- **active route صحيح:** `aria-current="page"` في التنقل السفلي، وTanStack Router يضيفه تلقائيًا لروابط الموقع؛ لم يُعثر على حالة active خاطئة. أُضيف مؤشر بصري غير لوني (شريط علوي) للتنقل السفلي.
- **القائمة على 360px:** الدرج عمودي بعرض كامل ضمن الحاوية، والتنقل السفلي `grid` ثابت بخمسة أعمدة؛ شريط التابلت يستخدم `overflow-x-auto` مقصودًا — لا مصدر overflow أفقي في الـshell (تحقق بالفحص الساكن، لم تُجرَ جلسة متصفح).
- **focus يعود لزر القائمة:** مُنفَّذ في قائمة الموقع وقائمة الإشعارات عند الإغلاق بـEscape.
- **Escape يغلق القوائم:** مُنفَّذ في `Header` و`NotificationsBell` (لم تكن موجودة إطلاقًا).
- **أسماء وصول لكل الأزرار:** أزرار الأيقونات (القائمة، الجرس، الخروج) لها `aria-label`؛ اسم زر القائمة يعكس حالته الآن.
- **لا اعتماد على اللون فقط:** التنقل السفلي: شريط ذهبي + `aria-current`؛ روابط الموقع: خط سفلي ذهبي + `aria-current`.
- **RTL صحيح:** `lang="ar" dir="rtl"` في الجذر؛ صفحة الخطأ الأخيرة أصبحت عربية RTL؛ أرقام أكاديمية في جزر `dir="ltr"` صحيحة.
- **لا raw error.message أو UUID في الـshell:** جذر الأخطاء نظيف أصلًا؛ أُزيل العرض الخام من `student.progress`؛ صفحة HTML الأخيرة لا تعرض تفاصيل.
- **لا fallback واسع:** الاسترجاع من خطأ تحت `/student` يبقى داخل البوابة؛ route-not-found الجذري عربي نظيف دون تفاصيل؛ permission-denied للطالب يتم عبر `beforeLoad` redirects معروفة.

## الاختبارات والنتائج

- `bun test tests/student-portal` — **108 pass / 0 fail** (شاملة 13 اختبارًا جديدًا).
- `bun test tests` — **1555 pass / 0 fail** (142 ملفًا).
- `bunx tsc --noEmit` — **نجح** (ملاحظة: `tsconfig.json` يضبط `noCheck: true`، لذا الفحص شكلي — عطل `onLogout` كان مخفيًا بسببه).
- ESLint على الملفات المعدلة — لا أخطاء جديدة: المستودع لا يجتاز prettier عند الأساس (مثال: `about.tsx` له 42 خطأً قبل التعديل و42 بعده)؛ قورنت كل ملف معدل بنسخته على `origin/main` بعد تطبيع نهايات الأسطر وكلها ≤ الأساس. ملف الاختبار الجديد نظيف تمامًا.
- `bun run build` — **نجح** (built in 17.66s، وتوليد wrangler/nitro سليم).
- `git diff --check` — **نظيف**.

## الافتراضات

- فحص 360px وhorizontal overflow تم بالفحص الساكن للكلاسات، لا بجلسة متصفح حقيقية.
- «الحساب (قريباً)» عومل كرابط ميت واستُبدل بـ«الدرجات»؛ لم تُنشأ صفحة حساب جديدة (خارج النطاق).
- صفحات `/student` المكتبية تُبقي ترويسة الموقع العامة (هي الـchrome الحالي للصفحات التي لا تستخدم `PortalShell`)؛ إزالتها كانت ستترك صفحات بلا ترويسة — سُجِّلت كملاحظة لا كعطل مُصلَح.

## المخاطر / ملاحظات خارج النطاق (لم تُمسّ)

- `mobile.student.requests.tsx:67` و`mobile.student.finance.tsx:168` و`mobile.student.documents.tsx:89` تعرض `error.message` خامًا — **لم تُعدَّل** لأنها ملاصقة لخدمات B1/الوثائق الممنوعة؛ يُنصح بمعالجتها في مهمة لاحقة.
- `tsconfig.json` `noCheck: true` يخفي أخطاء أنواع حقيقية (مثل عطل `onLogout`) — يُنصح بمراجعة مستقلة.
- صفحات `student.requests/schedule/progress/notifications` لا تستخدم `PortalShell` (لا زر خروج فيها) — تُركت كما هي لتجنّب توسيع النطاق نحو صفحات الطلبات.

## العوائق

- لا يمكن تشغيل متصفح حقيقي هنا؛ سلوك Focus/Escape تحقق منه بالفحص الساكن واختبارات السلاسل.

## أثر الإنتاج

- لا migrations، لا backend، لا بيانات. تغييرات عرض frontend فقط.

## القرار

**PASS_STUDENT_PORTAL_NAVIGATION_RTL_A11Y_QA_READY**
