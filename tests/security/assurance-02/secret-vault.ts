/**
 * TEST_ONLY_ASSURANCE_02 — private secret vault.
 *
 * Passwords are generated per account, written to a git-ignored 0600 file
 * inside a 0700 private directory using exclusive creation, and flushed to
 * disk BEFORE any account is created. Secret values never enter reports,
 * logs, manifests or error messages — `redactError` is the single funnel used
 * by the provisioning core for diagnostics.
 */

import { randomBytes } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, statSync, writeSync } from "node:fs";
import { dirname } from "node:path";

export const PRIVATE_DIR = "tests/security/assurance-02/.private";
// Future runs write the IDs-only manifest inside the ignored 0700 private
// directory. The historical repo-tracked manifest from the first apply is left
// untouched on purpose (no history rewrite, no deletion).
export const PUBLIC_MANIFEST_FILE = "tests/security/assurance-02/.private/manifest.public.json";

/** Per-run file names keep prior runs intact (never overwritten). */
export function runStamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}
export function secretsFileFor(stamp: string): string {
  return `${PRIVATE_DIR}/credentials.${stamp}.local.json`;
}
export function checkpointsFileFor(stamp: string): string {
  return `${PRIVATE_DIR}/checkpoints.${stamp}.local.jsonl`;
}

const PASSWORD_BYTES = 24;

/** Cryptographically random, per-account, never derived from a shared value. */
export function generatePassword(): string {
  return `A02!${randomBytes(PASSWORD_BYTES).toString("base64url")}`;
}

export class VaultError extends Error {
  constructor(message: string) {
    super(`ASSURANCE_02_VAULT: ${message}`);
    this.name = "VaultError";
  }
}

export interface WriteExclusivePort {
  mkdirSync: typeof mkdirSync;
  openSync: typeof openSync;
  writeSync: typeof writeSync;
  fsyncSync: typeof fsyncSync;
  closeSync: typeof closeSync;
}

const realFs: WriteExclusivePort = { mkdirSync, openSync, writeSync, fsyncSync, closeSync };

/**
 * Exclusive (`wx`) 0600 write inside a 0700 directory, fsynced. Fails closed if
 * the file exists — a previous run's credentials are never overwritten.
 */
export function persistSecrets(
  path: string,
  secrets: Record<string, string>,
  fs: WriteExclusivePort = realFs,
): void {
  fs.mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let fd: number;
  try {
    fd = fs.openSync(path, "wx", 0o600);
  } catch (error) {
    throw new VaultError(
      `refusing to overwrite or cannot create secret file (${(error as NodeJS.ErrnoException).code ?? "error"})`,
    );
  }
  try {
    fs.writeSync(fd, JSON.stringify(secrets, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function assertMode0600(path: string): void {
  const mode = statSync(path).mode & 0o777;
  if (mode !== 0o600) throw new VaultError(`secret file mode is ${mode.toString(8)}, expected 600`);
}

/** Throws if any secret value appears in the given text. */
export function assertNoSecrets(text: string, secrets: Iterable<string>): void {
  for (const secret of secrets) {
    if (secret && text.includes(secret)) {
      throw new VaultError("report attempted to include a generated secret");
    }
  }
}

/** Bearer tokens, service keys and JWTs that must never reach a report. */
const TOKEN_PATTERNS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
  /sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g,
  /bearer\s+[A-Za-z0-9._-]+/gi,
];

/**
 * Single diagnostic funnel: strips any generated password, JWT, Supabase key or
 * bearer token from an error before it can enter a checkpoint or report.
 */
export function redactError(error: unknown, secrets: Iterable<string>): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) {
    if (secret) message = message.split(secret).join("[REDACTED_SECRET]");
  }
  for (const pattern of TOKEN_PATTERNS) message = message.replace(pattern, "[REDACTED_TOKEN]");
  assertNoSecrets(message, secrets);
  return message;
}
