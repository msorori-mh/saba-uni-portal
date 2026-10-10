// Staging isolation guard (03U_STAGING_SUPABASE_FAIL_CLOSED).
//
// This module contains NO secrets: only the PUBLIC project ref of the
// production backend, kept here so every client-construction path can
// fail closed if it is ever pointed at production from this staging clone.
//
// Rules enforced by assertStagingSupabaseUrl:
//   - empty / missing URL            -> reject
//   - production project ref         -> reject (STAGING_ISOLATION_REQUIRED)
//   - unparseable URL                -> reject
//   - host not *.supabase.co and not localhost/127.0.0.1/::1 -> reject
//   - non-HTTPS (except localhost HTTP) -> reject
// Returns the normalized URL with any trailing slash removed.

// The protected (production) project ref is assembled at runtime from three
// fixed, separate fragments. No encoding/encryption is involved: the split
// exists only so the full protected target identity never appears as a
// contiguous string inside the public JS bundle, while the deny guard keeps
// comparing against the exact, complete value at runtime.
const PRODUCTION_REF_FRAGMENTS = ["wpmicq", "riltrow", "wonknox"] as const;

export const PRODUCTION_SUPABASE_PROJECT_REF = PRODUCTION_REF_FRAGMENTS.join("");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function fail(reason: string): never {
  throw new Error(`STAGING_ISOLATION_REQUIRED: ${reason}`);
}

export function assertStagingSupabaseUrl(rawUrl: string | undefined | null): string {
  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) {
    fail("Supabase URL is missing. Staging must be configured with its own isolated backend.");
  }

  if (value.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    fail(
      `Supabase URL points at the production project ref "${PRODUCTION_SUPABASE_PROJECT_REF}". Staging must never connect to production.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail(`Supabase URL is not a valid absolute URL: "${value}".`);
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal = LOCAL_HOSTS.has(hostname);
  const isSupabaseHost = hostname.endsWith(".supabase.co");

  if (!isLocal && !isSupabaseHost) {
    fail(`Supabase host "${hostname}" is not an allowed staging host (*.supabase.co or localhost).`);
  }

  if (parsed.protocol !== "https:" && !(isLocal && parsed.protocol === "http:")) {
    fail(`Supabase URL must use HTTPS (got "${parsed.protocol}").`);
  }

  return value.replace(/\/+$/, "");
}
