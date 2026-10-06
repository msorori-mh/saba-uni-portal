import { createFileRoute } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { DepartmentHeadBoard } from "@/components/graduation-projects/DepartmentHeadBoard";
import { useGraduationProjectList } from "./-graduation-projects-adapter";

export const Route = createFileRoute("/faculty-portal/graduation-projects/")({
  component: FacultyGraduationProjects,
});

function FacultyGraduationProjects() {
  const query = useGraduationProjectList("assigned");

  return (
    <FacultyPortalShell title="مشاريع التخرج">
      <main dir="rtl" className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="mb-2 text-2xl font-extrabold text-primary">
            مشاريع التخرج
          </h1>
          <p className="text-muted-foreground">
            المشاريع التي تشرف عليها أو تشارك في لجنة مناقشتها. يكوّن الطلاب فرقهم، ويعتمدها رئيس
            القسم ويسند المشرف.
          </p>
        </div>

        <DepartmentHeadBoard />

        <h2 className="text-base font-extrabold text-primary">مشاريعي (مشرفًا أو عضو لجنة)</h2>
        {query.isLoading ? (
          <MvpLoading />
        ) : query.error ? (
          <MvpError message={query.error.message} retry={() => void query.refetch()} />
        ) : !query.data?.length ? (
          <MvpEmpty message="لا توجد مشاريع مسندة إليك." />
        ) : (
          <MvpProjectList projects={query.data} basePath="/faculty-portal/graduation-projects" />
        )}
      </main>
    </FacultyPortalShell>
  );
}
