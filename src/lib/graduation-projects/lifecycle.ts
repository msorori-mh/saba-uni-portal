import {
  isSafePrivateObjectKey,
  type ProjectRole,
  type ProjectState,
} from "./domain";

/**
 * Lifecycle view-model for the graduation-projects completion slice.
 * Mirrors the DRAFT-ONLY RPC preconditions in
 * docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql.
 * Client action lists are a UX mirror only; the security definer RPCs remain
 * the single authorization authority.
 */

export type LifecycleAction =
  | "submit_proposal" | "resubmit_proposal" | "start_review" | "approve_proposal"
  | "reject_proposal" | "require_revision" | "create_project" | "activate_project"
  | "assign_faculty" | "end_assignment" | "submit_deliverable" | "review_submission"
  | "add_note" | "resolve_note" | "register_file" | "request_discussion"
  | "schedule_discussion" | "reject_discussion_request" | "assign_panel_member"
  | "record_discussion_outcome" | "save_evaluation" | "conclude_result"
  | "complete_correction" | "accept_correction" | "archive" | "view_reports";

export const PROJECT_STATE_LABELS: Record<ProjectState, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  under_review: "قيد المراجعة",
  revision_required: "يتطلب تعديلاً",
  approved: "معتمد",
  active: "نشط",
  discussion_requested: "مناقشة مطلوبة",
  discussion_scheduled: "مناقشة مجدولة",
  evaluating: "قيد التقييم",
  corrections_required: "يتطلب تصحيحات",
  completed: "مكتمل",
  archived: "مؤرشف",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  student: "طالب",
  supervisor: "مشرف",
  coordinator: "منسق",
  department_head: "رئيس القسم",
  dean: "عميد",
  panel_member: "عضو لجنة",
};

export const ACTION_LABELS: Record<LifecycleAction, string> = {
  submit_proposal: "تقديم المقترح",
  resubmit_proposal: "إعادة تقديم المقترح",
  start_review: "بدء المراجعة",
  approve_proposal: "اعتماد المقترح",
  reject_proposal: "رفض المقترح",
  require_revision: "طلب تعديل المقترح",
  create_project: "إنشاء مشروع",
  activate_project: "تفعيل المشروع",
  assign_faculty: "تعيين عضو هيئة تدريس",
  end_assignment: "إنهاء تعيين",
  submit_deliverable: "تسليم مخرج",
  review_submission: "مراجعة التسليم",
  add_note: "إضافة ملاحظة",
  resolve_note: "معالجة الملاحظة",
  register_file: "تسجيل ملف",
  request_discussion: "طلب مناقشة",
  schedule_discussion: "جدولة المناقشة",
  reject_discussion_request: "رفض طلب المناقشة",
  assign_panel_member: "تعيين عضو لجنة",
  record_discussion_outcome: "تسجيل نتيجة المناقشة",
  save_evaluation: "حفظ التقييم",
  conclude_result: "اعتماد النتيجة",
  complete_correction: "إتمام تصحيح",
  accept_correction: "قبول تصحيح",
  archive: "أرشفة",
  view_reports: "عرض التقارير",
};

