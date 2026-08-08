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

/** Package A create_graduation_project_file_upload_intent / register result. */
export interface UploadIntentResult {
  file_id: string;
  storage_bucket: string;
  storage_object_path: string;
  category: string;
  request?: Record<string, unknown>;
  /** @deprecated alias — use storage_object_path */
  object_key?: string;
  /** @deprecated alias — use storage_bucket */
  bucket?: string;
}

export interface FinalizeFileResult {
  file_id: string;
  category?: string;
  upload_status?: string;
  scan_state: string;
  is_current?: boolean;
  sha256?: string | null;
}

/** Package A authorize payload; service may attach a short-lived signed url. */
export interface SignedDownloadResult {
  storage_bucket: string;
  storage_object_path: string;
  expires_in_seconds: number;
  /** Filled by service via storage.createSignedUrl after RPC authorize. */
  url?: string;
  expires_at?: string;
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
] as const;

export const FROZEN_READ_RPCS = [
  "list_my_graduation_projects",
  "get_graduation_project_detail",
  "list_administration_graduation_projects_overview",
] as const;

/**
 * Signature dependencies on Package A (exact p_* names from A1/A2/A3).
 * Package B must not invent alternate argument names or return shapes.
 */
export const PACKAGE_A_SIGNATURE_DEPENDENCIES = {
  create_graduation_project_team:
    "p_department_id, p_leader_student_profile_id, p_leader_user_id, p_program_id, p_academic_year_id, p_semester_id, p_correlation_id",
  add_graduation_project_team_member:
    "p_project_id, p_student_profile_id, p_student_user_id, p_correlation_id",
  remove_graduation_project_team_member:
    "p_project_id, p_assignment_id, p_correlation_id",
  upsert_graduation_project_proposal:
    "p_project_id, p_title, p_problem_statement, p_objectives, p_summary, p_expected_version, p_correlation_id",
  create_graduation_project_file_upload_intent:
    "p_project_id, p_category, p_original_name, p_byte_size, p_correlation_id, p_sha256?",
  register_graduation_project_file:
    "p_project_id, p_category, p_original_name, p_byte_size, p_correlation_id, p_sha256?",
  finalize_graduation_project_file:
    "p_file_id, p_correlation_id, p_sha256?",
  mark_graduation_project_file_scan_state:
    "p_file_id, p_scan_state, p_correlation_id",
  submit_graduation_project_proposal:
    "p_project_id, p_expected_version, p_correlation_id",
  resubmit_graduation_project_proposal:
    "p_project_id, p_expected_version, p_correlation_id",
  review_graduation_project_proposal:
    "p_project_id, p_action (accept|return|reject), p_reason, p_expected_version, p_correlation_id",
  assign_graduation_project_supervisor:
    "p_project_id, p_faculty_profile_id, p_user_id, p_correlation_id",
  respond_graduation_project_supervision:
    "p_project_id, p_response (accept|decline), p_expected_version, p_correlation_id",
  submit_graduation_project_progress:
    "p_project_id, p_summary, p_file_id?, p_correlation_id",
  review_graduation_project_progress:
    "p_entry_id, p_action (approve|return), p_comments, p_correlation_id",
  submit_graduation_project_final:
    "p_project_id, p_file_id, p_expected_version, p_correlation_id",
  review_graduation_project_final:
    "p_project_id, p_action (ready|return), p_comments, p_expected_version, p_correlation_id",
  schedule_graduation_project_defense:
    "p_project_id, p_starts_at, p_venue, p_expected_version, p_correlation_id",
  assign_graduation_project_committee_member:
    "p_project_id, p_faculty_profile_id, p_user_id, p_correlation_id",
  mark_graduation_project_defense_held:
    "p_project_id, p_expected_version, p_correlation_id",
  submit_graduation_project_evaluation:
    "p_project_id, p_score (0..100), p_notes, p_correlation_id",
  conclude_graduation_project_result:
    "p_project_id, p_decision (passed|revisions_required|failed), p_expected_version, p_correlation_id",
  archive_graduation_project:
    "p_project_id, p_expected_version, p_correlation_id",
  create_graduation_project_signed_download:
    "p_file_id, p_correlation_id",
  cleanup_graduation_project_orphan_storage_contract:
    "p_project_id, p_correlation_id",
  list_my_graduation_projects: "(no args)",
  get_graduation_project_detail: "p_project_id",
  list_administration_graduation_projects_overview: "(no args)",
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
    leaderUserId: string;
    programId: string;
    academicYearId: string;
    semesterId: string;
    correlationId?: string;
    /** @deprecated title is not a Package A create-team parameter */
    title?: string;
  }): Promise<string> {
    return this.call<string>("create_graduation_project_team", {
      p_department_id: input.departmentId,
      p_leader_student_profile_id: input.leaderStudentProfileId,
      p_leader_user_id: input.leaderUserId,
      p_program_id: input.programId,
      p_academic_year_id: input.academicYearId,
      p_semester_id: input.semesterId,
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
    studentUserId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("add_graduation_project_team_member", {
      p_project_id: input.projectId,
      p_student_profile_id: input.studentProfileId,
      p_student_user_id: input.studentUserId,
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
   * Create upload intent (Package A). sha256 may be null while pending.
   * Server builds object key; binary bytes upload privately afterward.
   */
  async createFileUploadIntent(input: {
    projectId: string;
    category: FileCategory;
    originalName: string;
    byteSize: number;
    sha256?: string | null;
    correlationId?: string;
  }): Promise<UploadIntentResult> {
    const result = await this.call<UploadIntentResult>("create_graduation_project_file_upload_intent", {
      p_project_id: input.projectId,
      p_category: input.category,
      p_original_name: input.originalName,
      p_byte_size: input.byteSize,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "upload_intent",
        projectId: input.projectId,
        entityId: input.category,
      }),
      p_sha256: input.sha256 ?? null,
    });
    return {
      ...result,
      object_key: result.storage_object_path,
      bucket: result.storage_bucket,
    };
  }

  /**
   * Thin Package A wrapper → create_graduation_project_file_upload_intent; returns file_id.
   */
  async registerFile(input: {
    projectId: string;
    category: FileCategory;
    originalName: string;
    byteSize: number;
    sha256?: string | null;
    correlationId?: string;
    /** @deprecated client no longer supplies object key — Package A builds it */
    objectKey?: string;
    /** @deprecated media type fixed to application/pdf by Package A */
    mediaType?: string;
  }): Promise<string> {
    return this.call<string>("register_graduation_project_file", {
      p_project_id: input.projectId,
      p_category: input.category,
      p_original_name: input.originalName,
      p_byte_size: input.byteSize,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "register_file",
        projectId: input.projectId,
        entityId: input.category,
      }),
      p_sha256: input.sha256 ?? null,
    });
  }

  async finalizeFile(input: {
    fileId: string;
    sha256: string;
    correlationId?: string;
    /** @deprecated not a Package A finalize parameter */
    projectId?: string;
  }): Promise<FinalizeFileResult> {
    if (!input.sha256 || !/^[0-9a-f]{64}$/.test(input.sha256)) {
      throw new GraduationProjectsRpcError("بصمة الملف مطلوبة عند الإنهاء", {
        family: "validation",
      });
    }
    return this.call<FinalizeFileResult>("finalize_graduation_project_file", {
      p_file_id: input.fileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "finalize_file",
        projectId: input.projectId,
        entityId: input.fileId,
      }),
      p_sha256: input.sha256,
    });
  }

  async markFileScanState(input: {
    fileId: string;
    scanState: "clean" | "quarantined" | "rejected";
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("mark_graduation_project_file_scan_state", {
      p_file_id: input.fileId,
      p_scan_state: input.scanState,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "mark_scan",
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
      p_reason: input.reason ?? input.comments ?? null,
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
    progressId: string;
    action: ProgressReviewAction;
    comments?: string | null;
    correlationId?: string;
    /** @deprecated not a Package A review-progress parameter */
    projectId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_progress", {
      p_entry_id: input.progressId,
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
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_final", {
      p_project_id: input.projectId,
      p_file_id: input.fileId,
      p_expected_version: input.expectedVersion,
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
    action: FinalReviewAction;
    comments?: string | null;
    expectedVersion: number;
    correlationId?: string;
    /** @deprecated not a Package A review-final parameter */
    finalId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_final", {
      p_project_id: input.projectId,
      p_action: input.action,
      p_comments: input.comments ?? null,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "review_final",
        projectId: input.projectId,
        entityId: input.action,
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
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
    /** @deprecated not a Package A committee parameter */
    defenseId?: string;
    /** @deprecated not a Package A committee parameter */
    chair?: boolean;
  }): Promise<string> {
    return this.call<string>("assign_graduation_project_committee_member", {
      p_project_id: input.projectId,
      p_faculty_profile_id: input.facultyProfileId,
      p_user_id: input.userId,
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
    expectedVersion: number;
    correlationId?: string;
    /** @deprecated not a Package A mark-held parameter */
    defenseId?: string;
  }): Promise<string> {
    return this.call<string>("mark_graduation_project_defense_held", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "mark_defense_held",
        projectId: input.projectId,
      }),
    });
  }

  async submitEvaluation(input: {
    projectId: string;
    score: number;
    notes?: string | null;
    correlationId?: string;
    /** @deprecated not a Package A evaluation parameter */
    defenseId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_evaluation", {
      p_project_id: input.projectId,
      p_score: input.score,
      p_notes: input.notes ?? null,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "submit_evaluation",
        projectId: input.projectId,
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
      p_decision: decision,
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
    fileId: string;
    correlationId?: string;
    /** @deprecated not a Package A signed-download parameter */
    projectId?: string;
  }): Promise<SignedDownloadResult> {
    return this.call<SignedDownloadResult>("create_graduation_project_signed_download", {
      p_file_id: input.fileId,
      p_correlation_id: this.corr({
        correlationId: input.correlationId,
        scope: "signed_download",
        projectId: input.projectId,
        entityId: input.fileId,
      }),
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

  async listAdministrationOverview(_filters?: {
    departmentId?: string | null;
    lifecycleState?: string | null;
  }): Promise<AdministrationOverviewReport> {
    const rows = await this.call<AdministrationOverviewReport["projects"] | AdministrationOverviewReport | null>(
      "list_administration_graduation_projects_overview",
      {},
    );
    if (Array.isArray(rows)) {
      return {
        projects: rows,
        counts: {
          total: rows.length,
          by_lifecycle_state: {},
          by_final_decision: {},
          archived: rows.filter((r) => r.lifecycle_state === "archived" || Boolean((r as { archived_at?: string }).archived_at)).length,
        },
      };
    }
    return rows ?? {
      projects: [],
      counts: { total: 0, by_lifecycle_state: {}, by_final_decision: {}, archived: 0 },
    };
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
    leaderUserId?: string;
  }): Promise<string> {
    if (!input.leaderStudentProfileId || !input.leaderUserId) {
      throw new GraduationProjectsRpcError(
        "إنشاء الفريق يتطلب معرّف قائد الفريق والمستخدم وفق العقد المجمّد",
        { family: "validation" },
      );
    }
    return this.createTeam({
      departmentId: input.departmentId,
      leaderStudentProfileId: input.leaderStudentProfileId,
      leaderUserId: input.leaderUserId,
      programId: input.programId,
      academicYearId: input.academicYearId,
      semesterId: input.semesterId,
      correlationId: input.correlationId,
      title: input.title,
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
      facultyProfileId: input.facultyProfileId,
      userId: input.userId,
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
      score: total,
      notes: input.comments ?? null,
      correlationId: input.correlationId,
    });
  }
}
