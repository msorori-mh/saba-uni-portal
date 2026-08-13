import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Loader2 } from "lucide-react";
import { MvpProjectWorkspace } from "@/components/graduation-projects/MvpProjectWorkspace";
import { MvpError, MvpSuccess } from "@/components/graduation-projects/MvpStates";
import { GP_STUDENT_LEVEL4_REQUIRED_MSG } from "@/lib/graduation-projects/eligibility";
import { useMobileStudentContext } from "@/lib/mobile/student-context";
import {
  useGraduationProject,
  useGraduationProjectAction,
} from "./-graduation-projects-adapter";

export const Route = createFileRoute("/mobile/student/graduation-projects/$projectId")({
  head: () => ({ meta: [{ title: "مساحة مشروع التخرج" }] }),
  component: MobileGraduationProject,
});

function MobileGraduationProject() {
  const { projectId } = Route.useParams();
  const ctx = useMobileStudentContext();
  const eligible = ctx.data?.gpEligible === true;
  const query = useGraduationProject(projectId);
  const action = useGraduationProjectAction(projectId);

  if (ctx.isLoading) {
    return (
      <div className="grid min-h-[40vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 space-y-4" dir="rtl">
      <Link
        to="/mobile/student/graduation-projects"
        className="inline-flex items-center gap-1 text-xs font-bold text-primary"
      >
        <ArrowRight className="h-4 w-4" /> العودة إلى مشروعي
      </Link>

      {!eligible ? (
        <p className="rounded-xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          {GP_STUDENT_LEVEL4_REQUIRED_MSG}
        </p>
      ) : (
        <>
          {action.isSuccess ? <MvpSuccess message="تم تنفيذ الإجراء بنجاح." /> : null}
          {action.error ? <MvpError message={action.error.message} /> : null}
          {query.isLoading ? (
            <div className="grid place-items-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : query.error ? (
            <MvpError message={query.error.message} retry={() => void query.refetch()} />
          ) : query.data ? (
            <MvpProjectWorkspace
              detail={query.data}
              busy={action.isPending}
              onAction={(value) => action.mutate(value)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
