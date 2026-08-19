import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { GraduationCap, Loader2, ArrowLeft, ShieldCheck, Mail } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import { supabase } from "@/integrations/supabase/client";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { friendlyAuthError } from "@/components/auth/IdentifierInput";
import { validateUniversityLoginEmailInput, normalizeUniversityLoginEmail } from "@/lib/university-email-auth";
import { checkRateLimit, RATE_LIMIT_POLICIES, RATE_LIMIT_MESSAGE, describeBlockedFor } from "@/lib/rate-limit";

const REDIRECT_AFTER_LOGIN = "/mobile/student";

export const Route = createFileRoute("/mobile/student-login")({
  head: () => ({
    meta: [
      { title: "دخول الطالب — تطبيق الموبايل" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
  component: MobileStudentLoginPage,
});

function MobileStudentLoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    identifierRef.current?.focus();
  }, []);

  // If already signed-in as a student, jump straight to the mobile home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const { data: profile } = await supabase
        .from("student_profiles")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (!cancelled && profile) navigate({ to: REDIRECT_AFTER_LOGIN, replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!identifier.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const emailError = validateUniversityLoginEmailInput(identifier);
      if (emailError) {
        setError(emailError);
        setLoading(false);
        return;
      }

      const trimmedId = normalizeUniversityLoginEmail(identifier);
      const rl = await checkRateLimit(
        `login:mobile-student:${trimmedId}`,
        RATE_LIMIT_POLICIES.loginAttempt,
      );
      if (!rl.allowed) {
        const tail = describeBlockedFor(rl.blocked_until);
        setError(tail ? `${RATE_LIMIT_MESSAGE} ${tail}.` : RATE_LIMIT_MESSAGE);
        setLoading(false);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedId,
        password,
      });
      if (signInError) throw signInError;
      if (!data.user) throw new Error("invalid");

      // Student-only: must have student_profiles row
      const { data: profile } = await supabase
        .from("student_profiles")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (!profile) {
        await supabase.auth.signOut();
        setError("هذا التطبيق مخصص للطلاب فقط.");
        setLoading(false);
        return;
      }

      // A native WebView remains alive between logins. Drop every query and
      // route match owned by the previous student before mounting the new one.
      queryClient.clear();
      await router.invalidate();
      navigate({ to: REDIRECT_AFTER_LOGIN, replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
      setLoading(false);
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-hero-gradient text-primary-foreground flex flex-col"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex-1 flex flex-col px-5 py-8">
        <div className="mx-auto w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white p-1.5 ring-2 ring-gold/50 shadow-elegant">
              <img src={collegeLogo} alt="شعار الكلية" className="h-full w-full object-contain" />
            </div>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-white/10 px-3 py-1 text-[10px] font-bold tracking-widest text-gold uppercase">
              <ShieldCheck className="h-3 w-3" /> دخول آمن
            </div>
            <h1 className="mt-3 font-display text-2xl font-extrabold leading-tight">
              <span className="inline-flex items-center gap-2">
                <GraduationCap className="h-6 w-6 text-gold" /> دخول الطالب
              </span>
            </h1>
            <p className="mt-1.5 text-xs text-primary-foreground/75">
              تطبيق بوابة الطالب — نسخة الموبايل
            </p>
          </div>

          <form
            onSubmit={onSubmit}
            noValidate
            className="mt-6 rounded-2xl border border-white/15 bg-white/[0.97] text-foreground p-5 shadow-elegant space-y-4"
          >
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="m-student-id"
                className="block text-sm font-semibold mb-1.5"
              >
                الإيميل الجامعي
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  id="m-student-id"
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
                  placeholder="student@students.usr.edu.ye"
                  autoComplete="username"
                  dir="ltr"
                  required
                  className="w-full rounded-md border border-input bg-background pr-10 pl-3 py-3 text-sm text-right outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                يتم تسجيل الدخول باستخدام الإيميل الجامعي فقط.
              </p>
            </div>

            <div>
              <label
                htmlFor="m-student-pw"
                className="block text-sm font-semibold mb-1.5"
              >
                كلمة المرور
              </label>
              <PasswordInput
                id="m-student-pw"
                ref={passwordRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-elegant hover:bg-primary-deep transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> جاري تسجيل الدخول...
                </>
              ) : (
                <>
                  دخول <ArrowLeft className="h-4 w-4" />
                </>
              )}
            </button>

            <div className="text-center text-xs pt-1">
              <Link
                to="/mobile/student-forgot-password"
                className="text-primary hover:text-gold font-bold"
              >
                نسيت كلمة المرور؟
              </Link>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
