import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeft, BookOpen, Brain, Calendar, Code2, Cpu, Database, FileCheck,
  FlaskConical, GraduationCap, Layers, Mail, MapPin, Newspaper, Phone,
  Shield, ShieldCheck, Sparkles, Target, Eye, Award, Briefcase, Users2, MessageSquare,
} from "lucide-react";
import collegeLogo from "@/assets/college-logo.jpg";
import universityLogo from "@/assets/university-logo.jpeg.asset.json";
import techPattern from "@/assets/tech-pattern.jpg";
import { StatCard } from "@/components/brand";
import { eventsQuery, liveCountsQuery, newsQuery, programsQuery, settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "بوابة كلية تكنولوجيا المعلومات — جامعة إقليم سبأ" },
      { name: "description", content: "البوابة الإلكترونية الرسمية لكلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. الدخول إلى بوابات الطلاب وأعضاء هيئة التدريس والموظفين." },
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
  short: string;
  cta: string;
  to: string;
  search?: Record<string, string>;
  tone: "gold" | "primary" | "emerald" | "slate";
};

const PORTAL_CARDS: PortalCard[] = [
  {
    Icon: GraduationCap, emoji: "🎓", title: "بوابة الطالب", tone: "gold",
    short: "خدمات أكاديمية وإدارية متكاملة للطلاب.",
    cta: "دخول بوابة الطالب", to: "/portal-login", search: { type: "student" },
  },
  {
    Icon: BookOpen, emoji: "👨‍🏫", title: "بوابة أعضاء هيئة التدريس", tone: "primary",
    short: "إدارة المجموعات والدرجات والأنشطة الأكاديمية.",
    cta: "دخول بوابة أعضاء هيئة التدريس", to: "/portal-login", search: { type: "faculty" },
  },
  {
    Icon: Briefcase, emoji: "👨‍💼", title: "بوابة الموظفين", tone: "emerald",
    short: "إدارة الخدمات الأكاديمية والإدارية.",
    cta: "دخول بوابة الموظفين", to: "/portal-login", search: { type: "staff" },
  },
];

const QUICK_ACCESS = [
  { Icon: FileCheck, label: "التحقق من وثيقة", to: "/verify-document" as const },
  { Icon: Layers, label: "البرامج الأكاديمية", to: "/departments" as const },
  { Icon: Newspaper, label: "الأخبار", to: "/news" as const },
  { Icon: Calendar, label: "الفعاليات", to: "/events" as const },
  { Icon: FlaskConical, label: "الأبحاث", to: "/research" as const },
  { Icon: Phone, label: "تواصل معنا", to: "/contact" as const },
];

