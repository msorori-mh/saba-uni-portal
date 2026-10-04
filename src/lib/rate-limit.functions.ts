import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RateLimitResult } from "@/lib/rate-limit";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { localRateLimit } from "@/lib/rate-limit-fallback";

const publicActionSchema = z.enum(["login_attempt", "forgot_password", "contact_message"]);

const PUBLIC_POLICY_BY_ACTION = {
  login_attempt: RATE_LIMIT_POLICIES.loginAttempt,
  forgot_password: RATE_LIMIT_POLICIES.forgotPassword,
  contact_message: RATE_LIMIT_POLICIES.contactMessage,
} as const;

/** Pre-auth rate limit via service role — replaces direct anon RPC calls. */
export const checkPublicRateLimit = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      key: z.string().min(1).max(200),
      action: publicActionSchema,
    }),
  )
  .handler(async ({ data }): Promise<RateLimitResult> => {
    const policy = PUBLIC_POLICY_BY_ACTION[data.action];
    const key = data.key.trim().toLowerCase().slice(0, 200);
    try {
      const { data: result, error } = await (supabaseAdmin.rpc as any)(
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
        // Never fail open: degrade to the in-memory limiter with the same policy.
        console.warn("[rate-limit.public] RPC error — using local fallback", error);
        return localRateLimit(`${policy.action}:${key}`, policy);
      }
      if (!result) return localRateLimit(`${policy.action}:${key}`, policy);
      return result as RateLimitResult;
    } catch (e) {
      console.warn("[rate-limit.public] threw — using local fallback", e);
      return localRateLimit(`${policy.action}:${key}`, policy);
    }
  });
