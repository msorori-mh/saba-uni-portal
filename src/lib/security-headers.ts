/**
 * Clickjacking / injection hardening for HTML documents.
 *
 * Only directives that cannot break the app are set here: the page may be
 * framed by its own origin only, <base> and form targets are pinned to the
 * origin, and plugins are disabled. A full script/style CSP needs nonces and a
 * report-only rollout, so it is intentionally not introduced blindly.
 * Editor preview hosts are skipped because the Lovable editor frames the app.
 *
 * Resource policy (scripts, connections, images, fonts, frames, workers) is
 * sent as `Content-Security-Policy-Report-Only`: nothing is blocked yet, the
 * browser only logs violations to its console. It exists because the Android
 * WebView exposes a native biometric bridge to whatever script runs in the
 * page, so the allowed script/connect origins must be pinned before the policy
 * can be enforced. No report endpoint is configured on purpose.
 */
import {
  PRODUCTION_SUPABASE_URL,
  resolvePortalDeployTarget,
} from "@/integrations/supabase/deployment-profile";
import { STAGING_SUPABASE_URL } from "@/integrations/supabase/staging-config";

const PREVIEW_HOST = /(^|\.)lovable\.app$|(^|\.)lovableproject\.com$|^localhost$|^127\.0\.0\.1$/i;
const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const DOCUMENT_CSP = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";

const SUPABASE_HOST = /^[a-z0-9-]+\.supabase\.co$/;

function parseSupabaseOrigin(raw: string | undefined | null): string | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    if (!SUPABASE_HOST.test(host)) return null;
    return `https://${host}`;
  } catch {
    return null;
  }
}

/**
 * Origin of the Supabase project this deployment talks to (same resolution
 * order as the browser client: build-time value, runtime value, then the
 * deploy-target default). Null when it cannot be determined safely.
 */
export function resolveSupabaseOrigin(): string | null {
  const runtimeEnv = typeof process !== "undefined" ? process.env : undefined;
  const configured =
    parseSupabaseOrigin(import.meta.env.VITE_SUPABASE_URL) ??
    parseSupabaseOrigin(runtimeEnv?.SUPABASE_URL);
  if (configured) return configured;
  try {
    const target = resolvePortalDeployTarget(
      import.meta.env.VITE_PORTAL_DEPLOY_TARGET,
      runtimeEnv?.PORTAL_DEPLOY_TARGET,
    );
    return parseSupabaseOrigin(target === "production" ? PRODUCTION_SUPABASE_URL : STAGING_SUPABASE_URL);
  } catch {
    return null;
  }
}

/**
 * Report-only resource policy reflecting what the app really loads:
 *  - scripts: own bundles only. 'unsafe-inline' is temporary — TanStack Start
 *    emits inline hydration/streaming scripts and the root route an inline
 *    JSON-LD block, and nonces need framework support. No remote script host.
 *  - connections: same origin (server functions) + Supabase REST/Auth/Storage
 *    over https and Realtime over wss.
 *  - styles/fonts: own CSS + the Google Fonts stylesheet and font files.
 *  - images: own assets, data:/blob: (QR codes, generated previews), Supabase storage.
 *  - frames: none — the app embeds no iframe (the contact map is a plain link).
 *  - workers: the same-origin service worker; blob: for library workers.
 */
export function buildReportOnlyCsp(supabaseOrigin: string | null): string {
  const supabaseHttps = parseSupabaseOrigin(supabaseOrigin);
  const supabaseWss = supabaseHttps ? supabaseHttps.replace(/^https:/, "wss:") : null;
  const list = (...sources: Array<string | null>) => sources.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    `img-src ${list("'self'", "data:", "blob:", supabaseHttps)}`,
    `connect-src ${list("'self'", supabaseHttps, supabaseWss)}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export function withSecurityHeaders(request: Request, response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  let host = "";
  try {
    host = new URL(request.url).hostname;
  } catch {
    return response;
  }
  if (PREVIEW_HOST.test(host)) return response;

  const headers = new Headers(response.headers);
  if (!headers.has("content-security-policy")) headers.set("content-security-policy", DOCUMENT_CSP);
  if (!headers.has("content-security-policy-report-only")) {
    headers.set("content-security-policy-report-only", buildReportOnlyCsp(resolveSupabaseOrigin()));
  }
  if (!headers.has("x-frame-options")) headers.set("x-frame-options", "SAMEORIGIN");
  // Observed 2026-10-04: after a deploy, already-visited pages (e.g. /faculty)
  // kept being served from an edge cache for hours with the old build. HTML is
  // never user-specific here (sessions live in the browser), so let shared
  // caches keep it only briefly and revalidate, instead of an unbounded TTL.
  if (!headers.has("cache-control") && response.status === 200) {
    headers.set("cache-control", HTML_CACHE_CONTROL);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
