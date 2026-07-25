/** Home target for error fallbacks: stay inside the portal area where the failure happened. */
export function getErrorRecoveryHomePath(pathname: string): "/admin" | "/student" | "/" {
  if (pathname.startsWith("/admin")) return "/admin";
  // Keep signed-in students inside their portal instead of dumping them to the
  // public home page (which would then bounce them through login again).
  if (pathname.startsWith("/student") || pathname.startsWith("/mobile/student")) return "/student";
  return "/";
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
