import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
  Facebook,
  Twitter,
  Instagram,
  Youtube,
  Linkedin,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const SUBJECTS = [
  "استفسار عن القبول والتسجيل",
  "استفسار عن البرامج الأكاديمية",
  "بوابة الطالب والدعم التقني",
  "تواصل مع عمادة الكلية",
  "شراكات أكاديمية أو بحثية",
  "أخرى",
];

const FAQS = [
  {
    q: "ما هي شروط القبول في الكلية؟",
    a: "يجب أن يكون المتقدم حاصلاً على الثانوية العامة (القسم العلمي) بمعدل لا يقل عن 70%، مع اجتياز اختبار القبول والمقابلة الشخصية.",
  },
  {
    q: "ما هي البرامج الأكاديمية المتاحة؟",
    a: "تقدم الكلية أربعة برامج بكالوريوس: علوم الحاسوب، نظم المعلومات الحاسوبية، الأمن السيبراني، والذكاء الاصطناعي.",
  },
  {
    q: "كم تستغرق الدراسة في الكلية؟",
    a: "مدة الدراسة في برامج البكالوريوس أربع سنوات (ثمانية فصول دراسية)، يتخللها تدريب ميداني ومشروع تخرج.",
  },
  {
    q: "كيف أصل إلى بوابة الطالب؟",
    a: "يمكنك الدخول إلى بوابة الطالب عبر زر «بوابة الطالب» في أعلى الموقع، أو مباشرة عبر portal.it.saba.edu.ye باستخدام بياناتك الجامعية.",
  },
  {
    q: "هل توجد منح دراسية؟",
    a: "نعم، تتوفر منح للطلاب المتفوقين وذوي الحالات الخاصة. للتفاصيل، راجع عمادة شؤون الطلاب أو راسلنا عبر النموذج.",
  },
];

const contactSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, "الاسم يجب أن يكون حرفين على الأقل")
    .max(120, "الاسم طويل جدًا"),
  email: z
    .string()
    .trim()
    .email("صيغة البريد الإلكتروني غير صحيحة")
    .max(160, "البريد طويل جدًا"),
  phone: z
    .string()
    .trim()
    .max(30, "رقم الهاتف طويل جدًا")
    .optional()
    .or(z.literal("")),
  subject: z
    .string({ required_error: "اختر موضوع الرسالة" })
    .min(2, "اختر موضوع الرسالة")
    .max(200),
  message: z
    .string()
    .trim()
    .min(10, "الرسالة يجب أن تكون 10 أحرف على الأقل")
    .max(5000, "الرسالة طويلة جدًا"),
});

