import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Code2, Cpu, Database, Network, ShieldCheck, Sparkles, Users, BookOpen, Trophy } from "lucide-react";
import heroCampus from "@/assets/hero-campus.jpg";
import techPattern from "@/assets/tech-pattern.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { name: "description", content: "البوابة الرسمية لكلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ. تعرّف على أقسامنا وأخبارنا وبرامجنا الأكاديمية." },
      { property: "og:title", content: "كلية تكنولوجيا المعلومات وعلوم الحاسوب — جامعة إقليم سبأ" },
      { property: "og:description", content: "البوابة الرسمية للكلية — أقسام، أبحاث، أخبار." },
    ],
  }),
  component: HomePage,
});

const departments = [
  { icon: Code2, name: "هندسة البرمجيات", desc: "تصميم وتطوير الأنظمة البرمجية الحديثة وتطبيقات الويب والجوال." },
  { icon: Network, name: "شبكات الحاسوب", desc: "بناء وإدارة البنى التحتية للشبكات والاتصالات الرقمية." },
  { icon: ShieldCheck, name: "الأمن السيبراني", desc: "حماية الأنظمة والبيانات من التهديدات والمخاطر الإلكترونية." },
  { icon: Database, name: "نظم المعلومات", desc: "تحليل وتصميم نظم المعلومات الإدارية وقواعد البيانات." },
  { icon: Cpu, name: "الذكاء الاصطناعي", desc: "تعلّم الآلة، معالجة البيانات الضخمة، والرؤية الحاسوبية." },
  { icon: BookOpen, name: "علوم الحاسوب", desc: "الأسس النظرية والخوارزميات والحوسبة العلمية." },
];

const stats = [
  { value: "+1,200", label: "طالب وطالبة" },
  { value: "+60", label: "عضو هيئة تدريس" },
  { value: "6", label: "أقسام أكاديمية" },
  { value: "+25", label: "مختبر وقاعة تقنية" },
];

function HomePage() {
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
              نُعدّ جيلًا من المتخصصين في علوم الحاسوب والتقنية، عبر برامج أكاديمية متطورة،
              بيئة تعليمية محفّزة، وكوادر تدريسية متميزة تخدم تنمية الوطن وبناء مستقبل أبنائه.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/departments"
                    className="inline-flex items-center gap-2 rounded-md bg-gold-gradient px-7 py-3.5 text-sm font-extrabold text-primary-deep shadow-gold transition-transform hover:-translate-y-0.5">
                الأقسام الأكاديمية <ArrowLeft className="h-4 w-4" />
              </Link>
              <Link to="/about"
                    className="inline-flex items-center gap-2 rounded-md border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-primary-foreground hover:bg-white/10">
                تعرّف على الكلية
              </Link>
            </div>
          </div>

          {/* Floating info card */}
          <div className="lg:col-span-4 lg:mt-12">
            <div className="rounded-2xl border border-white/15 bg-white/[0.06] backdrop-blur-md p-7 shadow-elegant">
              <div className="text-xs font-bold tracking-widest text-gold uppercase">عمادة الكلية</div>
              <p className="mt-4 text-base leading-8 text-primary-foreground/85">
                ”نسعى أن نكون مرجعًا أكاديميًا متميزًا في علوم الحاسوب وتقنية المعلومات على المستوى المحلي والإقليمي،
                ونرحّب بكم في بوابتنا الرقمية.“
              </p>
              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-gold-gradient text-primary-deep font-extrabold">د</div>
                <div>
                  <div className="text-sm font-bold">عميد الكلية</div>
                  <div className="text-xs text-primary-foreground/60">كلية تكنولوجيا المعلومات</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border bg-surface">
        <div className="container mx-auto grid grid-cols-2 gap-6 px-4 py-10 md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl md:text-4xl font-extrabold text-primary">{s.value}</div>
              <div className="mt-1 text-xs md:text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Departments */}
      <section className="container mx-auto px-4 py-20">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-widest text-gold uppercase">برامجنا</div>
          <h2 className="mt-2 font-display text-3xl md:text-4xl font-extrabold text-primary">الأقسام الأكاديمية</h2>
          <div className="divider-gold mt-4" />
          <p className="mt-5 text-muted-foreground leading-8">
            ستة أقسام متخصصة تغطي مختلف فروع علوم الحاسوب وتقنية المعلومات، تجمع بين الأساس النظري القوي والتطبيق العملي.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {departments.map((d) => (
            <article key={d.name}
                     className="group relative overflow-hidden rounded-xl border border-border bg-card p-7 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40">
              <div className="grid h-14 w-14 place-items-center rounded-lg bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                <d.icon className="h-7 w-7" strokeWidth={2.2} />
              </div>
              <h3 className="mt-5 font-display text-xl font-bold text-primary">{d.name}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-7">{d.desc}</p>
              <div className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:text-gold transition-colors">
                التفاصيل <ArrowLeft className="h-4 w-4" />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Why us — tech band */}
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
              <Link to="/departments" className="rounded-md border border-white/30 bg-white/5 px-7 py-3.5 text-sm font-bold">
                استعرض الأقسام
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
