import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Brain, Calendar, Code2, Cpu, Database, FlaskConical, GraduationCap, MapPin, Newspaper, Shield, Sparkles, Trophy, Users } from "lucide-react";
import heroCampus from "@/assets/hero-campus.jpg";
import techPattern from "@/assets/tech-pattern.jpg";
import { eventsQuery, liveCountsQuery, newsQuery, programsQuery, settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { name: "description", content: "البوابة الرسمية لكلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. تعرّف على برامجنا الأكاديمية، أخبارنا، وفعالياتنا." },
      { property: "og:title", content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { property: "og:description", content: "البوابة الرسمية للكلية — برامج، أخبار، فعاليات." },
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

function HomePage() {
  const { data: programs } = useSuspenseQuery(programsQuery);
  const { data: counts } = useSuspenseQuery(liveCountsQuery);
  const { data: settings } = useSuspenseQuery(settingsQuery);
  const { data: news } = useSuspenseQuery(newsQuery(3));
  const { data: events } = useSuspenseQuery(eventsQuery(3));

  const statCards = [
    { icon: BookOpen, label: "البرامج الأكاديمية", value: counts.programs },
    { icon: GraduationCap, label: "أعضاء هيئة التدريس", value: counts.faculty },
    { icon: FlaskConical, label: "الأبحاث المنشورة", value: counts.research },
    { icon: Newspaper, label: "الأخبار والإعلانات", value: counts.news },
  ];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-gradient text-primary-foreground">
        <img src={heroCampus} alt="" aria-hidden width={1920} height={1080}
             className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-overlay-gradient" />
        <div className="container relative mx-auto grid gap-10 px-4 py-20 md:py-32 lg:grid-cols-12">
          <div className="lg:col-span-8 animate-float-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-white/5 px-4 py-1.5 text-xs font-bold tracking-widest text-gold uppercase">
              <Sparkles className="h-3.5 w-3.5" /> جامعة إقليم سبأ
            </div>
            <h1 className="mt-5 font-display text-4xl md:text-6xl font-extrabold leading-tight text-balance">
              كلية تكنولوجيا المعلومات<br />
              <span className="text-gold">وعلوم الحاسوب</span>
            </h1>
            <div className="divider-gold mt-6" />
            <p className="mt-6 max-w-2xl text-lg text-primary-foreground/80 leading-9">
              نُعدّ جيلًا من المتخصصين في علوم الحاسوب وتقنية المعلومات، عبر برامج أكاديمية متطورة،
              بيئة تعليمية محفّزة، وكوادر تدريسية متميزة تخدم تنمية الوطن وبناء مستقبل أبنائه.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/about"
                    className="inline-flex items-center gap-2 rounded-md bg-gold-gradient px-7 py-3.5 text-sm font-extrabold text-primary-deep shadow-gold transition-transform hover:-translate-y-0.5">
                تعرف على الكلية <ArrowLeft className="h-4 w-4" />
              </Link>
              <Link to="/departments"
                    className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-primary-foreground hover:bg-white/10">
                استكشف برامجنا
              </Link>
              <Link to="/portal-login"
                    className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-primary-foreground hover:bg-white/10">
                بوابة الطالب
              </Link>
            </div>
          </div>

          <div className="lg:col-span-4 lg:mt-12">
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-md p-7 shadow-elegant">
              <div className="text-xs font-bold tracking-widest text-gold uppercase">كلمة عميد الكلية</div>
              <p className="mt-4 text-sm leading-8 text-primary-foreground/85 line-clamp-6">
                {settings.dean_message || "نرحب بكم في بوابة الكلية الرقمية."}
              </p>
              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-gold-gradient text-primary-deep font-extrabold">
                  {(settings.dean_name || "د").trim().charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-bold text-gold">{settings.dean_name || "عميد الكلية"}</div>
                  <div className="text-xs text-primary-foreground/60 line-clamp-1">{settings.dean_title || "كلية تكنولوجيا المعلومات"}</div>
                </div>
              </div>
              <Link to="/about" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-gold hover:underline">
                اقرأ الكلمة كاملة <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border bg-surface">
        <div className="container mx-auto grid grid-cols-2 gap-5 px-4 py-12 md:grid-cols-4">
          {statCards.map((s) => (
            <div key={s.label} className="group rounded-xl border border-border bg-card p-6 text-center shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/50">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-secondary text-primary transition-colors group-hover:bg-gold-gradient group-hover:text-primary-deep">
                <s.icon className="h-7 w-7" strokeWidth={2.2} />
              </div>
              <div className="mt-4 font-display text-3xl md:text-4xl font-extrabold text-primary">
                {s.value.toLocaleString("ar-EG")}
                <span className="text-gold">+</span>
              </div>
              <div className="mt-1 text-xs md:text-sm font-semibold text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Programs */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">برامجنا</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">البرامج الأكاديمية</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            برامج متخصصة على مستوى البكالوريوس والماجستير تغطي علوم الحاسوب، تكنولوجيا المعلومات والاتصالات، نظم المعلومات الحاسوبية، الأمن السيبراني، والذكاء الاصطناعي.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {programs.map((p) => {
            const Icon = ICONS[p.icon ?? ""] ?? Cpu;
            return (
              <Link to="/departments/$code" params={{ code: p.code }} key={p.id}
                       className="group relative overflow-hidden rounded-xl border border-border bg-card p-7 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
                <div className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                  <Icon className="h-7 w-7" strokeWidth={2.2} />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-primary">{p.name_ar}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-7 line-clamp-3">{p.description_ar}</p>
                <div className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:text-gold transition-colors">
                  التفاصيل <ArrowLeft className="h-4 w-4" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Why us */}
      <section className="relative overflow-hidden bg-primary-deep text-primary-foreground">
        <img src={techPattern} alt="" aria-hidden loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-l from-primary-deep via-primary-deep/85 to-primary-deep/40" />
        <div className="container relative mx-auto grid gap-10 px-4 py-20 md:grid-cols-3">
          {[
            { icon: Users, t: "كادر تدريسي متميّز", d: "أساتذة من حملة الدكتوراه والماجستير بخبرة أكاديمية وعملية واسعة." },
            { icon: Trophy, t: "بيئة بحثية محفّزة", d: "أبحاث ومشاريع تخرج تواكب التحولات التقنية وتخدم سوق العمل." },
            { icon: Cpu, t: "بنية تحتية حديثة", d: "مختبرات حاسوب مجهّزة بأحدث المعدات والبرمجيات المتخصصة." },
          ].map((f) => (
            <div key={f.t}>
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-gold">{f.t}</h3>
              <p className="mt-2 text-sm leading-8 text-primary-foreground/75">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Latest News */}
      <section className="container mx-auto px-4 py-20">
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-bold tracking-widest text-gold uppercase">الإعلام</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">آخر الأخبار</h2>
            <div className="divider-gold mt-4" />
          </div>
          <Link to="/news" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
            جميع الأخبار <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>

        {news.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            لا توجد أخبار منشورة حاليًا.
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {news.map((n) => (
              <article key={n.id} className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
                <div className="relative h-40 bg-hero-gradient overflow-hidden">
                  {n.featured_image && <img src={n.featured_image} alt="" className="h-full w-full object-cover opacity-70" loading="lazy" />}
                  <span className="absolute bottom-3 right-3 rounded-full bg-gold px-3 py-1 text-xs font-bold text-primary-deep">{n.category}</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> {new Date(n.published_at).toLocaleDateString("ar-EG")}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold text-primary line-clamp-2">{n.title_ar}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-7 line-clamp-3">{n.excerpt_ar}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Events */}
      {events.length > 0 && (
        <section className="bg-surface border-y border-border">
          <div className="container mx-auto px-4 py-20">
            <div className="flex items-end justify-between flex-wrap gap-4">
              <div>
                <div className="text-xs font-bold tracking-widest text-gold uppercase">القادم</div>
                <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">الفعاليات القادمة</h2>
                <div className="divider-gold mt-4" />
              </div>
              <Link to="/events" className="text-sm font-bold text-primary hover:text-gold inline-flex items-center gap-1">
                كل الفعاليات <ArrowLeft className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {events.map((e) => (
                <article key={e.id} className="rounded-xl border border-border bg-card p-6 shadow-card hover:shadow-elegant transition-all hover:-translate-y-1">
                  <div className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                    <Calendar className="h-3.5 w-3.5" /> {new Date(e.event_date).toLocaleDateString("ar-EG")}
                  </div>
                  <h3 className="mt-4 font-display text-lg font-bold text-primary line-clamp-2">{e.title_ar}</h3>
                  {e.description_ar && <p className="mt-2 text-sm text-muted-foreground leading-7 line-clamp-3">{e.description_ar}</p>}
                  {e.location && <div className="mt-3 text-xs text-muted-foreground">📍 {e.location}</div>}
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="rounded-2xl bg-hero-gradient p-10 md:p-14 text-primary-foreground shadow-elegant relative overflow-hidden">
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-extrabold">انضم إلى كلية التقنية</h2>
              <p className="mt-3 text-primary-foreground/80 leading-8">
                ابدأ رحلتك الأكاديمية معنا واكتشف برامجنا المتميزة في علوم الحاسوب وتقنية المعلومات.
              </p>
            </div>
            <div className="flex md:justify-end gap-3 flex-wrap">
              <Link to="/contact" className="rounded-md bg-gold-gradient px-7 py-3.5 text-sm font-extrabold text-primary-deep shadow-gold">
                تواصل معنا
              </Link>
              <Link to="/portal-login" className="rounded-md border border-white/30 bg-white/5 px-7 py-3.5 text-sm font-bold">
                بوابة الطالب
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
