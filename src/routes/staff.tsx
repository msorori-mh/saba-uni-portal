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
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);

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
        .select("must_change_password")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError || !profile) {
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
