import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, CloudOff, Loader2 } from "lucide-react";
import {
  formatMobileOfflineTimestamp,
  useMobileOfflineActive,
  useMobileOnline,
} from "@/components/mobile/MobileOfflineGate";
import {
  getMobileOfflineController,
  isMobileOfflinePilot,
  isPersistableMobileQueryKey,
} from "@/lib/mobile/offline/config";
import {
  describeMobileOfflineSavedScreens,
  type MobileOfflineSavedScreen,
} from "@/lib/mobile/offline/saved-status";
import { readStoredSupabaseSession } from "@/lib/mobile/offline/stored-session";
import { setMobileOfflineMode } from "@/lib/mobile/offline/service-worker-client";

/**
 * Pilot opt-in for the offline mode (OFFLINE-FIRST-01). Rendered only while
 * the rollout is "pilot". The choice is stored per DEVICE (not per account)
 * and survives sign-out; switching it off unregisters the mobile service
 * worker, deletes its caches and wipes the saved data on this device at once.
 */
export function MobileOfflineModeSetting() {
  const queryClient = useQueryClient();
  const active = useMobileOfflineActive();
  const [busy, setBusy] = useState(false);

  if (!isMobileOfflinePilot()) return null;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = !active;
      await setMobileOfflineMode(next);
      if (next) {
        // Results already in memory were fetched before the opt-in and are not
        // saved; mark them stale so each screen saves a fresh copy when opened.
        void queryClient.invalidateQueries({
          predicate: (query) => isPersistableMobileQueryKey(query.queryKey),
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-2xl border border-gold/40 bg-card p-4 shadow-card space-y-2"
      data-testid="mobile-offline-mode-setting"
    >
      <div className="flex items-center justify-between gap-3">
        <div
          id="mobile-offline-mode-label"
          className="flex items-center gap-2 text-sm font-extrabold text-primary"
        >
          <CloudOff className="h-4 w-4 text-gold" /> الوضع بدون إنترنت (تجريبي)
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-labelledby="mobile-offline-mode-label"
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors disabled:opacity-60 ${
            active ? "border-gold bg-gold" : "border-border bg-muted"
          }`}
        >
          <span
            className={`grid h-5 w-5 place-items-center rounded-full bg-card shadow transition-transform ${
              active ? "-translate-x-6" : "-translate-x-1"
            }`}
          >
            {busy && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
          </span>
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        يحفظ الصفحة الرئيسية والسجل الأكاديمي والخطة الدراسية والجداول على هذا الجهاز لعرضها بدون
        اتصال
      </p>
      <p className="text-[10px] font-bold text-muted-foreground" role="status">
        {active
          ? "مفعّل على هذا الجهاز. افتح الصفحات مرة واحدة مع الاتصال لتُحفظ."
          : "غير مفعّل. إيقافه يحذف كل ما حُفظ على هذا الجهاز فوراً."}
      </p>
      {active ? <MobileOfflineSavedStatus /> : null}
    </section>
  );
}

const STATUS_REFRESH_MS = 2_000;

/**
 * Shows what is really stored on this device right now (read from the saved
 * snapshot, not from memory): which screens will open without a network and
 * since when, plus whether the storage worker controls the app yet.
 */
function MobileOfflineSavedStatus() {
  const online = useMobileOnline();
  const [screens, setScreens] = useState<MobileOfflineSavedScreen[]>([]);
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    const read = () => {
      setScreens(describeMobileOfflineSavedScreens(readStoredSupabaseSession()?.userId ?? null));
      setWorkerReady(getMobileOfflineController() !== null);
    };
    read();
    const timer = setInterval(read, STATUS_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const savedCount = screens.filter((screen) => screen.saved).length;

  return (
    <div
      className="space-y-2 rounded-xl border border-border bg-muted/30 p-3"
      data-testid="mobile-offline-saved-status"
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-extrabold text-primary">
        <span>الصفحات المحفوظة على هذا الجهاز</span>
        <span dir="ltr">
          {savedCount} / {screens.length}
        </span>
      </div>
      <ul className="space-y-1">
        {screens.map((screen) => (
          <li key={screen.path} className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 font-bold">
              {screen.saved ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              )}
              {screen.labelAr}
            </span>
            <span className="text-muted-foreground">
              {screen.saved
                ? `محفوظة — ${formatMobileOfflineTimestamp(screen.updatedAt)}`
                : "غير محفوظة بعد"}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        الاتصال الآن: {online ? "متصل" : "غير متصل"} · ملفات التطبيق:{" "}
        {workerReady ? "جاهزة للعمل دون اتصال" : "تُجهَّز عند فتح التطبيق مرة أخرى مع الاتصال"}
      </p>
      {savedCount < screens.length ? (
        <p className="text-[10px] font-bold leading-relaxed text-amber-700">
          افتح كل صفحة غير محفوظة مرة واحدة مع الاتصال، ثم عُد إلى هنا وتأكد من ظهور علامة الحفظ
          بجانبها قبل قطع الاتصال.
        </p>
      ) : null}
    </div>
  );
}