type ContactValues = z.infer<typeof contactSchema>;

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "اتصل بنا — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      {
        name: "description",
        content:
          "تواصل مع كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. هاتف، بريد، عنوان، ونموذج تواصل مباشر.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [sent, setSent] = useState(false);

  const form = useForm<ContactValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    },
  });

  const onSubmit = async (values: ContactValues) => {
    const subjectFull = values.phone
      ? `${values.subject} — هاتف: ${values.phone}`
      : values.subject;
    const { error } = await supabase.from("contact_messages").insert({
      full_name: values.full_name,
      email: values.email,
      subject: subjectFull,
      message: values.message,
    });
    if (error) {
      toast.error("تعذّر إرسال الرسالة، حاول مرة أخرى.");
      return;
    }
    setSent(true);
    form.reset();
    toast.success("تم إرسال رسالتك بنجاح، سنتواصل معك قريباً");
  };

  return (
    <>
      <PageHeader
        eyebrow="تواصل معنا"
        title="نحن في خدمتكم"
        subtitle="نسعد بتواصلكم معنا للاستفسار عن البرامج الأكاديمية، التسجيل، أو أي خدمة من خدمات الكلية."
      />

      {/* Info cards */}
      <section className="container mx-auto px-4 -mt-10 relative z-10">
        <div className="grid gap-5 md:grid-cols-3">
          {[
            {
              icon: MapPin,
              title: "العنوان",
              lines: ["الجمهورية اليمنية", "جامعة إقليم سبأ"],
            },
            {
              icon: Phone,
              title: "أرقام التواصل",
              lines: ["6302008", "6301274", "77963595"],
            },
            {
              icon: Mail,
              title: "البريد الإلكتروني",
              lines: ["itandcs@usr.edu.ye"],
            },
          ].map((c) => (
            <div
              key={c.title}
              className="group rounded-2xl border border-border bg-card p-6 shadow-elegant hover:border-gold/50 hover:-translate-y-1 transition-all"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-gold mb-4">
                <c.icon className="h-7 w-7" />
              </div>
              <h3 className="font-display text-lg font-extrabold text-primary">
                {c.title}
              </h3>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground leading-7">
                {c.lines.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Form + Hours */}
      <section className="container mx-auto px-4 py-16 grid gap-10 lg:grid-cols-5">
        {/* Side */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold/15 text-gold">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="font-display font-extrabold text-primary">
                ساعات العمل
              </h3>
            </div>
            <div className="text-sm text-muted-foreground leading-7">
              <div className="flex justify-between border-b border-border/60 py-2">
                <span>السبت — الخميس</span>
                <span className="font-bold text-foreground">8:00 ص — 3:00 م</span>
              </div>
              <div className="flex justify-between py-2">
                <span>الجمعة</span>
                <span className="font-bold text-gold">مغلق</span>
              </div>
            </div>
          </div>

          {/* Social */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-display font-extrabold text-primary mb-4">
              تابعنا على منصات التواصل
            </h3>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Facebook, label: "فيسبوك", color: "hover:bg-[#1877F2]" },
                { icon: Twitter, label: "تويتر", color: "hover:bg-[#1DA1F2]" },
                { icon: Instagram, label: "إنستغرام", color: "hover:bg-[#E4405F]" },
                { icon: Youtube, label: "يوتيوب", color: "hover:bg-[#FF0000]" },
                { icon: Linkedin, label: "لينكدإن", color: "hover:bg-[#0A66C2]" },
              ].map((s) => (
                <a
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className={`grid h-11 w-11 place-items-center rounded-lg border border-border bg-background text-primary transition-all hover:text-white hover:border-transparent ${s.color}`}
                >
                  <s.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Map */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
            <div className="aspect-video bg-hero-gradient relative grid place-items-center">
              <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,_var(--gold)_1px,_transparent_1px)] [background-size:24px_24px]" />
              <div className="relative text-center text-primary-foreground p-6">
                <MapPin className="mx-auto h-12 w-12 text-gold mb-3" />
                <div className="font-display font-extrabold text-lg">
                  جامعة إقليم سبأ
                </div>
                <div className="text-sm text-primary-foreground/80 mt-1">
                  مأرب — الجمهورية اليمنية
                </div>
                <a
                  href="https://maps.google.com/?q=Marib,Yemen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-xs text-gold hover:underline"
                >
                  فتح في خرائط Google ↗
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-border bg-card p-8 shadow-elegant">
            <h2 className="font-display text-2xl font-extrabold text-primary">
              أرسل لنا رسالة
            </h2>
            <div className="divider-gold mt-3" />

            {sent ? (
              <div className="mt-8 rounded-xl bg-gold/10 border border-gold/30 p-8 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-gold mb-3" />
                <div className="font-display text-xl font-extrabold text-primary">
                  تم إرسال رسالتك بنجاح
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  سنتواصل معك قريباً. شكرًا لتواصلك مع الكلية.
                </p>
                <Button
                  onClick={() => setSent(false)}
                  variant="outline"
                  className="mt-6 border-gold/40 hover:bg-gold/10"
                >
                  إرسال رسالة أخرى
                </Button>
              </div>
            ) : (
              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldWrap label="الاسم الكامل" required error={form.formState.errors.full_name?.message}>
                    <Input
                      {...form.register("full_name")}
                      placeholder="مثال: أحمد محمد"
                      autoComplete="name"
                    />
                  </FieldWrap>
                  <FieldWrap label="البريد الإلكتروني" required error={form.formState.errors.email?.message}>
                    <Input
                      type="email"
                      {...form.register("email")}
                      placeholder="example@email.com"
                      autoComplete="email"
                      dir="ltr"
                    />
                  </FieldWrap>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FieldWrap label="الهاتف (اختياري)" error={form.formState.errors.phone?.message}>
                    <Input
                      type="tel"
                      {...form.register("phone")}
                      placeholder="+967 7XXXXXXXX"
                      autoComplete="tel"
                      dir="ltr"
                    />
                  </FieldWrap>
                  <FieldWrap label="الموضوع" required error={form.formState.errors.subject?.message}>
                    <Select
                      value={form.watch("subject")}
                      onValueChange={(v) =>
                        form.setValue("subject", v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="اختر موضوع الرسالة" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBJECTS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrap>
                </div>

                <FieldWrap label="الرسالة" required error={form.formState.errors.message?.message}>
                  <Textarea
                    {...form.register("message")}
                    rows={6}
                    placeholder="اكتب رسالتك هنا..."
                    className="resize-none"
                  />
                </FieldWrap>

                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting}
                  className="w-full sm:w-auto bg-gold-gradient text-primary-deep hover:opacity-90 font-extrabold shadow-gold py-6 px-8 text-base"
                >
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جارٍ الإرسال...
                    </>
                  ) : (
                    <>
                      إرسال الرسالة <Send className="h-4 w-4 mr-2" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-secondary/40 border-y border-border">
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <div className="text-center mb-10">
            <div className="text-sm font-bold text-gold tracking-widest uppercase">
              الأسئلة الشائعة
            </div>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-primary">
              إجابات سريعة لأكثر الأسئلة شيوعاً
            </h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {FAQS.map((item, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="rounded-xl border border-border bg-card px-5 shadow-card"
              >
                <AccordionTrigger className="text-right font-bold text-primary hover:text-gold py-5">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-7 pb-5">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  );
}

function FieldWrap({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block text-sm font-semibold mb-2 text-foreground">
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </Label>
      {children}
      {error && (
        <p className="mt-1.5 text-xs text-destructive font-medium">{error}</p>
      )}
    </div>
  );
}
