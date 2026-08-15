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

        {/* Advanced coordinator tool: kept collapsed so identifier fields never
            dominate the operational view. Authorization is enforced server-side. */}
        <details className="rounded-lg border border-border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">
            أدوات منسق القسم — إنشاء فريق مشروع تخرج (متقدم)
          </summary>
          <div className="pt-3">
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
          </div>
        </details>
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