/** Arabic audit labels — exactly the 33 event types emitted by the merged drafts. */
export const EVENT_LABELS: Record<string, string> = {
  proposal_submitted: "تقديم المقترح",
  team_member_added: "إضافة عضو فريق",
  milestone_set: "تحديد مرحلة",
  discussion_requested: "طلب مناقشة",
  evaluation_finalized: "اعتماد التقييم",
  project_archived: "أرشفة المشروع",
  project_created: "إنشاء المشروع",
  faculty_assigned: "تعيين عضو هيئة تدريس",
  assignment_ended: "إنهاء تعيين",
  proposal_resubmitted: "إعادة تقديم المقترح",
  proposal_review_started: "بدء مراجعة المقترح",
  proposal_approved: "اعتماد المقترح",
  proposal_rejected: "رفض المقترح",
  proposal_revision_required: "طلب تعديل المقترح",
  project_activated: "تفعيل المشروع",
  deliverable_submitted: "تسليم مخرج",
  submission_accepted: "قبول التسليم",
  submission_revision_required: "طلب تعديل التسليم",
  supervisor_note_added: "ملاحظة مشرف",
  supervisor_note_resolved: "معالجة ملاحظة مشرف",
  file_registered: "تسجيل ملف",
  discussion_scheduled: "جدولة المناقشة",
  discussion_request_rejected: "رفض طلب المناقشة",
  panel_member_assigned: "تعيين عضو لجنة",
  discussion_held: "انعقاد المناقشة",
  discussion_postponed: "تأجيل المناقشة",
  discussion_cancelled: "إلغاء المناقشة",
  evaluation_saved: "حفظ التقييم",
  evaluation_submitted: "إرسال التقييم",
  result_completed: "اعتماد النتيجة",
  corrections_requested: "طلب تصحيحات",
  correction_completed: "إتمام تصحيح",
  correction_accepted: "قبول تصحيح",
};

const TERMINAL_STATES: ReadonlySet<ProjectState> = new Set(["completed", "archived", "rejected", "cancelled"]);

function studentActions(state: ProjectState): LifecycleAction[] {
  switch (state) {
    case "draft": return ["submit_proposal"];
    case "revision_required": return ["resubmit_proposal"];
    case "active": return ["submit_deliverable", "register_file", "request_discussion"];
    case "corrections_required": return ["complete_correction", "register_file"];
    default: return [];
  }
}

function supervisorActions(state: ProjectState): LifecycleAction[] {
  switch (state) {
    case "active": return ["review_submission", "add_note", "register_file", "request_discussion"];
    case "discussion_requested":
    case "discussion_scheduled":
    case "evaluating":
      return ["add_note"];
    case "corrections_required": return ["add_note", "register_file"];
    default: return [];
  }
}

function managerActions(state: ProjectState, head: boolean): LifecycleAction[] {
  const actions: LifecycleAction[] = ["create_project", "view_reports"];
  if (!TERMINAL_STATES.has(state)) actions.push("end_assignment");
  switch (state) {
    case "draft": actions.push("assign_faculty"); break;
    case "submitted": actions.push("start_review", "require_revision", "reject_proposal"); break;
    case "under_review": actions.push("approve_proposal", "require_revision", "reject_proposal"); break;
    case "revision_required": actions.push("assign_faculty"); break;
    case "approved": actions.push("activate_project", "assign_faculty"); break;
    case "active": actions.push("assign_faculty"); break;
    case "discussion_requested": actions.push("schedule_discussion", "reject_discussion_request"); break;
    case "discussion_scheduled": actions.push("assign_panel_member", "record_discussion_outcome"); break;
    case "evaluating": if (head) actions.push("conclude_result"); break;
    case "corrections_required": if (head) actions.push("accept_correction"); break;
    case "completed": if (head) actions.push("archive"); break;
    default: break;
  }
  return actions;
}

function deanActions(state: ProjectState): LifecycleAction[] {
  const actions: LifecycleAction[] = ["view_reports"];
  if (state === "evaluating") actions.push("conclude_result");
  if (state === "corrections_required") actions.push("accept_correction");
  if (state === "completed") actions.push("archive");
  return actions;
}

/**
 * Actions the current viewer may attempt on a project in `state`, as the union
 * of their active assignment roles. Mirrors SQL preconditions only.
 */
export function availableProjectActions(
  roles: readonly ProjectRole[],
  state: ProjectState,
): LifecycleAction[] {
  const result: LifecycleAction[] = [];
  const push = (actions: LifecycleAction[]) => {
    for (const action of actions) if (!result.includes(action)) result.push(action);
  };
  for (const role of roles) {
    switch (role) {
      case "student": push(studentActions(state)); break;
      case "supervisor": push(supervisorActions(state)); break;
      case "coordinator": push(managerActions(state, false)); break;
      case "department_head": push(managerActions(state, true)); break;
      case "dean": push(deanActions(state)); break;
      case "panel_member": if (state === "evaluating") push(["save_evaluation"]); break;
    }
  }
  return result;
}

