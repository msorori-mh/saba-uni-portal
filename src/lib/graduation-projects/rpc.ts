import type {
  AdministrationOverviewReport,
  EvaluationScoreRow,
  GraduationProjectDetail,
  MyProjectRow,
} from "./lifecycle";
import type { FinalDecision, FileCategory } from "./domain";
import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  GraduationProjectsRpcError,
  isGraduationProjectsRpcUnavailable,
  mapGraduationProjectRpcError,
  type RpcErrorLike,
} from "./errors";
import { newCorrelationId, resolveCorrelationId, type CorrelationIdStore } from "./correlation";

/**
 * Typed RPC adapter for Graduation Projects MVP (Package B).
 * Frozen inventory: docs/PORTAL-GRADUATION-PROJECTS-MVP-SCOPE-AND-CONTRACT-FREEZE-01.md § RPC Contract
 *
 * Never mutates tables/storage outside these RPCs + authorized upload intent flow.
 * Handwritten DTO returns until generated Supabase types are refreshed after Package A apply.
 */

export {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  GraduationProjectsRpcError,
  isGraduationProjectsRpcUnavailable,
  mapGraduationProjectRpcError,
  ERROR_LABELS,
} from "./errors";
export { newCorrelationId } from "./correlation";

export type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

/** Canonical proposal review actions (freeze). */
export type ProposalReviewActionCanonical = "accept" | "return" | "reject";

/**
 * Includes draft UI actions used by unrouted components.
 * Mapped to canonical before RPC via toCanonicalProposalReviewAction.
 */
export type ProposalReviewAction =
  | ProposalReviewActionCanonical
  | "start_review"
  | "approve"
  | "require_revision";

export type ProgressReviewAction = "approve" | "return";
export type FinalReviewAction = "ready" | "return";
export type SupervisionResponse = "accept" | "decline";

/** Draft vocabulary still referenced by unrouted ResultCorrectionsArchivePanel. */
export type LegacyResultOutcome = "completed" | "corrections_required";

/**
 * Includes draft UI outcomes for handwritten component compat.
 * RPC layer maps to FinalDecision via toCanonicalResultOutcome.
 */
export type ResultOutcome = FinalDecision | LegacyResultOutcome;
export type ResultOutcomeInput = ResultOutcome;

export type SubmissionReviewAction = "accept" | "require_revision" | ProgressReviewAction | FinalReviewAction;
export type AssignableFacultyRole = "supervisor" | "coordinator" | "panel_member" | "committee_member";
export type DiscussionOutcome = "held" | "postponed" | "cancelled";

export interface CorrectionInput {
  description: string;
  due_at?: string | null;
}

export function toCanonicalProposalReviewAction(
  action: ProposalReviewAction,
): ProposalReviewActionCanonical | null {
  switch (action) {
    case "accept":
    case "approve":
      return "accept";
    case "return":
    case "require_revision":
      return "return";
    case "reject":
      return "reject";
    case "start_review":
      return null;
    default:
      return null;
  }
}

export function toCanonicalResultOutcome(outcome: ResultOutcomeInput): ResultOutcome {
  if (outcome === "completed") return "passed";
  if (outcome === "corrections_required") return "revisions_required";
  return outcome;
}

export interface UploadIntentResult {
  file_id: string;
  object_key: string;
  bucket: string;
  upload_token?: string | null;
  /** Short-lived upload target when Package A provides one. */
  upload_url?: string | null;
}

export interface FinalizeFileResult {
  file_id: string;
  scan_state: string;
}

export interface SignedDownloadResult {
  url: string;
  expires_at: string;
}

export const FROZEN_WRITE_RPCS = [
  "create_graduation_project_team",
  "add_graduation_project_team_member",
  "remove_graduation_project_team_member",
  "upsert_graduation_project_proposal",
  "register_graduation_project_file",
  "finalize_graduation_project_file",
  "submit_graduation_project_proposal",
  "resubmit_graduation_project_proposal",
  "review_graduation_project_proposal",
  "assign_graduation_project_supervisor",
  "respond_graduation_project_supervision",
  "submit_graduation_project_progress",
  "review_graduation_project_progress",
  "submit_graduation_project_final",
  "review_graduation_project_final",
  "schedule_graduation_project_defense",
  "assign_graduation_project_committee_member",
  "mark_graduation_project_defense_held",
  "submit_graduation_project_evaluation",
  "conclude_graduation_project_result",
  "archive_graduation_project",
  "create_graduation_project_signed_download",
  "cleanup_graduation_project_test_artifacts",
] as const;

