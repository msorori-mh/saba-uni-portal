/**
 * Client-side download of course-material files from a short-lived signed URL.
 *
 * The signed URL is resolved by a server function AFTER an `await`, so any
 * `window.open(...)` call at that point is no longer part of the user's direct
 * click and is blocked by the browser / Android WebView popup blocker. A
 * programmatically clicked anchor is not subject to the popup blocker.
 *
 * Inside the Capacitor Android WebView an in-page anchor could strand the app
 * (the storage host is a different origin), so the native shell hands the URL
 * to the system handler via openExternalUrl — same rule as the official
 * document download flow.
 */

import { isNativePlatform } from "@/lib/native/platform";
import { openSignedUrlInSystemBrowser } from "@/lib/native/file-redirect";

/** Opens/downloads a signed URL without relying on a post-await popup. */
export async function triggerSignedFileDownload(
  signedUrl: string,
  filename?: string,
): Promise<void> {
  if (isNativePlatform()) {
    openSignedUrlInSystemBrowser(signedUrl);
    return;
  }
  if (typeof window === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = signedUrl;
  if (filename) anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