/** File object keys are exposed only when the external scan marks them clean. */
export function isFileObjectAccessible(scanState: string): boolean {
  return scanState === "clean";
}

export interface EvaluationScoreRow {
  criterion_code: string;
  criterion_label: string;
  maximum_score: number;
  awarded_score: number;
  comment?: string | null;
}

export interface EvaluationRow {
  id: string;
  discussion_id: string;
  panel_member_id: string;
  rubric_version: string;
  state: "draft" | "submitted" | "finalized";
  total_score: number;
  comments: string | null;
  submitted_at: string | null;
  finalized_at: string | null;
  scores: EvaluationScoreRow[];
}

export interface EvaluationViewer {
  viewerRoles: readonly string[];
  ownPanelMemberIds: readonly string[];
}

const STAFF_ROLES = new Set(["supervisor", "coordinator", "department_head", "dean"]);

/**
 * Students never see an evaluation before it is finalized; panel members see
 * their own drafts plus all finalized ones; staff see everything.
 */
export function visibleEvaluations(
  evaluations: readonly EvaluationRow[],
  viewer: EvaluationViewer,
): EvaluationRow[] {
  const staff = viewer.viewerRoles.some((role) => STAFF_ROLES.has(role));
  if (staff) return [...evaluations];
  const panel = viewer.viewerRoles.includes("panel_member");
  return evaluations.filter((evaluation) =>
    evaluation.state === "finalized"
    || (panel && viewer.ownPanelMemberIds.includes(evaluation.panel_member_id)));
}

export type ScoreProblem =
  | "scores_empty" | "criterion_code_missing" | "criterion_label_missing"
  | "maximum_score_invalid" | "awarded_score_invalid" | "awarded_exceeds_maximum"
  | "criterion_code_duplicate";

export const SCORE_PROBLEM_LABELS: Record<ScoreProblem, string> = {
  scores_empty: "أضف معياراً واحداً على الأقل",
  criterion_code_missing: "رمز المعيار مطلوب",
  criterion_label_missing: "اسم المعيار مطلوب",
  maximum_score_invalid: "الدرجة العظمى يجب أن تكون أكبر من صفر",
  awarded_score_invalid: "الدرجة الممنوحة غير صالحة",
  awarded_exceeds_maximum: "الدرجة الممنوحة تتجاوز الدرجة العظمى",
  criterion_code_duplicate: "رمز المعيار مكرر",
};

/** Mirrors the jsonb score validation inside save_graduation_project_evaluation. */
export function validateEvaluationScores(scores: readonly EvaluationScoreRow[]): ScoreProblem[] {
  if (scores.length === 0) return ["scores_empty"];
  const problems: ScoreProblem[] = [];
  const seen = new Set<string>();
  let duplicate = false;
  for (const score of scores) {
    const code = score.criterion_code.trim();
    if (code === "") problems.push("criterion_code_missing");
    if (score.criterion_label.trim() === "") problems.push("criterion_label_missing");
    const maxValid = Number.isFinite(score.maximum_score) && score.maximum_score > 0;
    const awardedValid = Number.isFinite(score.awarded_score) && score.awarded_score >= 0;
    if (!maxValid) problems.push("maximum_score_invalid");
    if (!awardedValid) problems.push("awarded_score_invalid");
    if (maxValid && awardedValid && score.awarded_score > score.maximum_score) {
      problems.push("awarded_exceeds_maximum");
    }
    if (code !== "") {
      if (seen.has(code)) duplicate = true;
      seen.add(code);
    }
  }
  if (duplicate) problems.push("criterion_code_duplicate");
  return problems;
}

export function computeEvaluationTotal(scores: readonly EvaluationScoreRow[]): number {
  return scores.reduce((sum, score) => sum + score.awarded_score, 0);
}

