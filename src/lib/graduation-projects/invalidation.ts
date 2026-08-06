import type { QueryClient } from "@tanstack/react-query";
import { graduationProjectKeys } from "./query-keys";

/**
 * Mutation → cache invalidation rules (Package B).
 * Always refresh assignment-scoped lists after writes; detail by projectId.
 */

export type GpMutationKind =
  | "team"
  | "proposal"
  | "proposal_review"
  | "supervision"
  | "progress"
  | "final"
  | "defense"
  | "committee"
  | "evaluation"
  | "result"
  | "archive"
  | "file"
  | "download";

export function invalidationTargets(
  kind: GpMutationKind,
  projectId?: string | null,
): Array<readonly unknown[]> {
  const targets: Array<readonly unknown[]> = [
    graduationProjectKeys.myProjects(),
    graduationProjectKeys.facultyAssignments(),
    graduationProjectKeys.coordinatorQueues(),
    graduationProjectKeys.defenseAssignments(),
  ];

  if (projectId) {
    targets.push(graduationProjectKeys.projectDetail(projectId));
  }

  if (
    kind === "result"
    || kind === "archive"
    || kind === "proposal_review"
    || kind === "team"
  ) {
    targets.push(graduationProjectKeys.administrationOverview());
  }

  if (kind === "defense" || kind === "committee" || kind === "evaluation") {
    targets.push(graduationProjectKeys.defenseAssignments());
  }

  return targets;
}

export async function invalidateAfterGpMutation(
  queryClient: QueryClient,
  kind: GpMutationKind,
  projectId?: string | null,
): Promise<void> {
  const targets = invalidationTargets(kind, projectId);
  await Promise.all(
    targets.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

/** Full GP namespace invalidation (stale-version recovery). */
export async function invalidateAllGraduationProjects(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: graduationProjectKeys.all });
}
