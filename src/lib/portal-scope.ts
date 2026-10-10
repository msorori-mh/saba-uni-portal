/** Internal portals render their own PortalShell header — no public site chrome. */
export const INTERNAL_PORTAL_PREFIXES = ["/student", "/faculty-portal", "/staff"] as const;

export function isInternalPortalPath(pathname: string): boolean {
  return INTERNAL_PORTAL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
