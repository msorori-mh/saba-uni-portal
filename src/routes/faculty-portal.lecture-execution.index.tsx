import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, CalendarCheck } from "lucide-react";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { listFacultyDeliverySections } from "@/lib/lecture-execution.functions";

export const Route = createFileRoute("/faculty-portal/lecture-execution/")({
  component: FacultyLectureExecutionList,
  head: () => ({
    meta: [
      { title: "متابعة تنفيذ المحاضرات | بوابة عضو هيئة التدريس" },
      {
        name: "description",
        content: "خطة المحاضرات المرقمة لكل مجموعة وتسجيل تنفيذ المحاضرات أولاً بأول.",
      },
      { property: "og:title", content: "متابعة تنفيذ المحاضرات" },
      {
        property: "og:description",
        content: "خطة المحاضرات المرقمة لكل مجموعة وتسجيل تنفيذ المحاضرات.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const PLAN_STATUS_LABELS: Record<string, string> = {
  none: "لا توجد خطة",
  draft: "مسودة",
  published: "معتمدة",
  archived: "مؤرشفة",
};

function FacultyLectureExecutionList() {
  const { data, isLoading } = useQuery({
    queryKey: ["faculty", "lecture-execution", "sections"],
    queryFn: () => listFacultyDeliverySections(),
    staleTime: 30_000,
  });

  return (
    <FacultyPortalShell
      title="بوابة عضو هيئة التدريس"
      breadcrumbs={[{ label: "متابعة تنفيذ المحاضرات" }]}
    >
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="font-display text-xl font-extrabold text-primary mb-4 flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-gold" aria-hidden /> متابعة تنفيذ المحاضرات
        </h1>

        {isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            لا توجد مجموعات مسندة إلى حسابك حالياً.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.map((s) => (
              <Link
                key={s.course_section_id}
                to="/faculty-portal/lecture-execution/$sectionId"
                params={{ sectionId: s.course_section_id }}
                className="rounded-xl border-2 border-gold/30 bg-card p-4 hover:border-gold hover:shadow-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="font-bold text-primary">
                  <span className="font-mono">{s.course_code}</span> — {s.course_name_ar}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  المجموعة: <span className="font-bold">{s.section_code}</span> • الخطة:{" "}
                  {PLAN_STATUS_LABELS[s.plan_status] ?? s.plan_status}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  المنفذ {s.executed_count} من {s.planned_session_count}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </FacultyPortalShell>
  );
}
