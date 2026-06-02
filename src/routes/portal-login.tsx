import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, GraduationCap, BookOpen, Briefcase, Loader2, User } from "lucide-react";
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
  student: { title: "تسجيل دخول الطالب",    idLabel: "الرقم الأكاديمي", idPlaceholder: "20230001", subtitle: "بوابة الطالب الإلكترونية", Icon: GraduationCap },
  faculty: { title: "تسجيل دخول عضو هيئة التدريس", idLabel: "رقم الموظف",     idPlaceholder: "F0001",     subtitle: "بوابة أعضاء هيئة التدريس", Icon: BookOpen },
  staff:   { title: "تسجيل دخول الموظف",     idLabel: "رقم الموظف",     idPlaceholder: "S0001",     subtitle: "بوابة الموظفين الإداريين", Icon: Briefcase },
};

const LAST_TAB_KEY = "portal-login:last-account-type";

export const Route = createFileRoute("/portal-login")({
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
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<AccountType>("student");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Restore last tab from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_TAB_KEY);
      if (saved === "student" || saved === "faculty" || saved === "staff") {
        setAccountType(saved);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist tab + focus first field when tab changes
  useEffect(() => {
    try { localStorage.setItem(LAST_TAB_KEY, accountType); } catch { /* ignore */ }
    identifierRef.current?.focus();
  }, [accountType]);

  // Auto-focus on mount
  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  // If already signed in, route to the appropriate portal
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!identifier.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const email = `${identifier.trim().toLowerCase()}@${DOMAIN[accountType]}`;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!data.user) throw new Error("invalid");

      const dest = await resolveDestinationForUser(data.user.id);
      if (!dest || dest !== REDIRECT_AFTER_LOGIN[accountType]) {
        await supabase.auth.signOut();
        throw new Error("mismatch");
      }
      navigate({ to: dest, replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
      setLoading(false);
    }
  };

  const cfg = COPY[accountType];
  const Icon = cfg.Icon;

  return (
    <section dir="rtl" className="relative min-h-[calc(100vh-200px)] bg-hero-gradient text-primary-foreground overflow-hidden flex items-center">
      <div className="absolute inset-0 bg-overlay-gradient" />
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -right-32 -bottom-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />

      <div className="container relative mx-auto grid gap-12 px-4 py-16 lg:grid-cols-2 items-center">
        {/* Left — branding */}
        <div className="hidden lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-widest text-gold uppercase">
            <ShieldCheck className="h-3.5 w-3.5" /> دخول آمن
          </div>
          <h1 className="mt-6 font-display text-4xl xl:text-5xl font-extrabold leading-tight">
            البوابة<br />
            <span className="text-gold">الإلكترونية</span>
          </h1>
          <div className="divider-gold mt-6" />
          <p className="mt-6 max-w-md text-primary-foreground/80 leading-8">
            اختر نوع حسابك ثم سجّل الدخول للوصول إلى خدماتك الإلكترونية.
          </p>

          <div className="mt-10 space-y-3" role="tablist" aria-label="نوع الحساب">
            {(["student", "faculty", "staff"] as const).map((k) => {
              const c = COPY[k];
              const C = c.Icon;
              const active = k === accountType;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAccountType(k)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-right transition-colors ${
                    active ? "border-gold bg-white/10 text-gold" : "border-white/10 bg-white/5 text-primary-foreground/75 hover:bg-white/10"
                  }`}
                >
                  <div className={`grid h-10 w-10 place-items-center rounded-md ${active ? "bg-gold text-primary-deep" : "bg-white/10"}`}>
                    <C className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">{c.title}</div>
                    <div className="text-xs opacity-80">{c.subtitle}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right — form */}
        <div className="mx-auto w-full max-w-md">
          {/* Mobile type tabs */}
          <div className="lg:hidden mb-4 grid grid-cols-3 gap-2 rounded-xl bg-white/10 p-1.5 border border-white/15" role="tablist" aria-label="نوع الحساب">
            {(["student", "faculty", "staff"] as const).map((k) => {
              const C = COPY[k].Icon;
              const active = k === accountType;
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setAccountType(k)}
                  className={`flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] font-bold transition-colors ${
                    active ? "bg-gold text-primary-deep" : "text-primary-foreground/80 hover:bg-white/10"
                  }`}
                >
                  <C className="h-4 w-4" />
                  <span>{k === "student" ? "طالب" : k === "faculty" ? "هيئة تدريس" : "موظف"}</span>
                </button>
              );
            })}
          </div>

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
                <div role="alert" aria-live="polite" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">
                  {error}
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
                <Link to="/forgot-password" search={{ ctx: accountType }} className="text-primary hover:text-gold font-bold">
                  نسيت كلمة المرور؟
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
