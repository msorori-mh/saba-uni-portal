import {
  isSafePrivateObjectKey,
  type FinalDecision,
  type FinalDecisionValue,
  type ProjectRole,
  type ProjectState,
  type SupervisionAcceptance,
  type FileCategory,
  type ScanState,
} from "./domain";

/**
 * Lifecycle view-model + handwritten DTOs for Graduation Projects MVP (Package B).
 * UX action lists are mirrors only; SECURITY DEFINER RPCs remain the authority.
 * Freeze wins over draft dean/head conclude/archive paths.
 */

export type LifecycleAction =
  | "submit_proposal"
  | "resubmit_proposal"
  | "upsert_proposal"
  | "approve_proposal"
  | "reject_proposal"
  | "require_revision"
  | "create_project"
  | "create_team"
  | "add_team_member"
  | "remove_team_member"
  | "assign_supervisor"
  | "respond_supervision_accept"
  | "respond_supervision_decline"
  | "submit_progress"
  | "review_progress"
  | "submit_final"
  | "review_final"
  | "schedule_defense"
  | "assign_committee_member"
  | "mark_defense_held"
  | "submit_evaluation"
  | "conclude_result"
  | "archive"
  | "register_file"
  | "finalize_file"
  | "signed_download"
  | "view_admin_overview"
  // legacy mirrors for unrouted Package C components
  | "start_review"
  | "activate_project"
  | "assign_faculty"
  | "end_assignment"
  | "submit_deliverable"
  | "review_submission"
  | "add_note"
  | "resolve_note"
  | "request_discussion"
  | "schedule_discussion"
  | "reject_discussion_request"
  | "assign_panel_member"
  | "record_discussion_outcome"
  | "save_evaluation"
  | "complete_correction"
  | "accept_correction"
  | "view_reports";

export const PROJECT_STATE_LABELS: Record<ProjectState, string> = {
  draft: "مسودة",
  submitted: "مُقدَّم",
  revision_required: "يتطلب تعديلاً",
  rejected: "مرفوض",
  approved: "معتمد",
  active: "نشط",
  defense_scheduled: "مناقشة مجدولة",
  evaluating: "قيد التقييم",
  archived: "مؤرشف",
  // legacy draft labels (unreachable MVP path)
  under_review: "قيد المراجعة",
  discussion_requested: "مناقشة مطلوبة",
  discussion_scheduled: "مناقشة مجدولة",
  corrections_required: "يتطلب تصحيحات",
  completed: "مكتمل",
  cancelled: "ملغى",
};

export const FINAL_DECISION_LABELS: Record<FinalDecision, string> = {
  passed: "ناجح",
  revisions_required: "يتطلب تعديلات",
  failed: "راسب",
};

export const ROLE_LABELS: Record<ProjectRole, string> = {
  student: "طالب",
  supervisor: "مشرف",
  coordinator: "منسق مشاريع التخرج",
  committee_member: "عضو لجنة المناقشة",
  panel_member: "عضو لجنة المناقشة",
  administration_viewer: "عرض إداري",
  department_head: "رئيس القسم",
  dean: "عميد",
};

export const SUPERVISION_STATUS_LABELS: Record<SupervisionAcceptance, string> = {
  pending: "بانتظار القبول",
  accepted: "مقبول",
  declined: "مرفوض",
};

