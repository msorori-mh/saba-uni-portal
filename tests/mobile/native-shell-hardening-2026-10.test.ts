/**
 * Native shell hardening (2026-10) — source contract + registration proof.
 *
 * The web layer is remote content, so the Android shell must not trust it with
 * the scope of the Keystore signing key, and the server must not trust a
 * client-supplied public key without proof of possession.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BIOMETRIC_KEY_ALIAS } from "../../src/lib/native/biometrics";
import {
  STEP_UP_SIGNING_VERSION,
  STEP_UP_SENSITIVE_SERVICES,
  buildStepUpSigningMessage,
  getStepUpDescriptor,
} from "../../src/lib/security/step-up-contract";
import {
  DEVICE_REGISTRATION_NONCE_TTL_SECONDS,
  DEVICE_REGISTRATION_SIGNING_VERSION,
  buildDeviceRegistrationMessage,
} from "../../src/lib/security/device-registration-contract";
import {
  deriveDeviceIdFromPublicKey,
  issueDeviceRegistrationNonce,
  verifyDeviceRegistrationNonce,
} from "../../src/lib/security/device-registration.server";

const ROOT = join(import.meta.dir, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const JAVA_DIR = "android/app/src/main/java/ye/edu/usr/fitcs/portal";
const plugin = read(`${JAVA_DIR}/BiometricKeystorePlugin.java`);
const activity = read(`${JAVA_DIR}/MainActivity.java`);

/** Body of a Java method, from its signature to the next top-level member. */
function javaMethod(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("\n    }\n", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("native signing scope is enforced in Java, not by the web layer", () => {
  test("the Keystore alias is a native constant equal to the JS alias", () => {
    expect(plugin).toContain(`static final String KEY_ALIAS = "${BIOMETRIC_KEY_ALIAS}";`);
    expect(plugin).toContain("return KEY_ALIAS.equals(alias);");
  });

  test("every alias-taking method rejects a non-canonical alias and uses the constant", () => {
    for (const name of ["ensureDeviceKey", "signChallenge", "clearDeviceKey"]) {
      const body = javaMethod(plugin, `public void ${name}(PluginCall call)`);
      expect(body).toContain('if (!isCanonicalAlias(call.getString("alias"))) {');
      expect(body).toContain('call.reject("PLUGIN_ERROR");');
      // The JS value is only compared, never passed on to the Keystore.
      expect(body).not.toMatch(/String alias = call\.getString/);
    }
    expect(plugin.match(/call\.getString\("alias"\)/g)?.length).toBe(3);
  });

  test("only the three known message formats are signable", () => {
    expect(plugin).toContain('MSG_APP_UNLOCK = "usrp-app-unlock-v1"');
    expect(plugin).toContain(`MSG_STEP_UP_PREFIX = "${STEP_UP_SIGNING_VERSION}|"`);
    expect(plugin).toContain(
      `MSG_DEVICE_REGISTER_PREFIX = "${DEVICE_REGISTRATION_SIGNING_VERSION}|"`,
    );
    const allow = javaMethod(plugin, "static String promptSubtitleFor(String message)");
    expect(allow).toContain("MSG_APP_UNLOCK.equals(message)");
    expect(allow).toContain("message.startsWith(MSG_STEP_UP_PREFIX)");
    expect(allow).toContain("message.startsWith(MSG_DEVICE_REGISTER_PREFIX)");
    expect(allow).toContain("parts.length != STEP_UP_FIELD_COUNT");
    expect(allow).toContain("parts.length != DEVICE_REGISTER_FIELD_COUNT");
    // Fall-through is a refusal.
    expect(allow.trimEnd().endsWith("return null;")).toBe(true);

    const sign = javaMethod(plugin, "public void signChallenge(PluginCall call)");
    const refuseAt = sign.indexOf("if (message == null || subtitle == null) {");
    expect(refuseAt).toBeGreaterThan(-1);
    expect(refuseAt).toBeLessThan(sign.indexOf("keyStore.getKey("));
  });

  test("native field counts match the JS message builders", () => {
    const stepUp = buildStepUpSigningMessage({
      challengeId: "c",
      nonce: "n",
      userId: "u",
      deviceId: "d",
      actionCode: "submit_file_withdrawal",
      requestId: "r",
      payloadHash: "h",
      expiresAt: "e",
    }).split("|");
    expect(plugin).toContain(`STEP_UP_FIELD_COUNT = ${stepUp.length};`);
    expect(plugin).toContain(`STEP_UP_ACTION_INDEX = ${stepUp.indexOf("submit_file_withdrawal")};`);
    const register = buildDeviceRegistrationMessage({
      nonce: "n",
      userId: "u",
      deviceId: "d",
      expiresAt: "1",
    }).split("|");
    expect(plugin).toContain(`DEVICE_REGISTER_FIELD_COUNT = ${register.length};`);
  });

  test("prompt wording is chosen natively; the JS reason is never read", () => {
    expect(plugin).not.toContain('getString("reason"');
    expect(plugin).not.toMatch(/\breason\b/);
    expect(plugin).toContain("final String subtitle = promptSubtitleFor(message);");
    expect(plugin).toContain("prompt(call, subtitle, crypto,");
    expect(plugin).toContain(".setSubtitle(subtitle)");
    expect(plugin).toContain('SUBTITLE_STEP_UP_GENERIC = "تأكيد عملية حساسة في بوابة الطالب"');
    expect(plugin).toContain('SUBTITLE_UNLOCK = "افتح بوابة الطالب"');
    expect(plugin).toContain("SUBTITLE_DEVICE_REGISTER");
    for (const service of STEP_UP_SENSITIVE_SERVICES) {
      expect(plugin).toContain(`case "${getStepUpDescriptor(service)!.actionCode}":`);
    }
    expect(plugin).toContain("return SUBTITLE_STEP_UP_GENERIC;");
  });

  test("there is no prompt-only authenticate() bridge method", () => {
    expect(plugin).not.toMatch(/public void authenticate\s*\(/);
    expect(plugin).not.toContain("biometricPrompt.authenticate(info);");
    expect(plugin).toContain("biometricPrompt.authenticate(info, crypto);");
    expect(read("src/lib/native/biometrics.ts")).not.toMatch(/\bauthenticate\(options/);
  });

  test("JS keeps the bridge call shape the installed 0.3.0 shell expects", () => {
    const js = read("src/lib/native/biometrics.ts");
    expect(js).toContain("alias: BIOMETRIC_KEY_ALIAS,");
    expect(js).toContain("reason: reasonAr,");
    expect(js).toContain('message: "usrp-app-unlock-v1",');
    for (const method of ["isAvailable", "ensureDeviceKey", "signChallenge", "clearDeviceKey", "setSecureScreen"]) {
      expect(plugin).toContain(`public void ${method}(PluginCall call)`);
    }
  });
});

describe("Recents snapshot protection", () => {
  test("FLAG_SECURE is added in onPause regardless of the app-lock setting", () => {
    const pause = javaMethod(activity, "public void onPause()");
    expect(pause).toContain("getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);");
    expect(pause).toContain("super.onPause();");
    expect(pause).not.toContain("isSecureRequestedByWeb");
  });

  test("onResume clears it only when the web layer did not ask to keep it", () => {
    const resume = javaMethod(activity, "public void onResume()");
    expect(resume).toContain("super.onResume();");
    expect(resume).toContain("if (!BiometricKeystorePlugin.isSecureRequestedByWeb()) {");
    expect(resume).toContain("getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);");
    // Foreground screenshots stay allowed: the flag is never set in onCreate.
    expect(javaMethod(activity, "public void onCreate(Bundle savedInstanceState)")).not.toContain(
      "FLAG_SECURE",
    );
  });

  test("a web 'disable' cannot strip the flag while the activity is paused", () => {
    const secure = javaMethod(plugin, "public void setSecureScreen(PluginCall call)");
    expect(secure).toContain("secureRequestedByWeb = enabled;");
    expect(secure).toContain("} else if (!hostPaused) {");
  });
});

describe("capacitor navigation allow-list", () => {
  const config = read("capacitor.config.ts");
  test("only the portal origin may host the native bridge", () => {
    expect(config).toContain('allowNavigation: ["quboolye.com", "www.quboolye.com"]');
    expect(config).not.toContain("supabase.co");
    expect(config).not.toContain("lovable.app");
  });

  test("signed files still leave the WebView through the redirect hop", () => {
    const redirect = read("src/lib/native/file-redirect.ts");
    expect(redirect).toContain("window.location.assign(buildFileRedirectUrl(safe));");
    const details = read("src/components/student-requests/StudentRequestDetailsScreen.tsx");
    expect(details).not.toContain("window.open(res.signedUrl");
    expect(details.match(/await openSignedPdf\(res\.signedUrl\);/g)?.length).toBe(2);
  });
});

describe("device registration requires proof of possession", () => {
  const server = read("src/lib/security/device-trust.functions.ts");
  const helper = read("src/lib/security/device-registration.server.ts");
  const client = read("src/lib/security/device-trust-client.ts");

  test("server verifies nonce HMAC and the ECDSA signature before the write", () => {
    const handler = server.slice(
      server.indexOf("export const registerTrustedDeviceFn"),
      server.indexOf("const beginChallengeSchema"),
    );
    const nonceAt = handler.indexOf("await verifyDeviceRegistrationNonce({");
    const sigAt = handler.indexOf("await verifyEcdsaAssertion({");
    const writeAt = handler.indexOf('from("student_trusted_devices").upsert');
    expect(nonceAt).toBeGreaterThan(-1);
    expect(sigAt).toBeGreaterThan(nonceAt);
    expect(writeAt).toBeGreaterThan(sigAt);
    expect(handler).toContain("userId: context.userId,");
    expect(handler).toContain("if (!proof.ok) throw new Error(proof.reason);");
    expect(handler).toContain('throw new Error("DEVICE_KEY_PROOF_INVALID");');
    expect(handler).toContain("REAUTHENTICATION_FAILED");
    for (const field of ["nonce:", "expiresAt:", "mac:", "signature:"]) {
      expect(server.slice(server.indexOf("const registerDeviceSchema"))).toContain(field);
    }
  });

  test("nonce issuance is authenticated and never accepts a client user id", () => {
    const begin = server.slice(
      server.indexOf("const beginDeviceRegistrationSchema"),
      server.indexOf("const registerDeviceSchema"),
    );
    expect(begin).toContain(".middleware([requireSupabaseAuth])");
    expect(begin).toContain(".strict()");
    expect(begin).not.toMatch(/userId:\s*z\./);
    expect(begin).toContain("userId: context.userId,");
  });

  test("the HMAC secret is server-only and loaded lazily", () => {
    expect(helper).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    expect(helper).toContain('crypto.subtle.verify(\n    "HMAC"');
    expect(server).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(server).not.toMatch(/^import .*device-registration\.server/m);
    expect(server.match(/await import\("\.\/device-registration\.server"\)/g)?.length).toBe(2);
    expect(client).not.toContain("device-registration.server");
    expect(client).not.toContain("process.env");
  });

  test("the client signs the server nonce and sends the proof", () => {
    expect(client).toContain("buildDeviceRegistrationMessage({");
    expect(client).toContain("signature: signature.signature,");
    expect(client).toContain("mac: challenge.mac,");
    expect(client).not.toContain("usrp-device-enroll-v1");
    const ui = read("src/components/mobile/MobileSecuritySettings.tsx");
    expect(ui).toContain("beginDeviceRegistrationFn({ data: input })");
    expect(ui).toContain("signInWithPassword");
  });

  describe("nonce HMAC behaviour", () => {
    const userId = "33333333-3333-3333-3333-333333333333";
    const publicKeyDer = Buffer.from(new Uint8Array(91).fill(7)).toString("base64");
    const withSecret = async <T>(fn: () => Promise<T>): Promise<T> => {
      const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-only-not-a-real-key";
      try {
        return await fn();
      } finally {
        if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
      }
    };

    test("accepts its own nonce and returns the canonical native-signable message", async () => {
      await withSecret(async () => {
        const deviceId = (await deriveDeviceIdFromPublicKey(publicKeyDer))!;
        expect(deviceId).toMatch(/^[0-9a-f]{64}$/);
        const issued = await issueDeviceRegistrationNonce({ userId, deviceId, nowMs: 1_000 });
        expect(Number(issued.expiresAt)).toBe(1_000 + DEVICE_REGISTRATION_NONCE_TTL_SECONDS * 1000);
        expect(DEVICE_REGISTRATION_NONCE_TTL_SECONDS).toBe(120);
        const ok = await verifyDeviceRegistrationNonce({
          userId, deviceId, publicKeyDer, ...issued, nowMs: 2_000,
        });
        expect(ok.ok).toBe(true);
        if (ok.ok) {
          expect(ok.message).toBe(
            `usrp-device-register-v1|${issued.nonce}|${userId}|${deviceId}|${issued.expiresAt}`,
          );
          expect(ok.message).toMatch(/^[\x20-\x7e]+$/);
        }
      });
    });

    test("rejects another user, altered nonce/expiry/mac, expiry and a foreign key", async () => {
      await withSecret(async () => {
        const deviceId = (await deriveDeviceIdFromPublicKey(publicKeyDer))!;
        const issued = await issueDeviceRegistrationNonce({ userId, deviceId, nowMs: 1_000 });
        const base = { userId, deviceId, publicKeyDer, ...issued, nowMs: 2_000 };
        const invalid = { ok: false, reason: "REGISTRATION_NONCE_INVALID" } as const;
        expect(
          await verifyDeviceRegistrationNonce({ ...base, userId: "44444444-4444-4444-4444-444444444444" }),
        ).toEqual(invalid);
        expect(
          await verifyDeviceRegistrationNonce({ ...base, nonce: "0".repeat(48) }),
        ).toEqual(invalid);
        expect(
          await verifyDeviceRegistrationNonce({ ...base, expiresAt: String(Number(issued.expiresAt) + 60_000) }),
        ).toEqual(invalid);
        expect(await verifyDeviceRegistrationNonce({ ...base, mac: "0".repeat(64) })).toEqual(invalid);
        expect(await verifyDeviceRegistrationNonce({ ...base, mac: "zz" })).toEqual(invalid);
        expect(
          await verifyDeviceRegistrationNonce({ ...base, nowMs: Number(issued.expiresAt) }),
        ).toEqual({ ok: false, reason: "REGISTRATION_NONCE_EXPIRED" });
        // Same device id, different public key: the id must be derived from the key.
        expect(
          await verifyDeviceRegistrationNonce({
            ...base,
            publicKeyDer: Buffer.from(new Uint8Array(91).fill(8)).toString("base64"),
          }),
        ).toEqual({ ok: false, reason: "DEVICE_ID_MISMATCH" });
      });
    });

    test("a nonce minted under a different server secret never verifies", async () => {
      const deviceId = (await withSecret(() => deriveDeviceIdFromPublicKey(publicKeyDer)))!;
      const issued = await withSecret(() =>
        issueDeviceRegistrationNonce({ userId, deviceId, nowMs: 1_000 }),
      );
      const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = "another-unit-test-secret";
      try {
        expect(
          (await verifyDeviceRegistrationNonce({ userId, deviceId, publicKeyDer, ...issued, nowMs: 2_000 })).ok,
        ).toBe(false);
      } finally {
        if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
      }
    });
  });
});

describe("native step-up challenge wiring", () => {
  test("the default begin function maps the server shape performStepUp consumes", () => {
    const client = read("src/lib/security/step-up-client.ts");
    for (const line of [
      "challenge_id: issued.challengeId,",
      "expires_at: issued.expiresAt,",
      "payload_hash: issued.payloadHash,",
    ]) {
      expect(client).toContain(line);
    }
    const server = read("src/lib/security/device-trust.functions.ts");
    expect(server).toContain("payloadHash: String(inserted.payload_hash),");
  });
});

describe("release build hardening and version", () => {
  const gradle = read("android/app/build.gradle");
  const rules = read("android/app/proguard-rules.pro");

  test("R8 is enabled for release with the optimize defaults, resources untouched", () => {
    expect(gradle).toContain("minifyEnabled true");
    expect(gradle).not.toContain("minifyEnabled false");
    expect(gradle).toContain("shrinkResources false");
    expect(gradle).toContain(
      "proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'",
    );
  });

  test("keep rules protect the reflective Capacitor bridge", () => {
    for (const rule of [
      "-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod",
      "-keep class ye.edu.usr.fitcs.portal.** { *; }",
      "-keep class com.getcapacitor.** { *; }",
      "-keep class org.apache.cordova.** { *; }",
      "-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }",
      "@com.getcapacitor.PluginMethod <methods>;",
    ]) {
      expect(rules).toContain(rule);
    }
  });

  test("version is 4 / 0.4.0 everywhere and the applicationId is unchanged", () => {
    expect(gradle).toContain("versionCode 4");
    expect(gradle).toContain('versionName "0.4.0"');
    expect(gradle).toContain('applicationId "ye.edu.usr.fitcs.portal"');
    const script = read("scripts/mobile/apply-android-identity.mjs");
    expect(script).toContain("VERSION_CODE = 4;");
    expect(script).toContain('VERSION_NAME = "0.4.0";');
    expect(script).toContain("versionCode   = 4");
    expect(script).toContain("versionName   = 0.4.0");
    const contract = read("docs/mobile/ANDROID-PLAY-IDENTITY-CONTRACT.md");
    expect(contract).toContain("| `versionCode` | `4` |");
    expect(contract).toContain("| `versionName` | `0.4.0` |");
    expect(contract).toContain("android.permission.USE_BIOMETRIC");
    expect(contract).toContain("android.permission.USE_FINGERPRINT");
  });
});
