import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearReportsLocalPreferences } from "@/lib/reports/clear-local-preferences";

/**
 * Safe student-portal logout: sign out, clear React Query cache, clear
 * local reports favorites, then navigate to portal login.
 */
export function useStudentLogout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Never block navigation on sign-out failure.
    } finally {
      queryClient.clear();
      clearReportsLocalPreferences();
      navigate({ to: "/portal-login", replace: true });
    }
  }, [navigate, queryClient]);
}
