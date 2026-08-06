import { createFileRoute } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { useGraduationProjectList } from "./-graduation-projects-adapter";
export const Route = createFileRoute("/faculty-portal/graduation-projects/")({
  component: FacultyGraduationProjects,
});
function FacultyGraduationProjects() {
  const query = useGraduationProjectList("assigned");
  return (
    <FacultyPortalShell title="مشاريع التخرج">
      <main dir="rtl" className="container mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-extrabold text-primary">مساحة مشاريع التخرج التشغيلية</h1>
        <p className="mb-6 text-muted-foreground">المشاريع المسندة إليك فقط حسب دورك المباشر.</p>
        {query.isLoading ? (
          <MvpLoading />
        ) : query.error ? (
          <MvpError message={query.error.message} retry={() => void query.refetch()} />
        ) : !query.data?.length ? (
          <MvpEmpty message="لا توجد مشاريع أو دعوات مسندة إليك." />
        ) : (
          <MvpProjectList projects={query.data} basePath="/faculty-portal/graduation-projects" />
        )}
      </main>
    </FacultyPortalShell>
  );
}
