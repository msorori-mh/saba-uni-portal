import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, Loader2 } from "lucide-react";
import { listStudentCourseMaterials } from "@/lib/student-materials.functions";
import { portalFeatures } from "@/lib/portal-features";

export const Route = createFileRoute("/mobile/student/materials/")({
  head: () => ({ meta: [{ title: "المواد التعليمية" }] }),
  component: MobileStudentMaterials,
});

function MobileStudentMaterials() {
  const enabled = portalFeatures.studentCourseMaterials;
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["mobile-student", "materials", "courses"],
    queryFn: () => listStudentCourseMaterials(),
    enabled,
    staleTime: 60_000,
  });

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <BookOpen className="h-5 w-5 text-gold" /> المواد التعليمية
      </h1>

      {!enabled ? (
        <p className="text-sm text-muted-foreground">الخدمة غير متاحة حالياً.</p>
      ) : isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">
          {(error as Error).message}
        </p>
      ) : data.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد مواد تعليمية متاحة حالياً.
        </p>
      ) : (
        <ul className="space-y-2">
          {data.map((s) => (
            <li key={s.section_id}>
              <Link
                to="/mobile/student/materials/$sectionId"
                params={{ sectionId: s.section_id }}
                className="flex items-center justify-between gap-2 rounded-2xl border border-gold/40 bg-card p-3.5 shadow-card active:scale-[0.99]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-primary truncate">
                    <span className="font-mono">{s.course_code}</span> — {s.course_name}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    المواد المنشورة: {s.material_count}
                  </span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
