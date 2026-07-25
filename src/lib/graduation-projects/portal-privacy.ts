import type { DiscussionReadiness, ProjectRole, ProjectState } from "./domain";
import {
  pendingCorrectionsCount,
  visibleEvaluations,
  type GraduationProjectDetail,
  type ProjectEventRow,
} from "./lifecycle";

const RESULT_VISIBLE_STATES = new Set<ProjectState>([
  "completed",
  "corrections_required",
  "archived",
]);

const STAFF_ROLES = new Set<ProjectRole>(["supervisor", "coordinator", "department_head", "dean"]);

/**
 * Portal-layer privacy for student-only viewers.
 * Backend already scopes evaluations; this additionally withholds committee
 * evaluations until a result state is reached, and redacts private object keys
 * plus actor user ids from the student-facing presentation.
 */
export function isStudentOnlyViewer(roles: readonly ProjectRole[]): boolean {
  return (
    roles.includes("student") &&
    !roles.some((role) => STAFF_ROLES.has(role) || role === "panel_member")
  );
}

export function applyPortalPrivacy(
  detail: GraduationProjectDetail,
  viewerUserId: string,
): GraduationProjectDetail {
  const roles = detail.viewer_roles;
  const ownPanelMemberIds = detail.panel_members
    .filter((member) =>
      detail.assignments.some(
        (assignment) =>
          assignment.id === member.assignment_id &&
          assignment.user_id === viewerUserId &&
          assignment.role === "panel_member" &&
          assignment.active &&
          assignment.ended_at == null,
      ),
    )
    .map((member) => member.id);

  let evaluations = visibleEvaluations(detail.evaluations, {
    viewerRoles: roles,
    ownPanelMemberIds,
  });

  if (isStudentOnlyViewer(roles) && !RESULT_VISIBLE_STATES.has(detail.project.state)) {
    evaluations = [];
  } else if (isStudentOnlyViewer(roles)) {
    evaluations = evaluations.filter((evaluation) => evaluation.state === "finalized");
  }

  const redactKeys = isStudentOnlyViewer(roles);
  const files = redactKeys
    ? detail.files.map((file) => ({ ...file, object_key: null }))
    : detail.files;
  const archive =
    detail.archive && redactKeys
      ? { ...detail.archive, final_file_object_key: null }
      : detail.archive;
  const events: ProjectEventRow[] = redactKeys
    ? detail.events.map((event) => ({
        ...event,
        actor_user_id: null,
        payload: null,
      }))
    : detail.events;

  return {
    ...detail,
    evaluations,
    files,
    archive,
    events,
  };
}

export function deriveDiscussionReadiness(detail: GraduationProjectDetail): DiscussionReadiness {
  const now = Date.now();
  const active = detail.assignments.filter((row) => row.active && row.ended_at == null);
  const weight = detail.milestones.reduce(
    (sum, milestone) => sum + Number(milestone.weight ?? 0),
    0,
  );
  const incomplete = detail.milestones.filter(
    (milestone) => milestone.status !== "accepted",
  ).length;
  const overdue = detail.milestones.filter((milestone) => {
    if (!milestone.due_at || milestone.status === "accepted") return false;
    return new Date(milestone.due_at).getTime() < now;
  }).length;
  const finalMilestoneIds = new Set(
    detail.milestones.filter((milestone) => milestone.milestone_kind === "final").map((m) => m.id),
  );
  const finalSubmissionIds = new Set(
    detail.submissions
      .filter((submission) => finalMilestoneIds.has(submission.milestone_id))
      .map((submission) => submission.id),
  );
  const cleanFinalFiles = detail.files.filter(
    (file) =>
      file.scan_state === "clean" &&
      file.submission_id != null &&
      finalSubmissionIds.has(file.submission_id),
  ).length;

  return {
    projectState: detail.project.state,
    teamMembers: active.filter((row) => row.role === "student").length,
    activeSupervisors: active.filter((row) => row.role === "supervisor").length,
    milestoneWeight: weight,
    incompleteMilestones: incomplete,
    overdueMilestones: overdue,
    pendingCorrections: pendingCorrectionsCount(detail.corrections),
    cleanFinalFiles,
  };
}

export function portalStateMessage(state: ProjectState): string | null {
  switch (state) {
    case "submitted":
    case "under_review":
      return "المقترح قيد المراجعة.";
    case "revision_required":
      return "يتطلب المقترح تعديلاً من الفريق.";
    case "discussion_scheduled":
      return "تم جدولة المناقشة.";
    case "evaluating":
      return "المناقشة منعقدة والتقييم جارٍ.";
    case "corrections_required":
      return "مطلوب تنفيذ تصحيحات قبل الإغلاق.";
    case "completed":
      return "اكتمل المشروع.";
    case "archived":
      return "المشروع مؤرشف.";
    default:
      return null;
  }
}
