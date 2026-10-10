/**
 * Trusted-device registration proof-of-possession contract.
 *
 * Pure, platform-free module (no Capacitor, no Supabase, no DOM, no secrets).
 * It defines the exact string the device key signs during enrolment so that
 * the server can verify the registering client really holds the private key
 * for the public key it submits.
 *
 * The version prefix is part of the native signing allow-list in
 * android/.../BiometricKeystorePlugin.java (MSG_DEVICE_REGISTER_PREFIX) and the
 * field count must stay in sync with DEVICE_REGISTER_FIELD_COUNT there.
 */

export const DEVICE_REGISTRATION_SIGNING_VERSION = "usrp-device-register-v1";
/** Lifetime of a server-issued registration nonce. */
export const DEVICE_REGISTRATION_NONCE_TTL_SECONDS = 120;

export type DeviceRegistrationSigningInput = {
  readonly nonce: string;
  readonly userId: string;
  readonly deviceId: string;
  /** Epoch milliseconds, decimal string. */
  readonly expiresAt: string;
};

/** version|nonce|userId|deviceId|expiresAt — printable ASCII, no empty field. */
export function buildDeviceRegistrationMessage(input: DeviceRegistrationSigningInput): string {
  return [
    DEVICE_REGISTRATION_SIGNING_VERSION,
    input.nonce,
    input.userId,
    input.deviceId,
    input.expiresAt,
  ].join("|");
}
