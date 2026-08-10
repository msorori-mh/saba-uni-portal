import { useEffect, useSyncExternalStore } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * Landing/home screens of each portal: they have no meaningful "back" target,
 * so the back affordance is hidden there.
 */
const HOME_PATHS = new Set([
  "/",
  "/admin",
  "/admin/login",
  "/student",
  "/student/",
  "/staff",
  "/staff/",
  "/faculty-portal",
  "/faculty-portal/",
  "/mobile/student",
  "/mobile/student/",
  "/portal-login",
  "/login",
]);

function normalize(pathname: string) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** Fallback destination when there is no in-app history to pop. */
export function backFallbackPath(pathname: string): string {
  if (pathname.startsWith("/admin")) return "/admin";
  if (pathname.startsWith("/mobile/student")) return "/mobile/student";
  if (pathname.startsWith("/student")) return "/student";
  if (pathname.startsWith("/staff")) return "/staff";
  if (pathname.startsWith("/faculty-portal")) return "/faculty-portal";
  return "/";
}

export function shouldShowBackButton(pathname: string): boolean {
  return !HOME_PATHS.has(normalize(pathname));
}

/* --- registry so the floating button steps aside when a shell renders one --- */

let inlineCount = 0;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function hasInline() {
  return inlineCount > 0;
}

function useRegisterInlineBackButton(active: boolean) {
  useEffect(() => {
    if (!active) return;
    inlineCount += 1;
    emit();
    return () => {
      inlineCount -= 1;
      emit();
    };
  }, [active]);
}

export function useHasInlineBackButton() {
  return useSyncExternalStore(subscribe, hasInline, () => false);
}

function useGoBack() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return () => {
    const canGoBack = typeof window !== "undefined" && window.history.length > 1;
    if (canGoBack) {
      router.history.back();
      return;
    }
    void router.navigate({ to: backFallbackPath(pathname) });
  };
}

/** Inline back button, meant for page/portal headers. */
export function PageBackButton({ className, label = "رجوع" }: { className?: string; label?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const show = shouldShowBackButton(pathname);
  const goBack = useGoBack();
  useRegisterInlineBackButton(show);

  if (!show) return null;

  return (
    <button
      type="button"
      onClick={goBack}
      data-testid="page-back-button"
      aria-label="الرجوع للصفحة السابقة"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-current/30 px-3 py-2 text-sm font-bold transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-10",
        className,
      )}
    >
      <ArrowRight className="h-4 w-4" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

/**
 * Floating back button rendered once at the app root. It hides itself on home
 * screens and whenever a shell already shows an inline back button.
 */
export function GlobalBackButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inline = useHasInlineBackButton();
  const goBack = useGoBack();

  if (inline || !shouldShowBackButton(pathname)) return null;

  return (
    <button
      type="button"
      onClick={goBack}
      data-testid="global-back-button"
      aria-label="الرجوع للصفحة السابقة"
      className="fixed bottom-24 left-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-primary-deep/95 px-4 py-2.5 text-sm font-bold text-gold shadow-elegant backdrop-blur transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 md:bottom-6 print:hidden"
    >
      <ArrowRight className="h-4 w-4" aria-hidden />
      <span>رجوع</span>
    </button>
  );
}
