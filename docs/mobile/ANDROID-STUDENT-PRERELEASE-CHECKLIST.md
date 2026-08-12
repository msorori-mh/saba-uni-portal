# قائمة اختبار ما قبل الإصدار — تطبيق Android لبوابة الطالب

الهوية المجمّدة: `ye.edu.usr.fitcs.portal` · «بوابة الكلية» · versionCode 1 · versionName 0.1.0
الأصل الرسمي للتطبيق: `https://quboolye.com/mobile/student-login`
النطاق: الطالب فقط. لا Faculty ولا Staff ولا Admin.

## 1. الفرع والـPR (ينفّذه المالك)

```
git checkout -b feat/mobile-capacitor-android-prebuild-01
git add -A && git commit -m "feat(mobile): Android student app pre-release"
git push -u origin feat/mobile-capacitor-android-prebuild-01
```
ثم فتح PR إلى `main`.

## 2. تشغيل CI

GitHub Actions → «Android Build — بوابة الطالب» → Run workflow.
المخرجات المطلوبة:
- `app-debug-apk` → `app-debug.apk`
- `app-debug-aab` → `app-debug.aab`
(نسخ Release غير موقّعة وتُعتبر اختيارية في هذه المرحلة.)

## 3. التثبيت على جهاز حقيقي

```
adb install -r app-debug.apk
```
أو نقل الملف إلى الجهاز وتثبيته يدويًا بعد السماح بمصادر غير معروفة.

## 4. الاختبار العملي (حساب طالب DEMO)

| # | الخطوة | المتوقع | النتيجة |
|---|--------|---------|---------|
| 1 | فتح التطبيق | شاشة Splash ثم شاشة دخول الطالب بالعربية RTL | |
| 2 | تسجيل الدخول بحساب طالب DEMO | الانتقال إلى `/mobile/student` | |
| 3 | الرئيسية | بطاقات الطالب تظهر بالبيانات الحقيقية | |
| 4 | الجدول | جدول المحاضرات مع اسم المدرّس والقاعة | |
| 5 | الدرجات / السجل الأكاديمي | الدرجات والمعدل تظهر بلا أخطاء | |
| 6 | الطلبات | قائمة الطلبات وإمكانية فتح طلب | |
| 7 | الوثائق | قائمة الوثائق والتحميل الآمن | |
| 8 | زر الرجوع داخل صفحة فرعية | رجوع صفحة واحدة داخل التطبيق | |
| 9 | زر الرجوع في الرئيسية | رسالة «اضغط رجوع مرة أخرى للخروج» | |
| 10 | ضغط الرجوع مرتين | خروج من التطبيق دون تعليق | |
| 11 | إعادة فتح التطبيق | الجلسة مستمرة ويفتح على `/mobile/student` مباشرة دون إعادة تسجيل دخول | |
| 12 | فحص عام | لا شاشة بيضاء، لا أخطاء، لا خروج إلى متصفح خارجي | |

## 5. القرار

- كل البنود PASS → `PASS_ANDROID_STUDENT_APP_PRE_RELEASE`
- أي بند FAIL → توصيف دقيق للعطل، إصلاح في المصدر، إعادة بناء CI، ثم إعادة الاختبار كاملًا.

Release Signing وPlay Console مؤجلان حتى طلب النشر.

## ملاحظات تقنية مثبتة في المصدر

- استمرار الجلسة: عميل الخلفية يستخدم `localStorage` مع `persistSession: true` و`autoRefreshToken: true`، ولا يوجد أي مسح تخزين عند الإقلاع داخل قشرة التطبيق.
- قشرة التطبيق: `useNativeAppShell` تضبط شريط الحالة، تُخفي Splash، وتدير زر الرجوع.
- الأذونات: `android.permission.INTERNET` فقط، ويفرضها `scripts/mobile/apply-android-identity.mjs` داخل CI.
