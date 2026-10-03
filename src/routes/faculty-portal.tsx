import { createFileRoute, Outlet, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FacultyPortalError, FacultyPortalNotFound } from "@/components/portal/FacultyPortalError";

// faculty_profiles.status values that must not reach the portal
// (admin "disable account" sets 'inactive' — see faculty-accounts.functions.ts).
const DISABLED_FACULTY_STATUSES = new Set(["inactive", "suspended", "disabled"]);

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

    const { data: profile, error: profileError } = await supabase
      .from("faculty_profiles")
      .select("must_change_password, status")
      .eq("user_id", data.user.id)
      .maybeSingle();

    // A transient read failure must not sign the user out; surface it via the
    // route error boundary (retry) instead.
    if (profileError) {
      throw new Error("تعذر التحقق من ملف عضو هيئة التدريس. حاول مرة أخرى.");
    }

    // No faculty profile (student/staff account), or a disabled faculty
    // account: end the session and return to login.
    if (!profile || DISABLED_FACULTY_STATUSES.has(String(profile.status ?? "").toLowerCase())) {
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
