# APPROVED — EXECUTE ANDROID-STUDENT-CANONICAL-REALIGNMENT-PHYSICAL-E2E-02

Apply these mandatory clarifications:

1. THIS IS SOURCE-ONLY.

   No Production Migration apply.

   No Production DB write.

   No Publish/Deploy to [quboolye.com](http://quboolye.com).

   Stop after source implementation, tests, and migration preparation.

2. Native PWA cleanup must be Capacitor-only.

   Do not clear arbitrary browser caches.

   Unregister only native WebView service workers and remove only portal-owned PWA caches.

   Preserve normal [quboolye.com](http://quboolye.com) PWA behavior in Chrome/web.

   Also verify the global manifest link cannot recreate the

   /manifest.webmanifest service-worker error inside native runtime.

3. For get_student_request_eligibility_context(uuid):

   obtain the CURRENT PRODUCTION definition using pg_get_functiondef first.

   Build the forward-only corrective migration from that exact production definition.

   The intended semantic change is ONLY:

     [rt.id](http://rt.id) = sr.request_type_id

   ->

     rt.code = sr.request_type

   Preserve SECURITY DEFINER, search_path, authorization guards,

   return shape, and all unrelated production behavior.

   Do not modify historical migration files.

   Do not apply the corrective migration.

4. Student reports filtering must happen SERVER-SIDE.

   Return a student-safe DTO that never transmits:

   report_code,

   sensitivity,

   raw data_scope,

   internal beneficiaries/roles,

   internal routes,

   implementation metadata.

   Do not merely hide those fields in React.

5. Do not create another static duplicated mobile service registry.

   Reuse canonical student feature/eligibility decisions.

   Mobile is a presentation projection only.

6. Route-containment tests must cover:

   Link/to,

   href,

   navigate(),

   window.location,

   [window.open](http://window.open),

   and redirects,

   so /mobile/student cannot silently escape to /student,

   faculty, staff, admin, or public-site routes.

7. Record provenance:

   REPO_HEAD

   FUNCTIONAL_SOURCE_BASE

   APK_WRAPPER_SHA=bb196a3d1e99ce5adade52d20a65125948477235

   DEPLOYED_WEB_SHA if determinable.

Final allowed decision:

PASS_ANDROID_STUDENT_CANONICAL_REALIGNMENT_SOURCE

Then STOP.

Do not announce PASS_ANDROID_STUDENT_APP_PRE_[RELEASE.ANDROID](http://RELEASE.ANDROID)-STUDENT-CANONICAL-REALIGNMENT-PHYSICAL-E2E-02

القرار الحالي يبقى: **HOLD_ANDROID_STUDENT_APP_PRE_RELEASE**. الهدف من هذه المهمة هو إغلاق عيوب المصدر فقط، ثم التوقف قبل أي كتابة إنتاجية.

## ما تم التحقق منه فعلياً قبل الخطة

- `src/routes/__root.tsx` يستثني `/admin` فقط؛ لذلك `Header` و`Footer` و`GlobalBackButton` و`PortalInstallPrompt` و`registerPortalPWA()` تعمل على `/mobile/*` — تسرّب الموقع العام مؤكد.
- `src/routes/mobile.student.tsx` يستدعي `registerPortalPWA()` أيضاً داخل التطبيق الأصلي.
- `src/routes/mobile.student.requests.tsx` يحتوي روابط خروج فعلية إلى `/student/requests/new` و`/student/requests` و`/student/requests/$id`.
- `mobile.student.index.tsx` يعرض بطاقات «قريباً» وبطاقة الرسوم/السجل الأكاديمي المرتبطة بأعلام معطّلة (`studentFinance=false`, `studentUnofficialTranscript=false`).
- `src/lib/beneficiary-reports.functions.ts:245` يضيف رابط `/student/graduation-projects` بلا شرط مستوى رابع.
- فحص إنتاجي للقراءة فقط: الدالة الوحيدة التي تستخدم `sr.request_type_id` هي `public.get_student_request_eligibility_context(p_student_profile_id uuid)`، بينما `public.student_requests` تملك `request_type text` فقط ولا تملك `request_type_id`. هذا يفسّر خطأ الواجهة حرفياً.

## المراحل

### 0) تثبيت المصدر

تسجيل: SHA الحالي للمصدر، SHA حاوية APK `bb196a3d`, وSHA النسخة المنشورة إن توفر. لا مساس بأعمال توصيف المقررات الحديثة.

### A) عزل `/mobile` عن الموقع العام

تعديل `__root.tsx` ليعامل `/mobile` مثل `/admin`: بلا Header وبلا Footer وبلا GlobalBackButton وبلا PortalInstallPrompt وبلا تسجيل PWA. لا إعادة تصميم لبقية البوابات.

### B) إزالة PWA من بيئة Capacitor الأصلية

كشف بيئة native، ثم: عدم التسجيل، و`unregister()` لأي Service Worker سابق، وتنظيف Caches المملوكة للبوابة داخل WebView، وإخفاء واجهة التثبيت. سلوك المتصفح خارج التطبيق يبقى كما هو. تحذير `public/plugins` يُصنّف غير حاجب.

### C) منتج طالب واحد

`/mobile/student/*` تصبح واجهة عرض فوق نفس الخوادم والعقود والأهلية المستخدمة في `/student/*`؛ لا تكرار لقواعد العمل.

### D) احتواء مسارات الموبايل

إزالة كل روابط الخروج من صفحات الموبايل، وإزالة «العودة إلى الموقع الرئيسي» من شاشة الدخول، مع إبقاء استعادة كلمة المرور ضمن مسار آمن للطالب داخل نطاق الموبايل.

### E) الرئيسية = خدمات فعلية فقط

حذف كل بطاقة «قريباً»: الرسوم والمدفوعات، التقدم الأكاديمي، الحساب، الملف الشخصي، والسجل الأكاديمي ما دام علمه معطلاً. الخدمات الحية فقط، مع شرطية مشاريع التخرج (مستوى رابع) وشؤون الخريجين (خريج معتمد). شريط سفلي: الرئيسية / الجدول / الطلبات / الوثائق / المزيد.

### F) عطل الطلبات — مصدر ثم توقف

إنشاء Migration تصحيحية **forward-only** واحدة بـ`CREATE OR REPLACE FUNCTION` لـ`get_student_request_eligibility_context(uuid)` تستبدل `rt.id = sr.request_type_id` بـ`rt.code = sr.request_type`، دون أي تعديل على Migrations مطبقة. **التوقف هنا وطلب موافقتك قبل أي تطبيق إنتاجي.**

### G) رحلة الطلبات كاملة داخل التطبيق

أنواع الطلبات ← الأهلية ← النموذج ← المرفقات ← مسودة ← إرسال ← طلباتي ← التفاصيل ← الحالة ← الإعادة للاستكمال، بنفس RPCs القانونية وداخل `/mobile/student/*` فقط.

### H) «تقاريري» بصيغة الطالب

إسقاط الكتالوج إلى DTO آمن للطالب: بلا report_code وبلا تصنيف حساسية وبلا data_scope وبلا مستفيدين داخليين وبلا مسارات داخلية وبلا تكرار تحت مجموعات هيئة التدريس أو رؤساء الأقسام.

### I) بوابة المستوى الرابع لمشروع التخرج

مُسند واحد قانوني يُستخدم في اللوحة والموبايل والقوائم والتقارير والروابط السريعة والمسار المباشر، مع بقاء الحارس الخلفي مرجعاً. لغير المستوى الرابع: صفر ظهور.

### J) استمرار الجلسة

لا يُعتبر فشلاً؛ يعاد اختباره لاحقاً على مستخدم Android واحد فقط. المصدر يبقى `persistSession` و`autoRefreshToken` مفعّلين.

### K) زر الرجوع

إزالة `GlobalBackButton` من `/mobile` فقط، مع إبقاء منطق الرجوع الأصلي كما هو.

### L) الاختبارات

توسيع `tests/mobile` لتغطية البنود 1–19 المطلوبة، ثم `bun test tests/mobile` و`bunx tsc --noEmit` بالإضافة إلى اختبارات الطلبات والتقارير وأهلية مشروع التخرج وسياسة PWA.

## القرار

عند اجتياز بوابات المصدر: `PASS_ANDROID_STUDENT_CANONICAL_REALIGNMENT_SOURCE` فقط. لا إعلان Pre-Release، ولا تطبيق Migration إنتاجية قبل موافقتك.