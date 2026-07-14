import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, BookOpen, ArrowRight } from "lucide-react";
import { PortalShell } from "@/components/portal/PortalShell";
import { NotificationsBell } from "@/components/portal/NotificationsBell";
import { supabase } from "@/integrations/supabase/client";
import { listStudentCourseMaterials } from "@/lib/student-materials.functions";

export const Route = createFileRoute("/student/materials/")({
  component: StudentMaterialsList,
});

function StudentMaterialsList() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["student", "materials", "courses"],
    queryFn: () => listStudentCourseMaterials(),
    staleTime: 60_000,
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/portal-login", replace: true });
  };

  return (
    <PortalShell title="بوابة الطالب" actions={<NotificationsBell />} onLogout={handleLogout}>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-4">
          <Link to="/student" className="text-sm text-primary hover:text-gold inline-flex items-center gap-1">
            <ArrowRight className="h-4 w-4" /> العودة إلى البوابة
          </Link>
        </div>
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-gold" /> المواد التعليمية
        </h1>

        {isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد مواد تعليمية متاحة حالياً.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((s) => (
              <Link
                key={s.section_id}
                to="/student/materials/$sectionId"
                params={{ sectionId: s.section_id }}
                className="rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all"
              >
                <div className="font-bold text-primary">
                  <span className="font-mono">{s.course_code}</span> — {s.course_name}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  عدد المحاضرات المنشورة: <span className="font-bold">{s.material_count}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </PortalShell>
  );
}
