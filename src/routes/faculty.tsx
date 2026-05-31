import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Mail, GraduationCap } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { facultyQuery, programsQuery } from "@/lib/queries";

export const Route = createFileRoute("/faculty")({
  head: () => ({
    meta: [
      { title: "هيئة التدريس — كلية تكنولوجيا المعلومات | جامعة إقليم سبأ" },
      { name: "description", content: "تعرّف على أعضاء هيئة التدريس في كلية تكنولوجيا المعلومات وعلوم الحاسوب." },
    ],
  }),
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(facultyQuery);
    context.queryClient.ensureQueryData(programsQuery);
  },
  component: FacultyPage,
});

function FacultyPage() {
  const { data: faculty = [] } = useQuery(facultyQuery);
  const { data: programs = [] } = useQuery(programsQuery);
  const [filter, setFilter] = useState<string>("all");

  const filtered = filter === "all"
    ? faculty
    : faculty.filter((f) => (f.programs as { code?: string } | null)?.code === filter);

  return (
    <>
      <PageHeader
        eyebrow="الكادر الأكاديمي"
        title="هيئة التدريس"
        subtitle="نخبة من أعضاء هيئة التدريس من حملة الدكتوراه والماجستير، يجمعون بين الخبرة الأكاديمية والعملية."
      />

      <section className="container mx-auto px-4 py-14">
        <div className="flex flex-wrap gap-2 mb-10 justify-center">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>الكل</FilterChip>
          {programs.map((p) => (
            <FilterChip key={p.id} active={filter === p.code} onClick={() => setFilter(p.code)}>
              {p.name_ar.replace("برنامج ", "")}
            </FilterChip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <GraduationCap className="mx-auto h-16 w-16 text-muted-foreground/30" />
            <p className="mt-4 text-muted-foreground">سيتم إضافة بيانات هيئة التدريس قريبًا.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((f) => (
              <article key={f.id} className="group rounded-2xl border border-border bg-card overflow-hidden shadow-card hover:shadow-elegant hover:border-gold/40 transition-all">
                <div className="aspect-square bg-hero-gradient grid place-items-center">
                  {f.photo ? (
                    <img src={f.photo} alt={f.full_name_ar} className="w-full h-full object-cover" />
                  ) : (
                    <div className="font-display text-6xl font-extrabold text-gold/80">{f.full_name_ar.charAt(0)}</div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold text-primary">{f.full_name_ar}</h3>
                  <div className="mt-1 text-xs text-gold font-bold">{f.degree ?? "عضو هيئة تدريس"}</div>
                  {f.specialization && <div className="mt-1 text-sm text-muted-foreground">{f.specialization}</div>}
                  {f.email && (
                    <a href={`mailto:${f.email}`} className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary hover:text-gold">
                      <Mail className="h-3.5 w-3.5" /> {f.email}
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground/70 hover:bg-secondary/70"
      }`}
    >
      {children}
    </button>
  );
}
