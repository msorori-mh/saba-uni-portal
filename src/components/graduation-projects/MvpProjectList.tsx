import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DECISION_LABELS, STATE_LABELS, type GraduationProjectSummary } from "./mvp-ui";

export function MvpProjectList({
  projects,
  basePath,
  readOnly = false,
}: {
  projects: GraduationProjectSummary[];
  basePath?:
    | "/student/graduation-projects"
    | "/faculty-portal/graduation-projects"
    | "/mobile/student/graduation-projects";
  readOnly?: boolean;
}) {
  return (
    <div dir="rtl" className="grid gap-4 md:grid-cols-2">
      {projects.map((project) => (
        <Card key={project.id} data-testid="gp-project-row">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-lg">{project.title}</CardTitle>
              <Badge variant="secondary">{STATE_LABELS[project.state]}</Badge>
            </div>
            <CardDescription>
              {project.finalDecision
                ? `النتيجة: ${DECISION_LABELS[project.finalDecision]}`
                : "لم تسجل نتيجة نهائية"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {project.nextAction ? (
              <p className="text-sm">
                <span className="font-semibold">الخطوة التالية:</span> {project.nextAction}
              </p>
            ) : null}
            {!readOnly && basePath ? (
              <Link
                className="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                to={`${basePath}/$projectId`}
                params={{ projectId: project.id }}
              >
                فتح مساحة المشروع
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
