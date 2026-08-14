/**
 * Native biometric + Android Keystore bridge.
 *
 * This is the ONLY module allowed to talk to the native biometric/Keystore
 * plugin. Everything above it works with the pure result types below.
 *
 * Security model (see docs/reviews/PORTAL-MOBILE-BIOMETRIC-STEP-UP-01.md):
 *  - The private key is generated INSIDE the Android Keystore, is
 *    `setUserAuthenticationRequired(true)` and
 *    `setInvalidatedByBiometricEnrollment(true)`, and never leaves the device.
 *  - Only the public key is sent to the server.
 *  - No biometric image/template/score is ever read, stored or transmitted.
 *  - A `KEY_INVALIDATED` signing failure (device biometrics changed) is the
 *    authoritative trust-revocation signal — not a plugin boolean.
 */

import { isNativePlatform } from "./platform";

export const BIOMETRIC_PLUGIN_NAME = "PortalBiometricKeystore";
export const BIOMETRIC_KEY_ALIAS = "ye.edu.usr.fitcs.portal.stepup.v1";

export type BiometricErrorCode =
  | "NOT_AVAILABLE"
  | "NOT_ENROLLED"
  | "USER_CANCELED"
  | "KEY_INVALIDATED"
  | "AUTH_FAILED"
  | "PLUGIN_ERROR";

export class BiometricError extends Error {
  constructor(
    readonly code: BiometricErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "BiometricError";
  }
}

export type BiometricAvailability = {
  readonly available: boolean;
  /** "fingerprint" | "face" | "iris" | "unknown" | "none" — label only. */
  readonly kind: string;
  readonly enrolled: boolean;
};

export type DeviceKeyInfo = {
  readonly deviceId: string;
  /** Base64 SubjectPublicKeyInfo (DER) of the Keystore public key. */
  readonly publicKeyDer: string;
  readonly algorithm: string;
};

export type SignedAssertion = {
  readonly signature: string;
  readonly algorithm: string;
};

type BiometricPlugin = {
  isAvailable(): Promise<BiometricAvailability>;
  /** Creates (or returns) the biometric-bound Keystore key pair. */
  ensureDeviceKey(options: { alias: string }): Promise<DeviceKeyInfo>;
  /** Biometric prompt + sign in a single native call; no JS-visible unlock flag. */
  signChallenge(options: {
    alias: string;
    message: string;
    reason: string;
  }): Promise<SignedAssertion>;
  /** Biometric prompt only — used for app unlock. */
  authenticate(options: { alias: string; reason: string }): Promise<{ verified: boolean }>;
  /** Deletes the Keystore key material for this app. */
  clearDeviceKey(options: { alias: string }): Promise<void>;
  /** FLAG_SECURE toggle used to hide content from Recent Apps. */
  setSecureScreen(options: { enabled: boolean }): Promise<void>;
};

function plugin(): BiometricPlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } })
    .Capacitor;
  const found = cap?.Plugins?.[BIOMETRIC_PLUGIN_NAME];
  return (found as BiometricPlugin | undefined) ?? null;
}

function normalizeError(error: unknown): BiometricError {
  if (error instanceof BiometricError) return error;
  const raw =
    typeof error === "object" && error !== null
      ? String(
          (error as { code?: unknown; message?: unknown }).code ??
            (error as { message?: unknown }).message ??
            "",
        )
      : String(error ?? "");
  const upper = raw.toUpperCase();
  if (upper.includes("CANCEL")) return new BiometricError("USER_CANCELED");
  if (upper.includes("INVALIDATED") || upper.includes("KEY_PERMANENTLY"))
    return new BiometricError("KEY_INVALIDATED");
  if (upper.includes("NOT_ENROLLED") || upper.includes("NONE_ENROLLED"))
    return new BiometricError("NOT_ENROLLED");
  if (upper.includes("NOT_AVAILABLE") || upper.includes("NO_HARDWARE"))
    return new BiometricError("NOT_AVAILABLE");
  if (upper.includes("AUTH")) return new BiometricError("AUTH_FAILED");
  return new BiometricError("PLUGIN_ERROR", raw || undefined);
}

/** True only when running natively AND the Keystore plugin is installed. */
export function isBiometricRuntimeAvailable(): boolean {
  return isNativePlatform() && plugin() !== null;
}

export async function getBiometricAvailability(): Promise<BiometricAvailability> {
  const impl = plugin();
  if (!isNativePlatform() || !impl) return { available: false, kind: "none", enrolled: false };
  try {
    return await impl.isAvailable();
  } catch {
    return { available: false, kind: "none", enrolled: false };
  }
}

export async function ensureDeviceKey(): Promise<DeviceKeyInfo> {
  const impl = plugin();
  if (!impl) throw new BiometricError("NOT_AVAILABLE");
  try {
    return await impl.ensureDeviceKey({ alias: BIOMETRIC_KEY_ALIAS });
  } catch (error) {
    throw normalizeError(error);
  }
}

/**
 * Biometric prompt + Keystore signature in one native round-trip.
 * There is deliberately no "biometricPassed" boolean crossing this boundary.
 */
export async function signStepUpChallenge(
  message: string,
  reasonAr: string,
): Promise<SignedAssertion> {
  const impl = plugin();
  if (!impl) throw new BiometricError("NOT_AVAILABLE");
  try {
    return await impl.signChallenge({
      alias: BIOMETRIC_KEY_ALIAS,
      message,
      reason: reasonAr,
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

/** App-unlock prompt bound to a Keystore signing operation. Returns false on
 *  cancel/failure; throws on invalidation. The signature itself is not used
 *  as a pass/fail boolean — a successful signing operation proves the key is
 *  accessible, which (with setUserAuthenticationRequired(true)) requires a fresh
 *  biometric authorization. */
export async function authenticateForAppUnlock(reasonAr: string): Promise<boolean> {
  const impl = plugin();
  if (!impl) throw new BiometricError("NOT_AVAILABLE");
  try {
    // Use a fixed canonical message so the unlock operation is not confused
    // with a step-up signing for a real request.
    await impl.signChallenge({
      alias: BIOMETRIC_KEY_ALIAS,
      message: "usrp-app-unlock-v1",
      reason: reasonAr,
    });
    return true;
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized.code === "KEY_INVALIDATED") throw normalized;
    if (normalized.code === "USER_CANCELED" || normalized.code === "AUTH_FAILED") return false;
    throw normalized;
  }
}

export async function clearDeviceKey(): Promise<void> {
  const impl = plugin();
  if (!impl) return;
  try {
    await impl.clearDeviceKey({ alias: BIOMETRIC_KEY_ALIAS });
  } catch {
    /* best effort — server-side revocation is authoritative */
  }
}

/**
 * Hide app content from Recent Apps / screenshots.
 * Enabled only while backgrounded or locked (per approved plan), never always-on.
 */
export async function setSecureScreen(enabled: boolean): Promise<void> {
  const impl = plugin();
  if (!impl) return;
  try {
    await impl.setSecureScreen({ enabled });
  } catch {
    /* best effort */
  }
}
