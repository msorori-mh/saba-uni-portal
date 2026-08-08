import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Newspaper,
  Users,
  BookOpen,
  FlaskConical,
  Calendar,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  GraduationCap,
  ChevronLeft,
  ChevronDown,
  CalendarRange,
  ListTree,
  CalendarDays,
  ClipboardList,
  ClipboardCheck,
  FileText,
  FileWarning,
  ListChecks,
  GraduationCap as GradCap,
  UserCog,
  Globe,
  Wallet,
  ShieldCheck,
  ScrollText,
  Lock,
  Database,
  FileBadge,
  Upload,
  BarChart3,
  Activity,
  TrendingUp,
  AlertCircle,
  Megaphone,
  Rocket,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { filterNavGroups } from "@/lib/admin-nav";
import { portalFeatures } from "@/lib/portal-features";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { useAdminLogout } from "@/lib/use-admin-logout";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badgeKey?: "new-messages";
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    id: "dashboard",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    items: [{ to: "/admin", label: "الرئيسية", icon: LayoutDashboard, exact: true }],
  },
  {
    id: "executive",
    label: "القيادة التنفيذية",
    icon: BarChart3,
    items: [
      { to: "/admin/executive-dashboard", label: "لوحة بيانات الإدارة العليا", icon: BarChart3 },
    ],
  },
  {
    id: "academic",
    label: "الشؤون الأكاديمية",
    icon: GradCap,
    items: [
      { to: "/admin/academic-operations", label: "مركز العمليات الأكاديمية", icon: Activity },
      { to: "/admin/academic-core", label: "البنية الأكاديمية", icon: CalendarRange },
      { to: "/admin/study-plans", label: "الخطط والمقررات", icon: ListTree },
      {
        to: "/admin/course-offerings",
        label: "إسناد المقررات والمجموعات الدراسية",
        icon: CalendarDays,
      },
      { to: "/admin/enrollments", label: "تقسيم المجموعات", icon: ClipboardList },
      { to: "/admin/grades", label: "الدرجات", icon: ClipboardCheck },
      { to: "/admin/transcripts", label: "السجلات الأكاديمية", icon: FileText },
      { to: "/admin/imports", label: "الاستيراد الجماعي", icon: Upload },

      { to: "/admin/student-progress", label: "تقدم الطلاب الأكاديمي", icon: TrendingUp },
      { to: "/admin/at-risk-students", label: "الطلاب المتعثرون أكاديمياً", icon: AlertCircle },
      { to: "/admin/academic-councils", label: "بوابة إدارة المجالس الأكاديمية", icon: ScrollText },
      { to: "/admin/graduation-projects", label: "مشاريع التخرج (عرض فقط)", icon: GradCap },
    ],
  },
  {
    id: "students",
    label: "شؤون الطلاب",
    icon: FileWarning,
    items: [
      { to: "/admin/students", label: "إدارة الطلاب", icon: GraduationCap },
      { to: "/admin/student-requests", label: "طلبات الطلاب", icon: FileWarning },
      { to: "/admin/request-types", label: "أنواع الطلبات", icon: ListChecks },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    icon: UserCog,
    items: [
      { to: "/admin/faculty-management", label: "إدارة أعضاء هيئة التدريس", icon: Users },
      { to: "/admin/staff-management", label: "إدارة الموظفين", icon: UserCog },
      { to: "/admin/faculty", label: "صفحة هيئة التدريس بالموقع", icon: Globe },
    ],
  },
  {
    id: "finance",
    label: "الشؤون المالية",
    icon: Wallet,
    items: [{ to: "/admin/finance", label: "الرسوم والمدفوعات", icon: Wallet }],
  },
  {
    id: "documents",
    label: "الوثائق الرسمية",
    icon: FileBadge,
    items: [{ to: "/admin/documents", label: "جميع الوثائق", icon: FileText }],
  },
  {
    id: "communications",
    label: "الاتصالات",
    icon: Megaphone,
    items: [
      { to: "/admin/communications", label: "مركز الاتصالات", icon: Megaphone },
      { to: "/messages", label: "صندوق الرسائل", icon: MessageSquare },
    ],
  },
  {
    id: "automation",
    label: "الأتمتة",
    icon: Activity,
    items: [{ to: "/admin/automation", label: "مركز الأتمتة الأكاديمية", icon: Activity }],
  },
  {
    id: "reports",
    label: "التقارير والتحليلات",
    icon: BarChart3,
    items: [{ to: "/admin/reports", label: "التقارير", icon: BarChart3 }],
  },
  {
    id: "site",
    label: "إدارة الموقع",
    icon: Globe,
    items: [
      { to: "/admin/news", label: "الأخبار", icon: Newspaper },
      { to: "/admin/events", label: "الفعاليات", icon: Calendar },
      { to: "/admin/research", label: "الأبحاث", icon: FlaskConical },
      { to: "/admin/departments", label: "الأقسام والبرامج", icon: BookOpen },
      { to: "/admin/contacts", label: "الرسائل", icon: MessageSquare, badgeKey: "new-messages" },
      { to: "/admin/settings", label: "الإعدادات", icon: Settings },
    ],
  },
  {
    id: "system",
    label: "النظام والرقابة",
    icon: ShieldCheck,
    items: [
      { to: "/admin/audit-log", label: "سجل التدقيق", icon: ScrollText },
      { to: "/admin/users", label: "المستخدمون والصلاحيات", icon: UserCog },
      { to: "/admin/roles", label: "إدارة الأدوار", icon: ShieldCheck },
      { to: "/admin/user-roles", label: "ربط الأدوار بالمستخدمين", icon: UserCog },
      { to: "/admin/organizational-structure", label: "الهيكل التنظيمي", icon: ListTree },
      { to: "/admin/processing-assignments", label: "ممثلو أدوار الطلبات", icon: UserCog },
      { to: "/admin/security-status", label: "حالة التأمين", icon: Lock },
      { to: "/admin/operations", label: "مركز العمليات", icon: Activity },
      { to: "/admin/pilot-center", label: "إدارة التشغيل التجريبي", icon: Rocket },
      { to: "/admin/backup-status", label: "النسخ الاحتياطي", icon: Database },
      { to: "/admin/system-readiness", label: "جاهزية النظام", icon: ShieldCheck },
    ],
  },
];

function isItemActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
}

export function AdminShell({
  children,
  userEmail,
  userRoles,
}: {
  children: React.ReactNode;
  userEmail: string;
  userRoles: string[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logout = useAdminLogout();

  const visibleGroups = useMemo(
    () =>
      filterNavGroups(
        portalFeatures.adminFinance ? groups : groups.filter((g) => g.id !== "finance"),
        userRoles,
      ),
    [userRoles],
  );

  const activeGroupId = useMemo(() => {
    const g = visibleGroups.find((g) => g.items.some((it) => isItemActive(pathname, it)));
    return g?.id ?? "dashboard";
  }, [pathname, visibleGroups]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [activeGroupId]: true,
  }));

  // Keep the active group open whenever route changes.
  useEffect(() => {
    setOpenGroups((prev) => ({ ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  const { data: newMessagesCount = 0 } = useQuery({
    queryKey: ["sidebar-new-messages"],
    queryFn: async () => {
      const { count } = await supabase
        .from("contact_messages")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Move focus into the sidebar when it opens on mobile.
  useEffect(() => {
    if (mobileOpen) closeButtonRef.current?.focus();
  }, [mobileOpen]);

  // Escape closes the mobile sidebar and returns focus to the menu button.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleGroup = (id: string) => setOpenGroups((p) => ({ ...p, [id]: !p[id] }));

  // Breadcrumb derived from the nav config: «لوحة الإدارة / المجموعة / الصفحة».
  // Null on the admin home itself (a single crumb adds nothing).
  const breadcrumb = useMemo(() => {
    for (const g of visibleGroups) {
      for (const it of g.items) {
        if (isItemActive(pathname, it)) {
          if (it.to === "/admin") return null;
          return { group: g.label, page: it.label };
        }
      }
    }
    return null;
  }, [pathname, visibleGroups]);

  return (
    <div dir="rtl" className="min-h-screen bg-surface flex">
      <aside
        id="admin-sidebar"
        className={cn(
          "fixed lg:sticky top-0 right-0 z-40 h-screen w-72 shrink-0 flex flex-col text-primary-foreground transition-transform duration-300",
          "bg-primary-deep",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-gold">لوحة الإدارة</div>
            <div className="text-[11px] text-primary-foreground/60">كلية تكنولوجيا المعلومات</div>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق القائمة"
            className="lg:hidden ms-auto rounded-md p-2 text-primary-foreground/80 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <nav aria-label="التنقل الرئيسي" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = !!openGroups[group.id];
            const isActiveGroup = activeGroupId === group.id;
            // Single-item dashboard group: render as a flat link
            if (group.items.length === 1 && group.id === "dashboard") {
              const item = group.items[0];
              const active = isItemActive(pathname, item);
              return (
                <Link
                  key={group.id}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    active
                      ? "bg-white/[0.08] text-gold"
                      : "text-primary-foreground/75 hover:text-gold hover:bg-white/[0.04]",
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute right-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-l-full bg-gold-gradient"
                    />
                  )}
                  <GroupIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{group.label}</span>
                  {active && <ChevronLeft className="h-3.5 w-3.5 opacity-70" aria-hidden />}
                </Link>
              );
            }

            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    isActiveGroup
                      ? "text-gold"
                      : "text-primary-foreground/85 hover:text-gold hover:bg-white/[0.04]",
                  )}
                  aria-expanded={isOpen}
                  aria-controls={`admin-nav-group-${group.id}`}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-right">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform opacity-70",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <div
                    id={`admin-nav-group-${group.id}`}
                    className="ps-3 ms-1 border-s border-white/10 space-y-1"
                  >
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(pathname, item);
                      const showBadge = item.badgeKey === "new-messages" && newMessagesCount > 0;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-all",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                            active
                              ? "bg-white/[0.08] text-gold"
                              : "text-primary-foreground/70 hover:text-gold hover:bg-white/[0.04]",
                          )}
                        >
                          {active && (
                            <span
                              aria-hidden
                              className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-gold-gradient"
                            />
                          )}
                          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="flex-1">{item.label}</span>
                          {showBadge && (
                            <span className="grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full bg-gold-gradient text-primary-deep text-[10px] font-extrabold">
                              {newMessagesCount}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-white/10">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-primary-foreground/60 hover:text-gold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <GraduationCap className="h-3.5 w-3.5" aria-hidden /> عرض الموقع العام
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-card border-b border-border h-16 flex items-center px-4 lg:px-8 gap-4">
          <button
            type="button"
            ref={menuButtonRef}
            className="lg:hidden rounded-md p-2 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="flex-1 min-w-0 truncate font-display font-bold text-primary">
            مرحباً بك في لوحة الإدارة
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <NotificationsBell />
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-xs text-muted-foreground">المسؤول</div>
              <div className="text-sm font-bold text-primary truncate max-w-[180px]" dir="ltr">
                {userEmail}
              </div>
            </div>
            <div
              aria-hidden
              className="grid h-9 w-9 place-items-center rounded-full bg-gold-gradient text-primary-deep font-extrabold text-sm"
            >
              {userEmail.charAt(0).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="تسجيل الخروج"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> خروج
            </button>
          </div>
        </header>

        {breadcrumb && (
          <nav aria-label="مسار التنقل" className="border-b border-border bg-background">
            <ol className="flex flex-wrap items-center gap-1 px-4 lg:px-8 py-2 text-xs">
              <li className="flex items-center gap-1">
                <Link
                  to="/admin"
                  className="rounded-sm font-bold text-primary hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  لوحة الإدارة
                </Link>
              </li>
              <li className="flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-muted-foreground">{breadcrumb.group}</span>
              </li>
              <li className="flex items-center gap-1">
                <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span aria-current="page" className="font-bold text-foreground">
                  {breadcrumb.page}
                </span>
              </li>
            </ol>
          </nav>
        )}

        <main className="flex-1 p-4 lg:p-8 bg-background">{children}</main>
      </div>
    </div>
  );
}
