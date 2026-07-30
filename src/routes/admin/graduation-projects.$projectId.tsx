import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { GraduationProjectPortalWorkspace } from "@/components/graduation-projects/GraduationProjectPortalWorkspace";

export const Route = createFileRoute("/admin/graduation-projects/$projectId")({
  component: AdminGraduationProjectDetailPage,
});

function AdminGraduationProjectDetailPage() {
  const { projectId } = Route.useParams();
  return (
    <div className="space-y-3" dir="rtl">
      <Link
        to="/admin/graduation-projects"
        className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
      >
        <ArrowRight className="h-3 w-3" /> قائمة مشاريع القسم
      </Link>
      <GraduationProjectPortalWorkspace
        projectId={projectId}
        queryKeyPrefix="graduation-projects-admin"
      />
    </div>
  );
}
