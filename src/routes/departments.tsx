import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Code2, Network, ShieldCheck, Database, Cpu, BookOpen, Clock, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "الأقسام الأكاديمية — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تعرّف على الأقسام الأكاديمية في كلية تكنولوجيا المعلومات وعلوم الحاسوب." },
    ],
  }),
  component: DepartmentsPage,
});

const departments = [
  { icon: Code2, name: "هندسة البرمجيات", desc: "يُعنى بأساليب تحليل وتصميم وتطوير الأنظمة البرمجية بمختلف أنواعها، وضمان جودتها وصيانتها.", courses: ["تحليل وتصميم النظم", "هندسة الويب", "تطوير الجوال", "اختبار البرمجيات"] },
  { icon: Network, name: "شبكات الحاسوب", desc: "تصميم وإدارة وتأمين شبكات الحاسوب السلكية واللاسلكية، وبروتوكولات الاتصال.", courses: ["بروتوكولات TCP/IP", "الشبكات اللاسلكية", "إدارة الخوادم", "Cisco CCNA"] },
  { icon: ShieldCheck, name: "الأمن السيبراني", desc: "حماية الأنظمة والبيانات من التهديدات والاختراقات، واكتشاف الثغرات والاستجابة للحوادث.", courses: ["التشفير", "اختبار الاختراق", "أمن التطبيقات", "الجرائم الرقمية"] },
  { icon: Database, name: "نظم المعلومات", desc: "تحليل وتصميم نظم المعلومات الإدارية وتطوير قواعد البيانات لخدمة المؤسسات.", courses: ["قواعد البيانات", "ذكاء الأعمال", "نظم المؤسسات (ERP)", "تحليل البيانات"] },
  { icon: Cpu, name: "الذكاء الاصطناعي", desc: "دراسة خوارزميات تعلم الآلة، التعلم العميق، الرؤية الحاسوبية، ومعالجة اللغات.", courses: ["تعلم الآلة", "التعلم العميق", "الرؤية الحاسوبية", "معالجة اللغة العربية"] },
  { icon: BookOpen, name: "علوم الحاسوب", desc: "الأسس النظرية لعلوم الحاسوب: الخوارزميات، البنى البيانية، نظرية الحوسبة، ونظم التشغيل.", courses: ["الخوارزميات المتقدمة", "نظرية الحوسبة", "نظم التشغيل", "المترجمات"] },
];

function DepartmentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="البرامج الأكاديمية"
        title="الأقسام الأكاديمية"
        subtitle="ستة أقسام متخصصة تطرح برامج بكالوريوس متكاملة تجمع بين الأساس النظري المتين والتطبيق العملي وفق أحدث المعايير الأكاديمية."
      />

      <section className="container mx-auto px-4 py-16 space-y-8">
        {departments.map((d, i) => (
          <article key={d.name} className="grid gap-6 rounded-2xl border border-border bg-card p-7 md:p-10 shadow-card md:grid-cols-12 hover:border-gold/40 transition-colors">
            <div className="md:col-span-3 flex md:flex-col items-start gap-4">
              <div className="grid h-16 w-16 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-gold">
                <d.icon className="h-8 w-8" strokeWidth={2.2} />
              </div>
              <div>
                <div className="text-xs font-bold tracking-widest text-gold uppercase">قسم {String(i + 1).padStart(2, "0")}</div>
                <h2 className="mt-1 font-display text-2xl font-extrabold text-primary">{d.name}</h2>
              </div>
            </div>

            <div className="md:col-span-9">
              <p className="text-muted-foreground leading-8">{d.desc}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {d.courses.map((c) => (
                  <div key={c} className="flex items-center gap-3 rounded-md bg-secondary px-4 py-2.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                    <span className="text-sm font-semibold text-foreground/85">{c}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-6 text-sm text-muted-foreground border-t border-border pt-5">
                <div className="flex items-center gap-2"><GraduationCap className="h-4 w-4 text-gold" /> بكالوريوس</div>
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-gold" /> 4 سنوات / 8 فصول</div>
                <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-gold" /> ~136 ساعة معتمدة</div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
