/**
 * GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01 — client adapter.
 *
 * Students form the team, the department head approves it and assigns the
 * supervisor (final), the supervisor endorses the proposal, then the head (or
 * the vice dean for academic affairs when the head supervises) approves it.
 *
 * Every authorisation decision lives in the SECURITY DEFINER RPCs of
 * docs/migration-drafts/GRADUATION-PROJECTS-DEPARTMENT-HEAD-WORKFLOW-01.sql;
 * this file only calls them and translates their errors.
 */
import { supabase } from "@/integrations/supabase/client";
import { newCorrelationId } from "./correlation";

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
type RpcFn = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const rpc: RpcFn = (fn, args) =>
  (supabase.rpc as unknown as RpcFn).call(supabase, fn, args);

export type WorkflowMember = {
  full_name_ar: string | null;
  academic_number: string | null;
  is_leader: boolean;
};

export type ProjectWorkflowStatus = {
  project_id: string;
  lifecycle_state: string;
  version: number;
  team_submitted_at: string | null;
  team_approved_at: string | null;
  proposal_supervisor_endorsed_at: string | null;
  supervisor_name: string | null;
  coordinator_name: string | null;
  members: WorkflowMember[];
  viewer: {
    is_leader: boolean;
    is_supervisor: boolean;
    is_coordinator: boolean;
    manages_department: boolean;
  };
};

export type DepartmentProjectRow = {
  project_id: string;
  title: string | null;
  lifecycle_state: string;
  version: number;
  program_name_ar: string | null;
  team_submitted_at: string | null;
  team_approved_at: string | null;
  proposal_supervisor_endorsed_at: string | null;
  supervisor_name: string | null;
  supervisor_faculty_profile_id: string | null;
  coordinator_name: string | null;
  members: WorkflowMember[];
};

export type DepartmentProjectsOverview = {
  can_manage: boolean;
  projects: DepartmentProjectRow[];
};

export type SupervisorOption = {
  faculty_profile_id: string;
  full_name_ar: string | null;
  academic_rank: string | null;
  department_name_ar: string | null;
  is_self: boolean;
  active_projects: number;
};

export type TeamCandidate = {
  student_profile_id: string;
  full_name_ar: string | null;
  academic_number: string | null;
};

/** Raised when the workflow RPCs are not deployed yet (migration pending). */
export class HeadWorkflowUnavailableError extends Error {
  constructor() {
    super("خدمة إدارة مشاريع التخرج قيد التحديث. حاول لاحقًا.");
    this.name = "HeadWorkflowUnavailableError";
  }
}

const ERROR_LABELS: ReadonlyArray<readonly [needle: string, label: string]> = [
  ["already has an active graduation project team", "لديك فريق مشروع تخرج قائم بالفعل، أو أحد الطلاب المختارين منضم إلى فريق آخر."],
  ["student profile required", "هذه الخدمة لطلاب المستوى الرابع فقط."],
  ["current semester required", "لا يوجد فصل دراسي حالي محدد في البوابة."],
  ["manager not configured", "لم يُحدَّد رئيس قسم لقسمك في البوابة بعد. راجع شؤون الطلاب."],
  ["GP_NO_PUBLISHED_POLICY", "لم تُنشر سياسة مشاريع التخرج لهذا العام بعد."],
  ["student login account required", "الطالب المختار ليس له حساب دخول في البوابة بعد."],
  ["team size limit exceeded", "بلغ الفريق الحد الأقصى لعدد الأعضاء."],
  ["team size below configured minimum", "عدد أعضاء الفريق أقل من الحد الأدنى المطلوب."],
  ["locked after approval", "لا يمكن تعديل الفريق بعد اعتماده. راجع رئيس القسم."],
  ["team already submitted", "أُرسل الفريق للاعتماد من قبل."],
  ["team already approved", "الفريق معتمد بالفعل."],
  ["requires a submitted team", "لم يرسل الطلاب الفريق للاعتماد بعد."],
  ["manager capability required", "هذا الإجراء لرئيس القسم فقط."],
  ["supervisor must be an active faculty member", "المشرف المختار غير نشط أو ليس له حساب دخول."],
  ["vice dean for academic affairs is not configured", "لا يمكنك الإشراف على المشروع بنفسك قبل تحديد نائب العميد للشؤون الأكاديمية في البوابة، لأنه من يعتمد مقترح المشروع عندئذ."],
  ["vice dean for academic affairs has no faculty profile", "نائب العميد للشؤون الأكاديمية ليس له ملف عضو هيئة تدريس في البوابة."],
  ["self supervision requires a different approving authority", "لا يمكن أن تكون المشرف وجهة الاعتماد معًا."],
  ["supervisor assignment state denied", "لا يمكن تغيير المشرف في حالة المشروع الحالية."],
  ["accepted supervisor assignment required", "هذا الإجراء لمشرف المشروع فقط."],
  ["review reason required", "اكتب سبب الإعادة."],
  ["proposal review precondition failed", "المقترح ليس بانتظار مراجعتك."],
  ["team return state denied", "لا يمكن إعادة الفريق في حالته الحالية."],
  ["team submission state denied", "لا يمكن إرسال الفريق في حالة المشروع الحالية."],
  ["leader assignment required", "هذا الإجراء لقائد الفريق فقط."],
  ["version precondition failed", "تغيّرت بيانات المشروع. حدّث الصفحة ثم أعد المحاولة."],
  ["access denied", "لا تملك صلاحية الوصول إلى هذا المشروع."],
];

