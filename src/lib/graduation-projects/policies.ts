/**
 * Graduation Projects — Policy Configuration layer (pure module).
 *
 * The domain kernel (eligibility, one active team per student, state
 * transitions, authorization, evaluation rounds, archive invariants) stays in
 * the backend and is NOT configurable. This module only describes the policy
 * envelope an administrator may tune on top of the kernel.
 */

export type GraduationProjectPolicyStatus = "draft" | "published" | "superseded";

export interface GraduationProjectPolicy {
  id: string;
  department_id: string | null;
  academic_year_id: string | null;
  version: number;
  status: GraduationProjectPolicyStatus;
  min_team_size: number;
  max_team_size: number;
  allow_co_supervisor: boolean;
  max_supervisors: number;
  required_progress_reports: number;
  min_committee_members: number;
  max_committee_members: number;
  passing_score: number;
  max_revision_rounds: number;
  proposal_window_start: string | null;
  proposal_window_end: string | null;
  defense_window_start: string | null;
  defense_window_end: string | null;
  notes: string | null;
  published_at: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GraduationProjectPolicyDraft = Pick<
  GraduationProjectPolicy,
  | "min_team_size"
  | "max_team_size"
  | "allow_co_supervisor"
  | "max_supervisors"
  | "required_progress_reports"
  | "min_committee_members"
  | "max_committee_members"
  | "passing_score"
  | "max_revision_rounds"
  | "proposal_window_start"
  | "proposal_window_end"
  | "defense_window_start"
  | "defense_window_end"
  | "notes"
> & {
  id?: string | null;
  department_id: string | null;
  academic_year_id: string | null;
};

/** Mirrors the backend fallback used when no policy version is published. */
export const GP_POLICY_DEFAULTS: GraduationProjectPolicyDraft = {
  department_id: null,
  academic_year_id: null,
  min_team_size: 1,
  max_team_size: 5,
  allow_co_supervisor: false,
  max_supervisors: 1,
  required_progress_reports: 1,
  min_committee_members: 2,
  max_committee_members: 5,
  passing_score: 60,
  max_revision_rounds: 2,
  proposal_window_start: null,
  proposal_window_end: null,
  defense_window_start: null,
  defense_window_end: null,
  notes: null,
};

export const GP_POLICY_FIELD_LABELS_AR: Record<string, string> = {
  min_team_size: "الحد الأدنى لأعضاء الفريق",
  max_team_size: "الحد الأعلى لأعضاء الفريق",
  allow_co_supervisor: "السماح بمشرف مشارك",
  max_supervisors: "عدد المشرفين",
  required_progress_reports: "عدد تقارير التقدم المطلوبة",
  min_committee_members: "الحد الأدنى لأعضاء لجنة المناقشة",
  max_committee_members: "الحد الأعلى لأعضاء لجنة المناقشة",
  passing_score: "درجة النجاح",
  max_revision_rounds: "عدد دورات التعديل المسموحة",
  proposal_window_start: "بداية فترة تقديم المقترحات",
  proposal_window_end: "نهاية فترة تقديم المقترحات",
  defense_window_start: "بداية فترة المناقشات",
  defense_window_end: "نهاية فترة المناقشات",
};

export const GP_POLICY_STATUS_LABELS_AR: Record<string, string> = {
  draft: "مسودة",
  published: "منشورة",
  superseded: "مستبدلة",
  default: "الافتراضي المدمج",
};

/**
 * Client-side guard rails. The backend re-validates every one of these; this
 * only gives the administrator an immediate, readable message.
 */
export function validateGraduationProjectPolicy(
  draft: GraduationProjectPolicyDraft,
): string[] {
  const errors: string[] = [];

  if (draft.min_team_size < 1) errors.push("الحد الأدنى لأعضاء الفريق لا يقل عن 1.");
  if (draft.max_team_size < draft.min_team_size)
    errors.push("الحد الأعلى لأعضاء الفريق لا يقل عن الحد الأدنى.");
  if (draft.max_team_size > 12) errors.push("الحد الأعلى لأعضاء الفريق لا يتجاوز 12.");

  if (draft.min_committee_members < 2)
    errors.push("لجنة المناقشة لا تقل عن عضوين (قاعدة ثابتة لا يمكن تجاوزها).");
  if (draft.max_committee_members < draft.min_committee_members)
    errors.push("الحد الأعلى لأعضاء اللجنة لا يقل عن الحد الأدنى.");
  if (draft.max_committee_members > 9)
    errors.push("الحد الأعلى لأعضاء اللجنة لا يتجاوز 9.");

  if (draft.max_supervisors < 1 || draft.max_supervisors > 3)
    errors.push("عدد المشرفين بين 1 و3.");
  if (!draft.allow_co_supervisor && draft.max_supervisors > 1)
    errors.push("لا يمكن تجاوز مشرف واحد دون السماح بمشرف مشارك.");

  if (draft.required_progress_reports < 0 || draft.required_progress_reports > 12)
    errors.push("عدد تقارير التقدم بين 0 و12.");

  if (draft.passing_score < 0 || draft.passing_score > 100)
    errors.push("درجة النجاح بين 0 و100.");

  if (draft.max_revision_rounds < 0 || draft.max_revision_rounds > 5)
    errors.push("عدد دورات التعديل بين 0 و5.");

  errors.push(...validateWindow(draft.proposal_window_start, draft.proposal_window_end, "فترة تقديم المقترحات"));
  errors.push(...validateWindow(draft.defense_window_start, draft.defense_window_end, "فترة المناقشات"));

  return errors;
}

function validateWindow(start: string | null, end: string | null, label: string): string[] {
  if (!start && !end) return [];
  if (!start || !end) return [`${label}: يجب تحديد البداية والنهاية معًا.`];
  if (start > end) return [`${label}: تاريخ البداية بعد تاريخ النهاية.`];
  return [];
}

export function describePolicyScope(
  policy: Pick<GraduationProjectPolicy, "department_id" | "academic_year_id">,
  departmentName?: string | null,
  academicYearName?: string | null,
): string {
  const scope = policy.department_id ? (departmentName ?? "قسم محدد") : "كل الأقسام";
  const year = policy.academic_year_id ? (academicYearName ?? "عام محدد") : "كل الأعوام";
  return `${scope} — ${year}`;
}
