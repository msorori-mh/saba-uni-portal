# PORTAL-PR249-INDEPENDENT-STUDENT-NAVIGATION-REVIEW-01 — تقرير المراجعة المستقلة

- المستودع: `msorori-mh/saba-uni-portal`
- PR الأصلية: `#249`
- الحالة الحية عند البدء وقبل النشر: `OPEN`، `isDraft=false`، `MERGEABLE`، `mergeStateStatus=BLOCKED`
- `headRefName`: `review/student-portal-navigation-rtl-a11y-qa-01`
- `headRefOid`: `8cbf25fecdd7e6d2249de18b944cdab650406fbb`
- `baseRefName`: `main`
- `baseRefOid`: `92d51faa9bcdc9fd99e89579f6a498b463264246`
- فرع المراجعة: `review/pr249-student-navigation-codex-01`
- التاريخ: 2026-07-25

## القرار

**PASS_PR249_INDEPENDENT_STUDENT_NAVIGATION_REVIEW**

## النتيجة

ثبّتت المراجعة إصلاح `onLogout` في `/student/study-plan`، وصحة رابط `/mobile/student/grades`، وعدم وجود تبويبات سفلية ميتة، ومنع Header/Footer العامين عن `/mobile/student`، وبقاء أخطاء `/student` داخل بوابة الطالب، وعدم عرض `error.message` أو UUID أو SQL/RPC details، وسلامة Escape وإعادة التركيز وخصائص ARIA والمؤشر النشط غير المعتمد على اللون وحده.

اكتُشفت أربع فجوات وأُصلحت forward-only:

1. جرس الإشعارات كان يملك `aria-expanded` بلا `aria-controls` أو هدف معرّف؛ أضيف الربط بـ`notifications-panel`.
2. breadcrumb طلبات الطلاب كان يضع `<nav>` داخل `<nav>`؛ أصبح يحتوي عنصر `<nav>` دلاليًا واحدًا مع `ol` و`aria-current="page"`.
3. مؤشر التنقل السفلي كان يعمل للمسار الكامل فقط؛ أصبح يبقى نشطًا على المسارات المتداخلة مثل تفاصيل الطلب، مع إبقاء الصفحة الرئيسية مطابقة exact.
4. فشل الشبكة/الصلاحية في الخطة الدراسية كان يتحول إلى empty state «لا توجد خطة»؛ أصبح خطأ عامًا آمنًا بـ`role="alert"` ولا يظهر empty state عند الفشل.

## مصفوفة المراجعة

| السطح | النتيجة |
|---|---|
| Desktop | Header والتنقل العام لهما مؤشرات نشطة نصية/مرئية، وقائمة الهاتف لا تظهر في desktop |
| 360px | التنقل السفلي خمس خانات حقيقية، عرض مرن وآمن مع safe-area، ولا public chrome مزدوج |
| Keyboard only | عناصر أصلية `button`/`Link`، Escape يغلق القوائم والجرس ويعيد التركيز للمشغل |
| Screen reader | `aria-expanded` و`aria-controls` و`aria-current` و`role=status/alert` وأسماء عربية واضحة |
| Logout | `/student/study-plan` يمرر `handleLogout` إلى `PortalShell` ثم يوجّه إلى login |
| Route transitions | `/mobile/student/grades` موجود، والمسارات المتداخلة تحفظ مؤشر القسم النشط |
| Error boundary | `/student*` و`/mobile/student*` يعودان إلى بوابة الطالب، بلا نص backend خام |
| Notification bell | Escape + focus return + unread accessible name + controls relationship |
| Mobile bottom nav | لا `to:null` فعليًا ولا «قريباً» في البيانات؛ خمس روابط موجودة |
| Breadcrumb | `nav` واحد، `ol`، و`aria-current=page` |
| Loading/error | spinners معلنة، والخطة/التقدم تعرضان أخطاء عامة منفصلة عن empty state |
| Authorization fallback | لا fallback يفتح صفحات أو أدوارًا؛ حواجز auth الأصلية بقيت كما هي |

## الملفات المعدلة في المراجعة المستقلة

- `src/components/portal/NotificationsBell.tsx`
- `src/components/portal/StudentRequestsNav.tsx`
- `src/routes/mobile.student.tsx`
- `src/routes/student.study-plan.tsx`
- `tests/student-portal/navigation-rtl-a11y-consistency-qa-01.test.ts`
- `docs/PORTAL-PR249-INDEPENDENT-STUDENT-NAVIGATION-REVIEW-01-REPORT.md`

## الاختبارات والنتائج

- `bun install --frozen-lockfile` — PASS.
- حارس المراجعة المحدد — PASS: 14/14.
- `bun test tests/student-portal` — PASS: 109/109 بعد النسخة النهائية للفرق.
- `bun test tests` — PASS: 1556/1556، 142 ملفًا.
- `bunx tsc --noEmit` — PASS بعد النسخة النهائية للفرق.
- ESLint لنسخة الإصلاح المنسقة أثناء التحقق — PASS بلا أخطاء. بعد إعادة الفرق إلى شكل جراحي، يظل تشغيل ESLint على جميع ملفات PR يظهر 934 خطأ Prettier/CRLF موروثة في ملفات PR الأصلية؛ لم تُنشئها هذه المراجعة، ولم يُجرَ تنسيق شامل خارج النطاق.
- `bun run build` — PASS؛ أزيل footer المولّد من `routeTree.gen.ts` بعد التحقق.
- `git diff --check` — PASS.
- لا يوجد Playwright/Browser/Chrome harness محلي في المستودع؛ لم يُنشأ E2E حي أو بيانات/حسابات اصطناعية.
- `bun run security:test` لم يُشغّل لعدم توفر بيئة Supabase آمنة ومصرّح بها؛ لم تحدث اتصالات أو كتابات إنتاجية.

## الافتراضات

- ثُبّت HEAD والـbase حيًا مرتين ولم يتحرك أي منهما.
- `mergeStateStatus=BLOCKED` حالة GitHub خارج نطاق التنقل؛ الفرق نفسه `MERGEABLE`.
- تغطية 360px والتفاعل اعتمدت على مراجعة classes responsive وDOM semantics وحراس المصدر والبناء لغياب harness محلي.

## المخاطر والعوائق

- خط أساس Prettier/CRLF الموروث يحتاج مهمة تنسيق مستقلة إن أُريد ESLint نظيفًا لكل ملفات PR دون استثناء.
- لا توجد عوائق متبقية ضمن نطاق المراجعة.

## أثر الإنتاج

SOURCE-ONLY. لا Production أو Staging أو Backend أو SQL أو migrations أو authorization أو dashboards أو B1 أو `enrollment_certificate` أو `student_visible`. لا Deploy/Publish ولا merge ولا بيانات أو حسابات أو طلبات اصطناعية. الأثر محصور في دقة التنقل وحالات الخطأ ودلالات Accessibility.