export const ACTION_LABELS: Record<LifecycleAction, string> = {
  submit_proposal: "تقديم المقترح",
  resubmit_proposal: "إعادة تقديم المقترح",
  upsert_proposal: "حفظ المقترح",
  approve_proposal: "قبول المقترح",
  reject_proposal: "رفض المقترح",
  require_revision: "إعادة المقترح للتعديل",
  create_project: "إنشاء مشروع",
  create_team: "إنشاء فريق",
  add_team_member: "إضافة عضو",
  remove_team_member: "إزالة عضو",
  assign_supervisor: "تعيين مشرف",
  respond_supervision_accept: "قبول الإشراف",
  respond_supervision_decline: "رفض الإشراف",
  submit_progress: "تقديم تقدم",
  review_progress: "مراجعة التقدم",
  submit_final: "تسليم النسخة النهائية",
  review_final: "مراجعة النسخة النهائية",
  schedule_defense: "جدولة مناقشة مشروع التخرج",
  assign_committee_member: "تعيين عضو لجنة",
  mark_defense_held: "تسجيل انعقاد المناقشة",
  submit_evaluation: "إرسال التقييم",
  conclude_result: "تسجيل النتيجة النهائية",
  archive: "أرشفة",
  register_file: "تسجيل ملف",
  finalize_file: "إنهاء رفع الملف",
  signed_download: "تحميل موقّع",
  view_admin_overview: "عرض إداري",
  start_review: "بدء المراجعة",
  activate_project: "تفعيل المشروع",
  assign_faculty: "تعيين عضو هيئة تدريس",
  end_assignment: "إنهاء تعيين",
  submit_deliverable: "تسليم مخرج",
  review_submission: "مراجعة التسليم",
  add_note: "إضافة ملاحظة",
  resolve_note: "معالجة الملاحظة",
  request_discussion: "طلب مناقشة",
  schedule_discussion: "جدولة المناقشة",
  reject_discussion_request: "رفض طلب المناقشة",
  assign_panel_member: "تعيين عضو لجنة",
  record_discussion_outcome: "تسجيل نتيجة المناقشة",
  save_evaluation: "حفظ التقييم",
  complete_correction: "إتمام تصحيح",
  accept_correction: "قبول تصحيح",
  view_reports: "عرض التقارير",
};

export const EVENT_LABELS: Record<string, string> = {
  team_created: "إنشاء الفريق",
  team_member_added: "إضافة عضو فريق",
  team_member_removed: "إزالة عضو فريق",
  proposal_upserted: "تحديث المقترح",
  proposal_submitted: "تقديم المقترح",
  proposal_resubmitted: "إعادة تقديم المقترح",
  proposal_accepted: "قبول المقترح",
  proposal_returned: "إعادة المقترح للتعديل",
  proposal_rejected: "رفض المقترح",
  supervisor_assigned: "تعيين مشرف",
  supervision_accepted: "قبول الإشراف",
  supervision_declined: "رفض الإشراف",
  progress_submitted: "تقديم تقدم",
  progress_approved: "اعتماد التقدم",
  progress_returned: "إعادة التقدم للتعديل",
  final_submitted: "تسليم النسخة النهائية",
  final_ready: "اعتماد الجاهزية للمناقشة",
  final_returned: "إعادة النسخة النهائية",
  defense_scheduled: "جدولة مناقشة مشروع التخرج",
  committee_member_assigned: "تعيين عضو لجنة",
  defense_held: "انعقاد المناقشة",
  evaluation_submitted: "إرسال التقييم",
  result_concluded: "تسجيل النتيجة النهائية",
  project_archived: "أرشفة المشروع",
  file_registered: "تسجيل ملف",
  file_finalized: "إنهاء رفع ملف",
  // legacy draft event labels
  proposal_approved: "قبول المقترح",
  proposal_revision_required: "طلب تعديل المقترح",
  project_created: "إنشاء المشروع",
  project_activated: "تفعيل المشروع",
  faculty_assigned: "تعيين عضو هيئة تدريس",
  evaluation_finalized: "اعتماد التقييم",
  result_completed: "اعتماد النتيجة",
  corrections_requested: "طلب تصحيحات",
};

const TERMINAL_STATES: ReadonlySet<ProjectState> = new Set([
  "archived",
  "rejected",
  "completed",
  "cancelled",
]);

function leaderActions(state: ProjectState, finalDecision: FinalDecisionValue): LifecycleAction[] {
  switch (state) {
    case "draft":
      return ["upsert_proposal", "submit_proposal", "add_team_member", "remove_team_member", "register_file", "finalize_file"];
    case "revision_required":
      return ["upsert_proposal", "resubmit_proposal", "add_team_member", "remove_team_member", "register_file", "finalize_file"];
    case "active":
      return ["submit_progress", "submit_final", "submit_deliverable", "register_file", "finalize_file"];
    case "evaluating":
      if (finalDecision === "revisions_required") {
        return ["submit_final", "register_file", "finalize_file"];
      }
      return [];
    default:
      return [];
  }
}

function memberActions(_state: ProjectState): LifecycleAction[] {
  return [];
}

