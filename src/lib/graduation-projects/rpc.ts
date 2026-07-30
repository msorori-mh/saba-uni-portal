import type {
  EvaluationScoreRow,
  GraduationProjectArchiveReport,
  GraduationProjectAssignmentsReport,
  GraduationProjectDetail,
  GraduationProjectEvaluationsReport,
  GraduationProjectStatesReport,
  MyProjectRow,
  ProjectFileKind,
  ProjectNotificationRow,
} from "./lifecycle";

/**
 * Typed client for the DRAFT-ONLY graduation-projects lifecycle RPC surface
 * (docs/migration-drafts/GRADUATION-PROJECTS-LIFECYCLE-COMPLETION-01.sql plus
 * the merged foundation RPCs). All writes flow through security definer RPCs;
 * this module never touches tables directly.
 */

export const GRADUATION_PROJECTS_SERVICE_UPDATING_MSG =
  "خدمة مشاريع التخرج قيد التحديث حالياً. حاول لاحقاً.";

type RpcErrorLike = { message?: string; code?: string };

type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcErrorLike | null }>;
};

export class GraduationProjectsRpcError extends Error {
  readonly code: string;
  readonly unavailable: boolean;

  constructor(message: string, code = "", unavailable = false) {
    super(message);
    this.name = "GraduationProjectsRpcError";
    this.code = code;
    this.unavailable = unavailable;
  }
}

