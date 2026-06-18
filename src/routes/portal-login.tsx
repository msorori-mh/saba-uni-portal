import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, GraduationCap, BookOpen, Briefcase, Loader2, User, Sparkles, Copy, Check, Zap } from "lucide-react";
import { toast } from "sonner";
import collegeLogo from "@/assets/college-logo.jpg";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { IdentifierInput, friendlyAuthError } from "@/components/auth/IdentifierInput";

type AccountType = "student" | "faculty" | "staff";

const DOMAIN: Record<AccountType, string> = {
  student: "students.usr.edu.ye",
  faculty: "faculty.usr.edu.ye",
  staff: "staff.usr.edu.ye",
};

const REDIRECT_AFTER_LOGIN: Record<AccountType, string> = {
  student: "/student",
  faculty: "/faculty-portal",
  staff: "/staff",
};

const COPY: Record<AccountType, { title: string; idLabel: string; idPlaceholder: string; subtitle: string; Icon: typeof User }> = {
  student: { title: "دخول بوابة الطالب",    idLabel: "الرقم الأكاديمي", idPlaceholder: "20230001", subtitle: "بوابة الطالب الإلكترونية", Icon: GraduationCap },
  faculty: { title: "دخول بوابة أعضاء هيئة التدريس", idLabel: "رقم الموظف",     idPlaceholder: "F0001",     subtitle: "بوابة أعضاء هيئة التدريس", Icon: BookOpen },
  staff:   { title: "دخول بوابة الموظفين",     idLabel: "رقم الموظف",     idPlaceholder: "S0001",     subtitle: "بوابة الموظفين الإداريين", Icon: Briefcase },
};

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO_LOGIN === "true";

const DEMO_CREDENTIALS: Record<AccountType, { identifier: string; password: string }> = {
  student: { identifier: "DEMO2024", password: "Demo@2024" },
  faculty: { identifier: "DEMO-FAC", password: "Demo@2024" },
  staff:   { identifier: "DEMO-STF", password: "Demo@2024" },
};

