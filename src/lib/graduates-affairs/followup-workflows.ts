/**
 * Graduates Affairs — Follow-up Type Catalog & Versioned Workflow
 * (GA-1 / GA-2 / GA-3 pure configuration layer).
 *
 * The domain kernel (authorization, append-only, one-active-per-record) stays
 * in the backend. This module describes the type catalog and workflow
 * envelope an administrator may tune on top of the kernel.
 */

export type GraduateFollowupWorkflowStatus = "draft" | "published" | "superseded";

export interface GraduateFollowupType {
  id: string;
  code: string;
  label_ar: string;
  description_ar: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  current_workflow_id: string | null;
  current_workflow_version: number | null;
  current_workflow_status: string | null;
}

export interface GraduateFollowupWorkflow {
  id: string;
  followup_type_id: string;
  type_code: string;
  type_label_ar: string;
  version: number;
  status: GraduateFollowupWorkflowStatus;
  states: string[] | Array<{ value: string; label?: string }>;
  transitions: Array<{ from: string; to: string }>;
  initial_state: string;
  terminal_states: string[];
  require_outcome_on_complete: boolean;
  max_active_per_graduate: number;
  notes: string | null;
  published_at: string | null;
  superseded_at: string | null;
  is_current: boolean;
  created_at: string;
}

export interface GraduateFollowupWorkflowDraft {
  id?: string | null;
  followup_type_id: string;
  states: string[];
  transitions: Array<{ from: string; to: string }>;
  initial_state: string;
  terminal_states: string[];
  require_outcome_on_complete: boolean;
  max_active_per_graduate: number;
  notes: string | null;
}

/** States as a flat string array for display/validation. */
export function workflowStatesAsStrings(
  states: GraduateFollowupWorkflow["states"],
): string[] {
  if (states.length === 0) return [];
  if (typeof states[0] === "string") return states as string[];
  return (states as Array<{ value: string }>).map((s) => s.value);
}

export const GA_WORKFLOW_STATUS_LABELS_AR: Record<GraduateFollowupWorkflowStatus, string> = {
  draft: "مسودة",
  published: "منشور",
  superseded: "مستبدل",
};

export const GA_FOLLOWUP_STATE_LABELS_AR: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

/**
 * Default states/transitions matching the built-in seeded workflow.
 * Used to pre-fill the workflow editor for new drafts.
 */
export const GA_WORKFLOW_DEFAULT_STATES = ["open", "in_progress", "completed", "cancelled"];

export const GA_WORKFLOW_DEFAULT_TRANSITIONS: Array<{ from: string; to: string }> = [
  { from: "open", to: "in_progress" },
  { from: "open", to: "cancelled" },
  { from: "in_progress", to: "completed" },
  { from: "in_progress", to: "cancelled" },
];

export const GA_WORKFLOW_EMPTY_DRAFT: GraduateFollowupWorkflowDraft = {
  id: null,
  followup_type_id: "",
  states: [...GA_WORKFLOW_DEFAULT_STATES],
  transitions: GA_WORKFLOW_DEFAULT_TRANSITIONS.map((t) => ({ ...t })),
  initial_state: "open",
  terminal_states: ["completed", "cancelled"],
  require_outcome_on_complete: true,
  max_active_per_graduate: 1,
  notes: null,
};

/**
 * DRAFT contract — incomplete draft save is ALLOWED.
 * Only structurally invalid values are rejected.
 */
export function validateDraftWorkflow(draft: GraduateFollowupWorkflowDraft): string[] {
  const errors: string[] = [];
  if (!draft.followup_type_id) {
    errors.push("يجب اختيار نوع المتابعة.");
  }
  if (draft.states.length === 0) {
    errors.push("يجب تحديد حالة واحدة على الأقل.");
  }
  if (draft.transitions.length === 0) {
    errors.push("يجب تحديد انتقال واحد على الأقل.");
  }
  if (draft.initial_state && !draft.states.includes(draft.initial_state)) {
    errors.push("الحالة الابتدائية غير موجودة في قائمة الحالات.");
  }
  if (draft.max_active_per_graduate < 1) {
    errors.push("الحد الأعلى للمتابعات النشطة لا يقل عن 1.");
  }
  // Check transitions reference known states
  for (const t of draft.transitions) {
    if (!draft.states.includes(t.from)) {
      errors.push(`انتقال من حالة غير معروفة: ${t.from}`);
      break;
    }
    if (!draft.states.includes(t.to)) {
      errors.push(`انتقال إلى حالة غير معروفة: ${t.to}`);
      break;
    }
  }
  return errors;
}

/**
 * PUBLISH contract — local UX mirror only. Backend is authoritative.
 */
export function validateWorkflowForPublish(draft: GraduateFollowupWorkflowDraft): string[] {
  const errors: string[] = [];
  // Must have at least one state
  if (draft.states.length === 0) {
    errors.push("يجب تحديد حالة واحدة على الأقل قبل النشر.");
  }
  // Must have at least one transition
  if (draft.transitions.length === 0) {
    errors.push("يجب تحديد انتقال واحد على الأقل قبل النشر.");
  }
  // Initial state is required and must be in states
  if (!draft.initial_state) {
    errors.push("الحالة الابتدائية مطلوبة قبل النشر.");
  } else if (!draft.states.includes(draft.initial_state)) {
    errors.push("الحالة الابتدائية غير موجودة في قائمة الحالات.");
  }
  // Terminal states must reference known states
  for (const ts of draft.terminal_states) {
    if (!draft.states.includes(ts)) {
      errors.push(`حالة نهائية غير معروفة: ${ts}`);
      break;
    }
  }
  // All transitions must reference known states
  for (const t of draft.transitions) {
    if (!draft.states.includes(t.from)) {
      errors.push(`انتقال من حالة غير معروفة: ${t.from}`);
      break;
    }
    if (!draft.states.includes(t.to)) {
      errors.push(`انتقال إلى حالة غير معروفة: ${t.to}`);
      break;
    }
  }
  if (draft.max_active_per_graduate < 1) {
    errors.push("الحد الأعلى للمتابعات النشطة لا يقل عن 1.");
  }
  return errors;
}
