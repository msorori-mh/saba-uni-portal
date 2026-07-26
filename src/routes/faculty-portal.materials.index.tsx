import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { getMyAssignedSectionsForMaterials } from "@/lib/faculty-materials.functions";

export const Route = createFileRoute("/faculty-portal/materials/")({
  component: FacultyMaterialsList,
});

function FacultyMaterialsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["faculty", "materials", "sections"],
    queryFn: () => getMyAssignedSectionsForMaterials(),
    staleTime: 60_000,
  });

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[{ label: "المواد التعليمية" }]}
    >
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gold" aria-hidden /> موادي التعليمية
        </h1>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد مقررات أو مجموعات مسندة إلى حسابك حالياً.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((s) => (
              <Link
                key={s.id}
                to="/faculty-portal/materials/$sectionId"
                params={{ sectionId: s.id }}
                className="rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="text-xs text-muted-foreground">
                  {s.year_name ?? ""} • {s.semester_name ?? ""}
                </div>
                <div className="mt-1 font-bold text-primary">
                  <span className="font-mono">{s.course_code}</span> — {s.course_name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  المجموعة: <span className="font-bold">{s.section_code}</span>
                  {s.program_name && <> • {s.program_name}</>}
                  {s.level_name && <> • {s.level_name}</>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </FacultyPortalShell>
  );
}
