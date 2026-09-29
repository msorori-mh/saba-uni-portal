import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RateLimitResult } from "@/lib/rate-limit";
import { RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

const publicActionSchema = z.enum(["login_attempt", "forgot_password"]);

const PUBLIC_POLICY_BY_ACTION = {
  login_attempt: RATE_LIMIT_POLICIES.loginAttempt,
  forgot_password: RATE_LIMIT_POLICIES.forgotPassword,
} as const;

/** Extra pre-auth throttle, scoped to the trusted Cloudflare client address. */
export const checkPublicRateLimit = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      key: z.string().min(1).max(200),
      action: publicActionSchema,
    }),
  )
  .handler(async ({ data }): Promise<RateLimitResult> => {
    const policy = PUBLIC_POLICY_BY_ACTION[data.action];
    // An email-only key lets any anonymous caller repeatedly lock another
    // person's account. Cloudflare supplies this header at the trusted edge.
    // Without it, defer to Supabase Auth's own rate limits.
    try {
      const ip = getRequest().headers.get("cf-connecting-ip");
      if (!ip || !/^[a-fA-F0-9:.]{3,45}$/.test(ip)) {
        return { allowed: true, reason: "trusted_ip_unavailable" };
      }
      const input = new TextEncoder().encode(`${data.action}|${ip}|${data.key.trim().toLowerCase()}`);
      const digest = await crypto.subtle.digest("SHA-256", input);
      const key = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
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
        console.warn("[rate-limit.public] RPC error", error);
        return { allowed: true, reason: "rpc_error" };
      }
      return (result ?? { allowed: true }) as RateLimitResult;
    } catch (e) {
      console.warn("[rate-limit.public] threw", e);
      return { allowed: true, reason: "exception" };
    }
  });