function HomePage() {
  const { data: programs } = useSuspenseQuery(programsQuery);
  const { data: counts } = useSuspenseQuery(liveCountsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: news } = useSuspenseQuery(newsQuery(3));
  const { data: events } = useSuspenseQuery(eventsQuery(3));

  const stats = [
    { Icon: Layers, value: `${Math.max(counts.programs ?? 4, 4)}`, label: "برامج أكاديمية" },
    { Icon: BookOpen, value: "100+", label: "مقررات دراسية" },
    { Icon: ShieldCheck, value: null, label: "بوابة إلكترونية متكاملة" },
    { Icon: Users2, value: null, label: "خدمات رقمية للطلاب" },
  ];

  const aboutCards = [
    {
      Icon: MessageSquare,
      title: "كلمة عميد الكلية",
      excerpt: settings.dean_message
        ? settings.dean_message
        : "أرحب بكم في البوابة الإلكترونية لكلية تكنولوجيا المعلومات وعلوم الحاسوب…",
      cta: "قراءة الكلمة كاملة",
      to: "/about" as const,
    },
    {
      Icon: Eye,
      title: "رؤية الكلية",
      excerpt: "الريادة في تعليم تكنولوجيا المعلومات وعلوم الحاسوب وإعداد كوادر تنافسية.",
      cta: "اقرأ المزيد",
      to: "/about" as const,
    },
    {
      Icon: Target,
      title: "رسالة الكلية",
      excerpt: "تقديم تعليم نوعي وبحث علمي يخدم المجتمع ويواكب التطورات التقنية.",
      cta: "اقرأ المزيد",
      to: "/about" as const,
    },
    {
      Icon: Award,
      title: "الأهداف الاستراتيجية",
      excerpt: "تطوير البرامج الأكاديمية، تعزيز البحث، وبناء شراكات فاعلة.",
      cta: "اقرأ المزيد",
      to: "/about" as const,
    },
  ];

  return (
    <>
      {/* ============ HERO — Schedule-portal style ============ */}
      <section className="relative overflow-hidden bg-primary-deep text-primary-foreground">
        {/* vertical gold divider on the leading edge */}
        <div className="pointer-events-none absolute inset-y-0 left-8 md:left-16 w-px bg-gold/60" />

        <div className="relative mx-auto flex min-h-[calc(100vh-14rem)] max-w-2xl flex-col items-center justify-center px-4 py-16 md:py-24 text-center">
          {/* Logo card */}
          <div className="grid h-36 w-36 md:h-40 md:w-40 place-items-center rounded-2xl bg-white p-3 shadow-elegant">
            <img src={universityLogo.url} alt="شعار جامعة إقليم سبأ" className="h-full w-full object-contain" />
          </div>

          {/* Title */}
          <h1 className="mt-8 font-display font-black leading-tight text-white text-3xl md:text-4xl">
            <span className="block">البوابة الإلكترونية</span>
            <span className="block mt-2 whitespace-nowrap">كلية تكنولوجيا المعلومات وعلوم الحاسوب</span>
          </h1>

          {/* Notice box */}
          <div className="mt-6 rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm px-5 py-4 text-sm md:text-[15px] text-white/85 leading-7 max-w-xl">
            منصة رقمية متكاملة للخدمات الأكاديمية والإدارية، تخدم الطلاب وأعضاء هيئة التدريس والموظفين في الكلية
          </div>

          {/* Login CTA */}
          <Link
            to="/portal-login"
            className="mt-8 inline-flex items-center justify-center rounded-md bg-gold-gradient px-12 py-4 text-base font-extrabold text-primary-deep shadow-gold transition-all hover:-translate-y-0.5"
          >
            تسجيل الدخول
          </Link>
        </div>
      </section>


      {/* ============ PORTAL CARDS ============ */}
      <section className="relative -mt-6 md:-mt-8 z-10 container mx-auto px-4 pb-8">
        <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PORTAL_CARDS.map((p) => <PortalAccessCard key={p.title} card={p} />)}
        </div>
      </section>

      {/* ============ QUICK ACCESS ============ */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <SectionHeader eyebrow="اختصارات" title="وصول سريع" />
        <div className="mt-6 grid grid-cols-3 gap-2.5 md:gap-4 md:grid-cols-6">
          {QUICK_ACCESS.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 md:p-4 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
            >
              <div className="grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                <q.Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2} />
              </div>
              <div className="text-center font-display text-[11px] md:text-xs font-bold text-primary group-hover:text-gold transition-colors leading-tight">
                {q.label}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ PROGRAMS ============ */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <SectionHeader
            eyebrow="البرامج"
            title="البرامج الأكاديمية"
            description="أربعة برامج بكالوريوس متخصصة في علوم الحاسوب وتكنولوجيا المعلومات والأمن السيبراني."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {programs.slice(0, 4).map((p) => {
              const Icon = ICONS[p.icon ?? ""] ?? Cpu;
              return (
                <Link
                  to="/departments/$code"
                  params={{ code: p.code }}
                  key={p.id}
                  className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                      <Icon className="h-5 w-5" strokeWidth={2.2} />
                    </div>
                    <span className="rounded-full bg-gold/10 text-gold border border-gold/30 px-2 py-0.5 text-[10px] font-bold">{p.code}</span>
                  </div>
                  <h3 className="mt-3 font-display text-sm font-bold text-primary leading-snug line-clamp-2">{p.name_ar}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-2 flex-1">{p.description_ar}</p>
                  <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary group-hover:text-gold border-t border-border pt-2.5">
                    التفاصيل <ArrowLeft className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="mt-6 text-center">
            <Link to="/departments" className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-card px-5 py-2.5 text-sm font-bold text-primary hover:border-gold hover:text-gold transition-colors">
              جميع البرامج <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============ STATS ============ */}
      <section className="container mx-auto px-4 py-10 md:py-12">
        <div className="card-grid md:grid-cols-4">
          {stats.map((s) => (
            <StatCard
              key={s.label}
              icon={s.Icon}
              label={s.label}
              value={s.value ?? s.label}
              className="text-center [&_p:last-of-type]:text-base [&_p:last-of-type]:md:text-lg"
            />
          ))}
        </div>
      </section>

      {/* ============ NEWS ============ */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <SectionHeader eyebrow="الإعلام" title="آخر الأخبار" />
            <Link to="/news" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
              عرض جميع الأخبار <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>

          {news.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              لا توجد أخبار منشورة حاليًا.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {news.slice(0, 3).map((n) => {
                const hasImage = !!n.featured_image;
                return (
                  <article key={n.id} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
                    {hasImage && (
                      <div className="relative h-32 bg-hero-gradient overflow-hidden">
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
        </div>
      </section>

      {/* ============ EVENTS ============ */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <SectionHeader eyebrow="القادم" title="الفعاليات" />
          <Link to="/events" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
            عرض جميع الفعاليات <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {events.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            لا توجد فعاليات قادمة حاليًا.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
      </section>

      {/* ============ RESEARCH ============ */}
      <section className="relative overflow-hidden bg-hero-gradient text-primary-foreground">
        <img src={techPattern} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-15" />
        <div className="absolute inset-0 bg-overlay-gradient" />
        <div className="container relative mx-auto px-4 py-12 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="text-xs font-bold tracking-widest text-gold uppercase">البحث العلمي</div>
              <h2 className="mt-2 font-display text-2xl md:text-3xl font-extrabold">الأبحاث المميزة</h2>
              <div className="divider-gold mt-3" />
              <p className="mt-4 text-sm md:text-base text-primary-foreground/80 leading-7">
                نتائج أبحاث ومشاريع علمية تواكب التحولات التقنية وتخدم سوق العمل.
              </p>
              <Link to="/research" className="mt-5 inline-flex items-center gap-2 rounded-md bg-gold-gradient px-5 py-2.5 text-sm font-extrabold text-primary-deep shadow-gold">
                عرض جميع الأبحاث <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              {[
                { Icon: FlaskConical, label: "أبحاث منشورة", value: counts.research },
                { Icon: GraduationCap, label: "أعضاء هيئة التدريس", value: counts.faculty },
              ].map((c) => (
                <div key={c.label} className="rounded-xl border border-white/15 bg-white/[0.05] backdrop-blur-md p-4 md:p-5 text-center">
                  <div className="mx-auto grid h-10 w-10 md:h-12 md:w-12 place-items-center rounded-full bg-gold-gradient text-primary-deep">
                    <c.Icon className="h-5 w-5 md:h-6 md:w-6" />
                  </div>
                  <div className="mt-2 font-display text-2xl md:text-3xl font-extrabold text-gold">{(c.value ?? 0).toLocaleString("ar-EG")}+</div>
                  <div className="mt-0.5 text-[11px] md:text-xs text-primary-foreground/75">{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============ ABOUT ============ */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <SectionHeader eyebrow="عن الكلية" title="نبذة عن الكلية" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {aboutCards.map((a) => (
            <Link
              key={a.title}
              to={a.to}
              className="group flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
            >
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                <a.Icon className="h-5 w-5" strokeWidth={2.2} />
              </div>
              <h3 className="mt-3 font-display text-sm font-bold text-primary leading-snug">{a.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3 flex-1">{a.excerpt}</p>
              <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-primary group-hover:text-gold border-t border-border pt-2.5">
                {a.cta} <ArrowLeft className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ============ CONTACT ============ */}
      <section className="bg-surface border-t border-border">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <SectionHeader eyebrow="تواصل" title="تواصل معنا" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {settings.contact_address && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep"><MapPin className="h-5 w-5" /></div>
                <div className="mt-3 font-display text-sm font-bold text-primary">العنوان</div>
                <div className="mt-1 text-xs text-muted-foreground leading-6">{settings.contact_address}</div>
              </div>
            )}
            {settings.contact_phone && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep"><Phone className="h-5 w-5" /></div>
                <div className="mt-3 font-display text-sm font-bold text-primary">الهاتف</div>
                <div className="mt-1 text-xs text-muted-foreground" dir="ltr">{settings.contact_phone}</div>
              </div>
            )}
            {settings.contact_email && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep"><Mail className="h-5 w-5" /></div>
                <div className="mt-3 font-display text-sm font-bold text-primary">البريد الإلكتروني</div>
                <div className="mt-1 text-xs text-muted-foreground" dir="ltr">{settings.contact_email}</div>
              </div>
            )}
          </div>
          <div className="mt-6 text-center">
            <Link to="/contact" className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-extrabold text-primary-foreground hover:bg-primary-deep transition-colors">
              تواصل معنا <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
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
      <h2 className="mt-2 font-display text-2xl md:text-3xl font-extrabold text-primary">{title}</h2>
      <div className="divider-gold mt-3" />
      {description && <p className="mt-4 text-sm md:text-base text-muted-foreground leading-7">{description}</p>}
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
      to={card.to as any}
      search={(card.search as any) ?? undefined}
      className={`group relative flex flex-col rounded-2xl border-2 bg-card p-4 md:p-5 shadow-elegant transition-all hover:-translate-y-1 ${s.ring}`}
    >
      <div className="flex items-center gap-3">
        <div className={`grid h-11 w-11 md:h-12 md:w-12 place-items-center rounded-xl ${s.iconBg} shadow-card`}>
          <Icon className="h-5 w-5 md:h-6 md:w-6" strokeWidth={2.2} />
        </div>
        <div className={`font-display text-sm md:text-base font-extrabold ${s.accent} leading-tight`}>
          {card.title}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground leading-6 flex-1">{card.short}</p>

      <div className={`mt-4 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[12px] font-extrabold transition-all ${s.btn}`}>
        {card.cta} <ArrowLeft className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
