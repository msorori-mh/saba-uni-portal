import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft, BookOpen, Brain, Calendar, Code2, Cpu, Database, FileCheck, FileText,
  FlaskConical, GraduationCap, Layers, MapPin, Newspaper, Phone, ReceiptText,
  ScrollText, Shield, ShieldCheck, Sparkles, Wallet, Briefcase, Users2, ClipboardList,
} from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import universityLogo from "@/assets/university-logo.jpeg.asset.json";
import techPattern from "@/assets/tech-pattern.jpg";
import { eventsQuery, liveCountsQuery, newsQuery, programsQuery, settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "البوابة الإلكترونية — كلية تكنولوجيا المعلومات وعلوم الحاسوب | جامعة إقليم سبأ" },
      { name: "description", content: "البوابة الإلكترونية الرسمية لكلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. الدخول إلى بوابات الطلاب وأعضاء هيئة التدريس والموظفين، والخدمات الأكاديمية والإدارية." },
      { property: "og:title", content: "البوابة الإلكترونية — كلية تكنولوجيا المعلومات وعلوم الحاسوب" },
      { property: "og:description", content: "منصة رقمية متكاملة للخدمات الأكاديمية والإدارية." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(programsQuery);
    context.queryClient.ensureQueryData(liveCountsQuery);
    context.queryClient.ensureQueryData(settingsQuery);
    context.queryClient.ensureQueryData(newsQuery(3));
    context.queryClient.ensureQueryData(eventsQuery(3));
  },
  component: HomePage,
});

const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  computer: Code2,
  database: Database,
  shield: Shield,
  brain: Brain,
};

type PortalCard = {
  Icon: typeof GraduationCap;
  emoji: string;
  title: string;
  features: string[];
  cta: string;
  to: string;
  tone: "gold" | "primary" | "emerald" | "slate";
};

const PORTAL_CARDS: PortalCard[] = [
  {
    Icon: GraduationCap, emoji: "🎓", title: "بوابة الطالب", tone: "gold",
    features: ["التسجيل الأكاديمي", "الدرجات والسجل", "الرسوم والمدفوعات", "الطلبات الطلابية", "الوثائق الرسمية"],
    cta: "دخول بوابة الطالب", to: "/portal-login",
  },
  {
    Icon: BookOpen, emoji: "👨‍🏫", title: "بوابة أعضاء هيئة التدريس", tone: "primary",
    features: ["الشُعب الدراسية", "إدارة الدرجات", "الطلاب المسجَّلون", "الجدول التدريسي"],
    cta: "دخول بوابة أعضاء هيئة التدريس", to: "/portal-login",
  },
  {
    Icon: Briefcase, emoji: "👨‍💼", title: "بوابة الموظفين", tone: "emerald",
    features: ["شؤون الطلاب", "الشؤون الأكاديمية", "الشؤون المالية"],
    cta: "دخول بوابة الموظفين", to: "/portal-login",
  },
  {
    Icon: ShieldCheck, emoji: "⚙️", title: "لوحة الإدارة", tone: "slate",
    features: ["إدارة النظام", "التقارير", "الرقابة والتدقيق", "العمليات"],
    cta: "دخول لوحة الإدارة", to: "/admin",
  },
];

const SERVICES = [
  { Icon: ClipboardList, title: "التسجيل الأكاديمي", desc: "تسجيل المقررات لكل فصل دراسي", to: "/portal-login" },
  { Icon: ScrollText, title: "السجل الأكاديمي", desc: "الاطلاع على السجل غير الرسمي والدرجات", to: "/portal-login" },
  { Icon: Wallet, title: "الرسوم والمدفوعات", desc: "متابعة الرسوم وإيداع سندات الدفع", to: "/portal-login" },
  { Icon: ReceiptText, title: "الطلبات الطلابية", desc: "أعذار، فرص إضافية، تحويل، مقاصة", to: "/portal-login" },
  { Icon: FileText, title: "الوثائق الرسمية", desc: "إفادات وكشف درجات وشهادات رسمية", to: "/portal-login" },
  { Icon: FileCheck, title: "التحقق من الوثائق", desc: "التحقق العام من صحة الوثائق الصادرة", to: "/verify-document" },
];

const QUICK_ACCESS = [
  { Icon: FileCheck, label: "التحقق من وثيقة", to: "/verify-document" },
  { Icon: Layers, label: "البرامج الأكاديمية", to: "/departments" },
  { Icon: Newspaper, label: "الأخبار", to: "/news" },
  { Icon: Calendar, label: "الفعاليات", to: "/events" },
  { Icon: Phone, label: "تواصل معنا", to: "/contact" },
];

