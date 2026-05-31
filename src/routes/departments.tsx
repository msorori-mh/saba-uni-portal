import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Cpu, Database, Shield, Brain, BookOpen } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { programsQuery } from "@/lib/queries";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "البرامج الأكاديمية — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "البرامج الأكاديمية الأربعة في كلية تكنولوجيا المعلومات وعلوم الحاسوب: علوم الحاسوب، نظم المعلومات، الأمن السيبراني، الذكاء الاصطناعي." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(programsQuery),
  component: ProgramsPage,
});

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  cpu: Cpu, database: Database, shield: Shield, brain: Brain, computer: Cpu,
};

function ProgramsPage() {
  const { data: programs = [] } = useQuery(programsQuery);

  return (
    <>
      <PageHeader
        eyebrow="أكاديمي"
        title="البرامج الأكاديمية"
        subtitle="أربعة برامج متخصصة تغطي أحدث مجالات تكنولوجيا المعلومات وعلوم الحاسوب، تجمع بين الأساس النظري القوي والتطبيق العملي."
      />

      <section className="container mx-auto px-4 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          {programs.map((p) => {
            const Icon = iconMap[p.icon ?? ""] ?? BookOpen;
            return (
              <Link
                key={p.id}
                to="/departments/$code"
                params={{ code: p.code }}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-card transition-all hover:-translate-y-1 hover:shadow-elegant hover:border-gold/40"
              >
                <div className="flex items-start gap-5">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-secondary text-primary group-hover:bg-gold-gradient group-hover:text-primary-deep transition-colors">
                    <Icon className="h-8 w-8" />
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-bold tracking-widest text-gold">{p.code}</div>
                    <h2 className="mt-1 font-display text-2xl font-extrabold text-primary">{p.name_ar}</h2>
                    {p.name_en && <div className="mt-1 text-xs text-muted-foreground">{p.name_en}</div>}
                    <p className="mt-4 text-sm text-muted-foreground leading-7">{p.description_ar}</p>
                    <div className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-primary group-hover:text-gold transition-colors">
                      تفاصيل البرنامج <ArrowLeft className="h-4 w-4" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
