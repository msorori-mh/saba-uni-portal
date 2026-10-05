import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Bell, Home, CalendarClock, ClipboardList, FileText, LayoutGrid, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import collegeLogo from "@/assets/college-logo.jpg";
import { disablePwaInNativeShell } from "@/lib/pwa/native-pwa-cleanup";
import { useNativeAppShell } from "@/hooks/use-native-app-shell";
import { MobileAppLockProvider } from "@/components/mobile/MobileAppLockProvider";
import { clearReportsLocalPreferences } from "@/lib/reports/clear-local-preferences";
import { clearSessionArtifacts } from "@/lib/auth/clear-session-artifacts";
import {
  clearMobileStudentIdentity,
  getMobileSessionUserId,
  getMobileStudentIdentity,
} from "@/lib/mobile/student-identity";
import { MOBILE_QUERY_GC_TIME_MS } from "@/lib/mobile/query-cache";
import { MobileOfflineGate } from "@/components/mobile/MobileOfflineGate";
import { MOBILE_OFFLINE_ENABLED, MOBILE_OFFLINE_WARM_ROUTES } from "@/lib/mobile/offline/config";
import {
  isMobileOnline,
  resolveMobileLaunchConnectivity,
  startMobileConnectivityWatch,
} from "@/lib/mobile/offline/connectivity";
import {
  clearMobileOfflineUserData,
  ensureMobileOfflineHydrated,
  startMobileOfflinePersistence,
} from "@/lib/mobile/offline/query-persistence";
import { readStoredSupabaseSession } from "@/lib/mobile/offline/stored-session";

export const Route = createFileRoute("/mobile/student")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "بوابة الطالب — كلية تكنولوجيا المعلومات وعلوم الحاسوب" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#061F33" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "بوابة الكلية" },
      { name: "application-name", content: "بوابة الكلية" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  beforeLoad: async ({ context }) => {
    // Runs on EVERY navigation inside the app, so it must stay cheap: a local
    // session read plus a cached student-profile check (see student-identity).
    // Data access itself is still enforced server-side by RLS and the RPCs.
    //
    // Offline-first: learn from the service worker whether this launch is
    // offline (memoized, <=300 ms once), then read the session locally — a
    // stored session is never treated as "signed out" because of a network
    // error — and hydrate the student's saved data BEFORE anything renders.
    await resolveMobileLaunchConnectivity();
    const userId = await getMobileSessionUserId();
    if (!userId) {
      throw redirect({ to: "/mobile/student-login" });
    }
    ensureMobileOfflineHydrated(context.queryClient, userId);
    let identity: Awaited<ReturnType<typeof getMobileStudentIdentity>>;
    try {
      identity = await getMobileStudentIdentity();
    } catch {
      // Transient read failure: do not sign the student out; the page's own
      // queries will surface the connection error with a retry.
      return;
    }
    if (!identity) {
      clearMobileStudentIdentity();
      clearMobileOfflineUserData(context.queryClient);
      await supabase.auth.signOut();
      throw redirect({ to: "/mobile/student-login" });
    }
  },
  pendingComponent: MobileStudentLoading,
  pendingMs: 300,
  component: MobileStudentLayout,
});

type ShortProfile = {
  full_name_ar: string | null;
  academic_number: string | null;
};

async function fetchShortProfile(userId: string): Promise<ShortProfile | null> {
  const { data } = await supabase
    .from("student_profiles")
    .select("full_name_ar, academic_number")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as ShortProfile) ?? null;
}

