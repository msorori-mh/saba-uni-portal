// Server-only temporary password generation for account provisioning/reset.
import { randomInt } from "node:crypto";

const TEMP_PASSWORD_CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";

/** Cryptographically random temporary password (default 12 chars, Supabase max 72). */
export function generateTemporaryPassword(length = 12): string {
  const size = Math.min(Math.max(length, 8), 72);
  let password = "";
  for (let i = 0; i < size; i++) {
    password += TEMP_PASSWORD_CHARS[randomInt(TEMP_PASSWORD_CHARS.length)];
  }
  return password;
}
