import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { GraduationCap, Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/PasswordInput";
import { friendlyAuthError } from "@/components/auth/IdentifierInput";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "تسجيل دخول المسؤول — كلية تكنولوجيا المعلومات" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if already signed in (and is admin)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      const { data: roles } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      if (!cancelled && roles) navigate({ to: "/admin", replace: true });
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => { emailRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!data.user) throw new Error("invalid");
      const { data: role } = await supabase
        .from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
      if (!role) {
        await supabase.auth.signOut();
        throw new Error("forbidden");
      }
      navigate({ to: "/admin", replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-primary-deep relative overflow-hidden grid place-items-center px-4 py-10">
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-sm text-primary-foreground/70 hover:text-gold transition-colors">
          <GraduationCap className="h-4 w-4" /> العودة إلى البوابة العامة
        </Link>

        <div className="rounded-2xl border-2 border-gold/40 bg-card shadow-elegant overflow-hidden">
          <div className="bg-gold-gradient px-8 py-6 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-deep text-gold shadow-elegant">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-primary-deep">لوحة الإدارة</h1>
            <p className="mt-1 text-sm text-primary-deep/75">كلية تكنولوجيا المعلومات وعلوم الحاسوب</p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">البريد الإلكتروني</Label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  required
                  dir="ltr"
                  placeholder="admin@usr.edu.ye"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pr-10 text-right"
                  autoComplete="email"
                />
              </div>
            </div>

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
                  placeholder="admin@usr.edu.ye"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      passwordRef.current?.focus();
                    }
                  }}
                  className="pr-10 text-right"
                  autoComplete="email"
                  aria-label="البريد الإلكتروني"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">كلمة المرور</Label>
              <PasswordInput
                id="password"
                ref={passwordRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="كلمة المرور"
                required
              />
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
              {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> جاري تسجيل الدخول...</> : "تسجيل الدخول"}
            </Button>

            <p className="text-center text-xs text-muted-foreground pt-2">
              يقتصر الوصول على المسؤولين المعتمدين فقط
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
