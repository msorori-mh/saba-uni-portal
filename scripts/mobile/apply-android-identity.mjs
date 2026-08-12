#!/usr/bin/env node
/**
 * Applies the frozen Android identity + version contract to the generated
 * `android/` project (Capacitor regenerates it in CI, so this runs after
 * `cap add android` / `cap sync android`).
 *
 * Contract (docs/mobile/ANDROID-PLAY-IDENTITY-CONTRACT.md):
 *   applicationId = ye.edu.usr.fitcs.portal
 *   namespace     = ye.edu.usr.fitcs.portal
 *   app label     = بوابة الكلية
 *   versionCode   = 1
 *   versionName   = 0.1.0
 *
 * It also fails closed on: wrong applicationId, cleartext traffic enabled,
 * and any Android permission outside the documented allowlist.
 */
import fs from "node:fs";
import path from "node:path";

export const APPLICATION_ID = "ye.edu.usr.fitcs.portal";
export const APP_LABEL = "بوابة الكلية";
export const VERSION_CODE = 1;
export const VERSION_NAME = "0.1.0";
/** Minimum permission set: network access only. */
export const ALLOWED_PERMISSIONS = ["android.permission.INTERNET"];

const ANDROID_DIR = path.resolve(process.cwd(), "android");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function fail(message) {
  console.error(`[android-identity] FAIL: ${message}`);
  process.exitCode = 1;
}

function main() {
  if (!fs.existsSync(ANDROID_DIR)) {
    console.error("[android-identity] android/ not found — run `cap add android` first.");
    process.exit(1);
  }

  // 1) build.gradle — applicationId, namespace, versionCode, versionName
  const gradleFile = path.join(ANDROID_DIR, "app", "build.gradle");
  let gradle = read(gradleFile);
  gradle = gradle
    .replace(/namespace\s*=?\s*"[^"]*"/, `namespace = "${APPLICATION_ID}"`)
    .replace(/applicationId\s*=?\s*"[^"]*"/, `applicationId "${APPLICATION_ID}"`)
    .replace(/versionCode\s*=?\s*\d+/, `versionCode ${VERSION_CODE}`)
    .replace(/versionName\s*=?\s*"[^"]*"/, `versionName "${VERSION_NAME}"`);
  fs.writeFileSync(gradleFile, gradle);

  if (!gradle.includes(`applicationId "${APPLICATION_ID}"`)) fail("applicationId not applied");
  if (!gradle.includes(`namespace = "${APPLICATION_ID}"`)) fail("namespace not applied");

  // 2) strings.xml — Arabic app label
  const stringsFile = path.join(ANDROID_DIR, "app", "src", "main", "res", "values", "strings.xml");
  let strings = read(stringsFile);
  strings = strings
    .replace(/(<string name="app_name">)[\s\S]*?(<\/string>)/, `$1${APP_LABEL}$2`)
    .replace(/(<string name="title_activity_main">)[\s\S]*?(<\/string>)/, `$1${APP_LABEL}$2`)
    .replace(/(<string name="package_name">)[\s\S]*?(<\/string>)/, `$1${APPLICATION_ID}$2`)
    .replace(/(<string name="custom_url_scheme">)[\s\S]*?(<\/string>)/, `$1${APPLICATION_ID}$2`);
  fs.writeFileSync(stringsFile, strings);

  // 3) AndroidManifest.xml — permission allowlist + no cleartext
  const manifestFile = path.join(ANDROID_DIR, "app", "src", "main", "AndroidManifest.xml");
  const manifest = read(manifestFile);
  const permissions = [...manifest.matchAll(/uses-permission[^>]*android:name="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const extra = permissions.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
  if (extra.length) fail(`undocumented Android permissions: ${extra.join(", ")}`);
  if (/usesCleartextTraffic="true"/.test(manifest)) fail("cleartext traffic is enabled");

  console.log(
    `[android-identity] applicationId=${APPLICATION_ID} versionCode=${VERSION_CODE} versionName=${VERSION_NAME} permissions=[${permissions.join(", ")}]`,
  );
}

main();