function coordinatorActions(state: ProjectState, finalDecision: FinalDecisionValue): LifecycleAction[] {
  const actions: LifecycleAction[] = ["create_project", "create_team", "view_reports", "view_admin_overview"];
  if (TERMINAL_STATES.has(state)) {
    if (state === "archived") return ["view_reports", "view_admin_overview"];
    return actions;
  }
  switch (state) {
    case "draft":
    case "revision_required":
      actions.push("add_team_member", "remove_team_member");
      break;
    case "submitted":
      actions.push("approve_proposal", "require_revision", "reject_proposal");
      break;
    case "approved":
      actions.push("assign_supervisor", "add_team_member", "remove_team_member");
      break;
    case "active":
      actions.push("assign_supervisor", "schedule_defense", "schedule_discussion", "add_team_member", "remove_team_member");
      break;
    case "defense_scheduled":
    case "discussion_scheduled":
      actions.push("assign_committee_member", "assign_panel_member", "mark_defense_held", "record_discussion_outcome");
      break;
    case "evaluating":
      actions.push("conclude_result");
      if (canArchive(finalDecision)) actions.push("archive");
      break;
    default:
      break;
  }
  if (canArchive(finalDecision) && state !== "archived") {
    if (!actions.includes("archive")) actions.push("archive");
  }
  return actions;
}

function canArchive(decision: FinalDecisionValue): boolean {
  return decision === "passed" || decision === "failed";
}

function supervisorPendingActions(_state: ProjectState): LifecycleAction[] {
  return ["respond_supervision_accept", "respond_supervision_decline"];
}

function supervisorAcceptedActions(state: ProjectState, finalDecision: FinalDecisionValue): LifecycleAction[] {
  if (state === "active") {
    return ["review_progress", "review_final", "review_submission", "add_note", "register_file"];
  }
  if (state === "evaluating" && finalDecision === "revisions_required") {
    return ["review_final", "review_submission", "add_note"];
  }
  return [];
}

function committeeActions(state: ProjectState): LifecycleAction[] {
  if (state === "evaluating") return ["submit_evaluation", "save_evaluation"];
  return [];
}

export interface AvailableActionsInput {
  roles: readonly ProjectRole[];
  state: ProjectState;
  finalDecision?: FinalDecisionValue;
  isLeader?: boolean;
  supervisionStatus?: SupervisionAcceptance;
}

/**
 * Actions the current viewer may attempt — UX mirror of freeze authorization.
 * Dean/department_head titles grant nothing operational.
 */
export function availableProjectActions(
  roles: readonly ProjectRole[],
  state: ProjectState,
  options?: Omit<AvailableActionsInput, "roles" | "state">,
): LifecycleAction[] {
  const finalDecision = options?.finalDecision ?? null;
  const result: LifecycleAction[] = [];
  const push = (actions: LifecycleAction[]) => {
    for (const action of actions) if (!result.includes(action)) result.push(action);
  };

  for (const role of roles) {
    switch (role) {
      case "student":
        if (options?.isLeader === false) push(memberActions(state));
        else push(leaderActions(state, finalDecision));
        break;
      case "supervisor":
        if (options?.supervisionStatus === "pending") push(supervisorPendingActions(state));
        else if (options?.supervisionStatus === "declined") break;
        else push(supervisorAcceptedActions(state, finalDecision));
        break;
      case "coordinator":
        push(coordinatorActions(state, finalDecision));
        break;
      case "committee_member":
      case "panel_member":
        push(committeeActions(state));
        break;
      case "administration_viewer":
        push(["view_admin_overview", "view_reports"]);
        break;
      case "department_head":
      case "dean":
        // No operational bypass (freeze).
        break;
    }
  }
  return result;
}

export function isFileObjectAccessible(scanState: string): boolean {
  return scanState === "clean";
}

/* ---------- evaluation helpers ---------- */

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
  /** MVP single score 0–100 when rubric rows are not used. */
  score?: number | null;
  notes?: string | null;
  committee_member_user_id?: string | null;
}

export interface EvaluationViewer {
  viewerRoles: readonly string[];
  ownPanelMemberIds: readonly string[];
  viewerUserId?: string;
}

