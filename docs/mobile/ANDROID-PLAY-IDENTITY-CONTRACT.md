# ANDROID / GOOGLE PLAY IDENTITY CONTRACT — ITCS Portal

FROZEN. Any change requires explicit written authorization from the project owner.

## 1. Application identity (frozen)

| Field | Value |
| --- | --- |
| `applicationId` | `ye.edu.usr.fitcs.portal` |
| `namespace` | `ye.edu.usr.fitcs.portal` |
| App label | ITCS Portal |
| Play listing app | single application, created once with the applicationId above |

`PACKAGE_NAME_FROZEN = YES`

Enforced in source by `scripts/mobile/apply-android-identity.mjs`, which rewrites the
generated `android/` project after every `cap add android` / `cap sync android` and
fails closed on a wrong applicationId, cleartext traffic, or an undocumented permission.

## 2. Version contract

| Field | Current value |
| --- | --- |
| `versionCode` | `5` |
| `versionName` | `0.4.1` |

Rules:

- `versionCode` is a strictly increasing integer. Never reused, never lowered.
- `versionName` is human readable (`MAJOR.MINOR.PATCH`).
- Every Play upload (internal testing included) consumes a `versionCode`.
- The Capacitor shell and any future Flutter rewrite share the same counter.

`INITIAL_VERSION_CODE=1`
`INITIAL_VERSION_NAME=0.1.0`

## 3. Signing

- Google **Play App Signing** is mandatory for this application.
- The **upload key** is generated once, outside the repository, and stored by the
  owner in a secure vault. It is never committed.
- The **app signing key** is held by Google Play. It is never exported into the repo.
- Release signing is supplied only through protected CI environment secrets; no signing material is committed.
- `.gitignore` blocks `*.jks`, `*.keystore` (except the Android SDK debug keystore),
  `key.properties`, `android/local.properties`, Play service-account JSON and Firebase
  service-account JSON.

## 4. Delivery mode

The Android app is a Capacitor shell around the deployed SSR portal
(`server.url = https://quboolye.com/mobile/student-login`), HTTPS only,
`cleartext = false`, no SSL bypass, navigation restricted to the portal origin
(`quboolye.com`, `www.quboolye.com`). The backend (Supabase) host is called by
fetch/XHR only and is not a navigation target from `0.4.0`; signed file URLs open
in the system browser.
Web releases therefore reach devices without a Play update; a Play update is only
needed when native config, identity, permissions or plugins change.

Entry surface is **student-first**: the login screen redirects to `/mobile/student`.
Staff/admin navigation is never exposed in the Android shell.

## 5. Future Flutter rewrite

`FUTURE_FLUTTER_REWRITE_SUPPORTED = YES`

A Flutter application may replace this Capacitor shell as an ordinary Play update
provided it keeps:

1. the same `applicationId` — `ye.edu.usr.fitcs.portal`;
2. the same Play application entry and the same Play App Signing identity
   (upload key may be rotated through Play's key-reset flow, the app signing
   identity may not change);
3. a `versionCode` strictly higher than the last published one;
4. permissions within the documented allowlist, or an updated allowlist documented here.

No second/conflicting Android application identity may be created for this portal.

## 6. Permission allowlist

| Permission | Reason |
| --- | --- |
| `android.permission.INTERNET` | Loading the HTTPS portal and calling the backend API |

Any additional permission must be added to `ALLOWED_PERMISSIONS` in
`scripts/mobile/apply-android-identity.mjs` **and** justified in this table.
Storage, location, contacts, phone and SMS permissions are explicitly not allowed.

### Merged-manifest permissions (library supplied)

The allowlist above is enforced against the app's own source manifest
(`android/app/src/main/AndroidManifest.xml`). The **merged** manifest of the built
APK/AAB additionally carries the following normal (install-time, no user prompt)
permissions contributed by the `androidx.biometric:biometric` dependency used for
the app lock and step-up confirmation:

| Permission | Source | Reason |
| --- | --- | --- |
| `android.permission.USE_BIOMETRIC` | `androidx.biometric` | BiometricPrompt (API 28+) |
| `android.permission.USE_FINGERPRINT` | `androidx.biometric` | Legacy fingerprint API (API 23–27) |

They grant no access to biometric templates or images; they must be declared
truthfully in the Play Console listing. No other library-supplied permission is expected.
