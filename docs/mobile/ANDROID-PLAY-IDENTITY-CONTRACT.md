# ANDROID / GOOGLE PLAY IDENTITY CONTRACT — بوابة الكلية

FROZEN. Any change requires explicit written authorization from the project owner.

## 1. Application identity (frozen)

| Field | Value |
| --- | --- |
| `applicationId` | `ye.edu.usr.fitcs.portal` |
| `namespace` | `ye.edu.usr.fitcs.portal` |
| App label (Arabic) | بوابة الكلية |
| Play listing app | single application, created once with the applicationId above |

`PACKAGE_NAME_FROZEN = YES`

Enforced in source by `scripts/mobile/apply-android-identity.mjs`, which rewrites the
generated `android/` project after every `cap add android` / `cap sync android` and
fails closed on a wrong applicationId, cleartext traffic, or an undocumented permission.

## 2. Version contract

| Field | Initial value |
| --- | --- |
| `versionCode` | `1` |
| `versionName` | `0.1.0` |

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
- No release signing is configured yet: current builds are **debug/unsigned** only.
- `.gitignore` blocks `*.jks`, `*.keystore` (except the Android SDK debug keystore),
  `key.properties`, `android/local.properties`, Play service-account JSON and Firebase
  service-account JSON.

## 4. Delivery mode

The Android app is a Capacitor shell around the deployed SSR portal
(`server.url = https://saba-uni-portal.lovable.app/mobile/student-login`), HTTPS only,
`cleartext = false`, no SSL bypass, navigation restricted to portal + backend hosts.
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
