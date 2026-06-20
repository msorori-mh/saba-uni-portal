import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";

type RuleId = "len" | "upper" | "lower" | "number" | "special";
const RULES: Array<{ id: RuleId; label: string; test: (v: string) => boolean }> = [
  { id: "len", label: "١٠ أحرف على الأقل", test: (v) => v.length >= 10 },
  { id: "upper", label: "حرف كبير (A-Z)", test: (v) => /[A-Z]/.test(v) },
  { id: "lower", label: "حرف صغير (a-z)", test: (v) => /[a-z]/.test(v) },
  { id: "number", label: "رقم (0-9)", test: (v) => /[0-9]/.test(v) },
  { id: "special", label: "رمز خاص (!@#$…)", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

const PRIVILEGED_ROLES = ["admin", "system_admin", "dean"];

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [recoveryOk, setRecoveryOk] = useState<boolean | null>(null);
  const [isPrivileged, setIsPrivileged] = useState(false);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Detect recovery session — Supabase auto-handles the recovery hash on this page load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Wait briefly for Supabase to consume the hash and create session.
      const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return;
        if (event === "PASSWORD_RECOVERY" || session) {
          setRecoveryOk(true);
          await loadRole(session?.user?.id);
          setReady(true);
        }
      });
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setRecoveryOk(true);
        await loadRole(data.session.user.id);
        setReady(true);
      } else {
        // Give Supabase a tick to parse URL hash, then re-check
        setTimeout(async () => {
          if (cancelled) return;
          const { data: d2 } = await supabase.auth.getSession();
          if (d2.session) {
            setRecoveryOk(true);
            await loadRole(d2.session.user.id);
          } else {
            setRecoveryOk(false);
          }
          setReady(true);
        }, 800);
      }
      return () => { sub.subscription.unsubscribe(); };
    })();
    return () => { cancelled = true; };

    async function loadRole(uid?: string) {
      if (!uid) return;
      try {
        const { data: roles } = await supabase
          .from("user_roles").select("role").eq("user_id", uid);
        const list = (roles ?? []).map((r: any) => r.role as string);
        if (list.some((r) => PRIVILEGED_ROLES.includes(r))) setIsPrivileged(true);
      } catch { /* ignore */ }
    }
  }, []);

  const results = useMemo(() => RULES.map((r) => ({ ...r, ok: r.test(pwd) })), [pwd]);
  const allOk = results.every((r) => r.ok);
  const score = results.filter((r) => r.ok).length;
  const strengthLabel = score <= 1 ? "ضعيفة جداً" : score === 2 ? "ضعيفة" : score === 3 ? "متوسطة" : score === 4 ? "جيدة" : "قوية";
  const strengthColor =
    score <= 1 ? "bg-destructive" :
    score === 2 ? "bg-orange-500" :
    score === 3 ? "bg-amber-500" :
    score === 4 ? "bg-lime-500" : "bg-emerald-600";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    if (!allOk) { setError("كلمة المرور لا تستوفي شروط الأمان."); return; }
    if (pwd !== confirm) { setError("كلمتا المرور غير متطابقتين."); return; }
    setLoading(true);
    try {
      const { data, error: updErr } = await supabase.auth.updateUser({ password: pwd });
      if (updErr) throw updErr;
      try {
        await (supabase.rpc as any)("log_audit", {
          _entity_type: "user",
          _entity_id: data.user?.id ?? null,
          _action_type: "password_reset_completed",
          _old: null,
          _new: { user_id: data.user?.id },
          _notes: null,
        });
      } catch { /* ignore */ }
      setDone(true);
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate({ to: "/admin/login", replace: true });
      }, 2500);
    } catch (err: any) {
      const msg = err?.message ?? "";
      if (/same.*password|new password should be different/i.test(msg)) {
        setError("لا يمكن استخدام نفس كلمة المرور القديمة. اختر كلمة مرور جديدة.");
      } else {
        setError(msg || "تعذّر تحديث كلمة المرور.");
      }
    } finally {
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
              <KeyRound className="h-7 w-7" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-primary-deep">تعيين كلمة مرور جديدة</h1>
            <p className="mt-1 text-sm text-primary-deep/75">اختر كلمة مرور قوية لحماية حسابك.</p>
          </div>

          <div className="px-8 py-8">
            {!ready && (
              <div className="grid place-items-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {ready && recoveryOk === false && (
              <div className="space-y-4 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-destructive">
                  <ShieldAlert className="h-7 w-7" />
                </div>
                <p className="text-sm font-semibold text-destructive">
                  رابط إعادة التعيين غير صالح أو انتهت صلاحيته.
                </p>
                <Link to="/forgot-password" className="inline-block text-sm font-bold text-primary hover:text-gold">
                  طلب رابط جديد
                </Link>
              </div>
            )}

            {ready && recoveryOk && done && (
              <div className="space-y-4 text-center py-6">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  تم تحديث كلمة المرور بنجاح. سيتم توجيهك لتسجيل الدخول…
                </p>
              </div>
            )}

            {ready && recoveryOk && !done && (
              <form onSubmit={onSubmit} className="space-y-5">
                {isPrivileged && (
                  <div role="alert" className="rounded-md border border-amber-300/60 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs font-semibold text-amber-800 dark:text-amber-200 flex gap-2">
                    <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <span>لأسباب أمنية، نوصي بتفعيل المصادقة الثنائية للحسابات الإدارية.</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="pwd" className="text-sm font-semibold">كلمة المرور الجديدة</Label>
                  <PasswordInput
                    id="pwd"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  {/* Strength meter */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full transition-all ${strengthColor}`} style={{ width: `${(score / RULES.length) * 100}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-muted-foreground">{strengthLabel}</span>
                  </div>
                  <ul className="grid grid-cols-1 gap-1 pt-1">
                    {results.map((r) => (
                      <li key={r.id} className={`text-[11px] font-semibold flex items-center gap-1.5 ${r.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${r.ok ? "bg-emerald-600" : "bg-muted-foreground/40"}`} />
                        {r.label}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm" className="text-sm font-semibold">تأكيد كلمة المرور</Label>
                  <PasswordInput
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                  {confirm && confirm !== pwd && (
                    <p className="text-[11px] font-bold text-destructive">كلمتا المرور غير متطابقتين</p>
                  )}
                </div>

                {error && (
                  <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={loading || !allOk || pwd !== confirm}
                  className="w-full h-12 bg-gold-gradient text-primary-deep font-extrabold text-base shadow-gold hover:opacity-95 hover:translate-y-0"
                >
                  {loading ? (
                    <><Loader2 className="h-5 w-5 animate-spin" /> جاري الحفظ...</>
                  ) : (
                    "تحديث كلمة المرور"
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
