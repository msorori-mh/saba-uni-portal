import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Target, Eye, Award } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "عن الكلية — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "نبذة عن كلية تكنولوجيا المعلومات وعلوم الحاسوب، رؤيتها ورسالتها وأهدافها." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <>
      <PageHeader
        eyebrow="عن الكلية"
        title="كلية تكنولوجيا المعلومات وعلوم الحاسوب"
        subtitle="صرح أكاديمي متخصص في إعداد كوادر مؤهلة في علوم الحاسوب وتقنية المعلومات تخدم متطلبات العصر الرقمي وتسهم في تنمية المجتمع."
      />

      <section className="container mx-auto px-4 py-16 grid gap-10 lg:grid-cols-3">
        {[
          { icon: Eye, title: "رؤيتنا", text: "أن نكون كلية رائدة في تعليم وبحوث علوم الحاسوب وتقنية المعلومات على المستوى المحلي والإقليمي، ومرجعًا أكاديميًا معتمدًا." },
          { icon: Target, title: "رسالتنا", text: "إعداد خريجين متميزين علميًا ومهنيًا في تخصصات تقنية المعلومات، وإجراء بحوث تخدم القطاع التقني والمؤسسات الحكومية والخاصة." },
          { icon: Award, title: "قيمنا", text: "التميّز الأكاديمي، النزاهة، الابتكار، روح الفريق، والمسؤولية المجتمعية في كل ما نقدمه من برامج وخدمات." },
        ].map((c) => (
          <article key={c.title} className="rounded-xl border border-border bg-card p-8 shadow-card">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-gold-gradient text-primary-deep shadow-gold">
              <c.icon className="h-7 w-7" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-extrabold text-primary">{c.title}</h2>
            <div className="divider-gold mt-3" />
            <p className="mt-4 text-muted-foreground leading-8">{c.text}</p>
          </article>
        ))}
      </section>

      <section className="bg-surface border-y border-border">
        <div className="container mx-auto grid gap-12 px-4 py-16 lg:grid-cols-2">
          <div>
            <div className="text-xs font-bold tracking-widest text-gold uppercase">نبذة تعريفية</div>
            <h2 className="mt-2 font-display text-3xl font-extrabold text-primary">عن الكلية</h2>
            <div className="divider-gold mt-4" />
            <div className="mt-6 space-y-5 text-muted-foreground leading-8">
              <p>
                تُعدّ كلية تكنولوجيا المعلومات وعلوم الحاسوب إحدى الكليات الأكاديمية المتميزة في جامعة إقليم سبأ،
                وتأسست بهدف توفير تعليم نوعي في مجالات تقنية المعلومات تواكب أحدث التطورات في هذا الميدان.
              </p>
              <p>
                تطرح الكلية مجموعة متكاملة من البرامج الأكاديمية على مستوى البكالوريوس، تشمل: هندسة البرمجيات،
                شبكات الحاسوب، الأمن السيبراني، نظم المعلومات، الذكاء الاصطناعي، وعلوم الحاسوب.
              </p>
              <p>
                تضم الكلية كادرًا تدريسيًا من أصحاب الكفاءة العلمية والخبرة العملية، وتوفر بيئة تعليمية محفّزة
                مزوّدة بمختبرات حاسوبية حديثة لتأهيل خريجين قادرين على المنافسة في سوق العمل المحلي والإقليمي.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {[
              { y: "2015", t: "تأسيس الكلية ضمن جامعة إقليم سبأ" },
              { y: "2017", t: "افتتاح أقسام البرمجة والشبكات والنظم" },
              { y: "2020", t: "إضافة قسم الأمن السيبراني والذكاء الاصطناعي" },
              { y: "2024", t: "إطلاق البوابة الإلكترونية الموحّدة للكلية" },
            ].map((m) => (
              <div key={m.y} className="flex items-start gap-5 rounded-xl border border-border bg-card p-5 shadow-card">
                <div className="font-display text-2xl font-extrabold text-gold w-20 shrink-0">{m.y}</div>
                <p className="text-foreground/85 leading-8">{m.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
