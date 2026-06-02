import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import collegeLogo from "@/assets/college-logo.jpg";
import { PasswordInput } from "@/components/auth/PasswordInput";

export const Route = createFileRoute("/staff/change-password")({
  component: ChangePasswordPage,
});

function ChangePasswordPage() {
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwdRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  useEffect(() => { pwdRef.current?.focus(); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwd.length < 8) { setError("يجب أن لا تقل كلمة المرور عن 8 أحرف"); return; }
    if (pwd !== confirm) { setError("كلمتا المرور غير متطابقتين"); return; }

    setLoading(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password: pwd });
      if (updErr) throw updErr;
      const { error: rpcErr } = await supabase.rpc("complete_staff_password_change");
      if (rpcErr) throw rpcErr;
      navigate({ to: "/staff", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تغيير كلمة المرور");
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen w-full bg-primary-deep relative overflow-hidden grid place-items-center px-4 py-10">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border-2 border-gold/40 bg-card shadow-elegant overflow-hidden">
          <div className="bg-gold-gradient px-8 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-deep text-gold shadow-elegant">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-primary-deep">تغيير كلمة المرور</h1>
            <p className="mt-1 text-sm text-primary-deep/75">يجب تغيير كلمة المرور قبل استخدام البوابة</p>
          </div>

          <form onSubmit={onSubmit} className="px-8 py-7 space-y-5">
            <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-3 text-xs text-muted-foreground">
              <img src={collegeLogo} alt="" className="h-8 w-8 rounded-full object-cover" />
              <span>اختر كلمة مرور قوية (8 أحرف على الأقل) ولا تشاركها مع أحد.</span>
            </div>

            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{error}</div>
            )}

            <div>
              <label htmlFor="new-pwd" className="block text-sm font-semibold mb-2">كلمة المرور الجديدة</label>
              <PasswordInput id="new-pwd" ref={pwdRef} value={pwd} onChange={(e) => setPwd(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmRef.current?.focus(); } }}
                required minLength={8} autoComplete="new-password" aria-label="كلمة المرور الجديدة" />
            </div>

            <div>
              <label htmlFor="confirm-pwd" className="block text-sm font-semibold mb-2">تأكيد كلمة المرور</label>
              <PasswordInput id="confirm-pwd" ref={confirmRef} value={confirm} onChange={(e) => setConfirm(e.target.value)}
                required minLength={8} autoComplete="new-password" aria-label="تأكيد كلمة المرور" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-elegant hover:bg-primary-deep transition-colors disabled:opacity-60">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...</> : "حفظ كلمة المرور والمتابعة"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
