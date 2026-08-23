import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
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
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/portal-login", search: { type: "staff" } });
    }

    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("must_change_password")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      throw redirect({ to: "/portal-login", search: { type: "staff" } });
    }

    if (profile.must_change_password && location.pathname !== "/staff/change-password") {
      throw redirect({ to: "/staff/change-password" });
    }
  },
  component: StaffLayout,
});

function StaffLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    setReady(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        lastUserId.current = null;
        queryClient.clear();
        navigate({ to: "/portal-login", search: { type: "staff" }, replace: true });
        return;
      }
      const uid = session.user.id;
      if (lastUserId.current && lastUserId.current !== uid) {
        // A different staff member signed in on this browser: drop every
        // cached query/route match belonging to the previous identity.
        queryClient.clear();
        void router.invalidate();
      }
      lastUserId.current = uid;
    });
    return () => subscription.unsubscribe();
  }, [navigate, router, queryClient]);


  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Outlet />;
}
