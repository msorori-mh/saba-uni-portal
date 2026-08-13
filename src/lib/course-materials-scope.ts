import {
  normalizeStudySystemTag,
  type MaterialPlanSessionOption,
  type MaterialScope,
  type StudySystemTag,
} from "@/lib/course-materials.shared";

/**
 * COURSE-SYLLABUS-MATERIALS-AND-STUDY-SYSTEM-CLOSURE-01 — Phase 4/5 contract.
 *
 * Server-side derivation for course materials. The client may only choose the
 * scope, the plan session id (lecture scope), a manual title (general scope)
 * and an optional description. Everything else — lecture number, week number,
 * lecture title and study system — is derived here from authoritative sources:
 * the CURRENT delivery plan session, and the course section.
 */

export type MaterialDerivationFailure =
  | "PLAN_SESSION_REQUIRED"
  | "PLAN_SESSION_NOT_IN_CURRENT_PLAN"
  | "PLAN_SESSION_NOT_ALLOWED_FOR_GENERAL"
  | "GENERAL_TITLE_REQUIRED"
  | "UNKNOWN_SECTION_STUDY_SYSTEM";

export type MaterialDerivationInput = {
  scope: MaterialScope;
  sectionId: string;
  /** Provided only for lecture scope. */
  planSessionId?: string | null;
  /** Provided only for general scope; ignored for lecture scope. */
  title?: string | null;
  description?: string | null;
  /** Authoritative sessions of the CURRENT plan for this exact section. */
  currentPlanSessions: readonly MaterialPlanSessionOption[];
  /** course_sections.study_system (may be legacy or null). */
  sectionStudySystem: unknown;
};

export type MaterialDerivedRow = {
  course_section_id: string;
  material_scope: MaterialScope;
  plan_session_id: string | null;
  title: string;
  description: string | null;
  week_number: number | null;
  lecture_number: number | null;
  study_system: StudySystemTag;
};

export type MaterialDerivationResult =
  | { ok: true; value: MaterialDerivedRow }
  | { ok: false; reason: MaterialDerivationFailure };

export const MATERIAL_DERIVATION_MESSAGES: Record<MaterialDerivationFailure, string> = {
  PLAN_SESSION_REQUIRED: "يجب اختيار محاضرة من خطة التنفيذ المعتمدة",
  PLAN_SESSION_NOT_IN_CURRENT_PLAN: "المحاضرة المختارة لا تنتمي إلى الخطة الحالية لهذه المجموعة",
  PLAN_SESSION_NOT_ALLOWED_FOR_GENERAL: "المادة العامة لا تُربط بمحاضرة",
  GENERAL_TITLE_REQUIRED: "عنوان المادة العامة مطلوب",
  UNKNOWN_SECTION_STUDY_SYSTEM: "نظام الدراسة للمجموعة غير محدد أو غير صحيح",
};

/**
 * Study system is ALWAYS derived from the course section (Source of Truth).
 *
 * FAIL CLOSED: an unclassified section (NULL / blank / unknown literal) is NOT
 * inferred as `both`. New material writes are denied until the section carries
 * an authoritative value. Historical rows are never rewritten.
 */
export function deriveMaterialStudySystem(sectionStudySystem: unknown): StudySystemTag | null {
  if (
    sectionStudySystem === null ||
    sectionStudySystem === undefined ||
    (typeof sectionStudySystem === "string" && sectionStudySystem.trim() === "")
  ) {
    return null;
  }
  return normalizeStudySystemTag(sectionStudySystem);
}

export function deriveMaterialRow(input: MaterialDerivationInput): MaterialDerivationResult {
  const study_system = deriveMaterialStudySystem(input.sectionStudySystem);
  if (!study_system) return { ok: false, reason: "UNKNOWN_SECTION_STUDY_SYSTEM" };

  const description = input.description?.trim() ? input.description.trim() : null;

  if (input.scope === "lecture") {
    const planSessionId = input.planSessionId?.trim();
    if (!planSessionId) return { ok: false, reason: "PLAN_SESSION_REQUIRED" };
    const session = input.currentPlanSessions.find((s) => s.plan_session_id === planSessionId);
    if (!session) return { ok: false, reason: "PLAN_SESSION_NOT_IN_CURRENT_PLAN" };
    return {
      ok: true,
      value: {
        course_section_id: input.sectionId,
        material_scope: "lecture",
        plan_session_id: session.plan_session_id,
        // Never taken from the client.
        title: session.planned_title,
        description,
        week_number: session.week_number ?? null,
        lecture_number: session.session_number,
        study_system,
      },
    };
  }

  if (input.planSessionId) return { ok: false, reason: "PLAN_SESSION_NOT_ALLOWED_FOR_GENERAL" };
  const title = input.title?.trim();
  if (!title) return { ok: false, reason: "GENERAL_TITLE_REQUIRED" };
  return {
    ok: true,
    value: {
      course_section_id: input.sectionId,
      material_scope: "general",
      plan_session_id: null,
      title,
      description,
      week_number: null,
      lecture_number: null,
      study_system,
    },
  };
}
