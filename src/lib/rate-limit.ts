// Client-side helper for pre-auth rate limits.
// Calls checkPublicRateLimit server function (service role) — not anon RPC.
import { checkPublicRateLimit } from "@/lib/rate-limit.functions";

export type RateLimitResult = {
  allowed: boolean;
  remaining?: number;
  blocked_until?: string | null;
  reason?: string;
};

export type RateLimitPolicy = {
  action: string;
  maxAttempts: number;
  windowMinutes: number;
  blockMinutes?: number;
};

export const RATE_LIMIT_POLICIES = {
  forgotPassword:        { action: "forgot_password",        maxAttempts: 3,  windowMinutes: 30, blockMinutes: 30 },
  resetPassword:         { action: "reset_password",         maxAttempts: 5,  windowMinutes: 30, blockMinutes: 30 },
  loginAttempt:          { action: "login_attempt",          maxAttempts: 5,  windowMinutes: 10, blockMinutes: 15 },
  accountCreation:       { action: "account_creation",       maxAttempts: 20, windowMinutes: 10, blockMinutes: 15 },
  accountImport:         { action: "account_import",         maxAttempts: 3,  windowMinutes: 30, blockMinutes: 30 },
  sensitiveRpc:          { action: "sensitive_rpc",          maxAttempts: 30, windowMinutes: 10, blockMinutes: 15 },
} as const satisfies Record<string, RateLimitPolicy>;

export const RATE_LIMIT_MESSAGE =
  "تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً.";

function normalizeKey(input: string) {
  return input.trim().toLowerCase().slice(0, 200);
}

/** Calls server-side rate limit (no anon RPC). */
export async function checkRateLimit(
  keyParts: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  if (policy.action !== "login_attempt" && policy.action !== "forgot_password") {
    console.warn("[rate-limit] unsupported pre-auth action", policy.action);
    return { allowed: true, reason: "unsupported_action" };
  }
  const key = normalizeKey(keyParts);
  try {
    const result = await checkPublicRateLimit({
      data: {
        key,
        action: policy.action,
      },
    });
    return result;
  } catch (e) {
    console.warn("[rate-limit] threw", e);
    return { allowed: true, reason: "exception" };
  }
}

/** Convenience: format a blocked-until timestamp into Arabic minutes. */
export function describeBlockedFor(iso?: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return null;
  const mins = Math.max(1, Math.ceil(ms / 60000));
  return `يرجى المحاولة بعد ${mins} دقيقة`;
}
