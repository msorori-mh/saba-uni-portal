import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, GraduationCap, BookOpen, Briefcase, Loader2, User } from "lucide-react";
import universityLogo from "@/assets/university-logo.jpeg";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { friendlyAuthError } from "@/components/auth/IdentifierInput";
import { validateUniversityLoginEmailInput, normalizeUniversityLoginEmail } from "@/lib/university-email-auth";
import { checkRateLimit, RATE_LIMIT_POLICIES, RATE_LIMIT_MESSAGE, describeBlockedFor } from "@/lib/rate-limit";
import { Mail } from "lucide-react";

type AccountType = "student" | "faculty" | "staff";

const REDIRECT_AFTER_LOGIN: Record<AccountType, string> = {
  student: "/student",
  faculty: "/faculty-portal",
  staff: "/staff",
};

const COPY: Record<AccountType, { title: string; idLabel: string; idPlaceholder: string; subtitle: string; Icon: typeof User }> = {
  student: { title: "دخول بوابة الطالب", idLabel: "الإيميل الجامعي", idPlaceholder: "student@students.usr.edu.ye", subtitle: "بوابة الطالب الإلكترونية", Icon: GraduationCap },
  faculty: { title: "دخول بوابة أعضاء هيئة التدريس", idLabel: "الإيميل الجامعي", idPlaceholder: "faculty@faculty.usr.edu.ye", subtitle: "بوابة أعضاء هيئة التدريس", Icon: BookOpen },
  staff:   { title: "دخول بوابة الموظفين", idLabel: "الإيميل الجامعي", idPlaceholder: "staff@staff.usr.edu.ye", subtitle: "بوابة الموظفين الإداريين", Icon: Briefcase },
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
      { name: "theme-color", content: "#061F33" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "بوابة الكلية" },
      { name: "application-name", content: "بوابة الكلية" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
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
    <section dir="rtl" className="relative bg-hero-gradient text-primary-foreground overflow-hidden py-12 md:py-16">
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
  const router = useRouter();
  const queryClient = useQueryClient();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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


  const doLogin = async (idValue: string, pwValue: string) => {
    if (loading) return;
    if (!idValue.trim() || !pwValue) return;
    setError(null);
    setLoading(true);
    try {
      const emailError = validateUniversityLoginEmailInput(idValue);
      if (emailError) {
        setError(emailError);
        setLoading(false);
        return;
      }

      const trimmedId = normalizeUniversityLoginEmail(idValue);
      const rl = await checkRateLimit(
        `login:portal:${accountType}:${trimmedId}`,
        RATE_LIMIT_POLICIES.loginAttempt,
      );
      if (!rl.allowed) {
        const tail = describeBlockedFor(rl.blocked_until);
        setError(tail ? `${RATE_LIMIT_MESSAGE} ${tail}.` : RATE_LIMIT_MESSAGE);
        setLoading(false);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: trimmedId, password: pwValue });
      if (signInError) throw signInError;
      if (!data.user) throw new Error("invalid");

      const dest = await resolveDestinationForUser(data.user.id);
      if (!dest || dest !== REDIRECT_AFTER_LOGIN[accountType]) {
        await supabase.auth.signOut();
        setError("هذا الحساب لا يطابق نوع البوابة المحددة.");
        setLoading(false);
        return;
      }
      // Drop every cached query and route match from any previous session so
      // the new user never sees the previous account's data.
      queryClient.clear();
      await router.invalidate();
      navigate({ to: dest, replace: true });
    } catch (err) {
      const msg = friendlyAuthError(err);
      setError(msg);
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void doLogin(identifier, password);
  };


  const cfg = COPY[accountType];
  const Icon = cfg.Icon;

  return (
    <section dir="rtl" className="relative bg-hero-gradient text-primary-foreground overflow-hidden py-12 md:py-16">
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
                <img src={universityLogo} alt="شعار جامعة إقليم سبأ" className="h-full w-full object-contain" />
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
                </div>
              )}
              <div>
                <label htmlFor="portal-identifier" className="block text-sm font-semibold mb-2">{cfg.idLabel}</label>
                <div className="relative">
                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <input
                    id="portal-identifier"
                    ref={identifierRef}
                    type="email"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        passwordRef.current?.focus();
                      }
                    }}
                    placeholder={cfg.idPlaceholder}
                    aria-label={cfg.idLabel}
                    autoComplete="username"
                    dir="ltr"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    className="w-full rounded-md border border-input bg-background pr-10 pl-3 py-3 text-sm text-right outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط.
                </p>
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


          <Link to="/" className="mt-4 block text-center text-sm text-primary-foreground/70 hover:text-gold">
            ← العودة إلى الموقع الرئيسي
          </Link>
        </div>
      </div>
    </section>
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
