import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GraduationProjectPortalWorkspace } from "@/components/graduation-projects/GraduationProjectPortalWorkspace";

export const Route = createFileRoute("/faculty-portal/graduation-projects/$projectId")({
  component: FacultyGraduationProjectDetailPage,
});

function FacultyGraduationProjectDetailPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-3" dir="rtl">
      <Link
        to="/faculty-portal/graduation-projects"
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ArrowRight className="h-3 w-3" /> قائمة المشاريع المسندة
      </Link>
      <GraduationProjectPortalWorkspace
        projectId={projectId}
        queryKeyPrefix="graduation-projects-faculty"
      />
    </div>
  );
}