/**
 * Builds a private project-scoped object key for attachment metadata. Binary
 * upload stays disabled until the separately approved storage policy lands.
 */
export function buildPrivateObjectKey(
  projectId: string,
  originalName: string,
  token: string,
): string | null {
  if (projectId.trim() === "") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return null;
  const base = (originalName.split(/[\\/]/).pop() ?? "").trim();
  if (base === "" || base.includes("..")) return null;
  const safeBase = base.replace(/[^\p{L}\p{N}._-]/gu, "_");
  if (safeBase === "") return null;
  const key = `graduation-projects/${projectId}/${token}-${safeBase}`;
  return isSafePrivateObjectKey(projectId, key) ? key : null;
}

export interface CorrectionRow {
  id: string;
  description: string;
  due_at: string | null;
  completed_at: string | null;
  accepted_at: string | null;
  requested_by_assignment_id: string;
}

export type CorrectionStatus = "pending" | "completed" | "accepted";

export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending: "معلَّق",
  completed: "مُنجز",
  accepted: "مقبول",
};

export function correctionStatus(correction: CorrectionRow): CorrectionStatus {
  if (correction.accepted_at) return "accepted";
  if (correction.completed_at) return "completed";
  return "pending";
}

export function isCorrectionOverdue(correction: CorrectionRow, now = new Date()): boolean {
  if (correctionStatus(correction) !== "pending" || !correction.due_at) return false;
  return new Date(correction.due_at).getTime() < now.getTime();
}

export function pendingCorrectionsCount(corrections: readonly CorrectionRow[]): number {
  return corrections.filter((correction) => correctionStatus(correction) === "pending").length;
}

export interface MyProjectRow {
  project_id: string;
  department_id: string;
  title: string;
  state: ProjectState;
  progress_percent: number;
  at_risk: boolean;
  version: number;
  roles: string[];
  updated_at: string;
}

export interface ProjectListFilter {
  state?: ProjectState | "all";
  atRiskOnly?: boolean;
}

export function filterProjects(
  rows: readonly MyProjectRow[],
  filter: ProjectListFilter = {},
): MyProjectRow[] {
  return rows.filter((row) => {
    if (filter.state && filter.state !== "all" && row.state !== filter.state) return false;
    if (filter.atRiskOnly && !row.at_risk) return false;
    return true;
  });
}

export function groupProjectsByState(
  rows: readonly MyProjectRow[],
): Partial<Record<ProjectState, number>> {
  const groups: Partial<Record<ProjectState, number>> = {};
  for (const row of rows) groups[row.state] = (groups[row.state] ?? 0) + 1;
  return groups;
}

export const READINESS_BLOCKER_LABELS: Record<string, string> = {
  project_not_active: "المشروع ليس في حالة نشط",
  team_missing: "لا يوجد طلاب في الفريق",
  supervisor_missing: "لا يوجد مشرف نشط",
  milestone_weight_invalid: "مجموع أوزان المراحل يجب أن يساوي 100",
  milestones_incomplete: "بعض المراحل غير مكتملة",
  corrections_pending: "توجد تصحيحات معلقة",
  clean_final_file_missing: "لا يوجد ملف نهائي سليم الفحص",
};

/* ---------- detail payload rows (get_graduation_project_detail jsonb) ---------- */

