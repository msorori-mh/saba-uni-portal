import { createFileRoute } from "@tanstack/react-router";
import { MvpProjectList } from "@/components/graduation-projects/MvpProjectList";
import { MvpEmpty, MvpError, MvpLoading } from "@/components/graduation-projects/MvpStates";
import { useGraduationProjectList } from "../-graduation-projects-adapter";
export const Route = createFileRoute("/admin/graduation-projects")({
  component: AdminGraduationProjects,
});
function AdminGraduationProjects() {
  const query = useGraduationProjectList("administration");
  return (
    <main dir="rtl" className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-primary">نظرة عامة على مشاريع التخرج</h1>
        <p className="text-muted-foreground">
          عرض إداري للحالات والنتائج فقط، دون إجراءات تشغيلية.
        </p>
      </div>
      {query.isLoading ? (
        <MvpLoading />
      ) : query.error ? (
        <MvpError message={query.error.message} retry={() => void query.refetch()} />
      ) : !query.data?.length ? (
        <MvpEmpty message="لا توجد مشاريع متاحة للعرض الإداري." />
      ) : (
        <div data-testid="administration-read-only">
          <MvpProjectList projects={query.data} readOnly />
        </div>
      )}
    </main>
  );
}
