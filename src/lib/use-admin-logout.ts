import { useCallback } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearReportsLocalPreferences } from "@/lib/reports/clear-local-preferences";

/**
 * Centralized, safe logout for the admin portal.
 *
 * - Always navigates back to /admin/login, even if `supabase.auth.signOut()`
 *   rejects (network error, expired session, …): the navigation lives in
 *   `finally`, so a failed sign-out can never strand the user.
 * - Clears the React Query cache so no stale identity/role data survives
 *   into the next login on the same client.
 * - Clears local reports favorites so shared browsers do not leak preferences.
 */
export function useAdminLogout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Swallow: the local session is discarded anyway and the login page
      // re-establishes a fresh session. Never block navigation on this.
    } finally {
      queryClient.clear();
      clearReportsLocalPreferences();
      await router.invalidate();
      navigate({ to: "/admin/login", replace: true });
    }
  }, [navigate, router, queryClient]);
}
