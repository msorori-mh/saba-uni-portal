import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FacultyPortalShell } from "@/components/portal/FacultyPortalShell";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { CreateTeamPanel } from "@/components/graduation-projects/CreateTeamPanel";
import {
  useCreateGraduationProjectTeam,
  useGraduationProjectList,
} from "./-graduation-projects-adapter";

export const Route = createFileRoute("/faculty-portal/graduation-projects/")({
  component: FacultyGraduationProjects,
});

function FacultyGraduationProjects() {
  const query = useGraduationProjectList("assigned");
  const createTeam = useCreateGraduationProjectTeam();
  const navigate = useNavigate();

  return (
    <FacultyPortalShell title="مشاريع التخرج">
      <main dir="rtl" className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
        <div>
          <h1 className="mb-2 text-2xl font-extrabold text-primary">
            مساحة مشاريع التخرج التشغيلية
          </h1>
          <p className="text-muted-foreground">
            المشاريع المسندة إليك فقط حسب دورك المباشر. إنشاء الفريق متاح لمنسق القسم المعتمد.
          </p>
        </div>

        <CreateTeamPanel
          busy={createTeam.isPending}
          onSubmit={(input) => {
            createTeam.mutate(input, {
              onSuccess: (projectId) => {
                void navigate({
                  to: "/faculty-portal/graduation-projects/$projectId",
                  params: { projectId },
                });
              },
            });
          }}
        />
        {createTeam.isError ? (
          <MvpError
            message={createTeam.error.message}
            retry={() => createTeam.reset()}
          />
        ) : null}

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
