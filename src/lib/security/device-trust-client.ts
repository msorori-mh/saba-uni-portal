/**
 * Trusted-device enrolment / revocation (client side).
 *
 * Enrolment requires BOTH:
 *  1. fresh account re-authentication (password), so a hijacked open session
 *     cannot silently enrol a new trusted device, and
 *  2. a successful biometric-bound Keystore key creation on the device.
 *
 * Only the public key leaves the device.
 */

import { clearDeviceKey, ensureDeviceKey } from "@/lib/native/biometrics";
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

export async function registerTrustedDevice(
  client: StepUpRpcClient,
  input: { password: string; reauthenticate: ReauthenticateFn; platform?: string },
): Promise<DeviceTrustResult> {
  const fresh = await input.reauthenticate(input.password);
  if (!fresh) {
    return { status: "reauth_required", messageAr: DEVICE_TRUST_MESSAGES_AR.reauthFailed };
  }

  let key;
  try {
    key = await ensureDeviceKey();
  } catch {
    return { status: "unavailable", messageAr: DEVICE_TRUST_MESSAGES_AR.unavailable };
  }

  const { error } = await client.rpc("register_student_device", {
    p_device_id: key.deviceId,
    p_public_key: key.publicKeyDer,
    p_algorithm: key.algorithm,
    p_platform: input.platform ?? "android",
  });
  if (error) return { status: "failed", messageAr: DEVICE_TRUST_MESSAGES_AR.failed };
  return { status: "registered", deviceId: key.deviceId };
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