/**
 * Cross-member evaluation leakage prevention (freeze):
 * - Committee peers never see other members' evaluations/notes.
 * - Coordinator receives aggregate only (handled separately); detail filtering
 *   must not expose peer notes as full evaluation rows to non-owners.
 * - Students never see raw evaluation rows pre-archive summary.
 */
export function visibleEvaluations(
  evaluations: readonly EvaluationRow[],
  viewer: EvaluationViewer,
): EvaluationRow[] {
  const roles = viewer.viewerRoles;
  const isCommittee = roles.some((r) => r === "panel_member" || r === "committee_member");
  const isCoordinator = roles.includes("coordinator");
  const isStudent = roles.includes("student");
  const isAdminViewer = roles.includes("administration_viewer");

  // Title-only staff (dean/head) and students: no peer evaluation rows.
  if (isStudent || isAdminViewer) return [];
  if (roles.some((r) => r === "dean" || r === "department_head") && !isCoordinator && !isCommittee) {
    return [];
  }

  if (isCoordinator && !isCommittee) {
    // Coordinator: aggregate path only — no peer notes/scores rows in detail.
    return [];
  }

  if (isCommittee) {
    return evaluations.filter((evaluation) => {
      if (viewer.ownPanelMemberIds.includes(evaluation.panel_member_id)) return true;
      if (
        viewer.viewerUserId
        && evaluation.committee_member_user_id
        && evaluation.committee_member_user_id === viewer.viewerUserId
      ) {
        return true;
      }
      return false;
    });
  }

  // Accepted supervisor: no committee evaluation leakage.
  if (roles.includes("supervisor")) return [];

  return [];
}

export type ScoreProblem =
  | "scores_empty"
  | "criterion_code_missing"
  | "criterion_label_missing"
  | "maximum_score_invalid"
  | "awarded_score_invalid"
  | "awarded_exceeds_maximum"
  | "criterion_code_duplicate"
  | "mvp_score_invalid";

export const SCORE_PROBLEM_LABELS: Record<ScoreProblem, string> = {
  scores_empty: "أضف معياراً واحداً على الأقل",
  criterion_code_missing: "رمز المعيار مطلوب",
  criterion_label_missing: "اسم المعيار مطلوب",
  maximum_score_invalid: "الدرجة العظمى يجب أن تكون أكبر من صفر",
  awarded_score_invalid: "الدرجة الممنوحة غير صالحة",
  awarded_exceeds_maximum: "الدرجة الممنوحة تتجاوز الدرجة العظمى",
  criterion_code_duplicate: "رمز المعيار مكرر",
  mvp_score_invalid: "الدرجة يجب أن تكون بين 0 و100",
};

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

export function validateMvpEvaluationScore(score: number): ScoreProblem[] {
  if (!Number.isFinite(score) || score < 0 || score > 100) return ["mvp_score_invalid"];
  return [];
}

export function computeEvaluationTotal(scores: readonly EvaluationScoreRow[]): number {
  return scores.reduce((sum, score) => sum + score.awarded_score, 0);
}

export function buildPrivateObjectKey(
  projectId: string,
  originalName: string,
  token: string,
): string | null {
  if (projectId.trim() === "") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(token)) return null;
  if (originalName.includes("..") || /^https?:\/\//i.test(originalName)) return null;
  const base = (originalName.split(/[\\/]/).pop() ?? "").trim();
  if (base === "" || base.includes("..")) return null;
  const safeBase = base.replace(/[^\p{L}\p{N}._-]/gu, "_");
  if (safeBase === "") return null;
  const key = `graduation-projects/${projectId}/${token}-${safeBase}`;
  return isSafePrivateObjectKey(projectId, key) ? key : null;
}

/* ---------- correction legacy (draft UI) ---------- */

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

/* ---------- list / filter ---------- */

export interface MyProjectRow {
  project_id: string;
  department_id: string;
  title: string;
  state: ProjectState;
  lifecycle_state?: ProjectState;
  final_decision?: FinalDecisionValue;
  progress_percent: number;
  at_risk: boolean;
  version: number;
  roles: string[];
  is_leader?: boolean;
  supervision_status?: SupervisionAcceptance | null;
  next_action_summary?: string | null;
  updated_at: string;
}

