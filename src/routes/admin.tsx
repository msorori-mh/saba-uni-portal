import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { canAccessAdminPanel, canAccessAdminRoute, firstAccessibleAdminRoute } from "@/lib/admin-nav";

export const Route = createFileRoute("/admin")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    accessDenied: search.accessDenied === "1" ? ("1" as const) : undefined,
  }),
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
    const { data: roles } = await supabase
      .from("user_roles").select("role").eq("user_id", data.user.id);
    const roleList = (roles ?? []).map((r) => r.role);
    if (!canAccessAdminPanel(roleList)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/admin/login" });
    }
    if (!canAccessAdminRoute(location.pathname, roleList)) {
      throw redirect({ to: firstAccessibleAdminRoute(roleList), search: { accessDenied: "1" } });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessDenied = useRouterState({ select: (s) => (s.location.search as { accessDenied?: string }).accessDenied === "1" });
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
      {accessDenied && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
          <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" />
          <span>ليس لديك صلاحية الوصول إلى الصفحة المطلوبة. تم توجيهك إلى أقرب صفحة مسموح بها لدورك.</span>
        </div>
      )}
      <Outlet />
    </AdminShell>
  );
}
