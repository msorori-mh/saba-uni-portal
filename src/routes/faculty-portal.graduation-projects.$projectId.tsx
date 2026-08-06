import { createFileRoute, Link } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { MvpProjectWorkspace } from "@/components/graduation-projects/MvpProjectWorkspace";
import { MvpError, MvpLoading, MvpSuccess } from "@/components/graduation-projects/MvpStates";
import { useGraduationProject, useGraduationProjectAction } from "./-graduation-projects-adapter";
export const Route = createFileRoute("/faculty-portal/graduation-projects/$projectId")({
  component: FacultyProject,
});
function FacultyProject() {
  const { projectId } = Route.useParams();
  const query = useGraduationProject(projectId);
  const action = useGraduationProjectAction(projectId);
  return (
    <FacultyPortalShell title="مساحة مشروع التخرج">
      <main dir="rtl" className="container mx-auto max-w-6xl space-y-4 px-4 py-8">
        <Link to="/faculty-portal/graduation-projects" className="text-sm text-primary underline">
          العودة إلى المشاريع المسندة
        </Link>
        {action.isSuccess ? <MvpSuccess message="تم تنفيذ الإجراء بنجاح." /> : null}
        {action.error ? <MvpError message={action.error.message} /> : null}
        {query.isLoading ? (
          <MvpLoading />
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
    </FacultyPortalShell>
  );
}
