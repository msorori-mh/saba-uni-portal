import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import {
  Eye,
  Target,
  GraduationCap,
  FlaskConical,
  Handshake,
  Globe2,
  ShieldCheck,
  ChevronLeft,
  Quote,
  ArrowLeft,
  Building2,
  HeartHandshake,
  Award,
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  Cpu,
  Network,
} from "lucide-react";
import { settingsQuery } from "@/lib/queries";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "عن الكلية — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تعرّف على رؤية ورسالة كلية تكنولوجيا المعلومات وعلوم الحاسوب، قيمها، أهدافها، قيادتها، وكلمة العميد." },
      { property: "og:title", content: "عن الكلية — كلية تكنولوجيا المعلومات" },
      { property: "og:description", content: "رؤيتنا ورسالتنا وقيمنا وأهدافنا الاستراتيجية." },
      { property: "og:url", content: "/about" },
    ],
    links: [{ rel: "canonical", href: "/about" }],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(settingsQuery),
  component: AboutPage,
});

const milestones = [
  { year: "2017", title: "تأسيس قسم نظم المعلومات الحاسوبية", desc: "بقرار مجلس الجامعة 25/4/2017م — برنامج CIS بنظام 4 سنوات و132 ساعة معتمدة." },
  { year: "2022", title: "قيادة جديدة للكلية", desc: "تولي أ.م.د. مقبول قايد الكامل عمادة الكلية للفترة 2022 – 2026." },
  { year: "2025", title: "إطلاق الخطة الاستراتيجية 2025-2030", desc: "أربعة محاور: التميز الأكاديمي، البحث العلمي، البنية التحتية، والمسؤولية المجتمعية." },
  { year: "2026", title: "تدشين برامج جديدة", desc: "بكالوريوس الذكاء الاصطناعي وماجستير تكنولوجيا المعلومات — العام الأكاديمي 2026-2027م." },
];

const values = [
  { icon: Building2, title: "الانتماء والعمل المؤسسي", desc: "تعزيز الانتماء وتطبيق اللوائح والأنظمة." },
  { icon: Award, title: "الجودة والتميز", desc: "الالتزام بمعايير الجودة في كل الجوانب." },
  { icon: Lightbulb, title: "الإبداع والابتكار", desc: "تعزيز التفكير الإبداعي لدى منتسبي الكلية." },
  { icon: HeartHandshake, title: "التعاون والشراكة", desc: "بناء شراكات مع المجتمع والمؤسسات." },
  { icon: ShieldCheck, title: "المسؤولية والمساءلة", desc: "أداء الواجب بشكل أخلاقي ومهني." },
  { icon: TrendingUp, title: "التحسين المستمر", desc: "تطوير الأداء والتعلم المستمر." },
];

const goals = [
  { icon: GraduationCap, title: "إعداد كوادر مؤهلة", desc: "تخريج مؤهلين في تكنولوجيا المعلومات لسوق العمل." },
  { icon: FlaskConical, title: "بيئة بحثية متميزة", desc: "توفير بيئة ملائمة للبحث العلمي والحلول التقنية." },
  { icon: Handshake, title: "خدمة المجتمع", desc: "خدمات مجتمعية واستشارية في مجال التقنية." },
  { icon: Globe2, title: "الشراكات الأكاديمية", desc: "تبادل الخبرات مع الكليات المناظرة والمؤسسات." },
];


