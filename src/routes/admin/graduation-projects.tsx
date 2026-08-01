import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/admin/graduation-projects")({
  component: AdminGraduationProjectsLayout,
});

function AdminGraduationProjectsLayout() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-5 w-5 text-gold" />
          <h1 className="font-display text-xl font-extrabold">مشاريع التخرج — إدارة القسم</h1>
        </div>
        <Link
          to="/admin"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <ArrowRight className="h-3 w-3" /> العودة
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        الوصول مقيد بالتعيين المباشر عبر العقود الخلفية. لا يوجد تجاوز عام لدور إداري.
      </p>
      <Outlet />
    </div>
  );
}
