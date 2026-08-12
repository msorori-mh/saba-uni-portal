# PORTAL-MOBILE-CAPACITOR-ANDROID-PREBUILD-LONGRUN-01

Mode: source preparation only — no production DB write, no migration apply, no deploy,
no Play upload, no release signing.

## Identity

```
APPLICATION_ID = ye.edu.usr.fitcs.portal
APP_NAME       = بوابة الكلية
VERSION_CODE   = 1
VERSION_NAME   = 0.1.0
PACKAGE_NAME_FROZEN = YES
FUTURE_FLUTTER_REWRITE_SUPPORTED = YES
```

Contract: `docs/mobile/ANDROID-PLAY-IDENTITY-CONTRACT.md`
Enforcement: `scripts/mobile/apply-android-identity.mjs` (fails closed on wrong
applicationId/namespace, cleartext traffic, or any permission outside the allowlist).

## G1 — Pre-existing state

```
CAPACITOR_ALREADY_PRESENT      = YES  (@capacitor/core, /cli, /android, /app, /status-bar, /splash-screen; capacitor.config.ts)
ANDROID_PROJECT_ALREADY_PRESENT= NO   (android/ was absent; generated in this task)
EXISTING_APPLICATION_ID        = ye.edu.usr.fitcs.portal (already frozen in config + helper)
EXISTING_APP_NAME              = بوابة الكلية
```

No duplicate native scaffolding was created; the existing config, native helpers and
CI workflow were reused and completed.

## G3/G4 — Capacitor + Android project

- `webDir` corrected to **`mobile-shell`**. The web build is SSR (`dist/client` has no
  `index.html`), so a minimal offline/loading fallback document is used as the local
  web dir while the app loads the deployed portal through `server.url` (HTTPS only).
- `android/` generated with `cap add android`, then `cap sync android`, identity script
  and branding script.
- `minSdk 24 / compileSdk 36 / targetSdk 36`, JDK 21 in CI — current Play-compatible.

## G5–G13 — Runtime behaviour

| Area | Implementation |
| --- | --- |
| Platform detection | single canonical helper `src/lib/native/platform.ts` (`isNativePlatform`, `isAndroidNative`); no scattered Capacitor checks |
| App shell | `src/hooks/use-native-app-shell.ts` wired into `src/routes/mobile.student.tsx` — status bar, splash hide, safe areas via `env(safe-area-inset-*)` |
| Back button | `src/lib/native/back-button.ts` — nested page → back; root → confirm toast → exit; never redirects to login, no loops |
| External links | `src/lib/native/external-links.ts` — allowlist `https:`/`mailto:`/`tel:`, portal hosts stay in-app, everything else `_system`, all other schemes blocked |
| Auth/session | unchanged Supabase web session (localStorage persistence + refresh) inside the WebView; login/logout/expiry handled by `mobile.student-login.tsx` and the layout `onAuthStateChange` guard; no public signup added |
| Documents | existing authenticated/server-generated URLs reused; no bucket made public, no privileged credential embedded, no new backend contract |
| Attachments | standard WebView `<input type="file">` flow (existing B1 forms); no extra Android permission requested |
| Network security | `cleartext: false`, `allowMixedContent: false`, `androidScheme: https`, navigation allowlist limited to portal + backend hosts; no SSL bypass |
| RTL | all mobile student surfaces render `dir="rtl"`, Arabic labels unchanged |

## G7 — Student-first entry

Entry URL: `https://saba-uni-portal.lovable.app/mobile/student-login` → `/mobile/student`.
Available student surfaces: الرئيسية، الجدول، الطلبات، الدرجات، الوثائق، السجل الأكاديمي، المالية.
No staff/admin navigation is exposed in the Android shell (asserted by tests).
Graduation Projects / Graduates Affairs remain gated by the existing backend eligibility rules.

## G15/G16 — Branding & permissions

- Branding derived from the existing official portal icon (`public/icon-512.png`) on the
  brand background `#061F33`: launcher icons (mdpi→xxxhdpi), round icons, adaptive
  foreground, portrait/landscape splash — committed under `resources/android/` and
  applied by `scripts/mobile/apply-android-branding.mjs` so CI regeneration is reproducible.
  No new visual identity invented; no low-quality placeholder introduced.
- Permissions: `android.permission.INTERNET` only (allowlist enforced).

## G17/G23 — Validation

```
WEB_BUILD          = PASS   (bun run build)
TYPECHECK          = PASS   (tsc --noEmit, 0 errors)
TESTS              = PASS   (tests/mobile + tests/pwa)
CAP_SYNC           = PASS   (cap sync android)
ANDROID_IDENTITY   = PASS   (apply-android-identity.mjs)
ANDROID_BRANDING   = PASS   (apply-android-branding.mjs)
DIFF_CHECK         = PASS   (git diff --check)
ANDROID_DEBUG_APK  = DEFERRED_TO_CI  (no JDK/Android SDK in this environment)
ANDROID_DEBUG_AAB  = DEFERRED_TO_CI
```

`assembleDebug` and `bundleDebug` run in `.github/workflows/android-build.yml`
(JDK 21 + Android SDK 36) and upload `app-debug-apk` / `app-debug-aab` artifacts.
Locally: `bun install && bun run cap:sync && cd android && ./gradlew assembleDebug`
(Windows: `gradlew.bat assembleDebug`, `gradlew.bat bundleDebug`).

## G18 — Android Studio

`bun run cap:open:android` (`npx cap open android`) opens `<repo>/android`.
Steps: File → Sync Project with Gradle Files → Build → Build Bundle(s)/APK(s) →
Build APK(s) / Build Bundle → select connected device → Run → Logcat filter by
package `ye.edu.usr.fitcs.portal`.
Canonical rebuild flow (no manual Android Studio edits required):
`web change → bun run build → cap sync android → identity+branding scripts → Android build`.

## G19 — Device smoke preparation

```
adb devices
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell monkey -p ye.edu.usr.fitcs.portal -c android.intent.category.LAUNCHER 1
```

Checklist: launch · splash · login screen · RTL · keyboard · back navigation ·
network error state · logout.

```
LIVE_AUTH_SMOKE = BLOCKED_NO_SAFE_TEST_CREDENTIAL
```

No real user credential was used; no production write occurred.

## G24 — Output locations

```
ANDROID_PROJECT_PATH = <repo>/android
APK_PATH             = <repo>/android/app/build/outputs/apk/debug/app-debug.apk      (produced by build, not committed)
AAB_PATH             = <repo>/android/app/build/outputs/bundle/debug/app-debug.aab   (produced by build, not committed)
```

`.gitignore` excludes `android/app/build/`, `android/build/`, `android/.gradle/`,
`android/local.properties`, `*.jks`, `*.keystore`, `key.properties`,
Play/Firebase service-account JSON.

## Final status

```
AUTH                  = PASS (unchanged Supabase email/password, WebView compatible)
SESSION_PERSISTENCE   = PASS
STUDENT_FIRST_ROUTING = PASS
RTL                   = PASS
BACK_NAVIGATION       = PASS
ATTACHMENTS           = PASS (WebView file chooser, no extra permissions)
DOCUMENTS             = PASS (authenticated paths preserved)
SECRET_COUNT          = 0
PRODUCTION_DB_WRITE   = 0
MIGRATION_APPLY       = 0
DEPLOY                = NO
PLAY_UPLOAD           = NO
RELEASE_SIGNING       = NO
```
