import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { CloudOff, Loader2, WifiOff } from "lucide-react";
import { classifyMobileOfflineScreen } from "@/lib/mobile/offline/config";
import {
  isMobileOnline,
  probeMobileConnectivity,
  subscribeMobileOnline,
} from "@/lib/mobile/offline/connectivity";
import {
  getMobileOfflineLastUpdated,
  hasMobileOfflineData,
} from "@/lib/mobile/offline/query-persistence";

/** «آخر تحديث» in Arabic with Latin digits, e.g. "٦ أكتوبر، 9:41 م" → "6 أكتوبر، 9:41 م". */
export function formatMobileOfflineTimestamp(timestamp: number | null): string {
  if (!timestamp) return "غير معروف";
  try {
    return new Intl.DateTimeFormat("ar-u-nu-latn", {
      day: "numeric",
      month: "long",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function useMobileOnline(): boolean {
  return useSyncExternalStore(subscribeMobileOnline, isMobileOnline, () => true);
}

function RetryButton() {
  const [checking, setChecking] = useState(false);
  return (
    <button
      type="button"
      disabled={checking}
      onClick={() => {
        setChecking(true);
        void probeMobileConnectivity({ force: true }).finally(() => setChecking(false));
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-primary/40 bg-card px-4 text-xs font-bold text-primary disabled:opacity-50"
    >
      {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      إعادة المحاولة
    </button>
  );
}

function NeedsInternet({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-4 py-10" data-testid="mobile-offline-needs-internet">
      <div
        role="status"
        className="rounded-2xl border border-dashed border-border bg-card p-6 text-center space-y-3"
      >
        <WifiOff className="mx-auto h-8 w-8 text-muted-foreground/70" aria-hidden />
        <p className="text-sm font-extrabold text-primary">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
        <RetryButton />
      </div>
    </div>
  );
}

function OfflineNotice({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="mobile-offline-notice"
      className="flex items-center gap-2 border-b border-gold/40 bg-gold/15 px-4 py-2 text-[11px] font-bold text-primary-deep"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/**
 * Wraps the mobile screens (inside the app lock, so nothing here is visible
 * while the app is locked):
 *  - online: renders the screen untouched;
 *  - offline + offline-capable screen: the screen with its saved data and a
 *    small notice with the time of the last update;
 *  - offline + a screen that needs the network (or has nothing saved yet): a
 *    friendly message instead of a spinner or an error.
 *
 * A screen that was already open when the connection dropped is never
 * unmounted (a half-filled request form must survive a network blip): the
 * blocking message is used only when the screen was ENTERED while offline.
 */
export function MobileOfflineGate({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const online = useMobileOnline();
  const queryClient = useQueryClient();
  const router = useRouter();
  // `offline` = this screen was ENTERED while offline.
  const [entry, setEntry] = useState(() => ({ pathname, offline: !online }));
  if (entry.pathname !== pathname) {
    setEntry({ pathname, offline: !online });
  }
  const enteredOfflinePath = entry.offline ? entry.pathname : null;
  useEffect(() => {
    if (!online || !enteredOfflinePath) return;
    let cancelled = false;
    // Back online on a screen that could not load: let the router load it
    // again (its code/data may have failed while offline) before showing it.
    void Promise.resolve(router.invalidate())
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) return;
        setEntry((current) =>
          current.pathname === enteredOfflinePath ? { ...current, offline: false } : current,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [online, enteredOfflinePath, router]);

  // One stable element shape — `{banner}{content}` — in every state, so going
  // offline/online never remounts the screen that is already open.
  let banner: ReactNode = null;
  let content: ReactNode = children;

  if (online) {
    const reloading =
      entry.pathname === pathname &&
      entry.offline &&
      classifyMobileOfflineScreen(pathname).kind === "online-only";
    if (reloading) {
      content = (
        <div className="min-h-[50vh] grid place-items-center" aria-busy="true">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      );
    }
  } else {
    const enteredOffline = entry.pathname === pathname ? entry.offline : true;
    const screen = classifyMobileOfflineScreen(pathname);

    if (screen.kind === "online-only") {
      if (enteredOffline) {
        content = (
          <NeedsInternet
            title="هذه الصفحة تحتاج اتصالاً بالإنترنت"
            body="تحقق من اتصالك ثم أعد المحاولة. الرئيسية والسجل الأكاديمي والخطة الدراسية والجدول والدرجات متاحة دون اتصال."
          />
        );
      } else {
        banner = (
          <OfflineNotice>
            لا يوجد اتصال بالإنترنت — هذه الصفحة تحتاج اتصالاً لإكمال العمل.
          </OfflineNotice>
        );
      }
    } else if (screen.kind === "cached") {
      if (hasMobileOfflineData(queryClient, screen.requires)) {
        const lastUpdated = getMobileOfflineLastUpdated(queryClient, screen.requires);
        banner = (
          <OfflineNotice>
            تعرض بيانات محفوظة — آخر تحديث: {formatMobileOfflineTimestamp(lastUpdated)}
          </OfflineNotice>
        );
      } else if (enteredOffline) {
        content = (
          <NeedsInternet
            title="لا توجد بيانات محفوظة لهذه الصفحة بعد"
            body="افتح هذه الصفحة مرة واحدة مع الاتصال بالإنترنت لتصبح متاحة دون اتصال."
          />
        );
      }
    } else {
      banner = <OfflineNotice>لا يوجد اتصال بالإنترنت — بعض الخدمات غير متاحة الآن.</OfflineNotice>;
    }
  }

  return (
    <>
      {banner}
      {content}
    </>
  );
}
