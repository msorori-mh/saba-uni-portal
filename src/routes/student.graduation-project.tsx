import { Outlet, createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/student/graduation-project")({
  component: StudentGraduationProjectLayout,
});

function StudentGraduationProjectLayout() {
  return (
    <div className="container mx-auto max-w-5xl px-4 py-6" dir="rtl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-primary">
          <GraduationCap className="h-5 w-5 text-gold" />
          <h1 className="font-display text-lg font-extrabold">مشروع التخرج</h1>
        </div>
        <Link
          to="/student"
          className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1"
        >
          <ArrowRight className="h-3 w-3" /> العودة إلى بوابة الطالب
        </Link>
      </div>
      <Outlet />
    </div>
  );
}