function AboutPage() {
  const { data: settings } = useSuspenseQuery(settingsQuery);

  const vision = settings["vision"] ?? "";
  const mission = settings["mission"] ?? "";
  const deanName = settings["dean_name"] ?? "عميد الكلية";
  const deanTitle = settings["dean_title"] ?? "";
  const deanMessage = settings["dean_message"] ?? "";

  return (
    <>
      <PageHeader
        eyebrow="من نحن"
        title="عن الكلية"
        subtitle="صرح أكاديمي متخصص في إعداد كوادر مؤهلة في علوم الحاسوب وتقنية المعلومات تخدم متطلبات العصر الرقمي."
      />

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="border-b border-border bg-surface">
        <div className="container mx-auto px-4 py-3">
          <ol className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
            <li><Link to="/" className="hover:text-primary transition-colors">الرئيسية</Link></li>
            <ChevronLeft className="h-3.5 w-3.5" />
            <li className="font-bold text-primary">عن الكلية</li>
          </ol>
        </div>
      </nav>

      {/* Vision & Mission — compact 2-col */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="grid gap-4 md:gap-5 md:grid-cols-2">
          {[
            { icon: Eye, title: "رؤيتنا", text: vision, accent: "from-primary to-primary-deep" },
            { icon: Target, title: "رسالتنا", text: mission, accent: "from-gold to-gold-glow" },
          ].map((c) => (
            <article
              key={c.title}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 md:p-6 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-elegant hover:border-gold/40"
            >
              <div className={`absolute -left-12 -top-12 h-28 w-28 rounded-full bg-gradient-to-br ${c.accent} opacity-10 blur-2xl`} />
              <div className="relative flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-gold-gradient text-primary-deep shadow-gold shrink-0">
                  <c.icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <h2 className="font-display text-xl md:text-2xl font-extrabold text-primary">{c.title}</h2>
              </div>
              <p className="relative mt-3 text-sm md:text-[15px] text-foreground/80 leading-7">{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Values + Goals — two compact list cards side by side */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="max-w-2xl mb-6">
            <div className="text-[11px] font-bold tracking-widest text-gold uppercase">المبادئ والتوجه</div>
            <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">قيمنا وأهدافنا</h2>
            <div className="divider-gold mt-3" />
          </div>

          <div className="grid gap-4 md:gap-5 lg:grid-cols-2">
            {/* Values list card */}
            <article className="rounded-xl border border-border bg-card p-4 md:p-5 shadow-card">
              <header className="flex items-center gap-2.5 pb-3 mb-3 border-b border-border/70">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-primary">
                  <Award className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base md:text-lg font-extrabold text-primary leading-none">قيم الكلية</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">ما نلتزم به أكاديمياً وإدارياً</p>
                </div>
              </header>
              <ul className="divide-y divide-border/60">
                {values.map((v) => (
                  <li key={v.title} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-primary shrink-0">
                      <v.icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-primary text-sm leading-snug">{v.title}</div>
                      <div className="text-xs text-muted-foreground leading-6 mt-0.5">{v.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            {/* Goals list card */}
            <article className="rounded-xl border border-border bg-card p-4 md:p-5 shadow-card">
              <header className="flex items-center gap-2.5 pb-3 mb-3 border-b border-border/70">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gold-gradient text-primary-deep shadow-gold">
                  <Target className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display text-base md:text-lg font-extrabold text-primary leading-none">الأهداف الاستراتيجية</h3>
                  <p className="text-[11px] text-muted-foreground mt-1">مرتكزات تحقيق الرؤية والرسالة</p>
                </div>
              </header>
              <ul className="divide-y divide-border/60">
                {goals.map((g) => (
                  <li key={g.title} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-secondary text-primary shrink-0">
                      <g.icon className="h-4 w-4" strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-primary text-sm leading-snug">{g.title}</div>
                      <div className="text-xs text-muted-foreground leading-6 mt-0.5">{g.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* College History — compact Timeline */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-2xl mb-6">
          <div className="text-[11px] font-bold tracking-widest text-gold uppercase">المسيرة</div>
          <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">تاريخ الكلية</h2>
          <div className="divider-gold mt-3" />
          <p className="mt-3 text-sm text-muted-foreground leading-7">
            محطات بارزة منذ التأسيس وحتى اليوم.
          </p>
        </div>

        <ol className="relative mx-auto max-w-3xl">
          {/* RTL vertical line */}
          <span className="absolute right-3 top-1 bottom-1 w-px bg-border" aria-hidden />
          {milestones.map((m) => (
            <li key={m.year} className="relative pr-10 pb-5 last:pb-0">
              <span
                className="absolute right-1.5 top-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-gold-gradient shadow-gold ring-4 ring-background"
                aria-hidden
              />
              <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-card hover:border-gold/40 transition-colors">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-base font-extrabold text-gold">{m.year}</span>
                  <span className="text-[11px] text-muted-foreground">•</span>
                  <h3 className="font-display text-sm md:text-base font-bold text-primary">{m.title}</h3>
                </div>
                <p className="mt-1 text-xs md:text-sm text-muted-foreground leading-6">{m.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Dean's Message — compact */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="max-w-2xl mb-5">
            <div className="text-[11px] font-bold tracking-widest text-gold uppercase">كلمة العميد</div>
            <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">رسالة ترحيب</h2>
            <div className="divider-gold mt-3" />
          </div>

          <div className="grid gap-5 rounded-xl border border-border bg-card p-5 md:p-7 shadow-elegant md:grid-cols-12">
            <div className="md:col-span-3">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-hero-gradient shadow-card">
                <div className="absolute inset-0 grid place-items-center">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gold-gradient text-primary-deep font-display text-3xl font-extrabold shadow-gold">
                    د
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="font-display font-extrabold text-primary text-sm md:text-base">{deanName}</div>
                <div className="text-xs text-gold mt-0.5">{deanTitle}</div>
              </div>
            </div>
            <div className="md:col-span-9">
              <Quote className="h-7 w-7 text-gold opacity-60" />
              <p className="mt-2 text-foreground/85 leading-7 text-sm md:text-[15px]">{deanMessage}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership — single compact card */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-2xl mb-5">
          <div className="text-[11px] font-bold tracking-widest text-gold uppercase">القيادة</div>
          <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">قيادة الكلية</h2>
          <div className="divider-gold mt-3" />
        </div>
        <article className="rounded-xl border-2 border-gold/40 bg-card p-4 md:p-5 shadow-elegant">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-gold-gradient text-primary-deep font-display text-xl font-extrabold shadow-gold shrink-0">
              م
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-base md:text-lg font-extrabold text-primary">أ.م.د. مقبول قايد الكامل</h3>
                <span className="inline-block rounded-full bg-gold/15 text-gold border border-gold/30 px-2 py-0.5 text-[10px] font-bold">العميد الحالي</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-foreground/80">
                <span><span className="font-bold text-primary">الفترة:</span> 2022 – 2026</span>
                <span><span className="font-bold text-primary">الرتبة:</span> أستاذ مشارك</span>
                <span><span className="font-bold text-primary">التخصص:</span> الذكاء الاصطناعي والأنظمة الموزعة</span>
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Labs & Facilities — compact */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-10 md:py-14">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <div>
              <div className="text-[11px] font-bold tracking-widest text-gold uppercase">البنية التحتية</div>
              <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">إدارة المعامل والمختبرات</h2>
              <div className="divider-gold mt-3" />
              <p className="mt-3 text-sm md:text-[15px] text-foreground/85 leading-7">
                معامل حاسوب وشبكات وتقنيات معلومات لدعم التدريب العملي، مشاريع التخرج، الشبكات، قواعد البيانات، الأمن السيبراني، والذكاء الاصطناعي.
              </p>
              <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
                {[
                  "معامل برمجة وتطوير برمجيات",
                  "معامل شبكات حاسوب واتصالات",
                  "معامل الأمن السيبراني واختبار الاختراق",
                  "معامل قواعد البيانات وتحليل البيانات",
                  "بيئة تطبيقية لمشاريع الذكاء الاصطناعي",
                ].map((l) => (
                  <li key={l} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-gold shrink-0" />
                    <span className="leading-6">{l}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Cpu, label: "معامل حاسوب" },
                { icon: Network, label: "معامل شبكات" },
                { icon: ShieldCheck, label: "أمن سيبراني" },
                { icon: FlaskConical, label: "بحث وتطوير" },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 shadow-card hover:border-gold/40 transition-all">
                  <div className="grid h-9 w-9 place-items-center rounded-md bg-gold-gradient text-primary-deep shadow-gold shrink-0">
                    <f.icon className="h-4 w-4" />
                  </div>
                  <div className="text-sm font-bold text-primary">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Org Structure — slim inline notice */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="max-w-2xl mb-5">
          <div className="text-[11px] font-bold tracking-widest text-gold uppercase">التنظيم</div>
          <h2 className="mt-1.5 font-display text-2xl md:text-3xl font-extrabold text-primary">الهيكل التنظيمي</h2>
          <div className="divider-gold mt-3" />
        </div>
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 shadow-card">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-primary shrink-0">
            <Building2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-primary text-sm">سيتم نشر الهيكل التنظيمي قريباً</div>
            <p className="text-xs text-muted-foreground mt-0.5 leading-6">جاري إعداد المخطط التنظيمي الرسمي وسيُعرض فور اعتماده.</p>
          </div>
        </div>
      </section>

      {/* Contact CTA — compact */}
      <section className="container mx-auto px-4 py-10 md:py-14">
        <div className="relative overflow-hidden rounded-xl bg-gold-gradient p-5 md:p-7 shadow-gold">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/20 blur-3xl" />
          <div className="relative grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <h2 className="font-display text-xl md:text-2xl font-extrabold text-primary-deep">هل لديك استفسار؟</h2>
              <p className="mt-1.5 text-primary-deep/85 leading-7 text-sm md:text-[15px]">
                فريق الكلية جاهز للإجابة على أسئلتك حول البرامج، التسجيل، والخدمات الطلابية.
              </p>
            </div>
            <Link
              to="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary-deep px-5 py-2.5 text-sm font-extrabold text-primary-foreground shadow-elegant transition-transform hover:-translate-y-0.5"
            >
              تواصل معنا <ArrowLeft className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