export interface ProjectListFilter {
  state?: ProjectState | "all";
  atRiskOnly?: boolean;
  role?: string;
}

export function filterProjects(
  rows: readonly MyProjectRow[],
  filter: ProjectListFilter = {},
): MyProjectRow[] {
  return rows.filter((row) => {
    const state = row.lifecycle_state ?? row.state;
    if (filter.state && filter.state !== "all" && state !== filter.state) return false;
    if (filter.atRiskOnly && !row.at_risk) return false;
    if (filter.role && !row.roles.includes(filter.role)) return false;
    return true;
  });
}

export function filterFacultyAssignments(
  rows: readonly MyProjectRow[],
  viewerRoles: readonly string[],
): MyProjectRow[] {
  const facultyRoles = new Set(["coordinator", "supervisor", "committee_member", "panel_member"]);
  if (!viewerRoles.some((r) => facultyRoles.has(r))) return [];
  return rows.filter((row) => row.roles.some((r) => facultyRoles.has(r)));
}

export function filterCoordinatorQueue(rows: readonly MyProjectRow[]): MyProjectRow[] {
  return rows.filter((row) => row.roles.includes("coordinator"));
}

export function filterDefenseAssignments(rows: readonly MyProjectRow[]): MyProjectRow[] {
  return rows.filter((row) =>
    row.roles.some((r) => r === "committee_member" || r === "panel_member")
    && (row.lifecycle_state ?? row.state) === "evaluating");
}

export function groupProjectsByState(
  rows: readonly MyProjectRow[],
): Partial<Record<ProjectState, number>> {
  const groups: Partial<Record<ProjectState, number>> = {};
  for (const row of rows) {
    const state = row.lifecycle_state ?? row.state;
    groups[state] = (groups[state] ?? 0) + 1;
  }
  return groups;
}

export const READINESS_BLOCKER_LABELS: Record<string, string> = {
  project_not_active: "المشروع ليس في حالة نشط",
  team_missing: "لا يوجد طلاب في الفريق",
  supervisor_missing: "لا يوجد مشرف مقبول",
  final_not_ready: "النسخة النهائية غير معتمدة من المشرف",
  milestone_weight_invalid: "مجموع أوزان المراحل يجب أن يساوي 100",
  milestones_incomplete: "بعض المراحل غير مكتملة",
  corrections_pending: "توجد تصحيحات معلقة",
  clean_final_file_missing: "لا يوجد ملف نهائي سليم الفحص",
  committee_incomplete: "يلزم تعيين عضوين على الأقل في لجنة المناقشة",
};

/* ---------- canonical DTOs ---------- */

export interface TeamMemberDto {
  assignment_id: string;
  user_id: string;
  student_profile_id: string | null;
  is_leader: boolean;
  active: boolean;
  assigned_at: string;
  ended_at: string | null;
}

export interface TeamDto {
  project_id: string;
  members: TeamMemberDto[];
  leader_user_id: string | null;
}

export interface ProposalDto {
  title: string;
  problem_statement: string;
  objectives: string;
  summary: string;
  attachment_file_id: string | null;
}

export interface ProposalDecisionDto {
  id: string;
  decision: "accept" | "return" | "reject" | string;
  reason: string | null;
  comments: string | null;
  decided_at: string;
  coordinator_assignment_id: string;
}

export interface SupervisionDto {
  assignment_id: string;
  user_id: string;
  faculty_profile_id: string | null;
  status: SupervisionAcceptance;
  assigned_at: string;
  responded_at: string | null;
}

export interface ProgressEntryDto {
  id: string;
  summary: string;
  state: "submitted" | "approved" | "returned" | string;
  file_id: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  review_comments: string | null;
}

export interface FinalSubmissionDto {
  id: string;
  file_id: string;
  state: "submitted" | "ready" | "returned" | string;
  is_current: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  review_comments: string | null;
}

export interface DefenseDto {
  id: string;
  starts_at: string;
  venue: string;
  state: "scheduled" | "held" | string;
  committee_member_ids: string[];
}

export interface CommitteeMemberDto {
  id: string;
  defense_id: string;
  assignment_id: string;
  user_id: string;
  chair: boolean;
}

