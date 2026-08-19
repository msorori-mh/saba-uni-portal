import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Home, CalendarClock, ClipboardList, FileText, LayoutGrid, LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import collegeLogo from "@/assets/college-logo.jpg";
import { disablePwaInNativeShell } from "@/lib/pwa/native-pwa-cleanup";
import { useNativeAppShell } from "@/hooks/use-native-app-shell";
import { MobileAppLockProvider } from "@/components/mobile/MobileAppLockProvider";
import { clearReportsLocalPreferences } from "@/lib/reports/clear-local-preferences";
import { clearSessionArtifacts } from "@/lib/auth/clear-session-artifacts";

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
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/mobile/student-login" });
    }
    const { data: profile } = await supabase
      .from("student_profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (!profile) {
      await supabase.auth.signOut();
      throw redirect({ to: "/mobile/student-login" });
    }
  },
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

  // Native (Capacitor/Android) app-shell: status bar, splash hide, back button.
  // No-op on the web.
  useNativeAppShell(pathname);

  useEffect(() => {
    let cancelled = false;
    void disablePwaInNativeShell();

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setAuthUserId(data.user?.id ?? null);
      if (!data.user) navigate({ to: "/mobile/student-login", replace: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const nextUserId = session?.user.id ?? null;
      setAuthUserId((currentUserId) => {
        if (currentUserId && currentUserId !== nextUserId) {
          queryClient.clear();
          void router.invalidate();
        }
        return nextUserId;
      });
      if (!session) navigate({ to: "/mobile/student-login", replace: true });
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate, queryClient, router]);

  const { data: profile } = useQuery({
    queryKey: ["mobile-student", "short-profile", authUserId],
    queryFn: () => fetchShortProfile(authUserId!),
    enabled: Boolean(authUserId),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      // Never retain the previous student's visible data if remote sign-out fails.
    } finally {
      setAuthUserId(null);
      queryClient.clear();
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

          <button
            onClick={handleLogout}
            aria-label="تسجيل الخروج"
            className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 px-3 py-1.5 text-xs font-bold text-gold hover:bg-gold hover:text-primary-deep transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> خروج
          </button>
        </div>
      </header>

      <main
        className="flex-1 w-full max-w-screen-sm mx-auto"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        }}
      >
        <Outlet />
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
  { label: "الطلبات", icon: ClipboardList, to: "/mobile/student/requests" },
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
              <span className="leading-none">{item.label}</span>
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