/** Exact SQL draft messages mapped to Arabic user-facing labels. */
export const ERROR_LABELS: Record<string, string> = {
  "project not found": "المشروع غير موجود",
  "project creation assignment required":
    "إنشاء المشاريع يتطلب تعييناً نشطاً كمنسق أو رئيس قسم في القسم",
  "project title invalid": "عنوان المشروع يجب أن يكون بين 3 و300 حرف",
  "exact direct processing assignment required": "لا تملك تعييناً مباشراً نشطاً يسمح بهذا الإجراء",
  "proposal review action unknown": "إجراء المراجعة غير معروف",
  "proposal review precondition failed":
    "لا يمكن تنفيذ إجراء المراجعة في الحالة الحالية أو برقم النسخة الحالي",
  "review reason required": "السبب مطلوب لهذا القرار",
  "proposal resubmission precondition failed":
    "إعادة التقديم تتطلب حالة «يتطلب تعديلاً» ورقم النسخة الصحيح",
  "project activation precondition failed": "التفعيل يتطلب مشروعاً معتمداً ورقم النسخة الصحيح",
  "faculty assignment role denied": "لا يمكن تعيين هذا الدور عبر هذه الخدمة",
  "faculty assignment state denied": "حالة المشروع لا تسمح بالتعيين",
  "faculty assignment already exists": "لدى هذا المستخدم تعيين نشط بنفس الدور على هذا المشروع",
  "project supervisor slot already filled": "يوجد مشرف نشط لهذا الدور على المشروع مسبقاً",
  "discussion request already pending": "يوجد طلب مناقشة معلَّق لهذا المشروع مسبقاً",
  "panel chair already assigned": "رئيس اللجنة معيَّن لهذه المناقشة مسبقاً",
  "scan state invalid": "حالة الفحص غير صالحة",
  "file not found": "الملف غير موجود",
  "file scan state already decided": "حالة فحص الملف محسومة مسبقاً",
  "panel member already assigned": "عضو اللجنة معيَّن لهذه المناقشة مسبقاً",
  "file object key already registered": "مفتاح الملف مسجَّل مسبقاً",
  "assignment end state denied": "لا يمكن إنهاء التعيينات في حالة نهائية",
  "assignment not found": "التعيين غير موجود",
  "cannot end own assignment": "لا يمكنك إنهاء تعيينك الخاص",
  "deliverable submission state denied": "حالة المشروع أو المرحلة لا تسمح بالتسليم",
  "milestone not found": "المرحلة غير موجودة",
  "submission review action unknown": "إجراء مراجعة التسليم غير معروف",
  "submission review precondition failed": "لا يمكن مراجعة التسليم في الحالة الحالية",
  "revision note required": "ملاحظة التعديل مطلوبة",
  "note state denied": "حالة المشروع لا تسمح بالملاحظات",
  "note text required": "نص الملاحظة مطلوب",
  "submission not found": "التسليم غير موجود",
  "note resolution precondition failed": "لا يمكن معالجة هذه الملاحظة",
  "file registration state denied": "حالة المشروع لا تسمح بتسجيل الملفات",
  "file object key outside project scope": "مفتاح الملف خارج نطاق المشروع",
  "file metadata invalid": "بيانات الملف الوصفية غير مكتملة أو غير صالحة",
  "file media type not allowed": "نوع الملف غير مسموح",
  "file size exceeds limit": "حجم الملف يتجاوز الحد المسموح (50 ميغابايت)",
  "file kind invalid": "نوع الملف المرحلي غير صالح",
  "file stage binding invalid": "هذا النوع من الملفات يجب أن يرتبط بتسليم",
  "final manuscript must attach to a final milestone submission": "النسخة النهائية يجب أن ترتبط بتسليم المرحلة النهائية",
  "discussion scheduling precondition failed": "لا يمكن جدولة المناقشة في الحالة الحالية",
  "discussion schedule details invalid": "موعد المناقشة ومكانها مطلوبان",
  "discussion rejection precondition failed": "لا يمكن رفض طلب المناقشة في الحالة الحالية",
  "discussion not found": "المناقشة غير موجودة",
  "panel assignment precondition failed": "تعيين اللجنة يتطلب مناقشة مجدولة وعضو لجنة نشطاً",
  "discussion outcome unknown": "نتيجة المناقشة غير معروفة",
  "discussion outcome precondition failed": "لا يمكن تسجيل نتيجة المناقشة في الحالة الحالية",
  "evaluation write precondition failed": "التقييم يتطلب مناقشة منعقدة وعضوية في اللجنة",
  "evaluation scores invalid": "درجات التقييم غير صالحة",
  "evaluation already submitted": "التقييم أُرسل مسبقاً ولا يمكن تعديله",
  "result outcome unknown": "نتيجة المشروع غير معروفة",
  "result conclusion precondition failed":
    "اعتماد النتيجة يتطلب حالة «قيد التقييم» ورقم النسخة الصحيح",
  "evaluations not finalized": "يجب اعتماد جميع التقييمات قبل إنهاء النتيجة",
  "corrections payload invalid": "قائمة التصحيحات غير صالحة",
  "correction completion precondition failed": "لا يمكن إتمام هذا التصحيح في الحالة الحالية",
  "correction acceptance precondition failed": "قبول التصحيح يتطلب إتمامه مسبقاً",
  "department report assignment required": "تقارير القسم تتطلب تعييناً إدارياً نشطاً في القسم",
  "direct archive assignment required": "الأرشفة تتطلب تعييناً مباشراً بصلاحية الأرشفة",
  "project not archive-ready": "المشروع ليس جاهزاً للأرشفة",
  "clean accepted final evidence and accepted corrections required":
    "الأرشفة تتطلب ملفاً نهائياً سليم الفحص ومقبولاً وتصحيحات مقبولة",
  "proposal transition precondition failed": "لا يمكن تقديم المقترح في الحالة الحالية",
  "team mutation state denied": "حالة المشروع لا تسمح بتعديل الفريق",
  "milestone mutation state denied": "حالة المشروع لا تسمح بتعديل المراحل",
  "discussion readiness failed": "المشروع غير جاهز لطلب المناقشة",
  "evaluation lifecycle precondition failed": "لا يمكن اعتماد التقييم في الحالة الحالية",
  "evaluation finalization precondition failed": "لا يمكن اعتماد التقييم في الحالة الحالية",
  "graduation project events are append-only": "سجل الأحداث للإضافة فقط",
};

export function isGraduationProjectsRpcUnavailable(
  error: RpcErrorLike | null | undefined,
): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  const code = error.code ?? "";
  return (
    code === "42883" ||
    /function .* does not exist/i.test(msg) ||
    /could not find the function/i.test(msg) ||
    /schema cache/i.test(msg)
  );
}

export function mapGraduationProjectRpcError(error: RpcErrorLike): GraduationProjectsRpcError {
  if (isGraduationProjectsRpcUnavailable(error)) {
    return new GraduationProjectsRpcError(
      GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
      error.code ?? "",
      true,
    );
  }
  const msg = error.message ?? "";
  return new GraduationProjectsRpcError(
    ERROR_LABELS[msg] ?? msg ?? "حدث خطأ غير متوقع",
    error.code ?? "",
  );
}

