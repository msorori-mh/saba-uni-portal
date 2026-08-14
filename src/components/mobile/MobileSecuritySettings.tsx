import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Fingerprint, Loader2, LogOut, ShieldCheck, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { useAppLock } from "@/components/mobile/MobileAppLockProvider";
import {
  registerTrustedDevice,
  revokeAllDevices,
  revokeThisDevice,
} from "@/lib/security/device-trust-client";
import { registerTrustedDeviceFn } from "@/lib/security/device-trust.functions";
import type { StepUpRpcClient } from "@/lib/security/step-up-client";

const rpcClient: StepUpRpcClient = {
  rpc: (fn, args) =>
    (supabase.rpc as unknown as (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>)(
      fn,
      args,
    ),
};

/** Security section of the student mobile settings screen. */
export function MobileSecuritySettings() {
  const navigate = useNavigate();
  const { enabled, available, deviceId, setEnabled, revokeLocalTrust } = useAppLock();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enable = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await registerTrustedDevice(rpcClient, {
        password,
        reauthenticate: async (candidate) => {
          const { data } = await supabase.auth.getUser();
          const email = data.user?.email;
          if (!email || candidate.length === 0) return false;
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password: candidate,
          });
          return !signInError;
        },
      });
      if (result.status === "registered") {
        setEnabled(true, result.deviceId);
        setPassword("");
        setMessage("تم تفعيل قفل التطبيق بالتحقق الحيوي على هذا الجهاز.");
      } else {
        setError(result.messageAr);
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await revokeThisDevice(rpcClient, deviceId);
      revokeLocalTrust();
      setMessage("تم تعطيل قفل التطبيق وإلغاء ثقة هذا الجهاز.");
    } finally {
      setBusy(false);
    }
  };

  const signOutThisDevice = async () => {
    await revokeThisDevice(rpcClient, deviceId);
    revokeLocalTrust();
    await supabase.auth.signOut();
    navigate({ to: "/mobile/student-login", replace: true });
  };

  const signOutAllDevices = async () => {
    await revokeAllDevices(rpcClient);
    revokeLocalTrust();
    await supabase.auth.signOut({ scope: "global" });
    navigate({ to: "/mobile/student-login", replace: true });
  };

  return (
    <section className="rounded-2xl border border-gold/40 bg-card p-4 shadow-card space-y-3">
      <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
        <ShieldCheck className="h-4 w-4 text-gold" /> الأمان
      </div>

      <div className="rounded-xl border border-border p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-[12px] font-extrabold text-primary">
            <Fingerprint className="h-4 w-4 text-gold" /> قفل التطبيق بالبصمة/التحقق الحيوي
          </span>
          <span className="text-[11px] font-bold text-muted-foreground">
            {enabled ? "مفعّل" : "غير مفعّل"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          لا تُحفظ بصمتك في البوابة إطلاقًا؛ يعتمد التحقق على نظام الجهاز فقط، ويُستخدم مفتاح
          محفوظ داخل الجهاز لإثبات العمليات الحساسة.
        </p>

        {!available && (
          <p className="text-[11px] font-bold text-muted-foreground">
            هذه الميزة متاحة داخل تطبيق الجوال على جهاز يدعم التحقق الحيوي.
          </p>
        )}

        {available && !enabled && (
          <div className="space-y-2">
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="أدخل كلمة المرور لتأكيد هويتك"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy || password.length === 0}
              className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-lg bg-gold-gradient px-4 text-sm font-extrabold text-primary-deep disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} تفعيل القفل بالبصمة
            </button>
          </div>
        )}

        {available && enabled && (
          <button
            type="button"
            onClick={() => void disable()}
            disabled={busy}
            className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-lg border border-primary px-4 text-sm font-bold text-primary disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} تعطيل القفل بالبصمة
          </button>
        )}
      </div>

      {message && (
        <p className="text-[11px] font-bold text-primary" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-[11px] font-bold text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-2">
        <button
          type="button"
          onClick={() => void signOutThisDevice()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-bold text-primary"
        >
          <Smartphone className="h-4 w-4" /> تسجيل الخروج من هذا الجهاز
        </button>
        <button
          type="button"
          onClick={() => void signOutAllDevices()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 text-sm font-extrabold text-destructive"
        >
          <LogOut className="h-4 w-4" /> تسجيل الخروج من جميع الأجهزة
        </button>
      </div>
    </section>
  );
}
