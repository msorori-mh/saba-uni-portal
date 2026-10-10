/**
 * Trusted-device enrolment / revocation (client side).
 *
 * Enrolment requires BOTH:
 *  1. fresh account re-authentication (password) performed SERVER-SIDE, so a
 *     hijacked open session cannot silently enrol a new trusted device, and
 *  2. a successful biometric-bound Keystore signing operation on the device
 *     over a server-issued registration nonce. The signature is sent to the
 *     server, which verifies it against the submitted public key (proof of
 *     possession) before storing the trusted-device row.
 *
 * Only the public key and that signature leave the device.
 */

import { clearDeviceKey, ensureDeviceKey, signStepUpChallenge } from "@/lib/native/biometrics";
import { buildDeviceRegistrationMessage } from "./device-registration-contract";
import type { StepUpRpcClient } from "./step-up-client";

export type DeviceTrustResult =
  | { readonly status: "registered"; readonly deviceId: string }
  | { readonly status: "reauth_required"; readonly messageAr: string }
  | { readonly status: "unavailable"; readonly messageAr: string }
  | { readonly status: "failed"; readonly messageAr: string };

export const DEVICE_TRUST_MESSAGES_AR = {
  reauthFailed: "كلمة المرور غير صحيحة. لم يتم تفعيل قفل التطبيق.",
  unavailable: "التحقق الحيوي غير متاح على هذا الجهاز أو غير مُفعّل في إعدادات النظام.",
  failed: "تعذّر تفعيل قفل التطبيق. حاول مرة أخرى.",
} as const;

export type ReauthenticateFn = (password: string) => Promise<boolean>;

export type RegisterTrustedDeviceFn = (input: {
  password: string;
  deviceId: string;
  publicKey: string;
  algorithm: string;
  platform: string;
  nonce: string;
  expiresAt: string;
  mac: string;
  signature: string;
}) => Promise<{ registered: true; deviceId: string }>;

/** Server-issued, HMAC-protected registration nonce for this user + device. */
export type BeginDeviceRegistrationFn = (input: { deviceId: string }) => Promise<{
  nonce: string;
  expiresAt: string;
  mac: string;
  userId: string;
}>;

export async function registerTrustedDevice(
  client: StepUpRpcClient,
  input: {
    password: string;
    reauthenticate: ReauthenticateFn;
    platform?: string;
    beginRegistration: BeginDeviceRegistrationFn;
    register: RegisterTrustedDeviceFn;
  },
): Promise<DeviceTrustResult> {
  // 1. Fresh re-authentication is verified server-side by the provided register
  //    function; the local callback is only used to gate UX early.
  const fresh = await input.reauthenticate(input.password);
  if (!fresh) {
    return { status: "reauth_required", messageAr: DEVICE_TRUST_MESSAGES_AR.reauthFailed };
  }

  // 2. Create or retrieve the biometric-bound key.
  let key;
  try {
    key = await ensureDeviceKey();
  } catch {
    return { status: "unavailable", messageAr: DEVICE_TRUST_MESSAGES_AR.unavailable };
  }

  // 3. Obtain a short-lived server nonce bound to this user and device.
  let challenge;
  try {
    challenge = await input.beginRegistration({ deviceId: key.deviceId });
  } catch {
    return { status: "failed", messageAr: DEVICE_TRUST_MESSAGES_AR.failed };
  }

  // 4. Sign the canonical registration message. This forces a biometric prompt
  //    and yields the proof of possession the server verifies. The prompt
  //    wording is chosen natively from the message type on current builds; the
  //    label below is only displayed by the legacy 0.3.0 shell.
  let signature;
  try {
    signature = await signStepUpChallenge(
      buildDeviceRegistrationMessage({
        nonce: challenge.nonce,
        userId: challenge.userId,
        deviceId: key.deviceId,
        expiresAt: challenge.expiresAt,
      }),
      "تأكيد ربط الجهاز",
    );
  } catch {
    return { status: "unavailable", messageAr: DEVICE_TRUST_MESSAGES_AR.unavailable };
  }

  // 5. Server-side registration: password re-verified, nonce HMAC/expiry/user
  //    binding checked, and the signature verified against the public key.
  try {
    const result = await input.register({
      password: input.password,
      deviceId: key.deviceId,
      publicKey: key.publicKeyDer,
      algorithm: key.algorithm,
      platform: input.platform ?? "android",
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
      mac: challenge.mac,
      signature: signature.signature,
    });
    return { status: "registered", deviceId: result.deviceId };
  } catch {
    return { status: "failed", messageAr: DEVICE_TRUST_MESSAGES_AR.failed };
  }
}

/** Revokes this device server-side and destroys the local Keystore key. */
export async function revokeThisDevice(
  client: StepUpRpcClient,
  deviceId: string | null,
): Promise<void> {
  if (deviceId) {
    await client.rpc("revoke_student_device", { p_device_id: deviceId });
  }
  await clearDeviceKey();
}

export async function revokeAllDevices(client: StepUpRpcClient): Promise<void> {
  await client.rpc("revoke_all_student_devices", {});
  await clearDeviceKey();
}
