# بوابة الطالب — Android Build (Capacitor)

## معلومات التطبيق

| الحقل | القيمة |
|---|---|
| App Name | بوابة الطالب |
| Package / appId | `usr.student` |
| Min SDK | 23 (Android 6.0) |
| Target SDK | 35 (Android 15) |
| Mode | Remote shell → `https://saba-uni-portal.lovable.app/mobile/student-login` |
| HTTPS | إجباري (`cleartext = false`) |
| Auth / RLS / API | بدون تغيير — نفس Supabase الحالي |

---

## 🚀 البناء التلقائي عبر GitHub Actions (الطريقة الموصى بها)

ملف الـ Workflow: `.github/workflows/android-build.yml`

### كيف يعمل

- يعمل **يدوياً** من تبويب Actions على GitHub (`workflow_dispatch`).
- يعمل **تلقائياً** عند كل push على فرع `main` يمسّ كود الواجهة أو `capacitor.config.ts`.
- يبني Debug APK + Release APK (unsigned) + Release AAB (unsigned).
- إذا لم يوجد `android/gradlew`، يحذف مجلد `android/` القديم (إن وُجد) ويستدعي `cap add android` تلقائياً.

### تشغيل البناء يدوياً

1. افتح GitHub repo → **Actions**.
2. اختر workflow باسم **Android Build — بوابة الطالب**.
3. اضغط **Run workflow** → اختر الفرع (عادة `main`) → **Run workflow**.
4. انتظر اكتمال البناء (تقريباً 5–10 دقائق).

### تحميل ملفات APK / AAB

بعد نجاح الـ Workflow:

1. ادخل صفحة الـ Run.
2. انزل إلى قسم **Artifacts** في الأسفل.
3. حمّل أحد الملفات:

| Artifact | الملف | الاستخدام |
|---|---|---|
| `app-debug-apk` | `app-debug.apk` | تثبيت مباشر للاختبار الداخلي |
| `app-release-unsigned-apk` | `app-release-unsigned.apk` | يحتاج توقيع قبل التوزيع |
| `app-release-unsigned-aab` | `app-release.aab` | للنشر على Google Play (بعد التوقيع) |

> Artifacts تُحفظ لمدة 30 يوماً ثم تُحذف تلقائياً.

### تثبيت Debug APK على جهاز Android

1. حمّل `app-debug.apk` من Artifacts على هاتفك.
2. فعّل **Install from Unknown Sources** للمتصفح الذي حمّلت منه.
3. افتح الملف وثبّته.
4. عند الفتح يجب أن تظهر **شاشة دخول الطالب** مباشرة.

أو عبر USB ADB من الكمبيوتر:

```bash
adb install -r app-debug.apk
```

---

## 🔐 ملاحظات التوقيع والنشر

- Release APK / AAB من الـ Workflow تخرج **بدون توقيع** لأن الـ keystore لم يُضف إلى GitHub Secrets بعد.
- لا يفشل الـ Workflow عند غياب الـ keystore — يكمل بناء Debug ويرفع Release كـ unsigned.

### إضافة التوقيع لاحقاً (للنشر على Google Play)

1. أنشئ keystore محلياً:

```bash
keytool -genkey -v -keystore saba-student.keystore \
  -alias saba -keyalg RSA -keysize 2048 -validity 10000
```

2. ارفع الملف + كلمات السر إلى **GitHub Secrets**:
   - `ANDROID_KEYSTORE_BASE64` (محتوى الـ keystore مُشفّر base64)
   - `ANDROID_KEYSTORE_PASSWORD`
   - `ANDROID_KEY_ALIAS`
   - `ANDROID_KEY_PASSWORD`

3. عدّل `android/app/build.gradle` لاستخدام `signingConfigs` تقرأ من متغيرات البيئة، وأضف خطوة في الـ Workflow تكتب الـ keystore من Secret إلى ملف قبل `assembleRelease`.

> هذه الخطوات خارج نطاق المرحلة الحالية — تُضاف في مرحلة لاحقة عند جاهزية النشر على Play Store.

---

## 🖥️ البناء محلياً (بديل اختياري)

يتطلب: Android Studio + JDK 17 + Node.js 20.

```bash
npm install
npm run build
npx cap add android      # أول مرة فقط
npx cap sync android
cd android
./gradlew assembleDebug     # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # → app-release-unsigned.apk
./gradlew bundleRelease     # → bundle/release/app-release.aab
```

---

## أحجام تقديرية

| النوع | الحجم |
|---|---|
| Debug APK | ~6–8 MB |
| Release APK | ~4–6 MB |
| AAB | ~3–5 MB |

الحجم صغير لأن الواجهة تُحمَّل من السيرفر (Remote shell)، أي تحديث ويب يظهر فوراً دون إعادة بناء.

---

## نطاق الإصدار v1

✅ يشمل: Login، Dashboard، Grades، Academic Record، Finance، Requests، Documents، Schedule، Splash، Deep Links.

❌ مؤجّل: Push Notifications، Offline Sync، رفع السندات، تقديم الطلبات من التطبيق.
