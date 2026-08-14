/**
 * Trusted-device enrolment / revocation (client side).
 *
 * Enrolment requires BOTH:
 *  1. fresh account re-authentication (password) performed SERVER-SIDE, so a
 *     hijacked open session cannot silently enrol a new trusted device, and
 *  2. a successful biometric-bound Keystore signing operation on the device,
 *     proving the private key is accessible and under the user's biometric
 *     control.
 *
 * Only the public key leaves the device.
 */

import { clearDeviceKey, ensureDeviceKey, signStepUpChallenge } from "@/lib/native/biometrics";
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
}) => Promise<{ registered: true; deviceId: string }>;

export async function registerTrustedDevice(
  client: StepUpRpcClient,
  input: {
    password: string;
    reauthenticate: ReauthenticateFn;
    platform?: string;
    register: RegisterTrustedDeviceFn;
  },
): Promise<DeviceTrustResult> {
  // 1. Fresh re-authentication is verified server-side by the provided register
  //    function; the local callback is only used to gate UX early.
  const fresh = await input.reauthenticate(input.password);
  if (!fresh) {
    return { status: "reauth_required", messageAr: DEVICE_TRUST_MESSAGES_AR.reauthFailed };
  }

  // 2. Create or retrieve the biometric-bound key and prove it works by
  //    signing a fixed enrolment message. This forces a biometric prompt during
  //    enrolment and proves the key is accessible.
  let key;
  let signature;
  try {
    key = await ensureDeviceKey();
    signature = await signStepUpChallenge(
      `usrp-device-enroll-v1|${key.deviceId}`,
      "تأكيد ربط الجهاز",
    );
  } catch {
    return { status: "unavailable", messageAr: DEVICE_TRUST_MESSAGES_AR.unavailable };
  }

  // 3. Server-side registration after the password has been re-verified. The
  //    signature is not sent to the server; it only proves to the local
  //    Keystore that the user is biometrically present.
  try {
    const result = await input.register({
      password: input.password,
      deviceId: key.deviceId,
      publicKey: key.publicKeyDer,
      algorithm: key.algorithm,
      platform: input.platform ?? "android",
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
