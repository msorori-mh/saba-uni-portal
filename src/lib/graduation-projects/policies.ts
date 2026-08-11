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
  min_team_size: number | null;
  max_team_size: number | null;
  allow_co_supervisor: boolean;
  max_supervisors: number;
  required_progress_reports: number | null;
  min_committee_members: number | null;
  max_committee_members: number | null;
  passing_score: number | null;
  max_revision_rounds: number | null;
  /** Explicit administrative decision; null = undecided (draft only). */
  enforce_proposal_window: boolean | null;
  enforce_defense_window: boolean | null;
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
  | "enforce_proposal_window"
  | "enforce_defense_window"
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

/**
 * Empty draft. The system carries NO invented academic values: every academic
 * figure must be entered and published by the administration (fail-closed).
 */
export const GP_POLICY_EMPTY_DRAFT: GraduationProjectPolicyDraft = {
  department_id: null,
  academic_year_id: null,
  min_team_size: null,
  max_team_size: null,
  allow_co_supervisor: false,
  max_supervisors: 1,
  required_progress_reports: null,
  min_committee_members: null,
  max_committee_members: null,
  passing_score: null,
  max_revision_rounds: null,
  proposal_window_start: null,
  proposal_window_end: null,
  defense_window_start: null,
  defense_window_end: null,
  notes: null,
};

export const GP_POLICY_REQUIRED_FIELD_LABELS_AR: Record<string, string> = {
  min_team_size: "الحد الأدنى لأعضاء الفريق",
  max_team_size: "الحد الأعلى لأعضاء الفريق",
  required_progress_reports: "عدد تقارير التقدم المطلوبة",
  min_committee_members: "الحد الأدنى لأعضاء لجنة المناقشة",
  max_committee_members: "الحد الأعلى لأعضاء لجنة المناقشة",
  passing_score: "درجة النجاح",
  max_revision_rounds: "عدد دورات التعديل المسموحة",
};

export const GP_POLICY_FIELD_LABELS_AR: Record<string, string> = {
  ...GP_POLICY_REQUIRED_FIELD_LABELS_AR,
  allow_co_supervisor: "السماح بمشرف مشارك",
  max_supervisors: "عدد المشرفين",
  proposal_window_start: "بداية فترة تقديم المقترحات",
  proposal_window_end: "نهاية فترة تقديم المقترحات",
  defense_window_start: "بداية فترة المناقشات",
  defense_window_end: "نهاية فترة المناقشات",
};

export const GP_POLICY_STATUS_LABELS_AR: Record<string, string> = {
  draft: "مسودة",
  published: "منشورة",
  superseded: "مستبدلة",
};

/**
 * Client-side guard rails, mirroring the backend `gp_validate_policy`.
 * The backend re-validates every one of these at publish time.
 */
export function validateGraduationProjectPolicy(
  draft: GraduationProjectPolicyDraft,
): string[] {
  const errors: string[] = [];

  for (const [field, label] of Object.entries(GP_POLICY_REQUIRED_FIELD_LABELS_AR)) {
    const value = draft[field as keyof GraduationProjectPolicyDraft];
    if (value === null || value === undefined || Number.isNaN(value as number)) {
      errors.push(`${label}: قيمة مطلوبة — لا توجد قيم افتراضية مدمجة.`);
    }
  }

  if (draft.min_team_size !== null && draft.min_team_size < 1)
    errors.push("الحد الأدنى لأعضاء الفريق لا يقل عن 1.");
  if (draft.min_team_size !== null && draft.max_team_size !== null && draft.max_team_size < draft.min_team_size)
    errors.push("الحد الأعلى لأعضاء الفريق لا يقل عن الحد الأدنى.");
  if (draft.max_team_size !== null && draft.max_team_size > 12)
    errors.push("الحد الأعلى لأعضاء الفريق لا يتجاوز 12.");

  if (draft.min_committee_members !== null && draft.min_committee_members < 2)
    errors.push("لجنة المناقشة لا تقل عن عضوين (قاعدة ثابتة لا يمكن تجاوزها).");
  if (
    draft.min_committee_members !== null &&
    draft.max_committee_members !== null &&
    draft.max_committee_members < draft.min_committee_members
  )
    errors.push("الحد الأعلى لأعضاء اللجنة لا يقل عن الحد الأدنى.");
  if (draft.max_committee_members !== null && draft.max_committee_members > 9)
    errors.push("الحد الأعلى لأعضاء اللجنة لا يتجاوز 9.");

  // CO_SUPERVISOR = DEFERRED — the runtime kernel supports exactly one
  // pending/accepted supervisor; the backend rejects any policy that enables
  // co-supervision, so the panel must not offer it either.
  if (draft.allow_co_supervisor || draft.max_supervisors > 1)
    errors.push("المشرف المشارك غير مدعوم حاليًا؛ عدد المشرفين يبقى واحدًا.");
  if (draft.max_supervisors < 1) errors.push("عدد المشرفين لا يقل عن 1.");

  if (
    draft.required_progress_reports !== null &&
    (draft.required_progress_reports < 0 || draft.required_progress_reports > 12)
  )
    errors.push("عدد تقارير التقدم بين 0 و12.");

  if (draft.passing_score !== null && (draft.passing_score < 0 || draft.passing_score > 100))
    errors.push("درجة النجاح بين 0 و100.");

  if (draft.max_revision_rounds !== null && (draft.max_revision_rounds < 0 || draft.max_revision_rounds > 5))
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