export interface AggregateScoreDto {
  submitted_count: number;
  required_count: number;
  average: number | null;
}

export interface ResultDto {
  final_decision: FinalDecisionValue;
  aggregate: AggregateScoreDto | null;
  concluded_at: string | null;
  concluded_by_assignment_id: string | null;
}

export interface ArchiveDto {
  id: string;
  archived_at: string;
  snapshot: Record<string, unknown>;
  final_file_id: string;
  final_file_name: string;
}

export interface ProjectFileDto {
  id: string;
  category: FileCategory | string;
  original_name: string;
  media_type: string;
  byte_size: number;
  scan_state: ScanState | string;
  /** Exposed only when scan_state is clean and caller is authorized. */
  object_key: string | null;
  is_active: boolean;
  is_current: boolean;
  uploaded_by_assignment_id: string;
  created_at: string;
}

/* ---------- detail payload (get_graduation_project_detail) ---------- */

export interface ProjectDetailProject {
  id: string;
  department_id: string;
  program_id: string | null;
  academic_year_id: string | null;
  semester_id: string | null;
  proposal_title: string;
  proposal_abstract: string | null;
  problem_statement?: string | null;
  objectives?: string | null;
  summary?: string | null;
  state: ProjectState;
  lifecycle_state?: ProjectState;
  final_decision?: FinalDecisionValue;
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
  is_leader?: boolean;
  supervision_status?: SupervisionAcceptance | null;
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
  category?: FileCategory | string | null;
  original_name: string;
  media_type: string;
  byte_size: number;
  scan_state: string;
  object_key: string | null;
  is_active?: boolean;
  is_current?: boolean;
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

export interface AdministrationOverviewRow {
  project_id: string;
  department_id: string;
  title: string;
  lifecycle_state: ProjectState;
  final_decision: FinalDecisionValue;
  archived: boolean;
  updated_at: string;
}

export interface GraduationProjectDetail {
  project: ProjectDetailProject;
  viewer_roles: ProjectRole[];
  assignments: AssignmentRow[];
  team?: TeamDto | null;
  proposal?: ProposalDto | null;
  proposal_decisions?: ProposalDecisionDto[];
  supervision?: SupervisionDto | null;
  progress?: ProgressEntryDto[];
  final_submission?: FinalSubmissionDto | null;
  defense?: DefenseDto | null;
  committee?: CommitteeMemberDto[];
  aggregate_score?: AggregateScoreDto | null;
  result?: ResultDto | null;
  // legacy draft slices (handwritten DTO compat until Package C rewires)
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

export function resolveViewerPanelMemberIds(
  detail: Pick<GraduationProjectDetail, "assignments" | "panel_members">,
  viewerUserId: string,
): string[] {
  const viewerAssignmentIds = new Set(
    detail.assignments
      .filter((assignment) =>
        (assignment.role === "panel_member" || assignment.role === "committee_member")
        && assignment.active
        && assignment.user_id === viewerUserId)
      .map((assignment) => assignment.id),
  );
  return detail.panel_members
    .filter((member) => viewerAssignmentIds.has(member.assignment_id))
    .map((member) => member.id);
}

export function resolveViewerEvaluation(
  detail: Pick<GraduationProjectDetail, "assignments" | "panel_members" | "evaluations">,
  viewerUserId: string,
): EvaluationRow | null {
  const memberIds = resolveViewerPanelMemberIds(detail, viewerUserId);
  return detail.evaluations.find((evaluation) =>
    memberIds.includes(evaluation.panel_member_id)
    || evaluation.committee_member_user_id === viewerUserId) ?? null;
}

export function mapLifecycleState(project: ProjectDetailProject): ProjectState {
  return project.lifecycle_state ?? project.state;
}

export function mapFinalDecision(project: ProjectDetailProject): FinalDecisionValue {
  return project.final_decision ?? null;
}

/* ---------- administration overview ---------- */

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
  final_decision?: FinalDecisionValue;
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

export interface AdministrationOverviewReport {
  projects: AdministrationOverviewRow[];
  counts: {
    total: number;
    by_lifecycle_state: Partial<Record<ProjectState, number>>;
    by_final_decision: Partial<Record<FinalDecision, number>>;
    archived: number;
  };
}
