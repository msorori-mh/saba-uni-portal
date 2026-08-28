import {
  stagingFallbackSupabasePublishableKey,
  stagingFallbackSupabaseUrl,
} from "./staging-config";
import { PRODUCTION_SUPABASE_PROJECT_REF, assertStagingSupabaseUrl } from "./staging-isolation";

export type PortalDeployTarget = "staging" | "production";

export const PRODUCTION_SUPABASE_URL =
  `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` as const;

const PRODUCTION_HOSTS = new Set(["quboolye.com", "www.quboolye.com"]);

function fail(reason: string): never {
  throw new Error(`PORTAL_DEPLOYMENT_PROFILE_REQUIRED: ${reason}`);
}

export function resolvePortalDeployTarget(
  ...candidates: Array<string | undefined | null>
): PortalDeployTarget {
  const configured = candidates.find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim() !== "",
  );
  const normalized = configured?.trim().toLowerCase() ?? "staging";

  if (normalized !== "staging" && normalized !== "production") {
    return fail(`Unsupported deployment target "${normalized}".`);
  }

  return normalized;
}

export function assertPortalRuntimeHost(target: PortalDeployTarget): void {
  if (typeof window === "undefined") return;

  const hostname = window.location?.hostname?.toLowerCase() ?? "";
  if (!hostname) {
    fail("Browser hostname is unavailable.");
  }

  if (target === "production" && !PRODUCTION_HOSTS.has(hostname)) {
    fail(`Production configuration cannot run on host "${hostname}".`);
  }

  if (target === "staging" && PRODUCTION_HOSTS.has(hostname)) {
    fail(`Staging configuration cannot run on production host "${hostname}".`);
  }
}

export function assertPortalSupabaseUrl(
  target: PortalDeployTarget,
  rawUrl: string | undefined | null,
): string {
  if (target === "staging") {
    return assertStagingSupabaseUrl(rawUrl);
  }

  const value = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!value) {
    return fail("Production requires an explicit Supabase URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return fail(`Production Supabase URL is not a valid absolute URL: "${value}".`);
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.port !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.hostname.toLowerCase() !== `${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`
  ) {
    return fail(
      `Production must use exactly "${PRODUCTION_SUPABASE_URL}" with no credentials, port, path, query, or fragment.`,
    );
  }

  return PRODUCTION_SUPABASE_URL;
}

export function assertPortalSupabasePublishableKey(
  target: PortalDeployTarget,
  rawKey: string | undefined | null,
): string {
  const value = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!value) {
    return fail(`${target} requires an explicit public Supabase publishable key.`);
  }

  if (!/^sb_publishable_.{9,}$/.test(value)) {
    return fail(`${target} requires a public sb_publishable_ key.`);
  }

  return value;
}

export function portalFallbackSupabaseUrl(target: PortalDeployTarget): string {
  if (target === "production") {
    return fail("Production has no fallback Supabase URL; configure it explicitly.");
  }
  return stagingFallbackSupabaseUrl();
}

export function portalFallbackSupabasePublishableKey(target: PortalDeployTarget): string {
  if (target === "production") {
    return fail("Production has no fallback Supabase key; configure it explicitly.");
  }
  return stagingFallbackSupabasePublishableKey();
}
