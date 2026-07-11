/** Home target for error fallbacks: stay in admin when the failure was under /admin. */
export function getErrorRecoveryHomePath(pathname: string): "/admin" | "/" {
  return pathname.startsWith("/admin") ? "/admin" : "/";
}

export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch dynamically imported module|Loading chunk [\d]+ failed|Importing a module script failed|error loading dynamically imported module/i.test(
    msg,
  );
}

/**
 * Preferred recovery: reset the error boundary, then invalidate the router.
 * Full page reload is a last resort for chunk-load failures only.
 */
export async function retryRouteError(options: {
  reset: () => void;
  invalidate: () => unknown | Promise<unknown>;
  error?: unknown;
  reload?: () => void;
}): Promise<void> {
  options.reset();
  await options.invalidate();
  if (options.error && isChunkLoadError(options.error) && options.reload) {
    options.reload();
  }
}
