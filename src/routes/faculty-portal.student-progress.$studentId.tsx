import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, GraduationCap, ShieldAlert } from "lucide-react";
import { getStudentProgress } from "@/lib/academic-status.functions";
import { ProgressSummary } from "@/components/academic/ProgressSummary";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";

export const Route = createFileRoute("/faculty-portal/student-progress/$studentId")({
  head: () => ({
    meta: [
      { title: "تقدم الطالب — بوابة هيئة التدريس" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FacultyStudentProgressPage,
});

function FacultyStudentProgressPage() {
  const { studentId } = Route.useParams();
  const fetchProgress = useServerFn(getStudentProgress);
  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-student-progress", studentId],
    queryFn: () => fetchProgress({ data: { studentProfileId: studentId } }),
  });

  return (
    <FacultyPortalShell title="بوابة عضو هيئة التدريس">
      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-extrabold text-primary">
            تقدم الطالب الأكاديمي
          </h1>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            <ShieldAlert className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden />
            <p>لا تملك صلاحية الوصول إلى هذه الصفحة أو تعذّر تحميل البيانات.</p>
            <Link
              to="/faculty-portal"
              className="mt-3 inline-flex items-center justify-center rounded-md border border-gold/40 px-4 py-2 text-xs font-bold text-primary hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              العودة إلى بوابتي
            </Link>
          </div>
        ) : data ? (
          <ProgressSummary d={data} />
        ) : null}
      </main>
    </FacultyPortalShell>
  );
}
