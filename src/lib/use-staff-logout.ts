import { useCallback } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearReportsLocalPreferences } from "@/lib/reports/clear-local-preferences";
import { clearSessionArtifacts } from "@/lib/auth/clear-session-artifacts";

/**
 * Centralized, safe logout for the staff portal.
 *
 * - Navigation lives in `finally`, so a failed sign-out never strands the user.
 * - Clears the React Query cache and invalidates the router so no stale
 *   identity/profile data from the previous staff member survives into the
 *   next login on the same browser.
 */
export function useStaffLogout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // Swallow: the local session is discarded anyway.
    } finally {
      queryClient.clear();
      clearReportsLocalPreferences();
      clearSessionArtifacts();
      await router.invalidate();
      navigate({ to: "/portal-login", replace: true });
    }
  }, [navigate, router, queryClient]);
}
