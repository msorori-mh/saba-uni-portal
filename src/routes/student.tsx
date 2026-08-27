import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابة الطالب — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/portal-login" });
    }

    const { data: profile } = await supabase
      .from("student_profiles")
      .select("must_change_password")
      .eq("user_id", data.user.id)
      .maybeSingle();

    // Not a student account
    if (!profile) {
      await supabase.auth.signOut();
      throw redirect({ to: "/portal-login" });
    }

    // Force password change before any other student page
    if (profile.must_change_password && location.pathname !== "/student/change-password") {
      throw redirect({ to: "/student/change-password" });
    }
  },
  component: StudentLayout,
  // Immediate transition feedback (e.g. /student → /student/notifications).
  pendingMs: 0,
  pendingComponent: StudentPending,
});

function StudentPending() {
  return (
    <div
      className="min-h-screen grid place-items-center bg-surface"
      data-testid="student-route-pending"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  );
}

function StudentLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session) navigate({ to: "/portal-login", replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <Outlet />;
}
