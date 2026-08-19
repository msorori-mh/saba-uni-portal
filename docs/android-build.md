# بوابة الكلية — بناء تطبيق Android

## العقد الثابت

| الحقل | القيمة |
|---|---|
| اسم التطبيق | بوابة الكلية |
| Package / appId | `ye.edu.usr.fitcs.portal` |
| Version | `versionCode 1` / `versionName 0.1.0` |
| Min SDK | 24 |
| Target SDK | 36 |
| نقطة الدخول | `https://quboolye.com/mobile/student-login` |
| الاتصال | HTTPS فقط؛ `cleartext = false` |
| النطاق | بوابة الطالب فقط |

لا تغيّر `appId` بعد إنشاء التطبيق في Google Play. وكل ملف يُرفع إلى Play يجب أن يحمل `versionCode` أعلى من الملف السابق.

## البناء عبر GitHub Actions

الـWorkflow هو `.github/workflows/android-build.yml`. يعمل يدويًا، ويعمل تلقائيًا عند الدفع إلى `main` عندما تتغير ملفات التطبيق أو إعداداته.

ينتج:

| Artifact | الاستخدام |
|---|---|
| `app-debug-apk` | تثبيت مباشر على جهاز اختبار |
| `app-debug-aab` | فحص بناء Debug |
| `app-release-apk` | Release APK؛ يكون موقعًا عند اكتمال أسرار التوقيع |
| `app-release-aab` | Release AAB؛ يكون موقعًا وجاهزًا للاختبار الداخلي عند اكتمال الأسرار |

تُحفظ Artifacts لمدة 30 يومًا.

## عقد توقيع Release

يقرأ البناء القيم من GitHub Actions Secrets فقط:

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

السلوك مغلق عند الخطأ:

- إذا غابت الأسرار الأربعة كلها، ينجح Debug ويُبنى Release غير موقع.
- إذا وُجدت بعض الأسرار فقط، يفشل التشغيل ولا ينتج إصدارًا ملتبسًا.
- إذا اكتملت، يُفك المفتاح مؤقتًا داخل runner، ويُوقّع Release APK/AAB، ثم يُحذف الملف المؤقت دائمًا.

لا تحفظ keystore أو كلمات مروره في المستودع، ولا ترسلها في المحادثة. أدخلها من إعدادات المستودع: **Settings → Secrets and variables → Actions**. احتفظ بنسخة احتياطية مشفرة من upload key خارج GitHub.

## تشغيل البناء يدويًا

1. افتح المستودع في GitHub ثم **Actions**.
2. اختر **Android Build — بوابة الطالب**.
3. اختر **Run workflow** وحدد الفرع.
4. بعد النجاح، حمّل الملفات من قسم **Artifacts**.

## تثبيت Debug APK

بعد تحميل وفك ضغط `app-debug-apk`:

```bash
adb install -r app-debug.apk
```

أو انقل الملف إلى الهاتف واسمح بالتثبيت من المصدر المستخدم. عند الفتح يجب أن تظهر شاشة دخول الطالب على النطاق الرسمي.

## البناء المحلي

المتطلبات: Node.js 22، Bun، JDK 21، Android SDK 36.

```bash
bun install --frozen-lockfile
bun run build
bunx cap sync android
node scripts/mobile/apply-android-identity.mjs
node scripts/mobile/apply-android-branding.mjs
cd android
./gradlew assembleDebug
```

لبناء Release موقع محليًا، مرّر متغيرات البيئة الأربعة التي يقرأها `android/app/build.gradle`، مع `ANDROID_KEYSTORE_PATH` لمسار ملف المفتاح المحلي. لا تستخدم سطر أوامر يسجل كلمات المرور في shell history.

## بوابة الاختبار الداخلي

قبل رفع AAB إلى Google Play Internal Testing يجب إثبات:

1. نجاح GitHub Actions وبناء AAB موقع.
2. تثبيت Debug APK واختباره على جهاز Android فعلي.
3. الدخول والخروج، الجلسة، الرجوع، الروابط الخارجية، RTL، والقياسات الأساسية.
4. تطابق `appId` والإصدار ونقطة الدخول مع العقد أعلاه.
5. تفعيل Play App Signing واستخدام upload key محفوظ بأمان.

الرفع إلى مسار Production ليس جزءًا من هذه البوابة؛ يبدأ أولًا بمسار **Internal testing**.
