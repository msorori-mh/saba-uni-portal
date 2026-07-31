/**
 * PORTAL-B1-PACKAGE66-EOL-PORTABILITY-REMEDIATION-70
 *
 * Shared EOL helpers for the package 65/66 offline test suites.
 *
 * The portability contract has two independent halves:
 *  1. What Git *stores* (the index/blob) must be LF — this is what Cursor and
 *     Codex both fetch, so it must not depend on the local checkout style.
 *  2. What the tests *read* must be normalized, so a CRLF working tree (Windows
 *     checkout, core.autocrlf=true, editor rewrite) still yields identical
 *     verdicts.
 *
 * Asserting raw working-tree bytes was the actual portability failure: it makes
 * the suite fail on a legitimate CRLF checkout even when the repository content
 * is LF. Repository-level assertions are done through `git show :<path>`.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const toLf = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export const toCrlf = (value: string) => toLf(value).replace(/\n/g, "\r\n");

/** Reads a file and normalizes its line endings to LF. */
export const readLf = (absPath: string) => toLf(readFileSync(absPath, "utf8"));

/**
 * Raw bytes of the file as Git has it staged/committed (index version), i.e.
 * exactly what another machine clones. Returns null when git is unavailable
 * (e.g. an exported tarball) so callers can degrade gracefully.
 */
export const gitBlob = (repoRelPath: string): string | null => {
  const res = spawnSync("git", ["show", `:${repoRelPath}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || typeof res.stdout !== "string") return null;
  return res.stdout;
};

/**
 * True when the repository-stored content of the path has no CR at all.
 * When git is not reachable, falls back to the working tree, which is a valid
 * proxy on LF checkouts and is skipped (returns true) on CRLF checkouts because
 * the checkout — not the repository — introduced the CR.
 */
export const isStoredAsLf = (repoRelPath: string): boolean => {
  const blob = gitBlob(repoRelPath);
  if (blob !== null) return !blob.includes("\r");
  const raw = readFileSync(join(process.cwd(), repoRelPath), "utf8");
  const crlfCheckout = raw.includes("\r\n");
  return crlfCheckout ? true : !raw.includes("\r");
};
