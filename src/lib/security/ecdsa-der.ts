/**
 * DER (X9.62) ECDSA signature -> raw r||s conversion.
 *
 * Android Keystore's "SHA256withECDSA" emits DER-encoded signatures, while
 * WebCrypto's ECDSA verify expects the fixed-length raw concatenation of r and
 * s (32 bytes each for P-256). This module is pure and unit-tested.
 */

export const P256_COORD_BYTES = 32;

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary =
    typeof atob === "function"
      ? atob(normalized)
      : Buffer.from(normalized, "base64").toString("binary");
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function readInteger(
  der: Uint8Array,
  offset: number,
): { value: Uint8Array; next: number } | null {
  if (der[offset] !== 0x02) return null;
  const length = der[offset + 1];
  if (length === undefined || length > 0x7f) return null; // long form not used by P-256
  const start = offset + 2;
  const end = start + length;
  if (end > der.length) return null;
  return { value: der.subarray(start, end), next: end };
}

function leftPad(bytes: Uint8Array, size: number): Uint8Array | null {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0x00) start += 1;
  const trimmed = bytes.subarray(start);
  if (trimmed.length > size) return null;
  const out = new Uint8Array(size);
  out.set(trimmed, size - trimmed.length);
  return out;
}

/** Returns null when the input is not a well-formed P-256 DER signature. */
export function derToRawEcdsaSignature(
  der: Uint8Array,
  coordBytes: number = P256_COORD_BYTES,
): Uint8Array | null {
  if (der.length < 8 || der[0] !== 0x30) return null;
  const seqLength = der[1];
  if (seqLength === undefined || seqLength > 0x7f) return null;
  if (seqLength + 2 !== der.length) return null;

  const r = readInteger(der, 2);
  if (!r) return null;
  const s = readInteger(der, r.next);
  if (!s || s.next !== der.length) return null;

  const rPadded = leftPad(r.value, coordBytes);
  const sPadded = leftPad(s.value, coordBytes);
  if (!rPadded || !sPadded) return null;

  const out = new Uint8Array(coordBytes * 2);
  out.set(rPadded, 0);
  out.set(sPadded, coordBytes);
  return out;
}
