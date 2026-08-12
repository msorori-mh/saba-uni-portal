# PORTAL-PR246-INDEPENDENT-ENROLLMENT-CERTIFICATE-BANNER-REVIEW-01 — تقرير المراجعة المستقلة

- المستودع: `msorori-mh/saba-uni-portal`
- PR الأصلية: `#246`
- حالة PR عند بدء المراجعة وقبل النشر: `OPEN`، `isDraft=false`، `MERGEABLE`، `mergeStateStatus=BLOCKED`
- `headRefName`: `review/enrollment-certificate-violation-banner-ux-01`
- `headRefOid`: `e8958b64efecf3ac4f65f06f4cfeac559cea3d67`
- `baseRefName`: `main`
- `baseRefOid`: `92d51faa9bcdc9fd99e89579f6a498b463264246`
- فرع المراجعة: `review/pr246-enrollment-certificate-banner-codex-01`
- التاريخ: 2026-07-25

## القرار

**PASS_PR246_INDEPENDENT_ENROLLMENT_CERTIFICATE_BANNER_REVIEW**

## النتيجة

أثبتت المراجعة أن الفتح الطبيعي وحالات `loading` و`null/undefined` و`violation=false` لا تعرض شريط مخالفة أحمر، وأن اللون الأحمر لا يظهر إلا عند `is_eligible=false` مع سبب منع موثّق. لا تُعرض رسائل Backend الخام في مسارات الإنشاء والقائمة والتفاصيل، ولا تظهر `error.message` أو UUID أو SQL/RPC أو أسماء جداول ودوال للمستخدم.

اكتُشف عيب واحد وأُصلح forward-only: فشل جلب أنواع الطلبات (بما فيه `permission denied`) كان يعرض تنبيه تعذر التحقق ثم empty state مضللاً «لا توجد أنواع طلبات متاحة». أصبحت حالة الفشل تعرض رسالة عامة مستقلة ولا تمر إلى empty state. كما وُسّع حارس الحالات اللاحقة ليغطي `cancelled` و`rejected` و`returned_for_completion` لأن صفحة التفاصيل تملك تنبيهاتها الحقيقية الخاصة.

## مصفوفة الحالات

| الحالة | النتيجة |
|---|---|
| normal | لا شريط أحمر؛ معلومات الخدمة زرقاء فقط |
| loading / null | مؤشر أو تنبيه تحقق محايد، بلا ادعاء مخالفة |
| violation=true | شريط أحمر `role=alert` مع سبب المنع الموثق |
| violation=false | لا شريط أحمر |
| violation undefined | `needs_verification` عنبري، لا مخالفة |
| permission denied | رسالة عامة آمنة، ولا empty state مضلل |
| network failure | رسالة عربية عامة، بلا نص PostgREST/RLS خام |
| submitted / processing | إخفاء أهلية الإنشاء |
| completed / archived | إخفاء أهلية الإنشاء |
| cancelled / rejected / returned | إخفاء أهلية الإنشاء مع بقاء تنبيهات التفاصيل الحقيقية مستقلة |

## RTL وMobile وAccessibility

- الجذور المعنية تستخدم `dir="rtl"`.
- أسطح الفشل الحقيقية تستخدم `role="alert"`، وحالات التحقق المؤقتة تستخدم `role="status"`.
- التخطيط مرن (`flex-wrap` وشبكات responsive) والنصوص قصيرة وقابلة للالتفاف على 360px.
- عناصر الاختيار والإرسال أزرار HTML أصلية قابلة للوحة المفاتيح، مع `disabled` حقيقي.
- لا يعتمد القرار على اللون وحده؛ يوجد عنوان ونص وسبب وحالة دلالية لقارئ الشاشة.

## الملفات المعدلة في مراجعة Codex

- `src/components/student-requests/StudentRequestEligibilityNotice.tsx`
- `src/routes/student.requests.new.tsx`
- `tests/student-requests/enrollment-certificate-violation-banner-ux-01.test.ts`
- `docs/PORTAL-PR246-INDEPENDENT-ENROLLMENT-CERTIFICATE-BANNER-REVIEW-01-REPORT.md`

## الاختبارات والنتائج

- `bun install --frozen-lockfile` — PASS.
- حارس PR المحدد — PASS: 9/9.
- `bun test tests/student-requests` — PASS: 614/614.
- `bun test tests` — PASS: 1551/1551. المحاولة الأولى داخل sandbox فشلت فقط بـ`EPERM` عند إنشاء عملية Wrangler؛ الإعادة خارج sandbox نجحت بالكامل.
- `bunx tsc --noEmit` — PASS.
- ESLint لملفات إصلاح المراجعة — PASS بلا أخطاء، مع تحذير Fast Refresh موروث واحد في ملف المكوّن.
- ESLint لجميع ملفات PR المعدلة — 766 أخطاء Prettier/CRLF موروثة في ملفي `student.requests.$id.tsx` و`student.requests.index.tsx`؛ لم تُنشئها هذه المراجعة ولم يُجرَ تنسيق شامل خارج النطاق.
- `bun run build` — PASS خارج sandbox؛ المحاولة الأولى داخله فشلت فقط بـ`spawn EPERM` من esbuild.
- `git diff --check` — PASS.
- `bun run security:test` — لم يُشغّل لعدم توفر بيئة Supabase آمنة ومصرح بها؛ لم تُنفذ اتصالات أو كتابات إنتاجية.

## الافتراضات

- ثُبّت `headRefOid` و`baseRefOid` الحيان مرتين (بعد fetch وقبل النشر) ولم يتحرك أي منهما.
- `mergeStateStatus=BLOCKED` حالة GitHub خارج نطاق صدق الشريط؛ PR قابلة للدمج من ناحية التعارض (`MERGEABLE`).
- التحقق البصري/التفاعلي اعتمد على مراجعة المصدر وSSR regression guards والبناء؛ لم يُستخدم Production أو Staging أو E2E حي.

## المخاطر والعوائق

- تحذير Fast Refresh الموروث وأخطاء تنسيق CRLF الموروثة لا تؤثر في runtime أو نتيجة البناء، وإصلاحها يحتاج PR تنسيق منفصلة.
- لا يوجد عائق متبقٍ ضمن نطاق المراجعة.

## أثر الإنتاج

SOURCE-ONLY. لا migrations أو SQL أو Backend أو RPC أو workflow أو authorization أو خدمات B1 أو `student_visible`. لا Production/Staging، ولا Deploy/Publish، ولا تعديل بيانات أو طلبات أو وثائق. التغيير يحسن صدق الرسائل فقط ويضيف حراس منع رجوع.
