import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Fingerprint, Loader2, LockKeyhole, LogOut } from "lucide-react";
import { isNativePlatform } from "@/lib/native/platform";
import {
  BiometricError,
  authenticateForAppUnlock,
  clearDeviceKey,
  isBiometricRuntimeAvailable,
  setSecureScreen,
} from "@/lib/native/biometrics";
import {
  APP_LOCK_DEVICE_STORAGE_KEY,
  APP_LOCK_STORAGE_KEY,
  isContentVisible,
  nextAppLockState,
  shouldApplySecureScreen,
  type AppLockEvent,
  type AppLockState,
} from "@/lib/security/app-lock-contract";

type AppLockContextValue = {
  readonly enabled: boolean;
  readonly state: AppLockState;
  readonly available: boolean;
  readonly deviceId: string | null;
  setEnabled: (enabled: boolean, deviceId?: string | null) => void;
  revokeLocalTrust: () => void;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock(): AppLockContextValue {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error("useAppLock must be used inside MobileAppLockProvider");
  return ctx;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(APP_LOCK_STORAGE_KEY) === "1";
}

function readDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(APP_LOCK_DEVICE_STORAGE_KEY);
}

/**
 * Biometric app lock for the student mobile surface.
 *
 * Content is never rendered while the app is covered (backgrounded) or locked,
 * and FLAG_SECURE is applied for exactly that window so Recent Apps shows no
 * student data — screenshots stay allowed during normal use.
 */
export function MobileAppLockProvider({
  children,
  onSignOut,
}: {
  children: ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const [enabled, setEnabledState] = useState(() => readEnabled());
  const [deviceId, setDeviceId] = useState(() => readDeviceId());
  // Cold start: begin covered so student data is never rendered before the
  // lock state is confirmed. If the feature is disabled, FOREGROUND will unlock.
  const [state, setState] = useState<AppLockState>(() =>
    readEnabled() ? "covered" : "unlocked",
  );
  const [unlocking, setUnlocking] = useState(false);
  const [errorAr, setErrorAr] = useState<string | null>(null);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const available = isBiometricRuntimeAvailable();

  useEffect(() => {
    // After the initial synchronous read, confirm the state and request a fresh
    // biometric check if the feature was enabled before the last backgrounding.
    dispatch({ type: "FOREGROUND" });
  }, []);

  const dispatch = useCallback((event: AppLockEvent) => {
    setState((current) => nextAppLockState(current, event, enabledRef.current));
  }, []);

  const setEnabled = useCallback((next: boolean, nextDeviceId?: string | null) => {
    if (typeof window !== "undefined") {
      if (next) window.localStorage.setItem(APP_LOCK_STORAGE_KEY, "1");
      else window.localStorage.removeItem(APP_LOCK_STORAGE_KEY);
      if (nextDeviceId) window.localStorage.setItem(APP_LOCK_DEVICE_STORAGE_KEY, nextDeviceId);
      if (!next) window.localStorage.removeItem(APP_LOCK_DEVICE_STORAGE_KEY);
    }
    enabledRef.current = next;
    setEnabledState(next);
    setDeviceId(next ? (nextDeviceId ?? readDeviceId()) : null);
    setState((current) => nextAppLockState(current, { type: next ? "FEATURE_ENABLED" : "FEATURE_DISABLED" }, next));
  }, []);

  const revokeLocalTrust = useCallback(() => {
    void clearDeviceKey();
    setEnabled(false, null);
    setState((current) => nextAppLockState(current, { type: "TRUST_REVOKED" }, false));
  }, [setEnabled]);

  // Background / foreground detection (Capacitor App plugin + visibility).
  useEffect(() => {
    if (typeof document === "undefined") return;
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const onVisibility = () => {
      dispatch({ type: document.visibilityState === "hidden" ? "BACKGROUND" : "FOREGROUND" });
    };
    document.addEventListener("visibilitychange", onVisibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", onVisibility));

    if (isNativePlatform()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          if (disposed) return;
          const handle = await App.addListener("appStateChange", ({ isActive }) => {
            dispatch({ type: isActive ? "FOREGROUND" : "BACKGROUND" });
          });
          cleanups.push(() => void handle.remove());
        } catch {
          /* visibility fallback already registered */
        }
      })();
    }

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, [dispatch]);

  // FLAG_SECURE only while covered/locked.
  useEffect(() => {
    if (!isNativePlatform()) return;
    void setSecureScreen(shouldApplySecureScreen(state) && enabled);
  }, [state, enabled]);

  const unlock = useCallback(async () => {
    setUnlocking(true);
    setErrorAr(null);
    try {
      const verified = await authenticateForAppUnlock("افتح بوابة الطالب");
      dispatch({ type: verified ? "UNLOCK_SUCCESS" : "UNLOCK_FAILURE" });
      if (!verified) setErrorAr("لم يتم التحقق. أعد المحاولة.");
    } catch (error) {
      if (error instanceof BiometricError && error.code === "KEY_INVALIDATED") {
        setErrorAr("تغيّرت إعدادات الأمان على الجهاز، لذا أُلغيت الثقة. سجّل الدخول وفعّل القفل مجددًا.");
        revokeLocalTrust();
        void onSignOut();
        return;
      }
      setErrorAr("تعذّر التحقق. أعد المحاولة.");
      dispatch({ type: "UNLOCK_FAILURE" });
    } finally {
      setUnlocking(false);
    }
  }, [dispatch, onSignOut, revokeLocalTrust]);

  // Auto-prompt as soon as the app becomes locked.
  useEffect(() => {
    if (state === "locked" && enabled && !unlocking) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled]);

  const value = useMemo<AppLockContextValue>(
    () => ({ enabled, state, available, deviceId, setEnabled, revokeLocalTrust }),
    [enabled, state, available, deviceId, setEnabled, revokeLocalTrust],
  );

  const visible = !enabled || isContentVisible(state);

  return (
    <AppLockContext.Provider value={value}>
      {visible ? children : null}
      {!visible && (
        <div
          dir="rtl"
          role="dialog"
          aria-modal="true"
          aria-label="قفل التطبيق"
          data-testid="mobile-app-lock-screen"
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-4 bg-primary-deep px-6 text-center"
        >
          <LockKeyhole className="h-10 w-10 text-gold" aria-hidden />
          <p className="font-display text-base font-extrabold text-primary-foreground">
            التطبيق مقفل
          </p>
          <p className="text-xs font-bold text-primary-foreground/80">
            التحقق الحيوي مطلوب لعرض بياناتك.
          </p>
          {errorAr && (
            <p className="text-[11px] font-bold text-destructive-foreground bg-destructive/80 rounded-md px-3 py-1.5" role="alert">
              {errorAr}
            </p>
          )}
          {state === "locked" && (
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button
                type="button"
                onClick={() => void unlock()}
                disabled={unlocking}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gold-gradient px-4 text-sm font-extrabold text-primary-deep disabled:opacity-60"
              >
                {unlocking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Fingerprint className="h-4 w-4" />
                )}
                فتح بالبصمة
              </button>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary-foreground/40 px-4 text-sm font-bold text-primary-foreground"
              >
                <LogOut className="h-4 w-4" /> تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      )}
    </AppLockContext.Provider>
  );
}
