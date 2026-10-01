import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// staff_profiles.status values that must not reach the staff portal
// (admin deactivation sets 'inactive' — see admin-staff-deletion.functions.ts).
const DISABLED_STAFF_STATUSES = new Set(["inactive", "suspended", "disabled"]);

export const Route = createFileRoute("/staff")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابة الموظف — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: StaffLayout,
});

function StaffLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [guardError, setGuardError] = useState(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setGuardError(false);

    const goToStaffLogin = () => {
      if (cancelled) return;
      lastUserId.current = null;
      queryClient.clear();
      navigate({
        to: "/portal-login",
        search: { type: "staff" },
        replace: true,
      });
    };

    const validateSession = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;

      if (error || !data.user) {
        goToStaffLogin();
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("staff_profiles")
        .select("must_change_password, status")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (cancelled) return;

      // A transient read failure must not sign the user out: show a retry.
      if (profileError) {
        setGuardError(true);
        return;
      }

      // Not a staff account, or a deactivated staff profile.
      if (!profile || DISABLED_STAFF_STATUSES.has(String(profile.status ?? "").toLowerCase())) {
        await supabase.auth.signOut();
        goToStaffLogin();
        return;
      }

      if (
        profile.must_change_password &&
        pathname !== "/staff/change-password"
      ) {
        navigate({
          to: "/staff/change-password",
          replace: true,
        });
        return;
      }

      lastUserId.current = data.user.id;
      setReady(true);
    };

    void validateSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        goToStaffLogin();
        return;
      }

      const userId = session.user.id;
      if (lastUserId.current && lastUserId.current !== userId) {
        queryClient.clear();
        setReady(false);
        lastUserId.current = userId;
        void validateSession();
        return;
      }

      lastUserId.current = userId;
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, pathname, queryClient]);

  if (guardError) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface px-4" dir="rtl" role="alert">
        <div className="text-center space-y-3">
          <p className="text-sm text-muted-foreground">تعذر التحقق من ملف الموظف. تحقق من الاتصال وحاول مرة أخرى.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className="min-h-screen grid place-items-center bg-surface"
        data-testid="staff-auth-guard-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Outlet />;
}