/** Idempotency correlation id for one logical user action (safe retries). */
export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export type ProposalReviewAction = "start_review" | "approve" | "reject" | "require_revision";
export type SubmissionReviewAction = "accept" | "require_revision";
export type AssignableFacultyRole = "supervisor" | "co_supervisor" | "coordinator" | "panel_member";
export type MilestoneKind = "progress" | "final";
export type DiscussionOutcome = "held" | "postponed" | "cancelled";
export type ResultOutcome = "completed" | "corrections_required";

export interface CorrectionInput {
  description: string;
  due_at?: string | null;
}

export class GraduationProjectsRpcClient {
  constructor(private readonly client: RpcClient) {}

  private async call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw mapGraduationProjectRpcError(error);
    return data as T;
  }

  async createProject(input: {
    departmentId: string;
    title: string;
    abstract: string;
    programId: string;
    academicYearId: string;
    semesterId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("create_graduation_project", {
      p_department_id: input.departmentId,
      p_title: input.title,
      p_abstract: input.abstract,
      p_program_id: input.programId,
      p_academic_year_id: input.academicYearId,
      p_semester_id: input.semesterId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async reviewProposal(input: {
    projectId: string;
    action: ProposalReviewAction;
    reason?: string | null;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_proposal", {
      p_project_id: input.projectId,
      p_action: input.action,
      p_reason: input.reason ?? null,
      p_expected_version: input.expectedVersion,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
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
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async activateProject(input: {
    projectId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("activate_graduation_project", {
      p_project_id: input.projectId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async assignFaculty(input: {
    projectId: string;
    role: AssignableFacultyRole;
    facultyProfileId: string;
    userId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("assign_graduation_project_faculty", {
      p_project_id: input.projectId,
      p_role: input.role,
      p_faculty_profile_id: input.facultyProfileId,
      p_user_id: input.userId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async endAssignment(input: {
    projectId: string;
    assignmentId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("end_graduation_project_assignment", {
      p_project_id: input.projectId,
      p_assignment_id: input.assignmentId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async submitDeliverable(input: {
    projectId: string;
    milestoneId: string;
    summary: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("submit_graduation_project_deliverable", {
      p_project_id: input.projectId,
      p_milestone_id: input.milestoneId,
      p_summary: input.summary,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async reviewSubmission(input: {
    projectId: string;
    submissionId: string;
    action: SubmissionReviewAction;
    note?: string | null;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("review_graduation_project_submission", {
      p_project_id: input.projectId,
      p_submission_id: input.submissionId,
      p_action: input.action,
      p_note: input.note ?? null,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async addSupervisorNote(input: {
    projectId: string;
    submissionId?: string | null;
    note: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("add_graduation_project_supervisor_note", {
      p_project_id: input.projectId,
      p_submission_id: input.submissionId ?? null,
      p_note: input.note,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async resolveSupervisorNote(input: {
    projectId: string;
    noteId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("resolve_graduation_project_supervisor_note", {
      p_project_id: input.projectId,
      p_note_id: input.noteId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async registerFile(input: {
    projectId: string;
    submissionId?: string | null;
    objectKey: string;
    originalName: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    fileKind?: ProjectFileKind;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("register_graduation_project_file", {
      p_project_id: input.projectId,
      p_submission_id: input.submissionId ?? null,
      p_object_key: input.objectKey,
      p_original_name: input.originalName,
      p_media_type: input.mediaType,
      p_byte_size: input.byteSize,
      p_sha256: input.sha256,
      p_file_kind: input.fileKind ?? "attachment",
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async listMyNotifications(): Promise<ProjectNotificationRow[]> {
    const rows = await this.call<ProjectNotificationRow[] | null>(
      "list_my_graduation_project_notifications",
      {},
    );
    return rows ?? [];
  }

  async scheduleDiscussion(input: {
    projectId: string;
    requestId: string;
    startsAt: string;
    venue: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("schedule_graduation_project_discussion", {
      p_project_id: input.projectId,
      p_request_id: input.requestId,
      p_starts_at: input.startsAt,
      p_venue: input.venue,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async rejectDiscussionRequest(input: {
    projectId: string;
    requestId: string;
    reason: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("reject_graduation_project_discussion_request", {
      p_project_id: input.projectId,
      p_request_id: input.requestId,
      p_reason: input.reason,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async assignPanelMember(input: {
    projectId: string;
    discussionId: string;
    assignmentId: string;
    chair: boolean;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("assign_graduation_project_panel_member", {
      p_project_id: input.projectId,
      p_discussion_id: input.discussionId,
      p_assignment_id: input.assignmentId,
      p_chair: input.chair,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async recordDiscussionOutcome(input: {
    projectId: string;
    discussionId: string;
    outcome: DiscussionOutcome;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("record_graduation_project_discussion_outcome", {
      p_project_id: input.projectId,
      p_discussion_id: input.discussionId,
      p_outcome: input.outcome,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async saveEvaluation(input: {
    projectId: string;
    discussionId: string;
    rubricVersion: string;
    scores: EvaluationScoreRow[];
    comments?: string | null;
    submit: boolean;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("save_graduation_project_evaluation", {
      p_project_id: input.projectId,
      p_discussion_id: input.discussionId,
      p_rubric_version: input.rubricVersion,
      p_scores: input.scores,
      p_comments: input.comments ?? null,
      p_submit: input.submit,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async concludeResult(input: {
    projectId: string;
    outcome: ResultOutcome;
    corrections?: CorrectionInput[];
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("conclude_graduation_project_result", {
      p_project_id: input.projectId,
      p_outcome: input.outcome,
      p_corrections: input.corrections ?? null,
      p_expected_version: input.expectedVersion,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async completeCorrection(input: {
    projectId: string;
    correctionId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("complete_graduation_project_correction", {
      p_project_id: input.projectId,
      p_correction_id: input.correctionId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async acceptCorrection(input: {
    projectId: string;
    correctionId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("accept_graduation_project_correction", {
      p_project_id: input.projectId,
      p_correction_id: input.correctionId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
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
      p_correlation_id: input.correlationId ?? newCorrelationId(),
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
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async setMilestone(input: {
    projectId: string;
    title: string;
    kind: MilestoneKind;
    sequence: number;
    weight: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("set_graduation_project_milestone", {
      p_project_id: input.projectId,
      p_title: input.title,
      p_kind: input.kind,
      p_sequence: input.sequence,
      p_weight: input.weight,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async requestDiscussion(input: {
    projectId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("request_graduation_project_discussion", {
      p_project_id: input.projectId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async finalizeEvaluation(input: {
    evaluationId: string;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("finalize_graduation_project_evaluation", {
      p_evaluation_id: input.evaluationId,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async archiveProject(input: {
    projectId: string;
    finalFileId: string;
    expectedVersion: number;
    correlationId?: string;
  }): Promise<string> {
    return this.call<string>("archive_graduation_project", {
      p_project_id: input.projectId,
      p_final_file_id: input.finalFileId,
      p_expected_version: input.expectedVersion,
      p_correlation_id: input.correlationId ?? newCorrelationId(),
    });
  }

  async listMyProjects(): Promise<MyProjectRow[]> {
    const rows = await this.call<MyProjectRow[] | null>("list_my_graduation_projects", {});
    return rows ?? [];
  }

  async getProjectDetail(projectId: string): Promise<GraduationProjectDetail> {
    return this.call<GraduationProjectDetail>("get_graduation_project_detail", {
      p_project_id: projectId,
    });
  }

  async getStatesReport(departmentId: string): Promise<GraduationProjectStatesReport> {
    return this.call<GraduationProjectStatesReport>("get_graduation_project_states_report", {
      p_department_id: departmentId,
    });
  }

  async getAssignmentsReport(departmentId: string): Promise<GraduationProjectAssignmentsReport> {
    return this.call<GraduationProjectAssignmentsReport>(
      "get_graduation_project_assignments_report",
      {
        p_department_id: departmentId,
      },
    );
  }

  async getEvaluationsReport(departmentId: string): Promise<GraduationProjectEvaluationsReport> {
    return this.call<GraduationProjectEvaluationsReport>(
      "get_graduation_project_evaluations_report",
      {
        p_department_id: departmentId,
      },
    );
  }

  async getArchiveReport(departmentId: string): Promise<GraduationProjectArchiveReport> {
    return this.call<GraduationProjectArchiveReport>("get_graduation_project_archive_report", {
      p_department_id: departmentId,
    });
  }
}
