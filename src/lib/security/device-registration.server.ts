/**
 * Server-only helpers for trusted-device registration proof of possession.
 *
 * Stateless by design (no table, no migration): the registration nonce is made
 * tamper-proof with an HMAC whose key is derived from a secret that only the
 * server runtime holds. Nothing here may be imported by client code — the
 * server functions load this module with a dynamic import inside their handler.
 */

import { base64ToBytes } from "./ecdsa-der";
import {
  DEVICE_REGISTRATION_NONCE_TTL_SECONDS,
  buildDeviceRegistrationMessage,
} from "./device-registration-contract";

/** Domain-separation label: the service-role key itself is never used as a MAC key. */
const MAC_KEY_LABEL = "usrp-device-register-nonce-mac-key-v1";
const HMAC = { name: "HMAC", hash: "SHA-256" } as const;

export type DeviceRegistrationNonce = {
  readonly nonce: string;
  /** Epoch milliseconds, decimal string. */
  readonly expiresAt: string;
  readonly mac: string;
};

export type DeviceRegistrationProofFailure =
  | "REGISTRATION_NONCE_INVALID"
  | "REGISTRATION_NONCE_EXPIRED"
  | "DEVICE_ID_MISMATCH";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function registrationMacKey(): Promise<CryptoKey> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("DEVICE_REGISTRATION_SECRET_UNAVAILABLE");
  const encoder = new TextEncoder();
  const root = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret) as unknown as ArrayBuffer,
    HMAC,
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign(
    "HMAC",
    root,
    encoder.encode(MAC_KEY_LABEL) as unknown as ArrayBuffer,
  );
  return crypto.subtle.importKey("raw", derived, HMAC, false, ["sign", "verify"]);
}

/** SHA-256 hex of the DER public key — the same rule the native plugin uses. */
export async function deriveDeviceIdFromPublicKey(publicKeyDer: string): Promise<string | null> {
  let der: Uint8Array;
  try {
    der = base64ToBytes(publicKeyDer);
  } catch {
    return null;
  }
  if (der.length === 0) return null;
  const digest = await crypto.subtle.digest("SHA-256", der as unknown as ArrayBuffer);
  return toHex(new Uint8Array(digest));
}

/** Issues a short-lived nonce bound to (user, device) by an HMAC. */
export async function issueDeviceRegistrationNonce(input: {
  userId: string;
  deviceId: string;
  nowMs?: number;
}): Promise<DeviceRegistrationNonce> {
  const nonce = toHex(crypto.getRandomValues(new Uint8Array(24)));
  const expiresAt = String(
    (input.nowMs ?? Date.now()) + DEVICE_REGISTRATION_NONCE_TTL_SECONDS * 1000,
  );
  const message = buildDeviceRegistrationMessage({
    nonce,
    userId: input.userId,
    deviceId: input.deviceId,
    expiresAt,
  });
  const mac = await crypto.subtle.sign(
    "HMAC",
    await registrationMacKey(),
    new TextEncoder().encode(message) as unknown as ArrayBuffer,
  );
  return { nonce, expiresAt, mac: toHex(new Uint8Array(mac)) };
}

/**
 * Verifies HMAC, expiry, user binding and the deviceId <-> public key binding.
 * On success returns the canonical message whose ECDSA signature the caller
 * must still verify against the supplied public key.
 */
export async function verifyDeviceRegistrationNonce(input: {
  userId: string;
  deviceId: string;
  publicKeyDer: string;
  nonce: string;
  expiresAt: string;
  mac: string;
  nowMs?: number;
}): Promise<
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly reason: DeviceRegistrationProofFailure }
> {
  const macBytes = hexToBytes(input.mac);
  if (!macBytes || !/^[0-9]{1,16}$/.test(input.expiresAt)) {
    return { ok: false, reason: "REGISTRATION_NONCE_INVALID" };
  }
  // The MAC covers nonce, the AUTHENTICATED user id, device id and expiry, so a
  // nonce issued to another user/device or with an altered expiry never verifies.
  const message = buildDeviceRegistrationMessage({
    nonce: input.nonce,
    userId: input.userId,
    deviceId: input.deviceId,
    expiresAt: input.expiresAt,
  });
  const macValid = await crypto.subtle.verify(
    "HMAC",
    await registrationMacKey(),
    macBytes as unknown as ArrayBuffer,
    new TextEncoder().encode(message) as unknown as ArrayBuffer,
  );
  if (!macValid) return { ok: false, reason: "REGISTRATION_NONCE_INVALID" };

  const now = input.nowMs ?? Date.now();
  const expiresAtMs = Number(input.expiresAt);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= now) {
    return { ok: false, reason: "REGISTRATION_NONCE_EXPIRED" };
  }
  if (expiresAtMs - now > DEVICE_REGISTRATION_NONCE_TTL_SECONDS * 1000) {
    return { ok: false, reason: "REGISTRATION_NONCE_INVALID" };
  }

  const derivedDeviceId = await deriveDeviceIdFromPublicKey(input.publicKeyDer);
  if (!derivedDeviceId || derivedDeviceId !== input.deviceId) {
    return { ok: false, reason: "DEVICE_ID_MISMATCH" };
  }
  return { ok: true, message };
}
