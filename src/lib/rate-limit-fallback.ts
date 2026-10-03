/**
 * In-memory fallback for the pre-auth rate limiter.
 *
 * The authoritative limiter is the database RPC `check_and_record_rate_limit`.
 * When that RPC errors (overload, timeout, outage) the limiter used to answer
 * `{ allowed: true }` — i.e. brute-force protection switched itself off exactly
 * when the backend was under pressure. This fallback keeps a bounded,
 * per-server-instance counter with the SAME policy, so the limiter degrades to
 * "weaker but still on" instead of "off". It is deliberately not fail-closed:
 * a database hiccup must not lock every user out of the login page.
 */

export type FallbackPolicy = {
  maxAttempts: number;
  windowMinutes: number;
  blockMinutes?: number;
};

export type FallbackResult = {
  allowed: boolean;
  remaining?: number;
  blocked_until?: string | null;
  reason: string;
};

type Entry = { attempts: number[]; blockedUntil: number };

const MAX_KEYS = 5000;
const store = new Map<string, Entry>();

function prune(now: number): void {
  if (store.size < MAX_KEYS) return;
  for (const [key, entry] of store) {
    if (entry.blockedUntil <= now && entry.attempts.every((t) => now - t > 60 * 60 * 1000)) {
      store.delete(key);
    }
  }
  // Still full (active flood): drop the oldest entries; Map keeps insertion order.
  while (store.size >= MAX_KEYS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export function localRateLimit(
  key: string,
  policy: FallbackPolicy,
  now: number = Date.now(),
): FallbackResult {
  const windowMs = policy.windowMinutes * 60 * 1000;
  const blockMs = (policy.blockMinutes ?? 15) * 60 * 1000;
  const entry = store.get(key) ?? { attempts: [], blockedUntil: 0 };

  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      blocked_until: new Date(entry.blockedUntil).toISOString(),
      reason: "fallback_blocked",
    };
  }

  entry.attempts = entry.attempts.filter((t) => now - t < windowMs);
  entry.attempts.push(now);

  if (entry.attempts.length > policy.maxAttempts) {
    entry.blockedUntil = now + blockMs;
    entry.attempts = [];
    store.set(key, entry);
    return {
      allowed: false,
      remaining: 0,
      blocked_until: new Date(entry.blockedUntil).toISOString(),
      reason: "fallback_blocked",
    };
  }

  if (!store.has(key)) prune(now);
  store.set(key, entry);
  return {
    allowed: true,
    remaining: policy.maxAttempts - entry.attempts.length,
    blocked_until: null,
    reason: "fallback_local",
  };
}

/** Test helper. */
export function resetLocalRateLimit(): void {
  store.clear();
}