function MobileStudentLayout() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const authUserIdRef = useRef<string | null>(null);

  // Native (Capacitor/Android) app-shell: status bar, splash hide, back button.
  // No-op on the web.
  useNativeAppShell(pathname);

  useEffect(() => {
    let cancelled = false;
    // Removes the portal-wide PWA worker inside the native shell; the mobile
    // offline worker (scope /mobile/) is deliberately kept — see native-pwa-cleanup.
    void disablePwaInNativeShell();
    startMobileConnectivityWatch();
    startMobileOfflinePersistence(queryClient, () => authUserIdRef.current);

    void getMobileSessionUserId().then((userId) => {
      if (cancelled) return;
      authUserIdRef.current = userId;
      setAuthUserId(userId);
      if (!userId) navigate({ to: "/mobile/student-login", replace: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Offline with an expired access token, supabase-js reports a null
      // session (the refresh failed) while the session is still stored on the
      // device. Only an explicit SIGNED_OUT, or a session that is really gone
      // from storage, means the student is signed out.
      const nextUserId =
        session?.user.id ??
        (event === "SIGNED_OUT" ? null : (readStoredSupabaseSession()?.userId ?? null));
      if (authUserIdRef.current && authUserIdRef.current !== nextUserId) {
        clearMobileStudentIdentity();
        // Sign-out from any screen, or another account: nothing persisted survives.
        clearMobileOfflineUserData(queryClient);
        queryClient.clear();
        void router.invalidate();
      }
      authUserIdRef.current = nextUserId;
      setAuthUserId(nextUserId);
      if (!nextUserId) {
        clearMobileOfflineUserData(queryClient);
        navigate({ to: "/mobile/student-login", replace: true });
      }
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, queryClient, router]);

  // Download the code of the offline-capable screens in advance (through the
  // service worker, which stores it), so they open later without a network.
  useEffect(() => {
    if (!MOBILE_OFFLINE_ENABLED || !authUserId) return;
    const timer = setTimeout(() => {
      if (!isMobileOnline()) return;
      for (const to of MOBILE_OFFLINE_WARM_ROUTES) {
        void router.preloadRoute({ to }).catch(() => undefined);
      }
    }, 3_000);
    return () => clearTimeout(timer);
  }, [authUserId, router]);

  const { data: profile } = useQuery({
    queryKey: ["mobile-student", "short-profile", authUserId],
    queryFn: () => fetchShortProfile(authUserId!),
    enabled: Boolean(authUserId),
    staleTime: 5 * 60 * 1000,
    gcTime: MOBILE_QUERY_GC_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const { data: unreadNotifications = 0 } = useQuery({
    queryKey: ["mobile-student", "notifications", "unread-count", authUserId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(authUserId),
    staleTime: 30_000,
    // Badge only: a 2-minute poll halves background traffic; returning to the
    // app still refreshes it immediately through the focus refetch below.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
    gcTime: MOBILE_QUERY_GC_TIME_MS,
  });

  const handleLogout = async () => {
    try {
      clearMobileStudentIdentity();
      // Wipe the persisted student data first: it must be gone even if the
      // remote sign-out below fails (e.g. signing out while offline).
      clearMobileOfflineUserData(queryClient);
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // Never retain the previous student's visible data if remote sign-out fails.
    } finally {
      authUserIdRef.current = null;
      setAuthUserId(null);
      queryClient.clear();
      clearMobileOfflineUserData(queryClient);
      clearReportsLocalPreferences();
      clearSessionArtifacts();
      await router.invalidate();
      navigate({ to: "/mobile/student-login", replace: true });
    }
  };

  const displayName = (profile?.full_name_ar?.trim().split(" ").slice(0, 2).join(" ")) || "الطالب";

  return (
    <MobileAppLockProvider onSignOut={handleLogout}>
    <div
      dir="rtl"
      className="min-h-screen bg-surface flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      {/* Fixed lightweight header */}
      <header className="sticky top-0 z-30 bg-primary-deep text-primary-foreground border-b-2 border-gold/40 shadow-elegant">
        <div className="px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={collegeLogo}
              alt=""
              className="h-9 w-9 rounded-full ring-2 ring-gold/50 object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display text-sm font-extrabold text-gold leading-tight truncate">
                {displayName}
              </div>
              {profile?.academic_number && (
                <div dir="ltr" className="text-[10px] text-primary-foreground/70 font-mono truncate text-right">
                  {profile.academic_number}
                </div>
              )}
            </div>
          </div>

          <Link
            to="/mobile/student/notifications"
            aria-label={unreadNotifications > 0 ? `الإشعارات، ${unreadNotifications} غير مقروءة` : "الإشعارات"}
            className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/40 text-gold transition-colors hover:bg-gold hover:text-primary-deep"
          >
            <Bell className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span
                aria-hidden="true"
                className="absolute -left-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-extrabold leading-none text-destructive-foreground ring-2 ring-primary-deep"
              >
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </Link>
        </div>
      </header>

      <main
        className="flex-1 w-full max-w-screen-sm mx-auto"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        }}
      >
        <MobileOfflineGate pathname={pathname}>
          <Outlet />
        </MobileOfflineGate>
      </main>

      <MobileBottomNav />
    </div>
    </MobileAppLockProvider>
  );
}

type NavItem = {
  label: string;
  icon: typeof Home;
  to: string | null; // null = coming soon
};

const NAV_ITEMS: NavItem[] = [
  { label: "الرئيسية", icon: Home, to: "/mobile/student" },
  { label: "الجدول", icon: CalendarClock, to: "/mobile/student/schedule" },
  { label: "الخدمات الطلابية", icon: ClipboardList, to: "/mobile/student/requests" },
  { label: "الوثائق", icon: FileText, to: "/mobile/student/documents" },
  { label: "المزيد", icon: LayoutGrid, to: "/mobile/student/more" },
];

function MobileBottomNav() {
  const location = useLocation();
  const current = location.pathname;

  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 bottom-0 z-40 bg-card border-t-2 border-gold/30 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <ul className="max-w-screen-sm mx-auto grid grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.to !== null && (current === item.to || current === item.to + "/");
          const disabled = item.to === null;

          const inner = (
            <div
              className={[
                "flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.25rem] text-[10px] font-bold transition-colors",
                active
                  ? "text-primary"
                  : disabled
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground hover:text-primary",
              ].join(" ")}
            >
              <Icon className={`h-5 w-5 ${active ? "text-gold" : ""}`} />
              <span className="px-0.5 text-center leading-tight">{item.label}</span>
              {disabled && (
                <span className="text-[8px] font-bold text-gold/80 leading-none">قريباً</span>
              )}
            </div>
          );

          return (
            <li key={item.label} className="text-center">
              {disabled ? (
                <button
                  type="button"
                  disabled
                  aria-label={`${item.label} (قريباً)`}
                  className="w-full cursor-not-allowed opacity-80"
                >
                  {inner}
                </button>
              ) : (
                <Link to={item.to!} aria-current={active ? "page" : undefined} className="block">
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Re-export the loading state for nested suspense scenarios
export function MobileStudentLoading() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <Loader2 className="h-7 w-7 animate-spin text-primary" />
    </div>
  );
}
