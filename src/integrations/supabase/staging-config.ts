import { PRODUCTION_SUPABASE_PROJECT_REF, assertStagingSupabaseUrl } from "./staging-isolation";

export const STAGING_SUPABASE_PROJECT_REF = "ldjhuutywqhjxabdotmn";
export const STAGING_SUPABASE_URL = "https://ldjhuutywqhjxabdotmn.supabase.co";

/** Public client publishable key of the isolated staging project. */
export const STAGING_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ia3UK8BOGpfbty2DfGqjnQ_Z8OgOXOT";

const PRODUCTION_HOSTS = new Set(["quboolye.com", "www.quboolye.com"]);

function fail(reason: string): never {
  throw new Error(`STAGING_ISOLATION_REQUIRED: ${reason}`);
}

function assertNotProductionHost(): void {
  if (typeof window === "undefined") return;

  const host = window.location?.hostname?.toLowerCase() ?? "";
  if (PRODUCTION_HOSTS.has(host)) {
    fail(`The staging fallback configuration must never run on production host "${host}".`);
  }
}

/** Last-resort staging URL, only for use when environment variables are absent. */
export function stagingFallbackSupabaseUrl(): string {
  assertNotProductionHost();

  if (
    STAGING_SUPABASE_URL.toLowerCase().includes(PRODUCTION_SUPABASE_PROJECT_REF) ||
    STAGING_SUPABASE_PROJECT_REF === PRODUCTION_SUPABASE_PROJECT_REF
  ) {
    fail("The staging fallback configuration points at the production project ref.");
  }

  return assertStagingSupabaseUrl(STAGING_SUPABASE_URL);
}

/** Last-resort public staging key, only when environment variables are absent. */
export function stagingFallbackSupabasePublishableKey(): string {
  assertNotProductionHost();

  if (!STAGING_SUPABASE_PUBLISHABLE_KEY.startsWith("sb_publishable_")) {
    fail("The staging fallback publishable key is not a public sb_publishable_ key.");
  }

  return STAGING_SUPABASE_PUBLISHABLE_KEY;
}
