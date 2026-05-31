import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Cpu, Database, Shield, Brain, BookOpen, GraduationCap, Briefcase, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { programByCodeQuery, facultyQuery } from "@/lib/queries";

export const Route = createFileRoute("/departments/$code")({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(programByCodeQuery(params.code));
    if (!data) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name_ar ?? "برنامج"} — كلية تكنولوجيا المعلومات` },
      { name: "description", content: loaderData?.description_ar ?? "" },
    ],
  }),
  component: ProgramDetail,
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-20 text-center">
      <p className="text-destructive">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-20 text-center">
      <h1 className="font-display text-3xl font-extrabold text-primary">البرنامج غير موجود</h1>
      <Link to="/departments" className="mt-6 inline-block text-gold font-bold">العودة إلى قائمة البرامج</Link>
    </div>
  ),
});

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  cpu: Cpu, database: Database, shield: Shield, brain: Brain, computer: Cpu,
};

function ProgramDetail() {
  const program = Route.useLoaderData();
  const { code } = Route.useParams();
  const { data: allFaculty = [] } = useQuery(facultyQuery);
  const programFaculty = allFaculty.filter((f) => (f.programs as { code?: string } | null)?.code === code);

  const Icon = iconMap[program.icon ?? ""] ?? BookOpen;

  return (
    <>
      <PageHeader eyebrow={program.code} title={program.name_ar} subtitle={program.description_ar ?? undefined} />

      <section className="container mx-auto px-4 py-14">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-10">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-xl bg-gold-gradient text-primary-deep shadow-gold">
                  <Icon className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="font-display text-2xl font-extrabold text-primary">عن البرنامج</h2>
                  {program.name_en && <div className="text-sm text-muted-foreground">{program.name_en}</div>}
                </div>
              </div>
              <div className="divider-gold mt-5" />
              <p className="mt-5 text-muted-foreground leading-8">{program.description_ar}</p>
            </div>

            <Block icon={ClipboardCheck} title="شروط القبول">
              {program.admission_requirements ?? "الحصول على الثانوية العامة (القسم العلمي) بمعدل لا يقل عن 70%، واجتياز اختبار القبول والمقابلة الشخصية."}
            </Block>

            <Block icon={Briefcase} title="فرص العمل بعد التخرج">
              {program.career_opportunities ?? "يعمل خريجو البرنامج في الشركات التقنية والمؤسسات الحكومية والبنوك ومراكز الأبحاث، بالإضافة إلى فرص العمل الحر وريادة الأعمال التقنية."}
            </Block>

            {programFaculty.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
                <div className="flex items-center gap-3">
                  <GraduationCap className="h-6 w-6 text-gold" />
                  <h2 className="font-display text-2xl font-extrabold text-primary">أعضاء هيئة التدريس</h2>
                </div>
                <div className="divider-gold mt-4" />
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {programFaculty.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border p-4">
                      <div className="grid h-12 w-12 place-items-center rounded-full bg-secondary font-bold text-primary">
                        {f.full_name_ar.charAt(0)}
                      </div>
                      <div>
                        <div className="font-bold text-primary text-sm">{f.full_name_ar}</div>
                        <div className="text-xs text-muted-foreground">{f.rank ?? "عضو هيئة تدريس"}{f.specialization ? ` — ${f.specialization}` : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl bg-hero-gradient p-7 text-primary-foreground shadow-elegant">
              <div className="text-xs font-bold tracking-widest text-gold uppercase">معلومات سريعة</div>
              <ul className="mt-4 space-y-3 text-sm">
                <li className="flex justify-between border-b border-white/10 pb-2"><span className="text-primary-foreground/70">الدرجة</span><span className="font-bold">بكالوريوس</span></li>
                <li className="flex justify-between border-b border-white/10 pb-2"><span className="text-primary-foreground/70">مدة الدراسة</span><span className="font-bold">4 سنوات</span></li>
                <li className="flex justify-between border-b border-white/10 pb-2"><span className="text-primary-foreground/70">عدد المستويات</span><span className="font-bold">8 مستويات</span></li>
                <li className="flex justify-between"><span className="text-primary-foreground/70">لغة الدراسة</span><span className="font-bold">عربي/إنجليزي</span></li>
              </ul>
            </div>

            <Link to="/contact" className="block rounded-xl bg-gold-gradient px-6 py-4 text-center font-extrabold text-primary-deep shadow-gold">
              استفسر عن البرنامج
            </Link>
            <Link to="/departments" className="flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-bold text-primary hover:bg-secondary">
              <ArrowRight className="h-4 w-4" /> جميع البرامج
            </Link>
          </aside>
        </div>
      </section>
    </>
  );
}

function Block({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
      <div className="flex items-center gap-3">
        <Icon className="h-6 w-6 text-gold" />
        <h2 className="font-display text-2xl font-extrabold text-primary">{title}</h2>
      </div>
      <div className="divider-gold mt-4" />
      <p className="mt-5 text-muted-foreground leading-8 whitespace-pre-line">{children}</p>
    </div>
  );
}
