import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Centralized, safe logout for the faculty portal.
 *
 * - Always navigates back to /portal-login, even if `supabase.auth.signOut()`
 *   rejects (network error, expired session, …): the navigation lives in
 *   `finally`, so a failed sign-out can never strand the user.
 * - Clears the React Query cache so no stale identity/profile data survives
 *   into the next login on the same client.
 */
export function useFacultyLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Swallow: the local session is discarded anyway and the login page
      // re-establishes a fresh session. Never block navigation on this.
    } finally {
      queryClient.clear();
      navigate({ to: "/portal-login", replace: true });
    }
  }, [navigate, queryClient]);
}