export const Route = createFileRoute("/portal-login")({
  validateSearch: (s: Record<string, unknown>): { type?: AccountType } => {
    const t = s.type;
    if (t === "student" || t === "faculty" || t === "staff") return { type: t };
    return {};
  },
  head: () => ({
    meta: [
      { title: "بوابة الدخول — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تسجيل الدخول إلى البوابة الإلكترونية للكلية: الطالب، عضو هيئة التدريس، أو الموظف." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const { type } = Route.useSearch();
  if (type) return <SinglePortalLogin accountType={type} />;
  return <PortalSelector />;
}

function PortalSelector() {
  const cards: AccountType[] = ["student", "faculty", "staff"];
  return (
    <section dir="rtl" className="relative min-h-[calc(100vh-200px)] bg-hero-gradient text-primary-foreground overflow-hidden flex items-center">
      <div className="absolute inset-0 bg-overlay-gradient" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
      <div className="container relative mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-widest text-gold uppercase">
            <ShieldCheck className="h-3.5 w-3.5" /> دخول آمن
          </div>
          <h1 className="mt-6 font-display text-4xl xl:text-5xl font-extrabold leading-tight">
            اختر <span className="text-gold">بوابتك</span>
          </h1>
          <p className="mt-4 text-primary-foreground/80">اختر نوع حسابك للمتابعة إلى صفحة تسجيل الدخول.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3 max-w-4xl mx-auto">
          {cards.map((k) => {
            const c = COPY[k];
            const C = c.Icon;
            return (
              <Link
                key={k}
                to="/portal-login"
                search={{ type: k }}
                className="group rounded-2xl border border-white/15 bg-white/[0.96] text-foreground p-6 shadow-elegant hover:-translate-y-1 transition-transform"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-gold">
                  <C className="h-6 w-6" />
                </div>
                <div className="mt-4 font-display font-extrabold text-primary text-lg">{c.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{c.subtitle}</div>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:text-gold">
                  متابعة <ArrowLeft className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
        <div className="text-center mt-10">
          <Link to="/" className="text-sm text-primary-foreground/70 hover:text-gold">← العودة إلى الموقع الرئيسي</Link>
        </div>
      </div>
    </section>
  );
}

function SinglePortalLogin({ accountType }: { accountType: AccountType }) {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsCreds, setErrorIsCreds] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => { identifierRef.current?.focus(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const dest = await resolveDestinationForUser(data.user.id);
      if (dest) navigate({ to: dest, replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const fillDemo = () => {
    const demo = DEMO_CREDENTIALS[accountType];
    setIdentifier(demo.identifier);
    setPassword(demo.password);
    setError(null);
    setErrorIsCreds(false);
  };

  const doLogin = async (idValue: string, pwValue: string) => {
    if (loading) return;
    if (!idValue.trim() || !pwValue) return;
    setError(null);
    setErrorIsCreds(false);
    setLoading(true);
    try {
      const email = `${idValue.trim().toLowerCase()}@${DOMAIN[accountType]}`;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwValue });
      if (signInError) throw signInError;
      if (!data.user) throw new Error("invalid");

      const dest = await resolveDestinationForUser(data.user.id);
      if (!dest || dest !== REDIRECT_AFTER_LOGIN[accountType]) {
        await supabase.auth.signOut();
        setError("هذا الحساب لا يطابق نوع البوابة المحددة.");
        setLoading(false);
        return;
      }
      navigate({ to: dest, replace: true });
    } catch (err) {
      const msg = friendlyAuthError(err);
      const isCreds = /credentials|كلمة المرور|بيانات/i.test(msg);
      setErrorIsCreds(isCreds);
      setError(msg);
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doLogin(identifier, password);
  };

  const oneClickDemo = async () => {
    const demo = DEMO_CREDENTIALS[accountType];
    setIdentifier(demo.identifier);
    setPassword(demo.password);
    await doLogin(demo.identifier, demo.password);
  };

  const cfg = COPY[accountType];
  const Icon = cfg.Icon;

  return (
    <section dir="rtl" className="relative min-h-[calc(100vh-200px)] bg-hero-gradient text-primary-foreground overflow-hidden flex items-center">
      <div className="absolute inset-0 bg-overlay-gradient" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />

      <div className="container relative mx-auto grid gap-12 px-4 py-16 lg:grid-cols-2 items-center">
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-widest text-gold uppercase">
            <ShieldCheck className="h-3.5 w-3.5" /> دخول آمن
          </div>
          <h1 className="mt-6 font-display text-4xl xl:text-5xl font-extrabold leading-tight">
            {cfg.title}
          </h1>
          <div className="divider-gold mt-6" />
          <p className="mt-6 max-w-md text-primary-foreground/80 leading-8">
            أدخل بياناتك للوصول إلى {cfg.subtitle}.
          </p>
          <div className="mt-8">
            <Link to="/portal-login" className="inline-flex items-center gap-2 text-sm text-primary-foreground/70 hover:text-gold">
              ← تغيير نوع البوابة
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-white/15 bg-white/[0.96] text-foreground p-7 shadow-elegant backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white p-1 ring-1 ring-gold/40 shadow-card">
                <img src={collegeLogo} alt="شعار الكلية" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 font-display font-extrabold text-primary text-sm">
                  <Icon className="h-4 w-4 text-gold" /> {cfg.title}
                </div>
                <div className="text-[11px] text-muted-foreground">{cfg.subtitle}</div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              {error && (
                <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive space-y-1.5">
                  <div>{error}</div>
                  {errorIsCreds && (
                    <button
                      type="button"
                      onClick={fillDemo}
                      className="inline-flex items-center gap-1.5 rounded bg-gold px-2 py-1 text-[11px] font-extrabold text-primary-deep hover:brightness-110"
                    >
                      <Sparkles className="h-3 w-3" /> تعبئة بيانات الحساب التجريبي
                    </button>
                  )}
                </div>
              )}
              <div>
                <label htmlFor="portal-identifier" className="block text-sm font-semibold mb-2">{cfg.idLabel}</label>
                <IdentifierInput
                  id="portal-identifier"
                  ref={identifierRef}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  onClear={() => { setIdentifier(""); identifierRef.current?.focus(); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      passwordRef.current?.focus();
                    }
                  }}
                  placeholder={cfg.idPlaceholder}
                  aria-label={cfg.idLabel}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label htmlFor="portal-password" className="block text-sm font-semibold mb-2">كلمة المرور</label>
                <PasswordInput
                  id="portal-password"
                  ref={passwordRef}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-label="كلمة المرور"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground shadow-elegant hover:bg-primary-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> جاري تسجيل الدخول...</>
                ) : (
                  <>دخول البوابة <ArrowLeft className="h-4 w-4" /></>
                )}
              </button>

              <div className="text-center text-xs pt-2">
                <Link to="/forgot-password" search={{ type: accountType }} className="text-primary hover:text-gold font-bold">
                  نسيت كلمة المرور؟
                </Link>
              </div>

              <div className="lg:hidden text-center text-xs pt-1">
                <Link to="/portal-login" className="text-muted-foreground hover:text-primary font-semibold">
                  تغيير نوع البوابة
                </Link>
              </div>

              <div className="text-center text-xs text-muted-foreground border-t border-border pt-3">
                <a href="mailto:support@it.saba.edu.ye" className="text-primary hover:text-gold font-bold">الدعم الفني</a>
              </div>
            </form>
          </div>

          <DemoHint
            accountType={accountType}
            loading={loading}
            onFill={fillDemo}
            onOneClick={oneClickDemo}
          />




          <Link to="/" className="mt-4 block text-center text-sm text-primary-foreground/70 hover:text-gold">
            ← العودة إلى الموقع الرئيسي
          </Link>
        </div>
      </div>
    </section>
  );
}

function CopyChip({ value, ariaLabel }: { value: string; ariaLabel: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("تم النسخ");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("تعذّر النسخ");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "تم" : "نسخ"}
    </button>
  );
}

function DemoHint({ accountType, onFill, onOneClick, loading }: { accountType: AccountType; onFill: () => void; onOneClick: () => void; loading: boolean }) {
  const demo = DEMO_CREDENTIALS[accountType];
  const label = accountType === "student" ? "حساب طالب تجريبي" : accountType === "faculty" ? "حساب مدرّس تجريبي" : "حساب موظف تجريبي";
  return (
    <div className="mt-4 rounded-2xl border-2 border-gold/60 bg-white/[0.98] text-foreground p-4 shadow-elegant ring-1 ring-gold/20">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-extrabold text-primary">
          <Sparkles className="h-4 w-4 text-gold" /> {label}
        </div>
        <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-primary-deep">للتجربة فقط</span>
      </div>

      <button
        type="button"
        onClick={onOneClick}
        disabled={loading}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md bg-gold-gradient px-4 py-2.5 text-sm font-extrabold text-primary-deep shadow-gold hover:brightness-110 transition disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        دخول تجريبي بنقرة واحدة
      </button>

      <dl className="mt-3 grid grid-cols-[auto,1fr,auto] gap-x-2 gap-y-2 text-xs items-center">
        <dt className="text-muted-foreground">المعرّف:</dt>
        <dd dir="ltr" className="font-mono font-bold text-primary text-left truncate">{demo.identifier}</dd>
        <CopyChip value={demo.identifier} ariaLabel="نسخ المعرّف" />
        <dt className="text-muted-foreground">كلمة المرور:</dt>
        <dd dir="ltr" className="font-mono font-bold text-primary text-left truncate">{demo.password}</dd>
        <CopyChip value={demo.password} ariaLabel="نسخ كلمة المرور" />
      </dl>

      <button
        type="button"
        onClick={onFill}
        className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        تعبئة الحقول فقط (بدون دخول)
      </button>
    </div>
  );
}



async function resolveDestinationForUser(userId: string): Promise<string | null> {
  const [{ data: s }, { data: f }, { data: st }] = await Promise.all([
    supabase.from("student_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("faculty_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
    supabase.from("staff_profiles").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (s) return "/student";
  if (f) return "/faculty-portal";
  if (st) return "/staff";
  return null;
}
