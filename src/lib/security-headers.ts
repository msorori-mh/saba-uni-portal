/**
 * Clickjacking / injection hardening for HTML documents.
 *
 * Only directives that cannot break the app are set here: the page may be
 * framed by its own origin only, <base> and form targets are pinned to the
 * origin, and plugins are disabled. A full script/style CSP needs nonces and a
 * report-only rollout, so it is intentionally not introduced blindly.
 * Editor preview hosts are skipped because the Lovable editor frames the app.
 */
const PREVIEW_HOST = /(^|\.)lovable\.app$|(^|\.)lovableproject\.com$|^localhost$|^127\.0\.0\.1$/i;
const HTML_CACHE_CONTROL = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";
const DOCUMENT_CSP = "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'";

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
