import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FacultyPortalError, FacultyPortalNotFound } from "@/components/portal/FacultyPortalError";

export const Route = createFileRoute("/faculty-portal")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابة عضو هيئة التدريس — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: FacultyPortalError,
  notFoundComponent: FacultyPortalNotFound,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/portal-login" });
    }

    const { data: profile } = await supabase
      .from("faculty_profiles")
      .select("must_change_password")
      .eq("user_id", data.user.id)
      .maybeSingle();

    if (!profile) {
      await supabase.auth.signOut();
      throw redirect({ to: "/portal-login" });
    }

    if (profile.must_change_password && location.pathname !== "/faculty-portal/change-password") {
      throw redirect({ to: "/faculty-portal/change-password" });
    }
  },
  component: FacultyPortalLayout,
});

function FacultyPortalLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    setReady(true);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        lastUserId.current = null;
        queryClient.clear();
        navigate({ to: "/portal-login", replace: true });
        return;
      }
      const uid = session.user.id;
      if (lastUserId.current && lastUserId.current !== uid) {
        // A different faculty member signed in on this browser: drop every
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