export const FROZEN_READ_RPCS = [
  "list_my_graduation_projects",
  "get_graduation_project_detail",
  "list_administration_graduation_projects_overview",
] as const;

/**
 * Signature dependencies on Package A (document exact args expected).
 * Package A must expose these parameter names; B does not weaken them.
 */
export const PACKAGE_A_SIGNATURE_DEPENDENCIES = {
  create_graduation_project_team:
    "p_department_id, p_leader_student_profile_id, p_title?, p_program_id?, p_academic_year_id?, p_semester_id?, p_correlation_id",
  add_graduation_project_team_member:
    "p_project_id, p_student_profile_id, p_correlation_id",
  remove_graduation_project_team_member:
    "p_project_id, p_assignment_id, p_correlation_id",
  upsert_graduation_project_proposal:
    "p_project_id, p_title, p_problem_statement, p_objectives, p_summary, p_expected_version, p_correlation_id",
  register_graduation_project_file:
    "p_project_id, p_category, p_object_key, p_original_name, p_media_type, p_byte_size, p_sha256, p_correlation_id",
  finalize_graduation_project_file:
    "p_project_id, p_file_id, p_correlation_id",
  submit_graduation_project_proposal:
    "p_project_id, p_expected_version, p_correlation_id",
  resubmit_graduation_project_proposal:
    "p_project_id, p_expected_version, p_correlation_id",
  review_graduation_project_proposal:
    "p_project_id, p_action (accept|return|reject), p_reason?, p_comments?, p_expected_version, p_correlation_id",
  assign_graduation_project_supervisor:
    "p_project_id, p_faculty_profile_id, p_user_id, p_correlation_id",
  respond_graduation_project_supervision:
    "p_project_id, p_response (accept|decline), p_expected_version, p_correlation_id",
  submit_graduation_project_progress:
    "p_project_id, p_summary, p_file_id?, p_correlation_id",
  review_graduation_project_progress:
    "p_project_id, p_progress_id, p_action (approve|return), p_comments?, p_correlation_id",
  submit_graduation_project_final:
    "p_project_id, p_file_id, p_correlation_id",
  review_graduation_project_final:
    "p_project_id, p_final_id, p_action (ready|return), p_comments?, p_correlation_id",
  schedule_graduation_project_defense:
    "p_project_id, p_starts_at, p_venue, p_expected_version, p_correlation_id",
  assign_graduation_project_committee_member:
    "p_project_id, p_defense_id, p_faculty_profile_id, p_user_id, p_chair?, p_correlation_id",
  mark_graduation_project_defense_held:
    "p_project_id, p_defense_id, p_expected_version, p_correlation_id",
  submit_graduation_project_evaluation:
    "p_project_id, p_defense_id, p_score (0..100), p_notes?, p_correlation_id",
  conclude_graduation_project_result:
    "p_project_id, p_final_decision (passed|revisions_required|failed), p_expected_version, p_correlation_id",
  archive_graduation_project:
    "p_project_id, p_expected_version, p_correlation_id",
  create_graduation_project_signed_download:
    "p_project_id, p_file_id, p_correlation_id",
  list_my_graduation_projects: "(no args)",
  get_graduation_project_detail: "p_project_id",
  list_administration_graduation_projects_overview: "optional filters",
} as const;

export class GraduationProjectsRpcClient {
  constructor(
    private readonly client: RpcClient,
    private readonly correlationStore?: CorrelationIdStore,
  ) {}

