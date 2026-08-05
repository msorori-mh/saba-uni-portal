import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronLeft,
  GraduationCap,
  LogOut,
  Menu,
  PanelRightClose,
  PanelRightOpen,
  Search,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { filterNavGroups } from "@/lib/admin-nav";
import { portalFeatures } from "@/lib/portal-features";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { useAdminLogout } from "@/lib/use-admin-logout";
import {
  ADMIN_NAV_FREQUENT_LABEL,
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_SEARCH_PLACEHOLDER,
  applyAdminFinanceNavGate,
  findActiveAdminNavGroupId,
  frequentAdminNavItems,
  isAdminNavItemActive,
  searchAdminNav,
  toggleExclusiveGroup,
  type AdminNavGroup,
  type AdminNavItem,
} from "@/lib/admin-navigation-config";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHighlight, setSearchHighlight] = useState(0);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const logout = useAdminLogout();

  const visibleGroups = useMemo(
    () =>
      filterNavGroups(
        applyAdminFinanceNavGate(ADMIN_NAV_GROUPS, portalFeatures.adminFinance),
        userRoles,
      ) as AdminNavGroup[],
    [userRoles],
  );

  const activeGroupId = useMemo(
    () => findActiveAdminNavGroupId(visibleGroups, pathname) ?? "dashboard",
    [pathname, visibleGroups],
  );

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(activeGroupId);

  useEffect(() => {
    setExpandedGroupId(activeGroupId);
  }, [activeGroupId]);

  const frequentItems = useMemo(
    () => frequentAdminNavItems(visibleGroups),
    [visibleGroups],
  );

  const searchHits = useMemo(
    () => searchAdminNav(visibleGroups, searchQuery),
    [visibleGroups, searchQuery],
  );

  const searching = searchQuery.trim().length > 0;

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

  useEffect(() => {
    if (mobileOpen) closeButtonRef.current?.focus();
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchQuery) {
          e.stopPropagation();
          setSearchQuery("");
          setSearchHighlight(0);
          searchInputRef.current?.focus();
          return;
        }
        e.stopPropagation();
        setMobileOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, searchQuery]);

  useEffect(() => {
    setSearchHighlight(0);
  }, [searchQuery]);

  const openSearchResult = (item: AdminNavItem) => {
    setSearchQuery("");
    setSearchHighlight(0);
    setMobileOpen(false);
    void navigate({ to: item.to });
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setSearchQuery("");
      setSearchHighlight(0);
      return;
    }
    if (!searching || searchHits.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSearchHighlight((i) => (i + 1) % searchHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSearchHighlight((i) => (i - 1 + searchHits.length) % searchHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = searchHits[searchHighlight] ?? searchHits[0];
      if (hit) openSearchResult(hit.item);
    }
  };

  const breadcrumb = useMemo(() => {
    for (const g of visibleGroups) {
      for (const it of g.items) {
        if (isAdminNavItemActive(pathname, it)) {
          if (it.to === "/admin") return null;
          return { group: g.label, page: it.label };
        }
      }
    }
    return null;
  }, [pathname, visibleGroups]);

  const collapsed = desktopCollapsed && !mobileOpen;

  const renderNavLink = (item: AdminNavItem, opts?: { compact?: boolean }) => {
    const active = isAdminNavItemActive(pathname, item);
    const showBadge = item.badgeKey === "new-messages" && newMessagesCount > 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        onClick={() => setMobileOpen(false)}
        className={cn(
          "group relative flex items-center gap-2 rounded-md px-3 text-[13px] font-semibold transition-all break-words",
          "min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
          opts?.compact ? "py-2" : "py-2.5",
          active
            ? "bg-white/[0.08] text-gold"
            : "text-primary-foreground/65 hover:text-gold hover:bg-white/[0.04]",
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute right-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-l-full bg-gold-gradient"
          />
        )}
        <span className="flex-1 leading-snug">{item.label}</span>
        {showBadge && (
          <span className="grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full bg-gold-gradient text-primary-deep text-[10px] font-extrabold">
            {newMessagesCount}
          </span>
        )}
      </Link>
    );
  };

  const sidebarBody = (
    <>
      <div
        className={cn(
          "border-b border-white/10 flex items-center gap-3",
          collapsed ? "px-2 py-4 justify-center" : "px-4 py-5",
        )}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </div>
        {!collapsed && (
          <div className="leading-tight min-w-0 flex-1">
            <div className="font-display font-extrabold text-gold">لوحة الإدارة</div>
            <div className="text-[11px] text-primary-foreground/60">كلية تكنولوجيا المعلومات</div>
          </div>
        )}
        <button
          type="button"
          ref={closeButtonRef}
          onClick={() => setMobileOpen(false)}
          aria-label="إغلاق القائمة"
          className="lg:hidden ms-auto rounded-md p-2 min-h-11 min-w-11 text-primary-foreground/80 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {!collapsed && (
        <div className="px-3 pt-3 pb-2 space-y-3 border-b border-white/10">
          <label className="sr-only" htmlFor="admin-nav-search">
            {ADMIN_NAV_SEARCH_PLACEHOLDER}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-foreground/45"
              aria-hidden
            />
            <input
              id="admin-nav-search"
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={ADMIN_NAV_SEARCH_PLACEHOLDER}
              autoComplete="off"
              className="w-full min-h-11 rounded-md border border-white/10 bg-white/5 pe-3 ps-9 text-sm text-primary-foreground placeholder:text-primary-foreground/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
          </div>

          {!searching && frequentItems.length > 0 && (
            <div>
              <div className="px-1 mb-1.5 text-[11px] font-bold text-primary-foreground/50">
                {ADMIN_NAV_FREQUENT_LABEL}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {frequentItems.map((item) => {
                  const active = isAdminNavItemActive(pathname, item);
                  return (
                    <Link
                      key={`freq-${item.to}`}
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "rounded-md px-2.5 py-1.5 text-[11px] font-semibold min-h-9 inline-flex items-center",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                        active
                          ? "bg-white/15 text-gold"
                          : "bg-white/[0.06] text-primary-foreground/75 hover:text-gold",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <nav
        aria-label="التنقل الرئيسي"
        className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden",
          collapsed ? "px-1.5 py-3 space-y-1" : "px-3 py-3 space-y-1",
        )}
      >
        {searching && !collapsed ? (
          <div className="space-y-3" role="listbox" aria-label="نتائج البحث">
            {searchHits.length === 0 ? (
              <p className="px-2 py-3 text-xs text-primary-foreground/55">لا توجد نتائج.</p>
            ) : (
              Object.entries(
                searchHits.reduce<Record<string, typeof searchHits>>((acc, hit) => {
                  (acc[hit.groupLabel] ??= []).push(hit);
                  return acc;
                }, {}),
              ).map(([groupLabel, hits]) => (
                <div key={groupLabel} className="space-y-1">
                  <div className="px-2 text-[11px] font-bold text-primary-foreground/50">
                    {groupLabel}
                  </div>
                  {hits.map((hit) => {
                    const idx = searchHits.indexOf(hit);
                    const active = isAdminNavItemActive(pathname, hit.item);
                    return (
                      <button
                        key={hit.item.to}
                        type="button"
                        role="option"
                        aria-selected={idx === searchHighlight}
                        onClick={() => openSearchResult(hit.item)}
                        className={cn(
                          "w-full text-right rounded-md px-3 py-2.5 min-h-11 text-[13px] font-semibold break-words",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                          idx === searchHighlight || active
                            ? "bg-white/[0.1] text-gold"
                            : "text-primary-foreground/70 hover:bg-white/[0.04] hover:text-gold",
                        )}
                      >
                        {hit.item.label}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        ) : collapsed ? (
          <TooltipProvider delayDuration={200}>
            {visibleGroups.map((group) => {
              const GroupIcon = group.icon;
              const isActiveGroup = activeGroupId === group.id;
              return (
                <Tooltip key={group.id}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={group.label}
                      aria-expanded={false}
                      onClick={() => {
                        setDesktopCollapsed(false);
                        setExpandedGroupId(group.id);
                      }}
                      className={cn(
                        "mx-auto flex h-11 w-11 items-center justify-center rounded-md",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                        isActiveGroup
                          ? "bg-white/[0.1] text-gold"
                          : "text-primary-foreground/75 hover:text-gold hover:bg-white/[0.04]",
                      )}
                    >
                      <GroupIcon className="h-4 w-4" aria-hidden />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[14rem]">
                    {group.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>
        ) : (
          visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = expandedGroupId === group.id;
            const isActiveGroup = activeGroupId === group.id;
            return (
              <div key={group.id} className="space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroupId((prev) => toggleExclusiveGroup(prev, group.id))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedGroupId((prev) => toggleExclusiveGroup(prev, group.id));
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md px-3 py-2.5 min-h-11 text-sm font-bold transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    isActiveGroup
                      ? "text-gold"
                      : "text-primary-foreground/85 hover:text-gold hover:bg-white/[0.04]",
                  )}
                  aria-expanded={isOpen}
                  aria-controls={`admin-nav-group-${group.id}`}
                >
                  <GroupIcon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1 text-right leading-snug break-words">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform opacity-70",
                      isOpen ? "rotate-180" : "rotate-0",
                    )}
                    aria-hidden
                  />
                </button>
                {isOpen && (
                  <div
                    id={`admin-nav-group-${group.id}`}
                    className="ps-3 ms-1 border-s border-white/10 space-y-0.5"
                  >
                    {group.items.map((item) => renderNavLink(item, { compact: true }))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      <div
        data-testid="admin-sidebar-footer"
        className={cn(
          "shrink-0 border-t border-white/10 space-y-1",
          collapsed ? "px-1.5 py-3" : "px-3 py-3",
        )}
      >
        {!collapsed && (
          <>
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 min-h-11 text-xs text-primary-foreground/60 hover:text-gold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <GraduationCap className="h-3.5 w-3.5 shrink-0" aria-hidden /> عرض الموقع العام
            </Link>
            <div className="flex items-center gap-2 rounded-md px-3 py-2 min-h-11">
              <div
                aria-hidden
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gold-gradient text-primary-deep font-extrabold text-xs"
              >
                {userEmail.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[11px] text-primary-foreground/50">المسؤول</div>
                <div className="text-xs font-bold text-primary-foreground/85 truncate" dir="ltr">
                  {userEmail}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              aria-label="تسجيل الخروج"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 min-h-11 text-xs font-bold text-destructive-foreground/90 bg-white/5 hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> تسجيل الخروج
            </button>
          </>
        )}
        <button
          type="button"
          className={cn(
            "hidden lg:flex items-center gap-2 rounded-md px-3 py-2.5 min-h-11 text-xs text-primary-foreground/60 hover:text-gold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
            collapsed && "mx-auto w-11 justify-center px-0",
          )}
          aria-label={desktopCollapsed ? "توسيع القائمة" : "طي القائمة"}
          aria-pressed={desktopCollapsed}
          onClick={() => setDesktopCollapsed((v) => !v)}
        >
          {desktopCollapsed ? (
            <PanelRightOpen className="h-4 w-4" aria-hidden />
          ) : (
            <>
              <PanelRightClose className="h-4 w-4" aria-hidden />
              <span>طي القائمة</span>
            </>
          )}
        </button>
      </div>
    </>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-surface flex">
      <aside
        id="admin-sidebar"
        className={cn(
          "fixed lg:sticky top-0 right-0 z-40 h-screen shrink-0 flex flex-col text-primary-foreground transition-[transform,width] duration-300",
          "bg-primary-deep max-w-[min(94vw,20rem)]",
          collapsed ? "w-16" : "w-72",
          mobileOpen ? "translate-x-0 w-[min(94vw,20rem)]" : "translate-x-full lg:translate-x-0",
        )}
      >
        {sidebarBody}
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
            className="lg:hidden rounded-md p-2 min-h-11 min-w-11 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 min-h-11 text-xs font-bold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
