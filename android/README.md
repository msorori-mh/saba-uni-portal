# بوابة الطالب — Android Build (Capacitor)

## معلومات التطبيق

| الحقل | القيمة |
|---|---|
| App Name | بوابة الطالب |
| Full Name | بوابة الطالب - كلية تكنولوجيا المعلومات وعلوم الحاسوب |
| Package / appId | `usr.student` |
| Min SDK | 23 (Android 6.0) |
| Target SDK | 35 (Android 15) |
| Mode | Remote shell → `https://saba-uni-portal.lovable.app` |
| Auth | نفس نظام Supabase الحالي (لا تغيير) |
| RLS | بدون تغيير |
| API | لا يوجد API جديد |

---

## ⚠️ لماذا لا يُبنى APK داخل Lovable؟

بيئة Lovable السحابية لا تحتوي على **Android SDK / Gradle / JDK 17**. لإنتاج APK/AAB يجب البناء على جهاز محلي عبر **Android Studio**.

---

## خطوات البناء (محلياً)

### 1) تجهيز البيئة

- ثبّت [Android Studio](https://developer.android.com/studio) (Hedgehog أو أحدث).
- ثبّت **JDK 17**.
- ثبّت Node.js 20+ و npm/bun.

### 2) سحب المشروع

```bash
# بعد Export to GitHub من Lovable
git clone <repo-url>
cd <project>
npm install      # أو: bun install
```

### 3) إضافة منصّة Android (أول مرة فقط)

```bash
npx cap add android
npx cap sync android
```

سيتم إنشاء مجلد `android/` بإعدادات `usr.student`.

### 4) إعداد الأيقونة وSplash

```bash
# باستخدام @capacitor/assets (مرة واحدة)
npm install -D @capacitor/assets
mkdir -p resources
# ضع: resources/icon.png (1024x1024) + resources/splash.png (2732x2732)
npx capacitor-assets generate --android
```

شعار الكلية المتوفر: `src/assets/college-logo.jpg`

### 5) إعداد Deep Links (App Links)

عدّل `android/app/src/main/AndroidManifest.xml` داخل `<activity android:name=".MainActivity">`:

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https"
        android:host="saba-uni-portal.lovable.app"
        android:pathPrefix="/mobile/student" />
</intent-filter>
```

المسارات المدعومة:

- `/mobile/student`
- `/mobile/student/grades`
- `/mobile/student/academic-record`
- `/mobile/student/finance`
- `/mobile/student/requests`
- `/mobile/student/documents`

> لتفعيل App Links موثّقة (بدون شاشة اختيار) يلزم رفع ملف `assetlinks.json` على `https://saba-uni-portal.lovable.app/.well-known/assetlinks.json` يحوي SHA-256 لشهادة التوقيع.

### 6) بناء النسخ

#### Debug APK

```bash
npx cap sync android
cd android
./gradlew assembleDebug
# الناتج: android/app/build/outputs/apk/debug/app-debug.apk
```

#### Release APK (unsigned)

```bash
cd android
./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

#### Release AAB (للنشر على Play Store)

```bash
cd android
./gradlew bundleRelease
# android/app/build/outputs/bundle/release/app-release.aab
```

#### توقيع Release (مطلوب للنشر)

```bash
keytool -genkey -v -keystore saba-student.keystore \
  -alias saba -keyalg RSA -keysize 2048 -validity 10000

# ثم في android/app/build.gradle ضمن signingConfigs
```

### 7) فتح في Android Studio (للاختبار البصري)

```bash
npx cap open android
```

---

## أحجام تقديرية

| النوع | الحجم المتوقع |
|---|---|
| Debug APK | ~6–8 MB (WebView shell فقط) |
| Release APK | ~4–6 MB |
| AAB | ~3–5 MB |

الحجم صغير لأن الواجهة تُحمَّل من السيرفر (Remote shell).

---

## نطاق هذا الإصدار (v1)

✅ مُدرج:
- Login، Dashboard، Grades، Academic Record، Finance، Requests، Documents
- Splash Screen
- Deep Links (HTTPS)
- نفس مصادقة Supabase

❌ مؤجّل للإصدار الثاني:
- Push Notifications
- Offline Sync
- رفع السندات
- تقديم الطلبات من التطبيق
- خدمات جديدة

---

## ملاحظات

- لا يوجد API جديد. لا يوجد Auth جديد. لا تغيير على RLS.
- التطبيق shell نحيف يفتح الموقع المنشور، أي تحديث ويب ينعكس فوراً دون إعادة بناء APK.
- HTTPS only — `cleartext = false`.
- جميع روابط الويب التي تُفتح خارج النطاقات المسموحة (`allowNavigation`) ستفتح في المتصفح الخارجي.
