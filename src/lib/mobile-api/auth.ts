import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { MobileApiError } from "./errors";

export type MobileApiAuthContext = {
  userId: string;
  supabase: SupabaseClient<Database>;
  token: string;
};

/**
 * Resolve caller identity from Authorization: Bearer <supabase JWT>.
 * Uses publishable key only — never service_role.
 */
export async function resolveMobileApiAuth(
  request: Request,
): Promise<MobileApiAuthContext> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new MobileApiError(
      "SERVICE_UNAVAILABLE",
      "SUPABASE_ENV_MISSING",
      "Authentication service unavailable",
      "خدمة المصادقة غير متاحة",
    );
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "AUTH_REQUIRED",
      "Authentication required",
      "يجب تسجيل الدخول",
    );
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "AUTH_BEARER_REQUIRED",
      "Bearer token required",
      "يجب إرسال رمز Bearer",
    );
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "AUTH_TOKEN_EMPTY",
      "Authentication required",
      "يجب تسجيل الدخول",
    );
  }

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new MobileApiError(
      "AUTH_REQUIRED",
      "AUTH_INVALID_TOKEN",
      "Invalid or expired token",
      "رمز الدخول غير صالح أو منتهٍ",
    );
  }

  return {
    userId: data.claims.sub,
    supabase,
    token,
  };
}