export interface ProjectDetailProject {
  id: string;
  department_id: string;
  program_id: string | null;
  academic_year_id: string | null;
  semester_id: string | null;
  proposal_title: string;
  proposal_abstract: string | null;
  state: ProjectState;
  progress_percent: number;
  at_risk: boolean;
  version: number;
  approved_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssignmentRow {
  id: string;
  role: ProjectRole;
  user_id: string;
  student_profile_id: string | null;
  faculty_profile_id: string | null;
  active: boolean;
  assigned_at: string;
  ended_at: string | null;
}

export interface MilestoneRow {
  id: string;
  title: string;
  milestone_kind: string;
  sequence_no: number;
  weight: number;
  due_at: string | null;
  status: string;
  completion_percent: number;
}

export interface SubmissionRow {
  id: string;
  milestone_id: string;
  version_no: number;
  state: string;
  summary: string | null;
  submitted_at: string;
  accepted_at: string | null;
  submitted_by_assignment_id: string;
}

export interface ProjectFileRow {
  id: string;
  submission_id: string | null;
  original_name: string;
  media_type: string;
  byte_size: number;
  scan_state: string;
  object_key: string | null;
  uploaded_by_assignment_id: string;
  created_at: string;
}

export interface SupervisorNoteRow {
  id: string;
  submission_id: string | null;
  note: string;
  supervisor_assignment_id: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ApprovalRow {
  id: string;
  stage: string;
  decision: string;
  assignment_id: string;
  reason: string | null;
  decided_at: string;
}

export interface DiscussionRequestRow {
  id: string;
  state: string;
  requested_at: string;
  decided_at: string | null;
  decision_reason: string | null;
  requested_by_assignment_id: string;
}

export interface DiscussionRow {
  id: string;
  request_id: string;
  starts_at: string;
  venue: string;
  state: string;
  coordinator_assignment_id: string;
}

export interface PanelMemberRow {
  id: string;
  discussion_id: string;
  assignment_id: string;
  chair: boolean;
  conflict_declared: boolean;
}

export interface ProjectEventRow {
  id: number;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_assignment_id: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
}

export interface ArchiveRow {
  id: string;
  archived_at: string;
  approved_by_assignment_id: string;
  final_file_id: string;
  final_file_name: string;
  final_file_object_key: string | null;
}

export interface GraduationProjectDetail {
  project: ProjectDetailProject;
  viewer_roles: ProjectRole[];
  assignments: AssignmentRow[];
  milestones: MilestoneRow[];
  submissions: SubmissionRow[];
  files: ProjectFileRow[];
  notes: SupervisorNoteRow[];
  approvals: ApprovalRow[];
  discussion_requests: DiscussionRequestRow[];
  discussions: DiscussionRow[];
  panel_members: PanelMemberRow[];
  evaluations: EvaluationRow[];
  corrections: CorrectionRow[];
  archive: ArchiveRow | null;
  events: ProjectEventRow[];
}

/* ---------- department report payloads ---------- */

export interface StatesReportProject {
  project_id: string;
  title: string;
  state: ProjectState;
  progress_percent: number;
  at_risk: boolean;
  version: number;
  overdue_milestones: number;
  discussion_ready: boolean;
  updated_at: string;
}

export interface GraduationProjectStatesReport {
  department_id: string;
  summary: {
    total: number;
    by_state: Partial<Record<ProjectState, number>>;
    at_risk: number;
    with_overdue: number;
    discussion_ready: number;
  };
  projects: StatesReportProject[];
}

export interface SupervisorLoadRow {
  assignment_id: string;
  user_id: string;
  active_projects: number;
  at_risk_projects: number;
  avg_progress: number;
}

export interface TeamCountRow {
  project_id: string;
  students: number;
  supervisors: number;
}

export interface GraduationProjectAssignmentsReport {
  department_id: string;
  supervisors: SupervisorLoadRow[];
  teams: TeamCountRow[];
  unassigned_projects: string[];
}

export interface EvaluationsReportProject {
  project_id: string;
  title: string;
  state: ProjectState;
  finalized_evaluations: number;
  avg_total: number | null;
  min_total: number | null;
  max_total: number | null;
  rubric_versions: string[];
  pending_corrections: number;
}

export interface GraduationProjectEvaluationsReport {
  department_id: string;
  projects: EvaluationsReportProject[];
}

export interface ArchiveReportRow {
  project_id: string;
  title: string;
  archived_at: string;
  approved_by_assignment_id: string;
  final_file: {
    id: string;
    original_name: string;
    object_key: string | null;
    byte_size: number;
    sha256: string;
    scan_state: string;
  };
}

export interface GraduationProjectArchiveReport {
  department_id: string;
  archives: ArchiveReportRow[];
}
