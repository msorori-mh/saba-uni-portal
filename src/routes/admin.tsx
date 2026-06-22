import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { canAccessAdminPanel, canAccessAdminRoute, firstAccessibleAdminRoute } from "@/lib/admin-nav";
import { getAdminSession, type AdminSession } from "@/lib/admin-session.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    accessDenied: search.accessDenied === "1" ? ("1" as const) : undefined,
  }),
  head: () => ({
    meta: [{ title: "لوحة الإدارة — كلية تكنولوجيا المعلومات" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  beforeLoad: async ({ location }) => {
    if (location.pathname === "/admin/login") return {};

    let session: AdminSession;
    try {
      session = await getAdminSession();
    } catch {
      throw redirect({ to: "/admin/login" });
    }

    if (!session.email) {
      throw redirect({ to: "/admin/login" });
    }

    if (!canAccessAdminPanel(session.roles)) {
      await supabase.auth.signOut();
      throw redirect({ to: "/admin/login" });
    }
    if (!canAccessAdminRoute(location.pathname, session.roles)) {
      throw redirect({ to: firstAccessibleAdminRoute(session.roles), search: { accessDenied: "1" } });
    }

    return { adminSession: session };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessDenied = useRouterState({ select: (s) => (s.location.search as { accessDenied?: string }).accessDenied === "1" });
  const adminSession = Route.useRouteContext({ select: (c) => c.adminSession });

  if (pathname === "/admin/login") {
    return <Outlet />;
  }

  if (!adminSession?.email) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <AdminShell userEmail={adminSession.email} userRoles={adminSession.roles}>
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
