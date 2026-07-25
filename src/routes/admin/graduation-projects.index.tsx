import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CreateProjectForm } from "@/components/graduation-projects/CreateProjectForm";
import {
  GraduationProjectReports,
  type GraduationProjectReportKind,
} from "@/components/graduation-projects/GraduationProjectReports";
import { GraduationProjectsList } from "@/components/graduation-projects/GraduationProjectsList";
import {
  GraduationProjectsEmpty,
  GraduationProjectsLoading,
  GraduationProjectsNetworkError,
  GraduationProjectsUnavailable,
} from "@/components/graduation-projects/PortalRuntimeStates";
import {
  createGraduationProject,
  getGraduationProjectsCreateContext,
  listMyGraduationProjects,
  loadGraduationProjectReport,
  probeGraduationProjectsAvailability,
} from "@/lib/graduation-projects/portal.functions";
import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  isGraduationProjectsRpcUnavailable,
} from "@/lib/graduation-projects/rpc";
import {
  ROLE_LABELS,
  type GraduationProjectArchiveReport,
  type GraduationProjectAssignmentsReport,
  type GraduationProjectEvaluationsReport,
  type GraduationProjectStatesReport,
  type ProjectListFilter,
} from "@/lib/graduation-projects/lifecycle";
import type { ProjectRole } from "@/lib/graduation-projects/domain";

export const Route = createFileRoute("/admin/graduation-projects/")({
  component: AdminGraduationProjectsIndexPage,
});

const DEPT_ROLES = new Set(["coordinator", "department_head", "dean"]);

function AdminGraduationProjectsIndexPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ProjectListFilter>({ state: "all" });
  const [statesReport, setStatesReport] = useState<GraduationProjectStatesReport | null>(null);
  const [assignmentsReport, setAssignmentsReport] =
    useState<GraduationProjectAssignmentsReport | null>(null);
  const [evaluationsReport, setEvaluationsReport] =
    useState<GraduationProjectEvaluationsReport | null>(null);
  const [archiveReport, setArchiveReport] = useState<GraduationProjectArchiveReport | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);

  const probeFn = useServerFn(probeGraduationProjectsAvailability);
  const listFn = useServerFn(listMyGraduationProjects);
  const createCtxFn = useServerFn(getGraduationProjectsCreateContext);
  const createFn = useServerFn(createGraduationProject);
  const reportFn = useServerFn(loadGraduationProjectReport);

  const probe = useQuery({
    queryKey: ["graduation-projects", "admin", "probe"],
    queryFn: () => probeFn({ data: {} }),
    staleTime: 30_000,
    retry: 1,
  });

  const list = useQuery({
    queryKey: ["graduation-projects", "admin", "list"],
    queryFn: () => listFn({ data: {} }),
    enabled: probe.data?.available === true,
    retry: 1,
  });

  const createCtx = useQuery({
    queryKey: ["graduation-projects", "admin", "create-context"],
    queryFn: () => createCtxFn({ data: {} }),
    enabled: probe.data?.available === true,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: { title: string; abstract: string }) => {
      const ctx = createCtx.data;
      if (
        !ctx?.canCreate ||
        !ctx.departmentId ||
        !ctx.programId ||
        !ctx.academicYearId ||
        !ctx.semesterId
      ) {
        throw new Error("سياق الإنشاء غير مكتمل. تأكد من تعيين القسم والفصل الحالي.");
      }
      return createFn({
        data: {
          title: input.title,
          abstract: input.abstract,
          departmentId: ctx.departmentId,
          programId: ctx.programId,
          academicYearId: ctx.academicYearId,
          semesterId: ctx.semesterId,
        },
      });
    },
    onSuccess: async (projectId) => {
      await queryClient.invalidateQueries({ queryKey: ["graduation-projects", "admin"] });
      void navigate({
        to: "/admin/graduation-projects/$projectId",
        params: { projectId: String(projectId) },
      });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async (kind: GraduationProjectReportKind) => {
      const departmentId =
        createCtx.data?.departmentId ?? list.data?.find((row) => row.department_id)?.department_id;
      if (!departmentId) throw new Error("تعذّر تحديد القسم للتقارير.");
      return { kind, report: await reportFn({ data: { departmentId, kind } }) };
    },
    onMutate: () => setReportError(null),
    onSuccess: ({ kind, report }) => {
      if (kind === "states") setStatesReport(report as GraduationProjectStatesReport);
      if (kind === "assignments")
        setAssignmentsReport(report as GraduationProjectAssignmentsReport);
      if (kind === "evaluations")
        setEvaluationsReport(report as GraduationProjectEvaluationsReport);
      if (kind === "archive") setArchiveReport(report as GraduationProjectArchiveReport);
    },
    onError: (error) => {
      setReportError(error instanceof Error ? error.message : "تعذّر تحميل التقرير");
    },
  });

  if (probe.isLoading || (probe.data?.available && list.isLoading)) {
    return <GraduationProjectsLoading />;
  }

  if (probe.isError || list.isError) {
    const err = probe.error ?? list.error;
    const msg = err instanceof Error ? err.message : GRADUATION_PROJECTS_SERVICE_UPDATING_MSG;
    if (
      isGraduationProjectsRpcUnavailable(err as { message?: string; code?: string }) ||
      msg === GRADUATION_PROJECTS_SERVICE_UPDATING_MSG
    ) {
      return <GraduationProjectsUnavailable message={msg} />;
    }
    return <GraduationProjectsNetworkError message={msg} />;
  }

  if (probe.data && !probe.data.available) {
    return (
      <GraduationProjectsUnavailable
        message={probe.data.message ?? GRADUATION_PROJECTS_SERVICE_UPDATING_MSG}
      />
    );
  }

  const projects = (list.data ?? [])
    .filter((row) => row.roles.some((role) => DEPT_ROLES.has(role)))
    .map((row) => ({
      ...row,
      roles: row.roles.map((role) => ROLE_LABELS[role as ProjectRole] ?? role),
    }));

  const departmentId =
    createCtx.data?.departmentId ??
    list.data?.find((row) => row.department_id)?.department_id ??
    "";

  return (
    <div className="space-y-6">
      {createCtx.data?.canCreate && createCtx.data.departmentId ? (
        <CreateProjectForm
          departmentId={createCtx.data.departmentId}
          busy={createMutation.isPending}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          إنشاء المشاريع متاح فقط عند وجود تعيين نشط وسياق أكاديمي مكتمل (قسم/برنامج/فصل حالي).
        </div>
      )}
      {createMutation.isError ? (
        <div className="text-sm text-destructive" role="alert">
          {createMutation.error instanceof Error
            ? createMutation.error.message
            : "تعذّر إنشاء المشروع"}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <GraduationProjectsEmpty message="لا توجد مشاريع ضمن تعييناتك الإدارية الحالية." />
      ) : (
        <GraduationProjectsList
          projects={projects}
          filter={filter}
          onFilterChange={setFilter}
          onSelect={(projectId) =>
            void navigate({
              to: "/admin/graduation-projects/$projectId",
              params: { projectId },
            })
          }
        />
      )}

      {departmentId ? (
        <div className="space-y-2">
          {reportError ? (
            <div className="text-sm text-destructive" role="alert">
              {reportError}
            </div>
          ) : null}
          <GraduationProjectReports
            departmentId={departmentId}
            statesReport={statesReport}
            assignmentsReport={assignmentsReport}
            evaluationsReport={evaluationsReport}
            archiveReport={archiveReport}
            busy={reportMutation.isPending}
            onLoad={(kind) => reportMutation.mutate(kind)}
          />
        </div>
      ) : null}
    </div>
  );
}
