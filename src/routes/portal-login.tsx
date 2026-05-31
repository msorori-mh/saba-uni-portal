import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Lock, User, ArrowLeft, HelpCircle, BookOpen, ShieldCheck } from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import { supabase } from "@/integrations/supabase/client";

const STUDENT_EMAIL_DOMAIN = "students.usr.edu.ye";

export const Route = createFileRoute("/portal-login")({
  head: () => ({
    meta: [
      { title: "بوابة الطالب — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تسجيل الدخول إلى بوابة الطالب الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PortalLoginPage,
});

function PortalLoginPage() {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!cancelled && data.user) navigate({ to: "/student", replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!studentId.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const email = `${studentId.trim()}@${STUDENT_EMAIL_DOMAIN}`;
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError || !data.user) throw new Error("invalid");
      navigate({ to: "/student", replace: true });
    } catch {
      setError("الرقم الأكاديمي أو كلمة المرور غير صحيحة");
      setLoading(false);
    }
  };

  return (
    <section className="relative min-h-[calc(100vh-200px)] bg-hero-gradient text-primary-foreground overflow-hidden flex items-center">
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
            بوابة الطالب<br />
            <span className="text-gold">الإلكترونية</span>
          </h1>
          <div className="divider-gold mt-6" />
          <p className="mt-6 max-w-md text-primary-foreground/80 leading-8">
            ادخل إلى حسابك الأكاديمي للاطلاع على جدولك الدراسي، درجاتك، الرسوم، والخدمات الإلكترونية الأخرى.
          </p>

          <div className="mt-10 space-y-4">
            {[
              { icon: BookOpen, t: "جدولك الدراسي ودرجاتك" },
              { icon: ShieldCheck, t: "خدمات إلكترونية آمنة 24/7" },
              { icon: HelpCircle, t: "دعم فني متاح للطلاب" },
            ].map((f) => (
              <div key={f.t} className="flex items-center gap-3 text-sm">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/10">
                  <f.icon className="h-5 w-5 text-gold" />
                </div>
                <span className="text-primary-foreground/85">{f.t}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — form card */}
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-white/15 bg-white/[0.96] text-foreground p-8 shadow-elegant backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-white p-1 ring-1 ring-gold/40 shadow-card">
                <img src={collegeLogo} alt="شعار الكلية" className="h-full w-full object-contain" />
              </div>
              <div>
                <div className="font-display font-extrabold text-primary">تسجيل دخول الطالب</div>
                <div className="text-xs text-muted-foreground">كلية تكنولوجيا المعلومات</div>
              </div>
            </div>

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">الرقم الأكاديمي</label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    type="text"
                    placeholder="مثال: 2024010012"
                    className="w-full rounded-md border border-input bg-background pr-10 pl-4 py-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold">كلمة المرور</label>
                  <a href="#" className="text-xs text-primary hover:text-gold font-bold">نسيت كلمة المرور؟</a>
                </div>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="••••••••"
                    className="w-full rounded-md border border-input bg-background pr-10 pl-4 py-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-elegant hover:bg-primary-deep transition-colors disabled:opacity-60"
              >
                {loading ? "جاري الدخول..." : <>دخول البوابة <ArrowLeft className="h-4 w-4" /></>}
              </button>

              <div className="text-center text-xs text-muted-foreground border-t border-border pt-4">
                <a href="#" className="text-primary hover:text-gold font-bold">دليل الاستخدام</a>
                <span className="mx-2">•</span>
                <a href="mailto:support@it.saba.edu.ye" className="text-primary hover:text-gold font-bold">الدعم الفني</a>
              </div>
            </form>
          </div>

          <Link to="/" className="mt-5 block text-center text-sm text-primary-foreground/70 hover:text-gold">
            ← العودة إلى الموقع الرئيسي
          </Link>
        </div>
      </div>
    </section>
  );
}
