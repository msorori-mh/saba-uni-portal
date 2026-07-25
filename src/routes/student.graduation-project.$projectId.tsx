import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GraduationProjectPortalWorkspace } from "@/components/graduation-projects/GraduationProjectPortalWorkspace";

export const Route = createFileRoute("/student/graduation-project/$projectId")({
  component: StudentGraduationProjectDetailPage,
});

function StudentGraduationProjectDetailPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-3" dir="rtl">
      <Link
        to="/student/graduation-project"
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ArrowRight className="h-3 w-3" /> قائمة مشاريعي
      </Link>
      <GraduationProjectPortalWorkspace
        projectId={projectId}
        queryKeyPrefix="graduation-projects-student"
      />
    </div>
  );
}
