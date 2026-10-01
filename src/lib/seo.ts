/** Public origin of the college site; canonical URLs must be absolute. */
export const SITE_URL = "https://quboolye.com";

export function absoluteUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
