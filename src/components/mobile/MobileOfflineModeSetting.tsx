import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Loader2 } from "lucide-react";
import { useMobileOfflineActive } from "@/components/mobile/MobileOfflineGate";
import { isMobileOfflinePilot, isPersistableMobileQueryKey } from "@/lib/mobile/offline/config";
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
    </section>
  );
}
