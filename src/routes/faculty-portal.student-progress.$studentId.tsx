import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2, GraduationCap } from "lucide-react";
import { getStudentProgress } from "@/lib/academic-status.functions";
import { ProgressSummary } from "@/components/academic/ProgressSummary";

export const Route = createFileRoute("/faculty-portal/student-progress/$studentId")({
  head: () => ({ meta: [{ title: "تقدم الطالب — بوابة هيئة التدريس" }, { name: "robots", content: "noindex, nofollow" }] }),
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
    <div dir="rtl" className="container mx-auto px-4 py-6 max-w-5xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gold-gradient text-primary-deep">
            <GraduationCap className="h-5 w-5" />
          </div>
          <h1 className="font-display text-xl font-extrabold text-primary">تقدم الطالب الأكاديمي</h1>
        </div>
        <Link to="/faculty-portal" className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:text-gold">
          <ArrowRight className="h-4 w-4" /> الرجوع
        </Link>
      </div>

      {isLoading ? (
        <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="rounded-xl border bg-red-50 border-red-200 p-4 text-sm text-red-700">{(error as any).message}</div>
      ) : data ? (
        <ProgressSummary d={data} />
      ) : null}
    </div>
  );
}
