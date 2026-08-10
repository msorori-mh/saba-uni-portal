// Server-only helper: request-scoped Supabase auth for council server functions.
//
// The generated `@/integrations/supabase/auth-middleware` export is a TanStack
// *middleware object* (used as `.middleware([requireSupabaseAuth])`). The council
// server functions were written against an older call-style API
// (`await requireSupabaseAuth(request)`), which throws
// "requireSupabaseAuth is not a function" at runtime. This helper restores that
// call style without editing the generated file, keeping RLS enforced as the
// signed-in user (bearer token from the incoming request).
import { createClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

export async function requireSupabaseAuth(request?: Request) {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Missing Supabase server environment variables.");
  }

  const req = request ?? getRequest();
  const authHeader = req?.headers?.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }
  const token = authHeader.slice("Bearer ".length);

  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("Unauthorized: Invalid or expired session");
  }

  return { supabase, userId: data.user.id, user: data.user, claims: data.user };
}
