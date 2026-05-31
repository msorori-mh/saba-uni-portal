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
  Sparkles,
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
  UserCheck,
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
  { year: "2017", title: "تأسيس قسم نظم المعلومات الحاسوبية", desc: "بقرار مجلس الجامعة بتاريخ 25/4/2017م، انطلق برنامج CIS بنظام 4 سنوات و132 ساعة معتمدة." },
  { year: "2022", title: "قيادة جديدة للكلية", desc: "تولي أ.م.د. مقبول قايد الكامل عمادة الكلية للفترة 2022 – 2026." },
  { year: "2025", title: "إطلاق الخطة الاستراتيجية 2025-2030", desc: "خطة شاملة بأربعة محاور: التميز الأكاديمي، البحث العلمي، البنية التحتية التكنولوجية، والمسؤولية المجتمعية." },
  { year: "2026", title: "تدشين برامج جديدة", desc: "بدء برنامج بكالوريوس الذكاء الاصطناعي وبرنامج ماجستير تكنولوجيا المعلومات من العام الأكاديمي 2026-2027م بإذن الله." },
];

const values = [
  { icon: Building2, title: "الانتماء والعمل المؤسسي", desc: "تعزيز الانتماء للكلية، وتطبيق اللوائح والقوانين والأنظمة." },
  { icon: Award, title: "الجودة والتميز", desc: "الالتزام بمعايير الجودة، والسعي للتميز في الجوانب الأكاديمية والبحثية والإدارية." },
  { icon: Lightbulb, title: "الإبداع والابتكار", desc: "تعزيز التفكير الإبداعي والابتكار لدى الطلبة وجميع منتسبي الكلية." },
  { icon: HeartHandshake, title: "التعاون والشراكة", desc: "بناء علاقات تعاون وشراكات مع المجتمع والمؤسسات التعليمية والبحثية." },
  { icon: ShieldCheck, title: "المسؤولية والمساءلة", desc: "التأكيد على قيم المسؤولية والمساءلة، والالتزام بأداء الواجب بشكل أخلاقي ومهني." },
  { icon: TrendingUp, title: "التحسين المستمر", desc: "تطوير الأداء في الكلية، والتشجيع نحو التعلم المستمر، وتحديث المعرفة والمهارات." },
];

