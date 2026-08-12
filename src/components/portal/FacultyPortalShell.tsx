import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { useFacultyLogout } from "@/lib/faculty-portal/use-faculty-logout";
import { hasActiveProcessingAssignment } from "@/lib/faculty-portal/processing-access.functions";
import { portalFeatures } from "@/lib/portal-features";
import { cn } from "@/lib/utils";

/** Registered faculty-portal paths reachable from the nav strip / breadcrumbs. */
export type FacultyNavPath =
  | "/faculty-portal"
  | "/faculty-portal/schedule"
  | "/faculty-portal/academic-councils"
  | "/faculty-portal/graduation-projects"
  | "/faculty-portal/materials"
  | "/faculty-portal/lecture-execution"
  | "/faculty-portal/reports";

export interface FacultyBreadcrumb {
  label: string;
  /** Registered faculty-portal route path. Omit for the current page. */
  to?: FacultyNavPath;
}

export interface FacultyPortalShellProps {
  title?: string;
  subtitle?: string;
  /** Breadcrumbs rendered under the header (home crumb is added automatically). */
  breadcrumbs?: FacultyBreadcrumb[];
  /** Extra header actions; defaults to the notifications bell. */
  actions?: ReactNode;
  /** Hide header + nav when printing (used by the schedule print view). */
  hideChromeOnPrint?: boolean;
  children: ReactNode;
}

type NavItem = { to: FacultyNavPath; label: string; exact?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/faculty-portal", label: "الرئيسية", exact: true },
  { to: "/faculty-portal/schedule", label: "جدول التدريس" },
  { to: "/faculty-portal/reports", label: "تقاريري" },
  { to: "/faculty-portal/academic-councils", label: "المجالس الأكاديمية" },
  { to: "/faculty-portal/graduation-projects", label: "مشاريع التخرج" },
];

/**
 * Shared shell for every /faculty-portal page: the common PortalShell header
 * plus a compact horizontal nav strip and optional breadcrumbs, with a
 * centralized safe logout (cache clear + guaranteed navigation).
 */
export function FacultyPortalShell({
  title = "بوابة عضو هيئة التدريس",
  subtitle,
  breadcrumbs,
  actions,
  hideChromeOnPrint = false,
  children,
}: FacultyPortalShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logout = useFacultyLogout();

  const processingAccessFn = useServerFn(hasActiveProcessingAssignment);
  const { data: processingAccess } = useQuery({
    queryKey: ["faculty-portal", "processing-access"],
    queryFn: () => processingAccessFn({ data: {} }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const showProcessingLink =
    !!processingAccess && (processingAccess.hasAssignment || processingAccess.isAdmin);

  const items: NavItem[] = [
    ...NAV_ITEMS,
    ...(portalFeatures.facultyCourseMaterials
      ? [{ to: "/faculty-portal/materials", label: "المواد التعليمية" }]
      : []),
    ...(showProcessingLink
      ? [{ to: "/faculty-portal/processing-requests", label: "طلبات المعالجة" }]
      : []),
  ];

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  return (
    <PortalShell
      title={title}
      subtitle={subtitle}
      onLogout={() => void logout()}
      actions={actions ?? <NotificationsBell />}
      headerClassName={hideChromeOnPrint ? "print:hidden" : undefined}
    >
      <nav
        aria-label="التنقل الرئيسي"
        className="no-print border-b border-gold/20 bg-primary-deep text-primary-foreground"
      >
        <div className="container mx-auto flex items-center gap-1 overflow-x-auto whitespace-nowrap px-4">
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-t-md px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                  active
                    ? "font-extrabold text-gold underline decoration-gold decoration-2 underline-offset-8"
                    : "font-medium text-primary-foreground/75 hover:text-gold",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="مسار التنقل" className="no-print border-b border-border bg-background">
          <ol className="container mx-auto flex flex-wrap items-center gap-1 px-4 py-2 text-xs">
            <li className="flex items-center gap-1">
              <Link
                to="/faculty-portal"
                className="font-bold text-primary hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                بوابة عضو هيئة التدريس
              </Link>
            </li>
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                  <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {isLast || !crumb.to ? (
                    <span aria-current="page" className="font-bold text-foreground">
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.to}
                      className="font-bold text-primary hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      {children}
    </PortalShell>
  );
}
