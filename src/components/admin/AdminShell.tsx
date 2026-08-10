import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronDown,
  GraduationCap,
  LogOut,
  Menu,
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
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_SEARCH_PLACEHOLDER,
  applyAdminFinanceNavGate,
  findActiveAdminNavGroupId,
  isAdminNavItemActive,
  searchAdminNav,
  searchMatchingGroupIds,
  toggleExclusiveGroup,
  type AdminNavGroup,
  type AdminNavItem,
} from "@/lib/admin-navigation-config";

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
  const [searchQuery, setSearchQuery] = useState("");
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const logout = useAdminLogout();

  // Role filtering is authoritative — search runs only on visibleGroups afterward.
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

  // Keep the active group open whenever route changes; clearing search restores this.
  useEffect(() => {
    if (!searchQuery.trim()) {
      setExpandedGroupId(activeGroupId);
    }
  }, [activeGroupId, searchQuery]);

  const searching = searchQuery.trim().length > 0;
  const searchHits = useMemo(
    () => searchAdminNav(visibleGroups, searchQuery),
    [visibleGroups, searchQuery],
  );
  const searchOpenGroupIds = useMemo(
    () => (searching ? searchMatchingGroupIds(visibleGroups, searchQuery) : null),
    [searching, visibleGroups, searchQuery],
  );

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

  // Escape: clear search first when focused/searching; otherwise close mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (searchQuery) {
          e.stopPropagation();
          setSearchQuery("");
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

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setSearchQuery("");
    }
  };

  const isGroupOpen = (groupId: string) => {
    if (searchOpenGroupIds) return searchOpenGroupIds.has(groupId);
    return expandedGroupId === groupId;
  };

  const onToggleGroup = (groupId: string) => {
    if (searching) return;
    setExpandedGroupId((prev) => toggleExclusiveGroup(prev, groupId));
  };

  // Breadcrumb derived from the nav config: «لوحة الإدارة / المجموعة / الصفحة».
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

  const renderItemLink = (item: AdminNavItem) => {
    const Icon = item.icon;
    const active = isAdminNavItemActive(pathname, item);
    const showBadge = item.badgeKey === "new-messages" && newMessagesCount > 0;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-semibold transition-all min-h-10",
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
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1 leading-snug break-words">{item.label}</span>
        {showBadge && (
          <span className="grid place-items-center min-w-[20px] h-5 px-1.5 rounded-full bg-gold-gradient text-primary-deep text-[11px] font-extrabold">
            {newMessagesCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-surface flex">
      <aside
        id="admin-sidebar"
        className={cn(
          "fixed lg:sticky top-0 right-0 z-40 h-screen w-80 max-w-[94vw] shrink-0 flex flex-col text-primary-foreground transition-transform duration-300",
          "bg-primary-deep",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-4 py-4 border-b border-white/10 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep shrink-0">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <div className="leading-tight min-w-0 flex-1">
            <div className="font-display font-extrabold text-gold text-base sm:text-lg">
              لوحة الإدارة
            </div>
            <div className="text-xs text-primary-foreground/60">كلية تكنولوجيا المعلومات</div>
          </div>
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

        <div className="px-3 pt-3 pb-2 border-b border-white/10">
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
              aria-label={ADMIN_NAV_SEARCH_PLACEHOLDER}
              autoComplete="off"
              className={cn(
                "w-full min-h-11 rounded-md border border-white/15 bg-white/[0.06] pe-9 ps-9",
                "text-sm text-primary-foreground placeholder:text-primary-foreground/45",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold",
              )}
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  searchInputRef.current?.focus();
                }}
                aria-label="مسح البحث"
                className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 min-h-9 min-w-9 text-primary-foreground/70 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
          {searching ? (
            <p className="mt-1.5 text-xs text-primary-foreground/55" aria-live="polite">
              {searchHits.length === 0
                ? "لا توجد نتائج في الخدمات المتاحة لك"
                : `${searchHits.length.toLocaleString("ar-EG")} نتيجة`}
            </p>
          ) : null}
        </div>

        <nav aria-label="التنقل الرئيسي" className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
          {visibleGroups.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = isGroupOpen(group.id);
            const isActiveGroup = activeGroupId === group.id;

            // Single-item dashboard group: render as a flat link
            if (group.items.length === 1 && group.id === "dashboard") {
              const item = group.items[0];
              const active = isAdminNavItemActive(pathname, item);
              return (
                <Link
                  key={group.id}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-bold transition-all min-h-10",
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
              <div key={group.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => onToggleGroup(group.id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md px-3 py-2 text-[15px] font-bold transition-all min-h-10",
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
                      "h-4 w-4 transition-transform opacity-70 shrink-0",
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
                    {group.items
                      .filter((item) => {
                        if (!searching) return true;
                        return searchHits.some((h) => h.item.to === item.to);
                      })
                      .map((item) => renderItemLink(item))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div
          data-testid="admin-sidebar-footer"
          className="px-3 py-3 border-t border-white/10 shrink-0"
        >
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-primary-foreground/60 hover:text-gold hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold min-h-10"
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
            className="lg:hidden rounded-md p-2 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11 min-w-11"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
            aria-expanded={mobileOpen}
            aria-controls="admin-sidebar"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <PageBackButton className="border-border text-primary hover:bg-accent" />

          <div className="flex-1 min-w-0 truncate font-display font-bold text-primary text-sm sm:text-base">
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
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-destructive transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-10"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden /> خروج
            </button>
          </div>
        </header>

        {breadcrumb && (
          <nav aria-label="مسار التنقل" className="border-b border-border bg-background">
            <ol className="flex flex-wrap items-center gap-1 px-4 lg:px-8 py-2 text-[13px]">
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
