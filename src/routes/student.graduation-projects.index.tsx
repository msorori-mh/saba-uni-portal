import { createFileRoute } from "@tanstack/react-router";
import { PortalShell } from "@/components/portal/PortalShell";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { useGraduationProjectList } from "./-graduation-projects-adapter";
export const Route = createFileRoute("/student/graduation-projects/")({
  component: StudentGraduationProjects,
});
function StudentGraduationProjects() {
  const query = useGraduationProjectList("assigned");
  return (
    <PortalShell title="مشاريع التخرج">
      <main dir="rtl" className="container mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-extrabold text-primary">مشروع التخرج المعيّن</h1>
        <p className="mb-6 text-muted-foreground">
          متابعة الفريق والمقترح والتقدم والمناقشة والنتيجة.
        </p>
        {query.isLoading ? (
          <MvpLoading />
        ) : query.error ? (
          <MvpError message={query.error.message} retry={() => void query.refetch()} />
        ) : !query.data?.length ? (
          <MvpEmpty message="لا يوجد مشروع تخرج معيّن لك حالياً." />
        ) : (
          <MvpProjectList projects={query.data} basePath="/student/graduation-projects" />
        )}
      </main>
    </PortalShell>
  );
}
