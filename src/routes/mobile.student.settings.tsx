import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { KeyRound, Loader2, LogOut, Settings2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { ANDROID_APP_DISPLAY_NAME } from "@/lib/native/platform";

export const Route = createFileRoute("/mobile/student/settings")({
  head: () => ({ meta: [{ title: "الإعدادات" }] }),
  component: MobileStudentSettings,
});

/** Auth actions only — no privileged/admin surface is reachable from here. */
function MobileStudentSettings() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (pwd.length < 8) {
      setError("يجب أن لا تقل كلمة المرور عن 8 أحرف");
      return;
    }
    if (pwd !== confirm) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setBusy(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pwd });
      if (updErr) throw updErr;
      const { error: rpcErr } = await supabase.rpc("complete_student_password_change");
      if (rpcErr) throw rpcErr;
      setPwd("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تغيير كلمة المرور");
    } finally {
      setBusy(false);
    }
  };

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/mobile/student-login", replace: true });
  };

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <Settings2 className="h-5 w-5 text-gold" /> الإعدادات
      </h1>

      <section className="rounded-2xl border border-gold/40 bg-card p-4 shadow-card space-y-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-primary">
          <KeyRound className="h-4 w-4 text-gold" /> تغيير كلمة المرور
        </div>
        <form onSubmit={onChangePassword} className="space-y-3">
          <PasswordInput
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="كلمة المرور الجديدة"
            autoComplete="new-password"
          />
          <PasswordInput
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="تأكيد كلمة المرور"
            autoComplete="new-password"
          />
          {error && (
            <p className="text-[11px] font-bold text-destructive" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="flex items-center gap-1 text-[11px] font-bold text-primary">
              <ShieldCheck className="h-3.5 w-3.5 text-gold" /> تم تحديث كلمة المرور بنجاح.
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gold-gradient px-4 py-2.5 text-sm font-extrabold text-primary-deep disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ كلمة المرور
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-2">
        <div className="text-sm font-extrabold text-primary">معلومات التطبيق</div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">التطبيق</span>
          <span className="font-bold text-primary">{ANDROID_APP_DISPLAY_NAME}</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">النطاق</span>
          <span className="font-bold text-primary">بوابة الطالب فقط</span>
        </div>
      </section>

      <button
        type="button"
        onClick={onLogout}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-extrabold text-destructive"
      >
        <LogOut className="h-4 w-4" /> تسجيل الخروج
      </button>
    </div>
  );
}
