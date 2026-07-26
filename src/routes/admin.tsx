import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  canAccessAdminPanel,
  canAccessAdminRoute,
  firstAccessibleAdminRoute,
} from "@/lib/admin-nav";
import { getAdminSession, type AdminSession } from "@/lib/admin-session.functions";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { retryRouteError } from "@/lib/route-error-recovery";

export const Route = createFileRoute("/admin")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    accessDenied: search.accessDenied === "1" ? ("1" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "لوحة الإدارة — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
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
      throw redirect({
        to: firstAccessibleAdminRoute(session.roles),
        search: { accessDenied: "1" },
      });
    }

    return { adminSession: session };
  },
  component: AdminLayout,
  errorComponent: AdminErrorComponent,
  notFoundComponent: AdminNotFoundComponent,
});

/** Not-found fallback scoped to the /admin route tree — no technical details. */
function AdminNotFoundComponent() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="max-w-md text-center" data-testid="admin-not-found">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          الصفحة غير موجودة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          عذراً، الصفحة المطلوبة غير متوفرة ضمن لوحة الإدارة.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            العودة إلى لوحة الإدارة
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_admin_error_component" });
  }, [error]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div
        className="max-w-md text-center"
        role="alert"
        aria-live="assertive"
        data-testid="admin-error-fallback"
      >
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          تعذّر تحميل صفحة الإدارة
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حدث خطأ أثناء تحميل هذه الصفحة. يمكنك المحاولة مرة أخرى أو العودة إلى لوحة الإدارة دون
          تسجيل الخروج.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              void retryRouteError({
                reset,
                invalidate: () => router.invalidate(),
                error,
                reload: () => window.location.reload(),
              });
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            إعادة المحاولة
          </button>
          <Link
            to="/admin"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            العودة إلى لوحة الإدارة
          </Link>
        </div>
      </div>
    </div>
  );
}

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessDenied = useRouterState({
    select: (s) => (s.location.search as { accessDenied?: string }).accessDenied === "1",
  });
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
          <span>
            ليس لديك صلاحية الوصول إلى الصفحة المطلوبة. تم توجيهك إلى أقرب صفحة مسموح بها لدورك.
          </span>
        </div>
      )}
      <Outlet />
    </AdminShell>
  );
}
