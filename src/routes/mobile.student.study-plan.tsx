import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookMarked, Loader2 } from "lucide-react";
import {
  SEMESTER_LABELS,
  fetchMyProgramId,
  fetchMyStudyPlan,
  groupStudyPlanByLevel,
} from "@/lib/student-study-plan";

export const Route = createFileRoute("/mobile/student/study-plan")({
  head: () => ({ meta: [{ title: "الخطة الدراسية" }] }),
  component: MobileStudyPlan,
});

function MobileStudyPlan() {
  const { data: programId, isLoading: loadingProgram } = useQuery({
    queryKey: ["mobile-student", "program-id"],
    queryFn: fetchMyProgramId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["mobile-student", "study-plan", programId],
    queryFn: () => fetchMyStudyPlan(programId!),
    enabled: !!programId,
    staleTime: 5 * 60 * 1000,
  });

  const groups = useMemo(() => groupStudyPlanByLevel(rows), [rows]);

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary flex items-center gap-2">
        <BookMarked className="h-5 w-5 text-gold" /> الخطة الدراسية
      </h1>

      {loadingProgram || isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          لا توجد خطة دراسية معتمدة لبرنامجك حالياً.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.levelNumber} className="space-y-2">
            <h2 className="font-display text-sm font-extrabold text-primary">{group.levelName}</h2>
            {Object.entries(group.semesters).map(([semester, courses]) => (
              <div
                key={semester}
                className="rounded-2xl border border-gold/40 bg-card p-3.5 shadow-card space-y-2"
              >
                <div className="text-[11px] font-extrabold text-gold">
                  {SEMESTER_LABELS[semester] ?? semester}
                </div>
                <ul className="divide-y divide-border">
                  {courses.map((c) => (
                    <li key={c.id} className="py-1.5">
                      <div className="text-[13px] font-bold text-primary">
                        <span className="font-mono text-[11px]">{c.course?.code}</span>{" "}
                        {c.course?.name_ar}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.course?.credit_hours ?? 0} ساعة معتمدة ·{" "}
                        {c.is_required ? "إجباري" : "اختياري"}
                        {c.prerequisite?.code ? ` · متطلب سابق: ${c.prerequisite.code}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
