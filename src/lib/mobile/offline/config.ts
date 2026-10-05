/**
 * Mobile student app — offline-first configuration (single source of truth for
 * the browser side). The service-worker side lives in public/mobile-sw.js and
 * public/mobile-offline-policy.js; tests keep the shared values in sync.
 *
 * Dependency-free on purpose: imported by the route guard, the persistence
 * layer and the unit tests.
 */

/**
 * KILL SWITCH. Set to `false` here AND in public/mobile-sw.js, then deploy:
 *  - the worker deletes its caches and unregisters itself on the next online launch;
 *  - the app stops registering it, deletes the caches from the page as well and
 *    wipes every persisted student payload on the device.
 */
export const MOBILE_OFFLINE_ENABLED = true;

export const MOBILE_OFFLINE_SW_URL = "/mobile-sw.js";
export const MOBILE_OFFLINE_SW_SCOPE = "/mobile/";
/** Cache Storage names owned by the mobile worker (see mobile-offline-policy.js). */
export const MOBILE_OFFLINE_CACHE_PREFIX = "mobile-offline-";

/** localStorage namespace of everything this feature writes. */
export const MOBILE_OFFLINE_STORAGE_PREFIX = "mobile-offline:";
/**
 * Version buster for the persisted payloads. BUMP IT whenever the shape of an
 * allow-listed query result changes: older payloads are then ignored.
 */
export const MOBILE_OFFLINE_SCHEMA_VERSION = 1;
/** Persisted data older than this is never shown and is dropped on read. */
export const MOBILE_OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Upper bound (characters of JSON) for one student's persisted snapshot. */
export const MOBILE_OFFLINE_MAX_SNAPSHOT_CHARS = 1_500_000;

/**
 * The ONLY React Query results that may be written to the device, as the
 * second segment of a `["mobile-student", <segment>, <optional id>]` key.
 * Documents, finance, requests, notifications, materials, attachments and
 * signed URLs are deliberately absent and are never persisted.
 */
export const MOBILE_OFFLINE_QUERY_SEGMENTS = [
  "context", // home dashboard + shared student context
  "short-profile", // header name / academic number
  "academic-record",
  "program-id", // study plan resolution
  "study-plan",
  "schedule",
  "grades",
] as const;

export type MobileOfflineQuerySegment = (typeof MOBILE_OFFLINE_QUERY_SEGMENTS)[number];

export const MOBILE_QUERY_ROOT = "mobile-student";

function isIdSegment(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "string";
}

/** True only for an allow-listed mobile student query key. */
export function isPersistableMobileQueryKey(key: unknown): key is readonly unknown[] {
  if (!Array.isArray(key) || key.length < 2 || key.length > 3) return false;
  if (key[0] !== MOBILE_QUERY_ROOT || typeof key[1] !== "string") return false;
  if (!(MOBILE_OFFLINE_QUERY_SEGMENTS as readonly string[]).includes(key[1])) return false;
  return key.length === 2 || isIdSegment(key[2]);
}

/**
 * A key that carries the auth user id must carry the CURRENT user's id.
 * (Only the header profile is keyed by user id today.)
 */
export function isMobileQueryKeyOwnedBy(key: readonly unknown[], userId: string): boolean {
  if (key[1] === "short-profile") return key[2] === userId;
  return true;
}

export type MobileOfflineScreen =
  /** Shows persisted data offline; `requires` lists the query segments it needs. */
  | { kind: "cached"; requires: readonly MobileOfflineQuerySegment[] }
  /** Works offline without remote data (menus, local settings). */
  | { kind: "static" }
  /** Needs the network (documents, finance, requests, notifications, …). */
  | { kind: "online-only" };

const CACHED_SCREENS: Record<string, readonly MobileOfflineQuerySegment[]> = {
  "/mobile/student": ["context"],
  "/mobile/student/academic-record": ["context", "academic-record"],
  "/mobile/student/study-plan": ["program-id", "study-plan"],
  "/mobile/student/schedule": ["schedule"],
  "/mobile/student/grades": ["grades"],
};

const STATIC_SCREENS: readonly string[] = ["/mobile/student/more", "/mobile/student/settings"];

/** Routes whose code is downloaded in advance so they open without a network. */
export const MOBILE_OFFLINE_WARM_ROUTES = [
  "/mobile/student",
  "/mobile/student/academic-record",
  "/mobile/student/study-plan",
  "/mobile/student/schedule",
  "/mobile/student/grades",
  "/mobile/student/more",
  "/mobile/student/settings",
] as const;

export function normalizeMobilePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export function classifyMobileOfflineScreen(pathname: string): MobileOfflineScreen {
  const path = normalizeMobilePath(pathname);
  const requires = CACHED_SCREENS[path];
  if (requires) return { kind: "cached", requires };
  if (STATIC_SCREENS.includes(path)) return { kind: "static" };
  return { kind: "online-only" };
}

/** True when a registration belongs to the mobile offline worker. */
export function isMobileOfflineScope(scopeUrl: string | null | undefined): boolean {
  if (!scopeUrl) return false;
  try {
    return new URL(scopeUrl).pathname === MOBILE_OFFLINE_SW_SCOPE;
  } catch {
    return false;
  }
}

export function isMobileOfflineCacheName(name: string): boolean {
  return name.startsWith(MOBILE_OFFLINE_CACHE_PREFIX);
}

/** The active controller of this page, only when it is the mobile offline worker. */
export function getMobileOfflineController(): ServiceWorker | null {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
    const controller = navigator.serviceWorker.controller;
    if (!controller) return null;
    return new URL(controller.scriptURL).pathname === MOBILE_OFFLINE_SW_URL ? controller : null;
  } catch {
    return null;
  }
}
