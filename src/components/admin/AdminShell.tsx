import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Newspaper, Users, BookOpen, FlaskConical, Calendar,
  MessageSquare, Settings, LogOut, Menu, GraduationCap, ChevronLeft, ChevronDown,
  CalendarRange, ListTree, CalendarDays, ClipboardList, ClipboardCheck, FileText,
  FileWarning, ListChecks, GraduationCap as GradCap, UserCog, Globe, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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
    items: [
      { to: "/admin", label: "الرئيسية", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    id: "academic",
    label: "الشؤون الأكاديمية",
    icon: GradCap,
    items: [
      { to: "/admin/academic-core", label: "البنية الأكاديمية", icon: CalendarRange },
      { to: "/admin/study-plans", label: "الخطط والمقررات", icon: ListTree },
      { to: "/admin/course-offerings", label: "الطرح والشعب", icon: CalendarDays },
      { to: "/admin/enrollments", label: "تسجيل الطلاب", icon: ClipboardList },
      { to: "/admin/grades", label: "الدرجات", icon: ClipboardCheck },
      { to: "/admin/transcripts", label: "السجلات الأكاديمية", icon: FileText },
    ],
  },
  {
    id: "students",
    label: "شؤون الطلاب",
    icon: FileWarning,
    items: [
      { to: "/admin/student-requests", label: "طلبات الطلاب", icon: FileWarning },
      { to: "/admin/request-types", label: "أنواع الطلبات", icon: ListChecks },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    icon: UserCog,
    items: [
      { to: "/admin/faculty", label: "أعضاء هيئة التدريس", icon: Users },
    ],
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
];

function isItemActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(item.to + "/");
}

export function AdminShell({ children, userEmail }: { children: React.ReactNode; userEmail: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const activeGroupId = useMemo(() => {
    const g = groups.find((g) => g.items.some((it) => isItemActive(pathname, it)));
    return g?.id ?? "dashboard";
  }, [pathname]);

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

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/admin/login", replace: true });
  };

  const toggleGroup = (id: string) =>
    setOpenGroups((p) => ({ ...p, [id]: !p[id] }));

  return (
    <div dir="rtl" className="min-h-screen bg-surface flex">
      <aside
        className={cn(
          "fixed lg:sticky top-0 right-0 z-40 h-screen w-72 shrink-0 flex flex-col text-primary-foreground transition-transform duration-300",
          "bg-[oklch(0.22_0.07_255)]",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-6 py-5 border-b border-white/10 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-extrabold text-gold">لوحة الإدارة</div>
            <div className="text-[11px] text-primary-foreground/60">كلية تكنولوجيا المعلومات</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {groups.map((group) => {
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
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-all",
                    active
                      ? "bg-white/[0.08] text-gold"
                      : "text-primary-foreground/75 hover:text-gold hover:bg-white/[0.04]",
                  )}
                >
                  {active && <span className="absolute right-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-l-full bg-gold-gradient" />}
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{group.label}</span>
                  {active && <ChevronLeft className="h-3.5 w-3.5 opacity-70" />}
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
                    isActiveGroup
                      ? "text-gold"
                      : "text-primary-foreground/85 hover:text-gold hover:bg-white/[0.04]",
                  )}
                  aria-expanded={isOpen}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-right">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 transition-transform opacity-70",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                  />
                </button>
                {isOpen && (
                  <div className="pr-3 mr-1 border-r border-white/10 space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isItemActive(pathname, item);
                      const showBadge = item.badgeKey === "new-messages" && newMessagesCount > 0;
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={cn(
                            "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-semibold transition-all",
                            active
                              ? "bg-white/[0.08] text-gold"
                              : "text-primary-foreground/70 hover:text-gold hover:bg-white/[0.04]",
                          )}
                        >
                          {active && <span className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-gold-gradient" />}
                          <Icon className="h-3.5 w-3.5 shrink-0" />
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
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-primary-foreground/60 hover:text-gold hover:bg-white/5"
          >
            <GraduationCap className="h-3.5 w-3.5" /> عرض الموقع العام
          </Link>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-20 bg-card border-b border-border h-16 flex items-center px-4 lg:px-8 gap-4">
          <button
            className="lg:hidden p-2 text-primary"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 font-display font-bold text-primary">
            مرحباً بك في لوحة الإدارة
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-left leading-tight">
              <div className="text-xs text-muted-foreground">المسؤول</div>
              <div className="text-sm font-bold text-primary truncate max-w-[180px]" dir="ltr">{userEmail}</div>
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gold-gradient text-primary-deep font-extrabold text-sm">
              {userEmail.charAt(0).toUpperCase()}
            </div>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> خروج
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8 bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