function isMissingRpc(error: { message?: string; code?: string }): boolean {
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(message)
  );
}

function toError(error: { message?: string; code?: string }): Error {
  if (isMissingRpc(error)) return new HeadWorkflowUnavailableError();
  const message = error.message ?? "";
  for (const [needle, label] of ERROR_LABELS) {
    if (message.includes(needle)) return new Error(label);
  }
  // Eligibility and other pre-existing guards already raise Arabic messages.
  return new Error(/[؀-ۿ]/.test(message) ? message : "تعذر تنفيذ الإجراء. حاول مرة أخرى.");
}

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw toError(error);
  return data as T;
}

export const headWorkflowKeys = {
  departmentOverview: () => ["graduation-projects", "department-overview"] as const,
  supervisorOptions: () => ["graduation-projects", "supervisor-options"] as const,
  workflowStatus: (projectId: string) =>
    ["graduation-projects", "workflow-status", projectId] as const,
  teamCandidates: (projectId: string) =>
    ["graduation-projects", "team-candidates", projectId] as const,
};

export function fetchDepartmentProjectsOverview(): Promise<DepartmentProjectsOverview> {
  return call<DepartmentProjectsOverview>("gp_department_projects_overview");
}

export function fetchSupervisorOptions(): Promise<SupervisorOption[]> {
  return call<SupervisorOption[]>("gp_list_supervisor_options");
}

export function fetchProjectWorkflowStatus(projectId: string): Promise<ProjectWorkflowStatus> {
  return call<ProjectWorkflowStatus>("gp_project_workflow_status", { p_project_id: projectId });
}

export function fetchTeamCandidates(projectId: string): Promise<TeamCandidate[]> {
  return call<TeamCandidate[]>("gp_list_team_candidates", { p_project_id: projectId });
}

export function createOwnTeam(): Promise<string> {
  return call<string>("student_create_graduation_project_team", {
    p_correlation_id: newCorrelationId(),
  });
}

export function addTeamMember(projectId: string, studentProfileId: string): Promise<string> {
  return call<string>("gp_add_team_member_by_profile", {
    p_project_id: projectId,
    p_student_profile_id: studentProfileId,
    p_correlation_id: newCorrelationId(),
  });
}

export function submitTeamForApproval(projectId: string, version: number): Promise<string> {
  return call<string>("gp_submit_team_for_approval", {
    p_project_id: projectId,
    p_expected_version: version,
    p_correlation_id: newCorrelationId(),
  });
}

export function returnTeam(projectId: string, version: number, reason: string): Promise<string> {
  return call<string>("gp_return_team", {
    p_project_id: projectId,
    p_reason: reason,
    p_expected_version: version,
    p_correlation_id: newCorrelationId(),
  });
}

export function approveTeamAndAssignSupervisor(
  projectId: string,
  version: number,
  supervisorFacultyProfileId: string,
): Promise<string> {
  return call<string>("gp_approve_team_and_assign_supervisor", {
    p_project_id: projectId,
    p_supervisor_faculty_profile_id: supervisorFacultyProfileId,
    p_expected_version: version,
    p_correlation_id: newCorrelationId(),
  });
}

export function supervisorReviewProposal(
  projectId: string,
  version: number,
  action: "endorse" | "return",
  reason: string | null,
): Promise<string> {
  return call<string>("gp_supervisor_review_proposal", {
    p_project_id: projectId,
    p_action: action,
    p_reason: reason,
    p_expected_version: version,
    p_correlation_id: newCorrelationId(),
  });
}

/** Where a project stands in the head workflow, in the reader's words. */
export function describeWorkflowStage(row: {
  lifecycle_state: string;
  team_submitted_at: string | null;
  team_approved_at: string | null;
  proposal_supervisor_endorsed_at: string | null;
}): string {
  if (!row.team_approved_at) {
    return row.team_submitted_at ? "بانتظار اعتماد رئيس القسم للفريق" : "الطلاب يكوّنون الفريق";
  }
  switch (row.lifecycle_state) {
    case "draft":
      return "الفريق معتمد — بانتظار مقترح المشروع";
    case "revision_required":
      return "المقترح معاد للتعديل";
    case "submitted":
      return row.proposal_supervisor_endorsed_at
        ? "المقترح بانتظار الاعتماد النهائي"
        : "المقترح بانتظار مراجعة المشرف";
    case "approved":
    case "active":
      return "المشروع قيد التنفيذ";
    case "rejected":
      return "المقترح مرفوض";
    case "completed":
      return "مكتمل";
    default:
      return "في مرحلة المناقشة والتقييم";
  }
}
