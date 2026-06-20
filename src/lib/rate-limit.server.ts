// Server-side rate-limit helper.
// Uses the service-role admin client to call check_and_record_rate_limit
// from within server functions (independent of caller's session token).
// Always fails open on infra errors so legitimate users aren't blocked.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ServerRateLimitPolicy = {
  action: string;
  maxAttempts: number;
  windowMinutes: number;
  blockMinutes?: number;
};

export const SERVER_RATE_LIMIT_POLICIES = {
  accountCreation: { action: "account_creation", maxAttempts: 20, windowMinutes: 10, blockMinutes: 15 },
  accountImport:   { action: "account_import",   maxAttempts: 3,  windowMinutes: 30, blockMinutes: 30 },
  /** Per-target admin reset — separate action/key from public forgot-password flows. */
  adminPasswordReset: { action: "admin_password_reset", maxAttempts: 10, windowMinutes: 15, blockMinutes: 15 },
  sensitiveRpc:    { action: "sensitive_rpc",    maxAttempts: 30, windowMinutes: 10, blockMinutes: 15 },
} as const;

export const RATE_LIMIT_ERROR_AR =
  "تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة لاحقاً.";

export async function enforceRateLimit(
  key: string,
  policy: ServerRateLimitPolicy,
): Promise<void> {
  try {
    const { data, error } = await (supabaseAdmin.rpc as any)(
      "check_and_record_rate_limit",
      {
        p_key: key.trim().toLowerCase().slice(0, 200),
        p_action: policy.action,
        p_max_attempts: policy.maxAttempts,
        p_window_minutes: policy.windowMinutes,
        p_block_minutes: policy.blockMinutes ?? 15,
      },
    );
    if (error) {
      console.warn("[rate-limit.server] RPC error", error);
      return; // fail-open
    }
    if (data && (data as any).allowed === false) {
      throw new Error(RATE_LIMIT_ERROR_AR);
    }
  } catch (e) {
    if (e instanceof Error && e.message === RATE_LIMIT_ERROR_AR) throw e;
    console.warn("[rate-limit.server] threw", e);
    // fail-open
  }
}
