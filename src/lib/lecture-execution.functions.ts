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
import { z } from "zod";
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

/* -------- input validation (server side; UI checks are not authorization) -------- */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "تاريخ غير صالح");

/** A lecture cannot be recorded as executed on a future day (1-day timezone slack). */
function notInFuture(dateIso: string): boolean {
  const limit = Date.now() + 24 * 60 * 60 * 1000;
  return Date.parse(`${dateIso}T00:00:00Z`) <= limit;
}

const sectionInputSchema = z.object({ sectionId: z.string().uuid() });
const planSessionInputSchema = z.object({ planSessionId: z.string().uuid() });
const recordExecutionSchema = z.object({
  planSessionId: z.string().uuid(),
  status: z.enum(LECTURE_EXECUTION_STATUSES),
  executionDate: isoDate
    .refine(notInFuture, "لا يمكن تسجيل تنفيذ محاضرة بتاريخ مستقبلي")
    .nullable()
    .optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
  compensationDate: isoDate.nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

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
    program_name: string | null;
    level_name: string | null;
    student_count: number;
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
  program_name: string | null;
  level_name: string | null;
  student_count: number;
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
  .inputValidator((input: { sectionId: string }) => sectionInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<SectionDeliveryPlan> => {
    const { data: result, error } = await context.supabase.rpc("cdp_get_section_plan", {
      p_course_section_id: data.sectionId,
    });
    const plan = unwrap<SectionDeliveryPlan>(result, error);
    // Program/level/student-count enrichment uses get_section_student_names,
    // which is faculty/department-head only. Students and other viewers
    // allowed by cdp_can_view_section must still get the plan itself.
    if (!plan.course || !plan.can_manage) return plan;
    const [{ data: section, error: sectionError }, { data: students, error: studentsError }] =
      await Promise.all([
        context.supabase
          .from("course_sections")
          .select(
            "offering:course_offerings(program:programs(name_ar), level:academic_levels(name))",
          )
          .eq("id", data.sectionId)
          .maybeSingle(),
        context.supabase.rpc("get_section_student_names", { p_section_id: data.sectionId }),
      ]);
    if (sectionError) throw new Error(sectionError.message);
    if (studentsError) throw new Error(studentsError.message);
    const offering = section?.offering as unknown as {
      program: { name_ar: string } | null;
      level: { name: string } | null;
    } | null;
    return {
      ...plan,
      course: {
        ...plan.course,
        program_name: offering?.program?.name_ar ?? null,
        level_name: offering?.level?.name ?? null,
        student_count: students?.length ?? 0,
      },
    };
  });

export const listFacultyDeliverySections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FacultyDeliverySection[]> => {
    const { data, error } = await context.supabase.rpc("cdp_list_my_faculty_sections");
    const rows = unwrap<Omit<FacultyDeliverySection, "program_name" | "level_name" | "student_count">[]>(
      data ?? [],
      error,
    );
    if (rows.length === 0) return [];
    const sectionIds = rows.map((row) => row.course_section_id);
    const { data: sections, error: sectionsError } = await context.supabase
      .from("course_sections")
      .select(
        "id, offering:course_offerings(program:programs(name_ar), level:academic_levels(name))",
      )
      .in("id", sectionIds);
    if (sectionsError) throw new Error(sectionsError.message);
    const contexts = new Map(
      (sections ?? []).map((section) => {
        const offering = section.offering as unknown as {
          program: { name_ar: string } | null;
          level: { name: string } | null;
        } | null;
        return [
          section.id,
          {
            program_name: offering?.program?.name_ar ?? null,
            level_name: offering?.level?.name ?? null,
          },
        ] as const;
      }),
    );
    const counts = await Promise.all(
      rows.map(async (row) => {
        const { data: students, error: studentsError } = await context.supabase.rpc(
          "get_section_student_names",
          { p_section_id: row.course_section_id },
        );
        if (studentsError) throw new Error(studentsError.message);
        return [row.course_section_id, students?.length ?? 0] as const;
      }),
    );
    const countBySection = new Map(counts);
    return rows.map((row) => ({
      ...row,
      program_name: contexts.get(row.course_section_id)?.program_name ?? null,
      level_name: contexts.get(row.course_section_id)?.level_name ?? null,
      student_count: countBySection.get(row.course_section_id) ?? 0,
    }));
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
  .inputValidator((input: { sectionId: string }) => sectionInputSchema.parse(input))
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
    }) => recordExecutionSchema.parse(input),
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
  .inputValidator((input: { planSessionId: string }) => planSessionInputSchema.parse(input))
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

const monitoringInputSchema = z.object({
  period: z.enum(MONITORING_PERIODS).optional(),
});

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
  .inputValidator((input: { period?: MonitoringPeriod }) => monitoringInputSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<DeliveryMonitoring> => {
    const { data: result, error } = await context.supabase.rpc("cdp_delivery_monitoring", {
      p_period: data.period ?? "term",
    });
    return unwrap<DeliveryMonitoring>(result, error);
  });

