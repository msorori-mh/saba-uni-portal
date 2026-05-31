import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "لوحة الإدارة — كلية تكنولوجيا المعلومات" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async ({ location }) => {
    // login page is open
    if (location.pathname === "/admin/login") return;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/admin/login" });
    }
    const { data: role } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!role) {
      await supabase.auth.signOut();
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    if (pathname === "/admin/login") return;
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, [pathname]);

  // Public login page: no shell, no chrome
  if (pathname === "/admin/login") {
    return <Outlet />;
  }

  if (!email) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AdminShell userEmail={email}>
      <Outlet />
    </AdminShell>
  );
}
