import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, Loader2, Mail, CheckCircle2, ShieldCheck, GraduationCap, BookOpen, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkRateLimit, RATE_LIMIT_POLICIES, RATE_LIMIT_MESSAGE, describeBlockedFor } from "@/lib/rate-limit";

type Ctx = "admin" | "student" | "faculty" | "staff";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (s: Record<string, unknown>): { type?: Ctx } => {
    const c = s.type ?? s.ctx;
    if (c === "admin" || c === "student" || c === "faculty" || c === "staff") return { type: c };
    return {};
  },
  head: () => ({
    meta: [
      { title: "نسيت كلمة المرور؟ — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ForgotPasswordPage,
});

const COPY: Record<Ctx, {
  title: string;
  description: string;
  hint?: { label: string; sample?: string };
  Icon: typeof KeyRound;
  backTo: "/admin/login" | "/portal-login";
  backLabel: string;
  placeholder: string;
}> = {
  admin: {
    title: "استعادة كلمة مرور المسؤول",
    description: "أدخل البريد الإلكتروني المرتبط بحساب الإدارة وسنرسل لك رابط إعادة تعيين كلمة المرور.",
    Icon: ShieldCheck,
    backTo: "/admin/login",
    backLabel: "العودة لتسجيل دخول المسؤول",
    placeholder: "admin@usr.edu.ye",
  },
  student: {
    title: "استعادة كلمة مرور الطالب",
    description: "أدخل الإيميل الجامعي وسنرسل لك رابط إعادة تعيين كلمة المرور.",
    hint: { label: "يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط." },
    Icon: GraduationCap,
    backTo: "/portal-login",
    backLabel: "العودة لبوابة الطالب",
    placeholder: "student@students.usr.edu.ye",
  },
  faculty: {
    title: "استعادة كلمة مرور عضو هيئة التدريس",
    description: "أدخل الإيميل الجامعي وسنرسل لك رابط إعادة تعيين كلمة المرور.",
    hint: { label: "يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط." },
    Icon: BookOpen,
    backTo: "/portal-login",
    backLabel: "العودة لبوابة أعضاء هيئة التدريس",
    placeholder: "faculty@faculty.usr.edu.ye",
  },
  staff: {
    title: "استعادة كلمة مرور الموظف",
    description: "أدخل الإيميل الجامعي وسنرسل لك رابط إعادة تعيين كلمة المرور.",
    hint: { label: "يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط." },
    Icon: Briefcase,
    backTo: "/portal-login",
    backLabel: "العودة لبوابة الموظفين",
    placeholder: "staff@staff.usr.edu.ye",
  },
};

function ForgotPasswordPage() {
  const { type } = Route.useSearch();
  const cfg = useMemo(() => COPY[(type ?? "admin") as Ctx], [type]);

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("الرجاء إدخال بريد إلكتروني صالح.");
      return;
    }
    setLoading(true);
    try {
      // Rate limit: 3 / 30min per email, then block 30min.
      const rl = await checkRateLimit(`forgot:${trimmed}`, RATE_LIMIT_POLICIES.forgotPassword);
      if (!rl.allowed) {
        const tail = describeBlockedFor(rl.blocked_until);
        setError(tail ? `${RATE_LIMIT_MESSAGE} ${tail}.` : RATE_LIMIT_MESSAGE);
        setLoading(false);
        return;
      }
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetErr) throw resetErr;
      try {
        await (supabase.rpc as any)("log_audit", {
          _entity_type: "user",
          _entity_id: null,
          _action_type: "password_reset_requested",
          _old: null,
          _new: { email: trimmed, ctx: type ?? "admin" },
          _notes: null,
        });
      } catch { /* ignore */ }
      setSent(true);
    } catch (err: any) {
      setError(err?.message ?? "تعذّر إرسال البريد. حاول لاحقاً.");
    } finally {
      setLoading(false);
    }
  };

  const Icon = cfg.Icon;

  return (
    <div dir="rtl" className="min-h-screen w-full bg-primary-deep relative overflow-hidden grid place-items-center px-4 py-10">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border-2 border-gold/40 bg-card shadow-elegant overflow-hidden">
          <div className="bg-gold-gradient px-8 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-deep text-gold shadow-elegant">
              <Icon className="h-7 w-7" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-primary-deep">{cfg.title}</h1>
            <p className="mt-1 text-sm text-primary-deep/75">{cfg.description}</p>
          </div>

          {done ? (
            <div className="px-8 py-10 text-center space-y-4">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <p className="text-sm font-semibold text-foreground">
                تم تعيين كلمة المرور الجديدة بنجاح.
              </p>
              <div className="pt-4">
                <Link to={cfg.backTo} className="text-sm font-bold text-primary hover:text-gold">
                  {cfg.backLabel}
                </Link>
              </div>
            </div>
          ) : sent ? (
            <form onSubmit={onVerify} className="px-8 py-8 space-y-5">
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-semibold text-emerald-800">
                أرسلنا رمز تحقق إلى <span dir="ltr" className="font-mono">{email.trim().toLowerCase()}</span>.
                أدخل الرمز وكلمة المرور الجديدة. إن لم يصلك البريد تحقق من مجلد البريد المزعج (Spam).
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-sm font-semibold">رمز التحقق</Label>
                <Input
                  id="code"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="text-center font-mono tracking-[0.5em] text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newpwd" className="text-sm font-semibold">كلمة المرور الجديدة</Label>
                <PasswordInput id="newpwd" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="new-password" />
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                  {PWD_RULES.map((r) => {
                    const ok = r.test(pwd);
                    return (
                      <li key={r.id} className={`text-[11px] ${ok ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {ok ? "✓" : "•"} {r.label}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmpwd" className="text-sm font-semibold">تأكيد كلمة المرور</Label>
                <PasswordInput id="confirmpwd" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gold-gradient text-primary-deep font-extrabold text-base shadow-gold hover:opacity-95 hover:translate-y-0"
              >
                {loading ? (<><Loader2 className="h-5 w-5 animate-spin" /> جاري التحقق...</>) : <>تأكيد وتعيين كلمة المرور</>}
              </Button>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="button"
                  onClick={() => { setSent(false); setCode(""); setPwd(""); setConfirm(""); setError(null); }}
                  className="text-primary hover:text-gold font-bold"
                >
                  إعادة إرسال الرمز
                </button>
                <Link to={cfg.backTo} className="text-primary hover:text-gold font-bold inline-flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" /> {cfg.backLabel}
                </Link>
              </div>
            </form>

          ) : (
            <form onSubmit={onSubmit} className="px-8 py-8 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">البريد الإلكتروني</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    id="email"
                    ref={emailRef}
                    type="email"
                    required
                    dir="ltr"
                    placeholder={cfg.placeholder}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pr-10 text-right"
                    autoComplete="email"
                  />
                </div>
                {cfg.hint && (
                  <p className="text-[11px] text-muted-foreground">
                    {cfg.hint.label}
                  </p>
                )}
              </div>

              {error && (
                <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gold-gradient text-primary-deep font-extrabold text-base shadow-gold hover:opacity-95 hover:translate-y-0"
              >
                {loading ? (
                  <><Loader2 className="h-5 w-5 animate-spin" /> جاري الإرسال...</>
                ) : (
                  <>إرسال رابط إعادة التعيين</>
                )}
              </Button>

              <div className="text-xs pt-2">
                <Link to={cfg.backTo} className="text-primary hover:text-gold font-bold inline-flex items-center gap-1">
                  <ArrowRight className="h-3 w-3" /> {cfg.backLabel}
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
