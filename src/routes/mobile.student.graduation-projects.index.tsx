import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError } from "@/components/graduation-projects/MvpStates";
import { GP_STUDENT_LEVEL4_REQUIRED_MSG } from "@/lib/graduation-projects/eligibility";
import { useMobileStudentContext } from "@/lib/mobile/student-context";
import { useGraduationProjectList } from "./-graduation-projects-adapter";

export const Route = createFileRoute("/mobile/student/graduation-projects/")({
  head: () => ({ meta: [{ title: "مشروع التخرج" }] }),
  component: MobileGraduationProjects,
});

/**
 * Conditional surface: canonical current fourth-level eligibility only.
 * L1/L2/L3 get zero graduation-project surface (the backend predicate stays
 * authoritative for every mutation).
 */
function MobileGraduationProjects() {
  const ctx = useMobileStudentContext();
  const eligible = ctx.data?.gpEligible === true;
  const query = useGraduationProjectList("assigned", { enabled: eligible });

  if (ctx.isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <h1 className="font-display text-lg font-extrabold text-primary">مشروع التخرج</h1>
      {!eligible ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {GP_STUDENT_LEVEL4_REQUIRED_MSG}
        </p>
      ) : query.isLoading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : query.error ? (
        <MvpError message={query.error.message} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <MvpEmpty message="لا يوجد مشروع تخرج معيّن لك حالياً." />
      ) : (
        <MvpProjectList
          projects={query.data}
          basePath="/mobile/student/graduation-projects"
        />
      )}
    </div>
  );
}
