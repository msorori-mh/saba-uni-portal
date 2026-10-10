/**
 * Native (Capacitor Android) hand-off of signed storage URLs to the system browser.
 *
 * Capacitor's Bridge keeps any main-frame navigation to the app host or to a
 * host in `server.allowNavigation` inside the WebView (which has no download
 * listener), and launches an ACTION_VIEW intent for every other host. The
 * storage host is allow-listed, so we navigate instead to a redirect route on
 * the default published host — NOT allow-listed — which Android opens in the
 * system browser; the route then 302s to the signed URL and the file downloads.
 * Works with the existing APK (no native plugin needed).
 *
 * Shell compatibility (this JS is served remotely to every installed APK):
 *  - APK <= 0.3.0 allow-lists the storage host, so a direct navigation would
 *    stay inside the WebView — the redirect hop is REQUIRED there.
 *  - APK >= 0.4.0 no longer allow-lists the storage host. The hop is kept
 *    unchanged: the redirect host is still outside the allow-list, so the
 *    system browser opens it and follows the 302 exactly as before.
 * Do not remove the hop while 0.3.0 installs exist.
 */

export const FILE_REDIRECT_HOST = "saba-uni-portal.lovable.app";
export const FILE_REDIRECT_PATH = "/api/public/file-redirect";
export const SIGNED_STORAGE_HOST = "wpmicqriltrowwonknox.supabase.co";
export const SIGNED_STORAGE_PREFIX = "/storage/v1/object/sign/";
export const FILE_REDIRECT_BUCKETS = [
  "course-materials",
  "official-documents",
  "student-request-attachments",
] as const;

/** Returns the validated signed URL, or null if it must be rejected. */
export function validateSignedStorageUrl(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 4096) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== SIGNED_STORAGE_HOST) return null;
  if (url.port || url.username || url.password) return null;
  if (!url.pathname.startsWith(SIGNED_STORAGE_PREFIX)) return null;
  if (url.pathname.includes("..") || url.pathname.includes("%2e") || url.pathname.includes("%2E")) return null;
  const bucket = url.pathname.slice(SIGNED_STORAGE_PREFIX.length).split("/")[0];
  if (!(FILE_REDIRECT_BUCKETS as readonly string[]).includes(bucket)) return null;
  if (!url.searchParams.get("token")) return null;
  return url.toString();
}

export function buildFileRedirectUrl(signedUrl: string): string {
  return `https://${FILE_REDIRECT_HOST}${FILE_REDIRECT_PATH}?u=${encodeURIComponent(signedUrl)}`;
}

/** Native only: leave the WebView via a main-frame navigation to the redirect host. */
export function openSignedUrlInSystemBrowser(signedUrl: string): void {
  const safe = validateSignedStorageUrl(signedUrl);
  if (!safe) throw new Error("رابط التنزيل غير صالح");
  if (typeof window === "undefined") return;
  window.location.assign(buildFileRedirectUrl(safe));
}
