import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Guard: PORTAL_DEPLOY_TARGET must only be read via dot-notation
// (process.env.PORTAL_DEPLOY_TARGET). vite.config.ts define-injects the
// build-time value only for the literal dotted key; bracket notation
// (process.env["PORTAL_DEPLOY_TARGET"]) is not replaced, evaluates to
// undefined at runtime, and makes resolvePortalDeployTarget fall back to
// "staging" — which then rejects the production Supabase URL in production
// (STAGING_ISOLATION_REQUIRED). See src/integrations/supabase/auth-middleware.ts
// for the canonical form.

const SRC_ROOT = "src";

function listFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      acc.push(...listFiles(path, acc));
    } else if (/\.tsx?$/.test(path)) {
      acc.push(path);
    }
  }
  return acc;
}

const BRACKET_PATTERNS = [
  /process\.env\[\s*["']PORTAL_DEPLOY_TARGET["']\s*\]/,
  /process\.env\[\s*["']SUPABASE_URL["']\s*\]/,
  /process\.env\[\s*["']SUPABASE_PUBLISHABLE_KEY["']\s*\]/,
];

describe("source guard: no bracket-notation reads of deployment env keys", () => {
  const files = listFiles(SRC_ROOT);

  it("src/ contains TS/TSX sources to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("never reads PORTAL_DEPLOY_TARGET via process.env[...]", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (BRACKET_PATTERNS[0].test(line)) {
          offenders.push({ file, line: index + 1, text: line.trim() });
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
