/**
 * Lecture Execution (Course Delivery Plan) server functions.
 *
 * Operational model (owner decision):
 * - No batch delegate confirmation. The section faculty member is the single
 *   operational source of truth for lecture execution.
 * - Every section has a numbered delivery plan with pre-authored session
 *   titles; execution is recorded against the planned session.
 * - Students see titles/status/dates only; reasons and notes stay internal.
 *
 * All authorization is enforced by the database RPCs (cdp_*), never by the UI.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const LECTURE_EXECUTION_STATUSES = [
  "executed",
  "hindered",
  "postponed",
  "cancelled",
  "compensated",
] as const;

export type LectureExecutionStatus = (typeof LECTURE_EXECUTION_STATUSES)[number];
export type LectureSessionStatus = LectureExecutionStatus | "not_recorded";

export const LECTURE_STATUS_LABELS: Record<LectureSessionStatus, string> = {
  not_recorded: "لم تُسجَّل",
  executed: "نُفذت",
  hindered: "تعذرت",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
  compensated: "عُوضت",
};

export type SectionStudySystem = "general" | "private" | "both";

export const SECTION_STUDY_SYSTEM_LABELS: Record<SectionStudySystem, string> = {
  general: "عام",
  private: "نفقة خاصة",
  both: "كلا النظامين",
};

export type DeliveryPlanSession = {
  plan_session_id: string;
  session_number: number;
  week_number: number | null;
  planned_title: string;
  planned_topics: string | null;
  status: LectureSessionStatus;
  execution_date: string | null;
  compensation_date: string | null;
  reason: string | null;
  notes: string | null;
  recorded_at: string | null;
};

export type SectionDeliveryPlan = {
  course: {
    course_section_id: string;
    section_code: string;
    course_code: string;
    course_name_ar: string;
    study_system: SectionStudySystem | null;
    faculty_name: string;
  } | null;
  can_manage: boolean;
  awaiting_syllabus: boolean;
  plan: {
    plan_id: string;
    planned_session_count: number;
    status: "draft" | "published" | "archived";
    source: "syllabus" | "legacy_faculty";
    syllabus_version: number | null;
    published_at: string | null;
  } | null;
  sessions: DeliveryPlanSession[];
};

export type FacultyDeliverySection = {
  course_section_id: string;
  section_code: string;
  course_code: string;
  course_name_ar: string;
  study_system: SectionStudySystem | null;
  plan_status: string;
  plan_source: "syllabus" | "legacy_faculty" | null;
  planned_session_count: number;
  recorded_count: number;
  executed_count: number;
};


export type StudentDeliverySection = {
  course_section_id: string;
  section_code: string;
  course_code: string;
  course_name_ar: string;
  plan_status: string;
  planned_session_count: number;
  executed_count: number;
};

export type DeliveryOverviewRow = {
  course_section_id: string;
  course_code: string;
  course_name_ar: string;
  section_code: string;
  department_name_ar: string | null;
  faculty_name: string;
  plan_status: string;
  planned_count: number;
  executed_count: number;
  compensated_count: number;
  not_executed_count: number;
  uncompensated_count: number;
  pending_count: number;
  coverage_percent: number;
};

function unwrap<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export const getSectionDeliveryPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sectionId: string }) => input)
  .handler(async ({ data, context }): Promise<SectionDeliveryPlan> => {
    const { data: result, error } = await context.supabase.rpc("cdp_get_section_plan", {
      p_course_section_id: data.sectionId,
    });
    return unwrap<SectionDeliveryPlan>(result, error);
  });

export const listFacultyDeliverySections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FacultyDeliverySection[]> => {
    const { data, error } = await context.supabase.rpc("cdp_list_my_faculty_sections");
    return unwrap<FacultyDeliverySection[]>(data ?? [], error);
  });

export const listStudentDeliverySections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StudentDeliverySection[]> => {
    const { data, error } = await context.supabase.rpc("cdp_list_student_sections");
    return unwrap<StudentDeliverySection[]>(data ?? [], error);
  });

/**
 * Plan authoring by faculty is disabled by design: the approved course
 * syllabus is the single academic source of the lecture plan. Faculty only
 * record actual execution. The database RPCs reject any authoring attempt.
 */