function HomePage() {
  const { data: programs } = useSuspenseQuery(programsQuery);
  const { data: counts } = useSuspenseQuery(liveCountsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: news } = useSuspenseQuery(newsQuery(3));
  const { data: events } = useSuspenseQuery(eventsQuery(3));

  const quickStats = [
    { Icon: Layers, label: "برامج أكاديمية", value: `${Math.max(counts.programs ?? 4, 4)}`, suffix: "" },
    { Icon: BookOpen, label: "مقررات دراسية", value: "100", suffix: "+" },
    { Icon: ShieldCheck, label: "بوابة إلكترونية متكاملة", value: "", suffix: "" },
    { Icon: Users2, label: "خدمات رقمية للطلاب", value: "", suffix: "" },
  ];

  return (
    <>
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-hero-gradient text-primary-foreground">
        <div className="absolute inset-0 bg-overlay-gradient" />
        <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-gold/15 blur-3xl" />
        <div className="absolute -left-40 -bottom-40 h-96 w-96 rounded-full bg-primary/40 blur-3xl" />

        <div className="container relative mx-auto px-4 pt-10 pb-16 md:pt-14 md:pb-20">
          {/* Dual logos */}
          <div className="flex items-center justify-center gap-6 md:gap-10">
            <div className="flex flex-col items-center gap-2">
              <div className="grid h-20 w-20 md:h-28 md:w-28 place-items-center rounded-2xl bg-white p-2 shadow-elegant ring-2 ring-gold/40">
                <img src={universityLogo.url} alt="شعار جامعة إقليم سبأ" className="h-full w-full object-contain" />
              </div>
              <div className="text-[11px] md:text-xs font-bold text-gold tracking-wider">جامعة إقليم سبأ</div>
            </div>

            <div className="h-16 md:h-24 w-px bg-gold/30" />

            <div className="flex flex-col items-center gap-2">
              <div className="grid h-20 w-20 md:h-28 md:w-28 place-items-center rounded-2xl bg-white p-2 shadow-elegant ring-2 ring-gold/40">
                <img src={collegeLogo} alt="شعار كلية تكنولوجيا المعلومات وعلوم الحاسوب" className="h-full w-full object-contain" />
              </div>
              <div className="text-[11px] md:text-xs font-bold text-gold tracking-wider">كلية تكنولوجيا المعلومات</div>
            </div>
          </div>

          {/* Title block */}
          <div className="mt-10 text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-[11px] font-bold tracking-widest text-gold uppercase">
              <Sparkles className="h-3.5 w-3.5" /> بوابة إلكترونية رسمية
            </div>

            <h1 className="mt-6 font-display font-extrabold leading-tight text-balance">
              <span className="block text-4xl md:text-6xl lg:text-7xl text-gold">البوابة الإلكترونية</span>
              <span className="block mt-3 text-2xl md:text-3xl lg:text-4xl">
                لكلية تكنولوجيا المعلومات وعلوم الحاسوب
              </span>
              <span className="block mt-2 text-lg md:text-xl text-primary-foreground/85 font-bold">
                جامعة إقليم سبأ
              </span>
            </h1>

            <div className="divider-gold mx-auto mt-6 max-w-xs" />

            <p className="mt-6 text-base md:text-lg text-primary-foreground/85 leading-8 max-w-2xl mx-auto">
              منصة رقمية متكاملة للخدمات الأكاديمية والإدارية،
              تخدم الطلاب وأعضاء هيئة التدريس والموظفين.
            </p>

            {settings.dean_message && (
              <div className="mt-6 mx-auto max-w-2xl rounded-xl border border-white/15 bg-white/[0.06] backdrop-blur-md px-5 py-3 text-xs text-primary-foreground/75 leading-7">
                <span className="text-gold font-bold">{settings.dean_name || "كلمة العميد"}: </span>
                <span className="line-clamp-2">{settings.dean_message}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ PORTAL CARDS — first screen view ============ */}
      <section className="relative -mt-10 z-10 container mx-auto px-4 pb-10">
        <div className="grid gap-4 md:gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PORTAL_CARDS.map((p) => (
            <PortalAccessCard key={p.title} card={p} />
          ))}
        </div>
      </section>

      {/* ============ QUICK STATS ============ */}
      <section className="border-y border-border bg-surface">
        <div className="container mx-auto grid grid-cols-2 gap-3 px-4 py-8 md:gap-5 md:py-10 md:grid-cols-4">
          {quickStats.map((s) => (
            <div key={s.label} className="group rounded-xl border border-border bg-card p-4 md:p-5 text-center shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/50">
              <div className="mx-auto grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-secondary text-primary transition-colors group-hover:bg-gold-gradient group-hover:text-primary-deep">
                <s.Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.2} />
              </div>
              {s.value ? (
                <div className="mt-2.5 font-display text-2xl md:text-3xl font-extrabold text-primary">
                  {s.value}<span className="text-gold">{s.suffix}</span>
                </div>
              ) : (
                <div className="mt-2.5 font-display text-base md:text-lg font-extrabold text-primary leading-tight">
                  {s.label}
                </div>
              )}
              {s.value && (
                <div className="mt-0.5 text-[11px] md:text-xs font-semibold text-muted-foreground">{s.label}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ============ ELECTRONIC SERVICES ============ */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <SectionHeader eyebrow="الخدمات" title="الخدمات الإلكترونية" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((srv) => (
            <Link
              key={srv.title}
              to={srv.to}
              className="group flex items-start gap-4 rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                <srv.Icon className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-base font-bold text-primary group-hover:text-gold transition-colors">
                  {srv.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground leading-6 line-clamp-2">{srv.desc}</div>
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary group-hover:text-gold">
                  الدخول <ArrowLeft className="h-3 w-3" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ PROGRAMS ============ */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <SectionHeader
            eyebrow="البرامج"
            title="البرامج الأكاديمية"
            description="أربعة برامج بكالوريوس متخصصة في علوم الحاسوب وتكنولوجيا المعلومات والأمن السيبراني."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {programs.slice(0, 4).map((p) => {
              const Icon = ICONS[p.icon ?? ""] ?? Cpu;
              return (
                <Link
                  to="/departments/$code"
                  params={{ code: p.code }}
                  key={p.id}
                  className="group relative flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                      <Icon className="h-6 w-6" strokeWidth={2.2} />
                    </div>
                    <span className="rounded-full bg-gold/10 text-gold border border-gold/30 px-2 py-0.5 text-[10px] font-bold">{p.code}</span>
                  </div>
                  <h3 className="mt-4 font-display text-base font-bold text-primary leading-snug line-clamp-2">{p.name_ar}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3 flex-1">{p.description_ar}</p>
                  <div className="mt-4 flex items-center justify-between text-[11px] font-bold border-t border-border pt-3">
                    <span className="inline-flex items-center gap-1 text-primary group-hover:text-gold transition-colors">
                      التفاصيل <ArrowLeft className="h-3 w-3" />
                    </span>
                    <span className="text-muted-foreground">الخطة الدراسية</span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <Link to="/departments" className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-card px-6 py-3 text-sm font-bold text-primary hover:border-gold hover:text-gold transition-colors">
              جميع البرامج <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============ NEWS ============ */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <SectionHeader eyebrow="الإعلام" title="آخر الأخبار" />
          <Link to="/news" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
            عرض جميع الأخبار <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {news.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            لا توجد أخبار منشورة حاليًا.
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {news.slice(0, 3).map((n) => {
              const hasImage = !!n.featured_image;
              return (
                <article key={n.id} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
                  {hasImage && (
                    <div className="relative h-36 bg-hero-gradient overflow-hidden">
                      <img src={n.featured_image ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-bold text-primary-deep">{n.category}</span>
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(n.published_at).toLocaleDateString("ar-EG")}</span>
                      {!hasImage && (
                        <span className="rounded-full bg-gold/15 text-gold border border-gold/30 px-2 py-0 text-[10px] font-bold">{n.category}</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-display text-sm font-bold text-primary line-clamp-2 leading-6">{n.title_ar}</h3>
                    <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3">{n.excerpt_ar}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ============ EVENTS ============ */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-16 md:py-20">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <SectionHeader eyebrow="القادم" title="الفعاليات" />
            <Link to="/events" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
              عرض جميع الفعاليات <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          {events.length === 0 ? (
            <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
              لا توجد فعاليات قادمة حاليًا.
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.slice(0, 3).map((e) => (
                <article key={e.id} className="rounded-xl border border-border bg-card p-5 shadow-card hover:shadow-elegant transition-all hover:-translate-y-1 hover:border-gold/40">
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
                    <Calendar className="h-3 w-3" /> {new Date(e.event_date).toLocaleDateString("ar-EG")}
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold text-primary line-clamp-2 leading-snug">{e.title_ar}</h3>
                  {e.description_ar && <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-2">{e.description_ar}</p>}
                  {e.location && <div className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-gold" /> {e.location}</div>}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ============ RESEARCH ============ */}
      <section className="relative overflow-hidden bg-primary-deep text-primary-foreground">
        <img src={techPattern} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-15" />
        <div className="absolute inset-0 bg-gradient-to-l from-primary-deep via-primary-deep/85 to-primary-deep/40" />
        <div className="container relative mx-auto px-4 py-16 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div>
              <div className="text-xs font-bold tracking-widest text-gold uppercase">البحث العلمي</div>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold">الأبحاث المميزة</h2>
              <div className="divider-gold mt-4" />
              <p className="mt-5 text-primary-foreground/80 leading-8">
                نتائج أبحاث ومشاريع علمية تواكب التحولات التقنية وتخدم سوق العمل، يُسهم بها أعضاء هيئة التدريس والطلاب.
              </p>
              <Link to="/research" className="mt-6 inline-flex items-center gap-2 rounded-md bg-gold-gradient px-6 py-3 text-sm font-extrabold text-primary-deep shadow-gold">
                عرض جميع الأبحاث <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { Icon: FlaskConical, label: "أبحاث منشورة", value: counts.research },
                { Icon: GraduationCap, label: "أعضاء هيئة التدريس", value: counts.faculty },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-white/15 bg-white/[0.05] backdrop-blur-md p-5 text-center">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold-gradient text-primary-deep">
                    <c.Icon className="h-6 w-6" />
                  </div>
                  <div className="mt-3 font-display text-3xl font-extrabold text-gold">{(c.value ?? 0).toLocaleString("ar-EG")}+</div>
                  <div className="mt-1 text-xs text-primary-foreground/75">{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ QUICK ACCESS ============ */}
      <section className="container mx-auto px-4 py-16 md:py-20">
        <SectionHeader eyebrow="اختصارات" title="وصول سريع" />
        <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {QUICK_ACCESS.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
            >
              <div className="grid h-14 w-14 place-items-center rounded-xl bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                <q.Icon className="h-7 w-7" strokeWidth={2} />
              </div>
              <div className="text-center font-display text-sm font-bold text-primary group-hover:text-gold transition-colors">
                {q.label}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}

/* ============ Helpers ============ */

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-xs font-bold tracking-widest text-gold uppercase">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">{title}</h2>
      <div className="divider-gold mt-4" />
      {description && <p className="mt-5 text-muted-foreground leading-8">{description}</p>}
    </div>
  );
}

function PortalAccessCard({ card }: { card: PortalCard }) {
  const toneStyles: Record<PortalCard["tone"], { ring: string; iconBg: string; btn: string; accent: string }> = {
    gold: {
      ring: "border-gold/40 hover:border-gold",
      iconBg: "bg-gold-gradient text-primary-deep",
      btn: "bg-gold-gradient text-primary-deep shadow-gold",
      accent: "text-gold",
    },
    primary: {
      ring: "border-primary/30 hover:border-primary",
      iconBg: "bg-primary text-primary-foreground",
      btn: "bg-primary text-primary-foreground hover:bg-primary-deep",
      accent: "text-primary",
    },
    emerald: {
      ring: "border-emerald-600/30 hover:border-emerald-600",
      iconBg: "bg-emerald-600 text-white",
      btn: "bg-emerald-600 text-white hover:bg-emerald-700",
      accent: "text-emerald-700 dark:text-emerald-400",
    },
    slate: {
      ring: "border-slate-500/30 hover:border-slate-700",
      iconBg: "bg-slate-800 text-white",
      btn: "bg-slate-800 text-white hover:bg-slate-900",
      accent: "text-slate-700 dark:text-slate-300",
    },
  };
  const s = toneStyles[card.tone];
  const Icon = card.Icon;

  return (
    <Link
      to={card.to}
      className={`group relative flex flex-col rounded-2xl border-2 bg-card p-5 shadow-elegant transition-all hover:-translate-y-1 ${s.ring}`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-12 w-12 place-items-center rounded-xl ${s.iconBg} shadow-card`}>
          <Icon className="h-6 w-6" strokeWidth={2.2} />
        </div>
        <div className="leading-tight">
          <div className="text-[10px] font-bold text-muted-foreground">بوابة</div>
          <div className={`font-display text-base font-extrabold ${s.accent}`}>{card.title.replace("بوابة ", "")}</div>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground leading-6 flex-1">
        {card.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5">
            <span className={`mt-1.5 h-1 w-1 rounded-full ${s.accent} bg-current shrink-0`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[12px] font-extrabold transition-all ${s.btn}`}>
        {card.cta} <ArrowLeft className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
