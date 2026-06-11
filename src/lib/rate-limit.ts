// Client-side helper around the public.check_and_record_rate_limit RPC.
// Note: this is an ad-hoc limiter — it protects flows we control (Forgot
// Password, account creation, sensitive RPCs). It does NOT protect direct
// calls to Supabase Auth (login/reset) — that requires Cloudflare/WAF.
import { supabase } from "@/integrations/supabase/client";

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

/** Calls the SECURITY DEFINER RPC. Requires an authenticated session OR
 *  a session-less call still works because the function is granted to
 *  authenticated only — anonymous callers (forgot/login pre-auth) will
 *  receive a soft "allowed" fallback (we cannot rate-limit before login
 *  without a session; logging happens server-side anyway via Audit). */
export async function checkRateLimit(
  keyParts: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const key = normalizeKey(keyParts);
  try {
    const { data, error } = await (supabase.rpc as any)(
      "check_and_record_rate_limit",
      {
        p_key: key,
        p_action: policy.action,
        p_max_attempts: policy.maxAttempts,
        p_window_minutes: policy.windowMinutes,
        p_block_minutes: policy.blockMinutes ?? 15,
      },
    );
    if (error) {
      // Fail-open to avoid blocking real users on infra glitches.
      console.warn("[rate-limit] RPC error", error);
      return { allowed: true, reason: "rpc_error" };
    }
    return (data ?? { allowed: true }) as RateLimitResult;
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
