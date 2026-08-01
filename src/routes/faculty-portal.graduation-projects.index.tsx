import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GraduationProjectsList } from "@/components/graduation-projects/GraduationProjectsList";
import {
  GraduationProjectsEmpty,
  GraduationProjectsLoading,
  GraduationProjectsNetworkError,
  GraduationProjectsUnavailable,
} from "@/components/graduation-projects/PortalRuntimeStates";
import {
  listMyGraduationProjects,
  probeGraduationProjectsAvailability,
} from "@/lib/graduation-projects/portal.functions";
import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  isGraduationProjectsRpcUnavailable,
} from "@/lib/graduation-projects/rpc";
import { ROLE_LABELS, type ProjectListFilter } from "@/lib/graduation-projects/lifecycle";
import type { ProjectRole } from "@/lib/graduation-projects/domain";

export const Route = createFileRoute("/faculty-portal/graduation-projects/")({
  component: FacultyGraduationProjectsIndexPage,
});

const FACULTY_ROLES = new Set([
  "supervisor",
  "coordinator",
  "department_head",
  "dean",
  "panel_member",
]);

function FacultyGraduationProjectsIndexPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ProjectListFilter>({ state: "all" });
  const probeFn = useServerFn(probeGraduationProjectsAvailability);
  const listFn = useServerFn(listMyGraduationProjects);

  const probe = useQuery({
    queryKey: ["graduation-projects", "faculty", "probe"],
    queryFn: () => probeFn({ data: {} }),
    staleTime: 30_000,
    retry: 1,
  });

  const list = useQuery({
    queryKey: ["graduation-projects", "faculty", "list"],
    queryFn: () => listFn({ data: {} }),
    enabled: probe.data?.available === true,
    retry: 1,
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
    .filter((row) => row.roles.some((role) => FACULTY_ROLES.has(role)))
    .map((row) => ({
      ...row,
      roles: row.roles.map((role) => ROLE_LABELS[role as ProjectRole] ?? role),
    }));

  if (projects.length === 0) {
    return (
      <GraduationProjectsEmpty message="لا توجد مشاريع تخرج مسندة إليك بصفتك مشرفاً أو عضو لجنة." />
    );
  }

  return (
    <GraduationProjectsList
      projects={projects}
      filter={filter}
      onFilterChange={setFilter}
      onSelect={(projectId) =>
        void navigate({
          to: "/faculty-portal/graduation-projects/$projectId",
          params: { projectId },
        })
      }
    />
  );
}
