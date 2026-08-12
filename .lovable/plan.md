# تطبيق Android — بوابة الطالب فقط: من المصدر إلى Pre-Release

النطاق مثبت: التطبيق = الطالب فقط (`/mobile/student-login` ثم `/mobile/student`). لا Faculty ولا Staff ولا Admin داخل التطبيق. الويب يبقى شاملًا للجميع.

## الحالة الحالية (تم التحقق منها الآن)

- مسارات الموبايل الموجودة كلها طلابية: login, index, schedule, grades, academic-record, finance, requests, documents. لا يوجد أي مسار faculty/staff داخل `/mobile`. الإشارة الوحيدة لكلمة faculty هي اسم مدرّس المادة داخل جدول الطالب — عرض فقط.
- قشرة التطبيق الأصلية `use-native-app-shell` جاهزة: شريط الحالة، إخفاء Splash، وزر الرجوع (رجوع → تأكيد الخروج → خروج).
- الجلسة تُحفظ في localStorage مع `persistSession` و`autoRefreshToken`، أي أن إعادة فتح التطبيق يجب أن تُبقي الطالب مسجّل الدخول.
- شجرة العمل نظيفة، والفرع الحالي هو فرع التحرير، وworkflow البناء `.github/workflows/android-build.yml` جاهز (JDK 21، SDK 36، APK + AAB).

## ما سأنفّذه أنا (مصدر فقط)

1. حارس نطاق التطبيق: اختبار في `tests/mobile` يفشل إذا ظهر أي مسار `/mobile/*` غير طلابي أو أي رابط داخل شاشات الموبايل يوجّه إلى `/faculty-portal` أو `/staff` أو `/admin`.
2. تثبيت مسار الدخول: التأكد أن `capacitor.config.ts` يبدأ من `/mobile/student-login` وأن `allowNavigation` لا يسمح بالخروج خارج نطاقات البوابة والخلفية.
3. تثبيت استمرار الجلسة داخل WebView: مراجعة أن لا شيء يمسح التخزين عند الإقلاع، وتوثيق ذلك في تقرير التسليم.
4. إضافة تشغيل يدوي واضح لـCI (`workflow_dispatch` موجود) وتوثيق أسماء المخرجات: `app-debug-apk`، `app-debug-aab`.
5. قائمة اختبار الجهاز الحقيقي بصيغة قابلة للتعليم في `docs/mobile/ANDROID-STUDENT-PRERELEASE-CHECKLIST.md`، تغطي: Login → الرئيسية → الجدول → الدرجات/السجل → الطلبات → الوثائق → زر الرجوع → إعادة الفتح واستمرار الجلسة.

## ما يجب أن تنفّذه أنت (خارج قدرتي)

- إنشاء الفرع والـCommit والـPR: لا يُسمح لي بتنفيذ أوامر git تغييرية. الاسم المقترح `feat/mobile-capacitor-android-prebuild-01`.
- تشغيل GitHub Actions وتنزيل `app-debug.apk`.
- تثبيت APK على جهاز Android حقيقي وتنفيذ قائمة الاختبار بحساب طالب DEMO (كلمة المرور الموحّدة للحسابات التجريبية).

## معيار القرار

`PASS_ANDROID_STUDENT_APP_PRE_RELEASE` عند نجاح كل بنود قائمة الاختبار بدون أخطاء JS ودون فقدان الجلسة. عند أي فشل: يوصف العطل بدقة وأصلحه في المصدر ثم يعاد بناء CI.

Release Signing وPlay Console مؤجلان بالكامل حتى تطلب النشر.

## تفاصيل تقنية

- لا Migration ولا تغييرات قاعدة بيانات.
- التحقق قبل التسليم: `bunx tsc --noEmit` + اختبارات `tests/mobile`.
- الهوية مجمّدة كما هي: `ye.edu.usr.fitcs.portal` / بوابة الكلية / versionCode 1، ويطبّقها `scripts/mobile/apply-android-identity.mjs` داخل CI.
