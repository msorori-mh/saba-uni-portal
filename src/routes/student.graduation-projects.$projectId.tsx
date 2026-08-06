import { createFileRoute, Link } from "@tanstack/react-router";
import { PortalShell } from "@/components/portal/PortalShell";
import { MvpProjectWorkspace } from "@/components/graduation-projects/MvpProjectWorkspace";
import { MvpError, MvpLoading, MvpSuccess } from "@/components/graduation-projects/MvpStates";
import { useGraduationProject, useGraduationProjectAction } from "./-graduation-projects-adapter";
export const Route = createFileRoute("/student/graduation-projects/$projectId")({
  component: StudentProject,
});
function StudentProject() {
  const { projectId } = Route.useParams();
  const query = useGraduationProject(projectId);
  const action = useGraduationProjectAction(projectId);
  return (
    <PortalShell title="مساحة مشروع التخرج">
      <main dir="rtl" className="container mx-auto max-w-5xl space-y-4 px-4 py-8">
        <Link to="/student/graduation-projects" className="text-sm text-primary underline">
          العودة إلى مشروعي
        </Link>
        {action.isSuccess ? <MvpSuccess message="تم تنفيذ الإجراء بنجاح." /> : null}
        {action.error ? <MvpError message={action.error.message} /> : null}
        {query.isLoading ? (
          <MvpLoading label="جارٍ تحميل مساحة المشروع…" />
        ) : query.error ? (
          <MvpError message={query.error.message} retry={() => void query.refetch()} />
        ) : query.data ? (
          <MvpProjectWorkspace
            detail={query.data}
            busy={action.isPending}
            onAction={(value) => action.mutate(value)}
          />
        ) : null}
      </main>
    </PortalShell>
  );
}