const goals = [
  { icon: GraduationCap, title: "إعداد كوادر مؤهلة", desc: "تخريج مؤهلين في تكنولوجيا المعلومات وعلوم الحاسوب يمتلكون المعارف والمهارات التقنية لتلبية احتياجات سوق العمل." },
  { icon: FlaskConical, title: "بيئة بحثية متميزة", desc: "توفير بيئة ملائمة للبحث العلمي وتقديم الحلول التقنية في ضوء المستجدات العلمية والتكنولوجية." },
  { icon: Handshake, title: "خدمة المجتمع", desc: "تقديم الخدمات المجتمعية والاستشارية في مجال تكنولوجيا المعلومات وعلوم الحاسوب." },
  { icon: Globe2, title: "الشراكات الأكاديمية", desc: "بناء الشراكات وتبادل الخبرات مع الكليات المناظرة والمؤسسات؛ للارتقاء بالعملية التعليمية والإسهام في التنمية." },
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
        <div className="container mx-auto px-4 py-4">
          <ol className="flex items-center gap-2 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-primary transition-colors">الرئيسية</Link>
            </li>
            <ChevronLeft className="h-4 w-4" />
            <li className="font-bold text-primary">عن الكلية</li>
          </ol>
        </div>
      </nav>

      {/* Vision & Mission */}
      <section className="container mx-auto px-4 py-20">
        <div className="grid gap-8 md:grid-cols-2">
          {[
            { icon: Eye, title: "رؤيتنا", text: vision, accent: "from-primary to-primary-deep" },
            { icon: Target, title: "رسالتنا", text: mission, accent: "from-gold to-gold-glow" },
          ].map((c) => (
            <article
              key={c.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-10 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
            >
              <div className={`absolute -left-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${c.accent} opacity-10 blur-2xl`} />
              <div className="relative grid h-16 w-16 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-gold">
                <c.icon className="h-8 w-8" strokeWidth={2.2} />
              </div>
              <h2 className="relative mt-6 font-display text-3xl font-extrabold text-primary">{c.title}</h2>
              <div className="divider-gold mt-3" />
              <p className="relative mt-5 text-foreground/80 leading-9 text-[17px]">{c.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* College History — Timeline */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-bold tracking-widest text-gold uppercase">المسيرة</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">تاريخ الكلية</h2>
            <div className="divider-gold mt-4" />
            <p className="mt-5 text-muted-foreground leading-8">
              محطات بارزة في مسيرة كلية تكنولوجيا المعلومات وعلوم الحاسوب منذ التأسيس وحتى اليوم.
            </p>
          </div>

          <ol className="relative mt-14 mx-auto max-w-4xl">
            {/* vertical line — RTL: place on the right */}
            <span className="absolute right-4 md:right-1/2 top-0 bottom-0 w-0.5 bg-border md:translate-x-px" aria-hidden />
            {milestones.map((m, i) => (
              <li key={m.year} className="relative mb-10 md:grid md:grid-cols-2 md:gap-10 md:items-start">
                {/* dot */}
                <span
                  className="absolute right-2 md:right-1/2 top-2 grid h-5 w-5 place-items-center rounded-full bg-gold-gradient shadow-gold ring-4 ring-surface md:translate-x-1/2"
                  aria-hidden
                />
                {/* content — alternate sides on desktop */}
                <div className={`pr-12 md:pr-0 ${i % 2 === 0 ? "md:order-1 md:pl-10 md:text-left" : "md:order-2 md:pr-10 md:text-right"}`}>
                  <div className="rounded-xl border border-border bg-card p-6 shadow-card hover:shadow-elegant transition-all hover:border-gold/40">
                    <div className="font-display text-2xl font-extrabold text-gold">{m.year}</div>
                    <h3 className="mt-2 font-display text-lg font-bold text-primary">{m.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-7">{m.desc}</p>
                  </div>
                </div>
                <div className={i % 2 === 0 ? "md:order-2" : "md:order-1"} aria-hidden />
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Values */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">قيمنا</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">قيم الكلية</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            القيم التي نلتزم بها في تعاملنا الأكاديمي والإداري وفي علاقاتنا مع الطلاب والمجتمع.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {values.map((v) => (
            <article key={v.title} className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors shrink-0">
                  <v.icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-primary leading-snug">{v.title}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3">{v.desc}</p>
                </div>
              </div>
            </article>

          ))}
        </div>
      </section>

      {/* Strategic Goals */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">التوجه</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">الأهداف الاستراتيجية</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            مرتكزات نعمل عليها لتحقيق رؤيتنا ورسالتنا في تقديم تعليم وبحث متميّز في علوم الحاسوب.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <article key={g.title} className="group rounded-xl border border-border bg-card p-5 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors shrink-0">
                  <g.icon className="h-5 w-5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-primary leading-snug">{g.title}</h3>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-6 line-clamp-3">{g.desc}</p>
                </div>
              </div>
            </article>

          ))}
        </div>
      </section>

      {/* Dean's Message */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-2xl">
            <div className="text-xs font-bold tracking-widest text-gold uppercase">كلمة العميد</div>
            <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">رسالة ترحيب</h2>
            <div className="divider-gold mt-4" />
          </div>

          <div className="mt-12 grid gap-10 rounded-2xl border border-border bg-card p-8 md:p-12 shadow-elegant lg:grid-cols-12">
            {/* Photo placeholder */}
            <div className="lg:col-span-4">
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-hero-gradient shadow-card">
                <div className="absolute inset-0 bg-overlay-gradient opacity-50" />
                <div className="absolute inset-0 grid place-items-center text-primary-foreground">
                  <div className="text-center">
                    <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-gold-gradient text-primary-deep font-display text-5xl font-extrabold shadow-gold">
                      د
                    </div>
                    <div className="mt-4 px-4 text-sm text-primary-foreground/80">صورة العميد</div>
                  </div>
                </div>
                <div className="absolute bottom-0 right-0 left-0 bg-gradient-to-t from-primary-deep/95 to-transparent p-5 text-primary-foreground">
                  <div className="font-display font-extrabold text-lg">{deanName}</div>
                  <div className="text-xs text-gold mt-0.5">{deanTitle}</div>
                </div>
              </div>
            </div>

            {/* Message */}
            <div className="lg:col-span-8">
              <Quote className="h-12 w-12 text-gold opacity-50" />
              <p className="mt-4 text-foreground/85 leading-9 text-lg">{deanMessage}</p>
              <div className="mt-8 border-t border-border pt-6">
                <div className="font-display font-extrabold text-primary text-lg">{deanName}</div>
                <div className="text-sm text-muted-foreground mt-1">{deanTitle}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">القيادة</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">قيادة الكلية</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            عمداء الكلية الذين أسهموا في رسم مسيرتها الأكاديمية والإدارية.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border-2 border-gold/40 bg-card p-8 shadow-elegant">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-gold-gradient text-primary-deep font-display text-2xl font-extrabold shadow-gold">
                م
              </div>
              <div>
                <div className="inline-block rounded-full bg-gold/15 text-gold border border-gold/30 px-3 py-1 text-xs font-bold">العميد الحالي</div>
                <div className="mt-1 font-display text-xs text-muted-foreground">الفترة 2022 – 2026</div>
              </div>
            </div>
            <h3 className="mt-5 font-display text-xl font-extrabold text-primary">أ.م.د. مقبول قايد الكامل</h3>
            <div className="mt-2 text-sm text-foreground/80">
              <div><span className="font-bold text-primary">الرتبة:</span> أستاذ مشارك</div>
              <div className="mt-1"><span className="font-bold text-primary">التخصص:</span> الذكاء الاصطناعي والأنظمة الموزعة</div>
            </div>
          </article>
          <article className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-muted-foreground">
              <UserCheck className="h-7 w-7" />
            </div>
            <div className="mt-4 font-display text-xs text-muted-foreground">الفترة 2016 – 2022</div>
            <p className="mt-3 text-sm text-muted-foreground leading-7">
              لا توجد بيانات مسجلة لهذا المنصب حالياً.
            </p>
          </article>
        </div>
      </section>

      {/* Labs & Facilities */}
      <section className="bg-surface border-y border-border">
        <div className="container mx-auto px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="text-xs font-bold tracking-widest text-gold uppercase">البنية التحتية</div>
              <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">إدارة المعامل والمختبرات</h2>
              <div className="divider-gold mt-4" />
              <p className="mt-5 text-foreground/85 leading-9 text-[17px]">
                تضم الكلية معامل حاسوب وشبكات وتقنيات معلومات مخصصة للتدريب العملي، وتدعم تنفيذ التطبيقات البرمجية،
                ومشاريع التخرج، والتدريب على الشبكات، وقواعد البيانات، والأمن السيبراني، والذكاء الاصطناعي.
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-foreground/80">
                {[
                  "معامل برمجة وتطوير برمجيات",
                  "معامل شبكات حاسوب واتصالات",
                  "معامل الأمن السيبراني واختبار الاختراق",
                  "معامل قواعد البيانات وتحليل البيانات",
                  "بيئة تطبيقية لمشاريع الذكاء الاصطناعي",
                ].map((l) => (
                  <li key={l} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-gold shrink-0" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Cpu, label: "معامل حاسوب" },
                { icon: Network, label: "معامل شبكات" },
                { icon: ShieldCheck, label: "أمن سيبراني" },
                { icon: FlaskConical, label: "بحث وتطوير" },
              ].map((f) => (
                <div key={f.label} className="rounded-2xl border border-border bg-card p-6 text-center shadow-card hover:border-gold/40 hover:-translate-y-1 transition-all">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-gold-gradient text-primary-deep shadow-gold">
                    <f.icon className="h-6 w-6" />
                  </div>
                  <div className="mt-3 text-sm font-bold text-primary">{f.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Org Structure */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">التنظيم</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">الهيكل التنظيمي</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            التسلسل الإداري والوحدات التنظيمية لكلية تكنولوجيا المعلومات وعلوم الحاسوب.
          </p>
        </div>
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-12 text-center shadow-card">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-secondary text-primary">
            <Building2 className="h-8 w-8" />
          </div>
          <p className="mt-5 font-display text-lg font-bold text-primary">سيتم نشر الهيكل التنظيمي للكلية قريباً.</p>
          <p className="mt-2 text-sm text-muted-foreground">جاري إعداد المخطط التنظيمي الرسمي وسيُعرض فور اعتماده.</p>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="container mx-auto px-4 py-20">
        <div className="relative overflow-hidden rounded-2xl bg-gold-gradient p-10 md:p-14 shadow-gold">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/20 blur-3xl" />
          <div className="relative grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-extrabold text-primary-deep">هل لديك استفسار؟</h2>
              <p className="mt-3 text-primary-deep/85 leading-8 text-lg">
                فريق الكلية جاهز للإجابة على كل أسئلتك حول البرامج الأكاديمية، التسجيل، والخدمات الطلابية.
              </p>
            </div>
            <div className="flex md:justify-end">
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 rounded-md bg-primary-deep px-8 py-4 text-base font-extrabold text-primary-foreground shadow-elegant transition-transform hover:-translate-y-0.5"
              >
                تواصل معنا <ArrowLeft className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
