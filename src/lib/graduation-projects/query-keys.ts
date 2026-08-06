/**
 * React Query keys for Graduation Projects MVP (Package B → Package C).
 */

export const graduationProjectKeys = {
  all: ["graduation-projects"] as const,

  myProjects: () => [...graduationProjectKeys.all, "my-projects"] as const,

  projectDetail: (projectId: string) =>
    [...graduationProjectKeys.all, "detail", projectId] as const,

  facultyAssignments: () =>
    [...graduationProjectKeys.all, "faculty-assignments"] as const,

  coordinatorQueues: () =>
    [...graduationProjectKeys.all, "coordinator-queues"] as const,

  defenseAssignments: () =>
    [...graduationProjectKeys.all, "defense-assignments"] as const,

  administrationOverview: (filters?: { departmentId?: string | null; lifecycleState?: string | null }) =>
    [
      ...graduationProjectKeys.all,
      "administration-overview",
      filters?.departmentId ?? null,
      filters?.lifecycleState ?? null,
    ] as const,
} as const;

export type GraduationProjectQueryKey =
  | ReturnType<typeof graduationProjectKeys.myProjects>
  | ReturnType<typeof graduationProjectKeys.projectDetail>
  | ReturnType<typeof graduationProjectKeys.facultyAssignments>
  | ReturnType<typeof graduationProjectKeys.coordinatorQueues>
  | ReturnType<typeof graduationProjectKeys.defenseAssignments>
  | ReturnType<typeof graduationProjectKeys.administrationOverview>;