  private async call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw mapGraduationProjectRpcError(error);
    return data as T;
  }

  private corr(input: {
    correlationId?: string;
    scope: string;
    projectId?: string;
    entityId?: string;
  }): string {
    return resolveCorrelationId({
      correlationId: input.correlationId,
      scope: input.scope,
      projectId: input.projectId,
      entityId: input.entityId,
      store: this.correlationStore,
    });
  }

  /* ---------- frozen write RPCs ---------- */

  async createTeam(input: {
    departmentId: string;
    leaderStudentProfileId: string;
    title?: string;
    programId?: string | null;
    academicYearId?: string | null;
    semesterId?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("create_graduation_project_team", {
      p_department_id: input.departmentId,
      p_leader_student_profile_id: input.leaderStudentProfileId,
      p_title: input.title ?? null,
      p_program_id: input.programId ?? null,
      p_academic_year_id: input.academicYearId ?? null,
      p_semester_id: input.semesterId ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "create_team",
        entityId: input.leaderStudentProfileId,
      }),
    });
  }

  async addTeamMember(input: {
    projectId: string;
    studentProfileId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("add_graduation_project_team_member", {
      p_project_id: input.projectId,
      p_student_profile_id: input.studentProfileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "add_member",
        projectId: input.projectId,
        entityId: input.studentProfileId,
      }),
    });
  }

  async removeTeamMember(input: {
    projectId: string;
    assignmentId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("remove_graduation_project_team_member", {
      p_project_id: input.projectId,
      p_assignment_id: input.assignmentId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "remove_member",
        projectId: input.projectId,
        entityId: input.assignmentId,
      }),
    });
  }

  async upsertProposal(input: {
    projectId: string;
    title: string;
    problemStatement: string;
    objectives: string;
    summary: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("upsert_graduation_project_proposal", {
      p_project_id: input.projectId,
      p_title: input.title,
      p_problem_statement: input.problemStatement,
      p_objectives: input.objectives,
      p_summary: input.summary,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "upsert_proposal",
        projectId: input.projectId,
      }),
    });
  }

  /**
   * Upload-intent / register metadata for private GP files.
   * Binary bytes go to storage via the returned intent; never public URLs.
   */
  async registerFile(input: {
    projectId: string;
    category: FileCategory;
    objectKey: string;
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    correlationId?: string;
  }): Promise<string | UploadIntentResult> {
    return this.call<string | UploadIntentResult>("register_graduation_project_file", {
      p_project_id: input.projectId,
      p_category: input.category,
      p_object_key: input.objectKey,
      p_original_name: input.originalName,
      p_media_type: input.mediaType,
      p_byte_size: input.byteSize,
      p_sha256: input.sha256,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "register_file",
        projectId: input.projectId,
        entityId: input.objectKey,
      }),
    });
  }

  async finalizeFile(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<string | FinalizeFileResult> {
    return this.call<string | FinalizeFileResult>("finalize_graduation_project_file", {
      p_project_id: input.projectId,
      p_file_id: input.fileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "finalize_file",
        projectId: input.projectId,
        entityId: input.fileId,
      }),
    });
  }

  async submitProposal(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_proposal", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "submit_proposal",
        projectId: input.projectId,
      }),
    });
  }

  async resubmitProposal(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("resubmit_graduation_project_proposal", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "resubmit_proposal",
        projectId: input.projectId,
      }),
    });
  }

  async reviewProposal(input: {
    projectId: string;
    action: ProposalReviewAction;
    reason?: string | null;
    comments?: string | null;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    const canonical = toCanonicalProposalReviewAction(input.action);
    if (!canonical) {
      throw new GraduationProjectsRpcError("إجراء المراجعة غير معروف", {
        family: "validation",
      });
    }
    return this.call<string>("review_graduation_project_proposal", {
      p_project_id: input.projectId,
      p_action: canonical,
      p_reason: input.reason ?? null,
      p_comments: input.comments ?? input.reason ?? null,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "review_proposal",
        projectId: input.projectId,
        entityId: canonical,
      }),
    });
  }

  async assignSupervisor(input: {
    projectId: string;
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("assign_graduation_project_supervisor", {
      p_project_id: input.projectId,
      p_faculty_profile_id: input.facultyProfileId,
      p_user_id: input.userId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "assign_supervisor",
        projectId: input.projectId,
        entityId: input.userId,
      }),
    });
  }

  async respondSupervision(input: {
    projectId: string;
    response: SupervisionResponse;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("respond_graduation_project_supervision", {
      p_project_id: input.projectId,
      p_response: input.response,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "respond_supervision",
        projectId: input.projectId,
        entityId: input.response,
      }),
    });
  }

  async submitProgress(input: {
    projectId: string;
    summary: string;
    fileId?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_progress", {
      p_project_id: input.projectId,
      p_summary: input.summary,
      p_file_id: input.fileId ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "submit_progress",
        projectId: input.projectId,
      }),
    });
  }

  async reviewProgress(input: {
    projectId: string;
    progressId: string;
    action: ProgressReviewAction;
    comments?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_progress", {
      p_project_id: input.projectId,
      p_progress_id: input.progressId,
      p_action: input.action,
      p_comments: input.comments ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "review_progress",
        projectId: input.projectId,
        entityId: input.progressId,
      }),
    });
  }

  async submitFinal(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_final", {
      p_project_id: input.projectId,
      p_file_id: input.fileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "submit_final",
        projectId: input.projectId,
        entityId: input.fileId,
      }),
    });
  }

  async reviewFinal(input: {
    projectId: string;
    finalId: string;
    action: FinalReviewAction;
    comments?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_final", {
      p_project_id: input.projectId,
      p_final_id: input.finalId,
      p_action: input.action,
      p_comments: input.comments ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "review_final",
        projectId: input.projectId,
        entityId: input.finalId,
      }),
    });
  }

  async scheduleDefense(input: {
    projectId: string;
    startsAt: string;
    venue: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("schedule_graduation_project_defense", {
      p_project_id: input.projectId,
      p_starts_at: input.startsAt,
      p_venue: input.venue,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "schedule_defense",
        projectId: input.projectId,
      }),
    });
  }

  async assignCommitteeMember(input: {
    projectId: string;
    defenseId: string;
    facultyProfileId: string;
    userId: string;
    chair?: boolean;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("assign_graduation_project_committee_member", {
      p_project_id: input.projectId,
      p_defense_id: input.defenseId,
      p_faculty_profile_id: input.facultyProfileId,
      p_user_id: input.userId,
      p_chair: input.chair ?? false,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "assign_committee",
        projectId: input.projectId,
        entityId: input.userId,
      }),
    });
  }

  async markDefenseHeld(input: {
    projectId: string;
    defenseId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("mark_graduation_project_defense_held", {
      p_project_id: input.projectId,
      p_defense_id: input.defenseId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "mark_defense_held",
        projectId: input.projectId,
        entityId: input.defenseId,
      }),
    });
  }

  async submitEvaluation(input: {
    projectId: string;
    defenseId: string;
    score: number;
    notes?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_evaluation", {
      p_project_id: input.projectId,
      p_defense_id: input.defenseId,
      p_score: input.score,
      p_notes: input.notes ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "submit_evaluation",
        projectId: input.projectId,
        entityId: input.defenseId,
      }),
    });
  }

  async concludeResult(input: {
    projectId: string;
    outcome: ResultOutcomeInput;
    expectedVersion: number;
    correlationId?: string;
    /** @deprecated draft corrections payload — ignored by MVP conclude RPC */
    corrections?: CorrectionInput[];
  }): Promise<string> {
    const decision = toCanonicalResultOutcome(input.outcome);
    return this.call<string>("conclude_graduation_project_result", {
      p_project_id: input.projectId,
      p_final_decision: decision,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "conclude_result",
        projectId: input.projectId,
        entityId: decision,
      }),
    });
  }

  async archiveProject(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("archive_graduation_project", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "archive",
        projectId: input.projectId,
      }),
    });
  }

  async createSignedDownload(input: {
    projectId: string;
    fileId: string;
    correlationId?: string;
  }): Promise<SignedDownloadResult> {
    return this.call<SignedDownloadResult>("create_graduation_project_signed_download", {
      p_project_id: input.projectId,
      p_file_id: input.fileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "signed_download",
        projectId: input.projectId,
        entityId: input.fileId,
      }),
    });
  }

  async cleanupTestArtifacts(input: {
    fingerprint: string;
    correlationId?: string;
  }): Promise<unknown> {
    return this.call("cleanup_graduation_project_test_artifacts", {
      p_fingerprint: input.fingerprint,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  /* ---------- frozen read RPCs ---------- */

  async listMyProjects(): Promise<MyProjectRow[]> {
    const rows = await this.call<MyProjectRow[] | null>("list_my_graduation_projects", {});
    return rows ?? [];
  }

  async getProjectDetail(projectId: string): Promise<GraduationProjectDetail> {
    return this.call<GraduationProjectDetail>("get_graduation_project_detail", {
      p_project_id: projectId,
    });
  }

  async listAdministrationOverview(filters?: {
    departmentId?: string | null;
    lifecycleState?: string | null;
  }): Promise<AdministrationOverviewReport> {
    return this.call<AdministrationOverviewReport>("list_administration_graduation_projects_overview", {
      p_department_id: filters?.departmentId ?? null,
      p_lifecycle_state: filters?.lifecycleState ?? null,
    });
  }

  /* ---------- legacy draft method names (compat shims for unrouted workspace) ---------- */

  /** @deprecated Use createTeam — draft create_graduation_project */
  async createProject(input: {
    departmentId: string;
    title: string;
    abstract: string;
    programId: string;
    academicYearId: string;
    semesterId: string;
    correlationId?: string;
    leaderStudentProfileId?: string;
  }): Promise<string> {
    if (!input.leaderStudentProfileId) {
      throw new GraduationProjectsRpcError(
        "إنشاء الفريق يتطلب معرّف قائد الفريق وفق العقد المجمّد",
        { family: "validation" },
      );
    }
    return this.createTeam({
      departmentId: input.departmentId,
      leaderStudentProfileId: input.leaderStudentProfileId,
      title: input.title,
      programId: input.programId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId,
      correlationId: input.correlationId,
    });
  }

  /** @deprecated Defense scheduling replaces discussion scheduling. */
  async scheduleDiscussion(input: {
    projectId: string;
    requestId: string;
    startsAt: string;
    venue: string;
    expectedVersion?: number;
    correlationId?: string;
  }): Promise<string> {
    return this.scheduleDefense({
      projectId: input.projectId,
      startsAt: input.startsAt,
      venue: input.venue,
      expectedVersion: input.expectedVersion ?? 0,
      correlationId: input.correlationId,
    });
  }

  /** @deprecated Use assignCommitteeMember. */
  async assignPanelMember(input: {
    projectId: string;
    discussionId: string;
    assignmentId: string;
    chair: boolean;
    facultyProfileId?: string;
    userId?: string;
    correlationId?: string;
  }): Promise<string> {
    if (!input.facultyProfileId || !input.userId) {
      throw new GraduationProjectsRpcError(
        "تعيين اللجنة يتطلب معرّف عضو هيئة التدريس والمستخدم",
        { family: "validation" },
      );
    }
    return this.assignCommitteeMember({
      projectId: input.projectId,
      defenseId: input.discussionId,
      facultyProfileId: input.facultyProfileId,
      userId: input.userId,
      chair: input.chair,
      correlationId: input.correlationId,
    });
  }

  /** @deprecated Use markDefenseHeld. */
  async recordDiscussionOutcome(input: {
    projectId: string;
    discussionId: string;
    outcome: DiscussionOutcome;
    expectedVersion?: number;
    correlationId?: string;
  }): Promise<string> {
    if (input.outcome !== "held") {
      throw new GraduationProjectsRpcError("نتيجة المناقشة غير مدعومة في نطاق MVP", {
        family: "validation",
      });
    }
    return this.markDefenseHeld({
      projectId: input.projectId,
      defenseId: input.discussionId,
      expectedVersion: input.expectedVersion ?? 0,
      correlationId: input.correlationId,
    });
  }

  /** @deprecated Use submitEvaluation (MVP score 0–100). */
  async saveEvaluation(input: {
    projectId: string;
    discussionId: string;
    rubricVersion: string;
    scores: EvaluationScoreRow[];
    comments?: string | null;
    submit: boolean;
    correlationId?: string;
  }): Promise<string> {
    if (!input.submit) {
      throw new GraduationProjectsRpcError("حفظ مسودة التقييم غير مدعوم؛ أرسل التقييم مباشرة", {
        family: "validation",
      });
    }
    const total = input.scores.reduce((sum, row) => sum + row.awarded_score, 0);
    return this.submitEvaluation({
      projectId: input.projectId,
      defenseId: input.discussionId,
      score: total,
      notes: input.comments ?? null,
      correlationId: input.correlationId,
    });
  }
}
