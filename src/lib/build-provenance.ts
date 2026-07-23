// Build provenance - single source of truth for the deployed-commit SHA.
//
// The SHA is injected at BUILD TIME by vite.config.ts via
// `define: { "import.meta.env.VITE_BUILD_SHA": ... }` (same pattern as the
// existing VITE_SUPABASE_* defines). At runtime this module only validates
// and exposes the injected value. It NEVER reads the process environment,
// NEVER guesses, and NEVER throws: any missing or malformed value degrades
// to the "unknown" sentinel, which downstream verification tracks must treat
// as UNVERIFIABLE (not as a mismatch).
//
// Security boundary: the injected define value is public in the client
// bundle by design. The exposed shape is frozen to exactly { sha } - a git
// commit SHA is not a credential. Do not add fields here without an
// explicit security review (no env vars, no keys, no build host data).

export const BUILD_SHA_SENTINEL = "unknown";

// A git commit SHA (full or short) is 7-40 lowercase hex characters.
// Anything else - empty, placeholders, whitespace-padded junk, HTML/JS
// payloads - is rejected and replaced by the sentinel.
const BUILD_SHA_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * Validate an arbitrary candidate value. Returns the normalized SHA or the
 * "unknown" sentinel. Pure and total: accepts unknown input, never throws.
 */
export function normalizeBuildSha(candidate: unknown): string {
  if (typeof candidate !== "string") return BUILD_SHA_SENTINEL;
  const normalized = candidate.trim().toLowerCase();
  return BUILD_SHA_PATTERN.test(normalized) ? normalized : BUILD_SHA_SENTINEL;
}

// The exact expression `import.meta.env.VITE_BUILD_SHA` is statically
// replaced by the vite define at build time. When no define happened
// (e.g. unit tests, or a build without any SHA source), the value is
// undefined and normalizes to the sentinel.
export const BUILD_SHA: string = normalizeBuildSha(
  import.meta.env.VITE_BUILD_SHA,
);

/**
 * Frozen public shape of the provenance payload. ONLY `sha` is allowed.
 */
export interface BuildProvenance {
  sha: string;
}

/** The provenance payload. Deterministic for a given build. */
export function getBuildProvenance(): BuildProvenance {
  return { sha: BUILD_SHA };
}

/** Canonical JSON serialization (single key, fixed order). */
export function serializeBuildProvenance(): string {
  return JSON.stringify(getBuildProvenance());
}