export type PlanSessionOption = {
  plan_session_id: string;
  session_number: number;
  week_number: number | null;
  planned_title: string;
  planned_topics: string | null;
};

/** Lecture picker used when attaching a learning material to a planned lecture. */
export const listPlanSessionsForMaterials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sectionId: string }) => input)
  .handler(async ({ data, context }): Promise<PlanSessionOption[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "cdp_list_plan_sessions_for_materials",
      { p_course_section_id: data.sectionId },
    );
    return unwrap<PlanSessionOption[]>(rows ?? [], error);
  });

export const recordSessionExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      planSessionId: string;
      status: LectureExecutionStatus;
      executionDate?: string | null;
      reason?: string | null;
      compensationDate?: string | null;
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cdp_record_session_execution", {
      p_plan_session_id: data.planSessionId,
      p_status: data.status,
      p_execution_date: data.executionDate ?? null,
      p_reason: data.reason ?? null,
      p_compensation_date: data.compensationDate ?? null,
      p_notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearSessionExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planSessionId: string }) => input)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase.rpc("cdp_clear_session_execution", {
      p_plan_session_id: data.planSessionId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDeliveryOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DeliveryOverviewRow[]> => {
    const { data, error } = await context.supabase.rpc("cdp_admin_delivery_overview");
    return unwrap<DeliveryOverviewRow[]>(data ?? [], error);
  });

export const MONITORING_PERIODS = ["week", "month", "term"] as const;
export type MonitoringPeriod = (typeof MONITORING_PERIODS)[number];

export const MONITORING_PERIOD_LABELS: Record<MonitoringPeriod, string> = {
  week: "أسبوعي",
  month: "شهري",
  term: "منذ بداية الفصل",
};

export const PLAN_STATUS_LABELS: Record<string, string> = {
  none: "لا توجد خطة",
  draft: "مسودة",
  published: "معتمدة",
  archived: "مؤرشفة",
};

export const RISK_LABELS: Record<string, string> = {
  high: "خطر مرتفع",
  medium: "خطر متوسط",
  low: "ضمن الخطة",
  no_plan: "بلا خطة معتمدة",
};

export type MonitoringRow = {
  course_section_id: string;
  course_code: string;
  course_name_ar: string;
  section_code: string;
  department_name_ar: string | null;
  faculty_name: string;
  plan_status: string;
  planned_count: number;
  executed_count: number;
  compensated_count: number;
  postponed_count: number;
  cancelled_count: number;
  hindered_count: number;
  not_executed_count: number;
  uncompensated_count: number;
  remaining_count: number;
  execution_percent: number | null;
  behind_plan: boolean;
  risk_level: "high" | "medium" | "low" | "no_plan";
};

export type DeliveryMonitoring = {
  scope: "college" | "department";
  period: { kind: MonitoringPeriod; from: string | null; to: string };
  departments: { department_name_ar: string }[];
  totals: {
    sections: number;
    planned: number;
    executed: number;
    compensated: number;
    postponed: number;
    cancelled: number;
    hindered: number;
    not_executed: number;
    uncompensated: number;
    remaining: number;
    execution_percent: number | null;
    behind_plan_courses: number;
  };
  reasons: { reason: string; count: number }[];
  rows: MonitoringRow[];
};

/**
 * Period-scoped planned-vs-executed monitoring. The RPC decides the scope:
 * department heads see their own departments, dean/registrar/student affairs
 * and admins see the whole college.
 */
export const getDeliveryMonitoring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { period?: MonitoringPeriod }) => input)
  .handler(async ({ data, context }): Promise<DeliveryMonitoring> => {
    const { data: result, error } = await context.supabase.rpc("cdp_delivery_monitoring", {
      p_period: data.period ?? "term",
    });
    return unwrap<DeliveryMonitoring>(result, error);
  });

