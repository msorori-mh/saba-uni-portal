import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Mail, Phone, MapPin, Clock, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "اتصل بنا — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تواصل مع كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { error: err } = await supabase.from("contact_messages").insert({
      full_name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim(),
      subject: String(fd.get("subject") ?? "").trim(),
      message: String(fd.get("message") ?? "").trim(),
    });
    setLoading(false);
    if (err) { setError("تعذّر إرسال الرسالة، حاول مرة أخرى."); return; }
    setSent(true);
  };

  return (
    <>
      <PageHeader
        eyebrow="تواصل معنا"
        title="اتصل بالكلية"
        subtitle="نسعد بتواصلكم معنا للاستفسار عن البرامج الأكاديمية، التسجيل، أو أي خدمة من خدمات الكلية."
      />

      <section className="container mx-auto px-4 py-16 grid gap-10 lg:grid-cols-5">
        {/* Info */}
        <div className="lg:col-span-2 space-y-5">
          {[
            { icon: MapPin, t: "العنوان", v: "مأرب — الجمهورية اليمنية\nجامعة إقليم سبأ، مجمع الكليات" },
            { icon: Phone, t: "الهاتف", v: "+967 1 234 5678\n+967 7 1234 5678" },
            { icon: Mail, t: "البريد الإلكتروني", v: "it@usr.edu.ye\ndean.it@usr.edu.ye" },
            { icon: Clock, t: "ساعات العمل", v: "السبت — الخميس\n8:00 صباحًا — 3:00 عصرًا" },
          ].map((c) => (
            <div key={c.t} className="flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-gold-gradient text-primary-deep shadow-gold">
                <c.icon className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-primary">{c.t}</div>
                <div className="mt-1 text-sm text-muted-foreground whitespace-pre-line leading-7">{c.v}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Form */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-elegant">
            <h2 className="font-display text-2xl font-extrabold text-primary">أرسل لنا رسالة</h2>
            <div className="divider-gold mt-3" />

            {sent ? (
              <div className="mt-8 rounded-lg bg-secondary p-6 text-center">
                <div className="text-lg font-bold text-primary">تم استلام رسالتك بنجاح</div>
                <p className="mt-2 text-sm text-muted-foreground">سنقوم بالرد عليك في أقرب وقت ممكن. شكرًا لتواصلك.</p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mt-6 grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="الاسم الكامل" name="name" required />
                  <Field label="البريد الإلكتروني" name="email" type="email" required />
                </div>
                <Field label="الموضوع" name="subject" required />
                <div>
                  <label className="block text-sm font-semibold mb-2 text-foreground">الرسالة</label>
                  <textarea required rows={5}
                            className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
                </div>
                <button type="submit"
                        className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3.5 text-sm font-extrabold text-primary-foreground shadow-elegant hover:bg-primary-deep transition-colors">
                  إرسال الرسالة <Send className="h-4 w-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-2 text-foreground">{label}</label>
      <input type={type} name={name} required={required}
             className="w-full rounded-md border border-input bg-background px-4 py-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" />
    </div>
  );
}
