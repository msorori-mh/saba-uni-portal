import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  auditLogToTimelineEvent,
  buildEffectTimelineEvents,
  mergeTimelineEvents,
  sanitizeTimelineForStudent,
  type AuditLogTimelineRow,
  type RequestEffectMarkers,
  type StudentRequestTimelineEvent,
} from "@/lib/student-request-timeline";

export type { StudentRequestTimelineEvent };

export const STUDENT_REQUESTS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

/** PostgREST FK hints must match DB constraint names (see types.ts). */
export const ENROLLMENT_SUSPENSION_DETAILS_SELECT =
  "request_id, requested_from_academic_year_id, requested_from_semester_id, suspension_reason, suspension_duration_type, notes, requested_from_academic_year:academic_years!enrollment_suspension_details_requested_from_academic_year_fkey(name), requested_from_semester:semesters!enrollment_suspension_details_requested_from_semester_id_fkey(name)";

export const ENROLLMENT_REINSTATEMENT_DETAILS_SELECT =
  "request_id, requested_from_academic_year_id, requested_from_semester_id, reinstatement_reason, notes, requested_from_academic_year:academic_years!enrollment_reinstatement_deta_requested_from_academic_year_fkey(name), requested_from_semester:semesters!enrollment_reinstatement_detail_requested_from_semester_id_fkey(name)";

export const OFFICIAL_TRANSCRIPT_DETAILS_SELECT =
  "request_id, purpose, notes, document_issued_at, official_document_id, official_document:official_documents(id, document_number, verification_code, status, issued_at)";

const requestStatusSchema = z.enum([
  "draft", "submitted", "under_review", "returned", "approved", "rejected", "cancelled",
]);

async function assertRequestsAdmin(userId: string) {
  await assertAnyRole(
    userId,
    STUDENT_REQUESTS_ADMIN_ROLES,
    "ليس لديك صلاحية إدارة طلبات الطلاب",
  );
}

function portalSiteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.VITE_SITE_URL ??
    "https://quboolye.com"
  ).replace(/\/$/, "");
}

type EquivalencyCourseRow = {
  status: string;
  target_course_id: string | null;
};

function buildEquivalencySummary(courses: EquivalencyCourseRow[]) {
  const pendingCount = courses.filter((c) => c.status === "pending").length;
  const approvedWithTargetCount = courses.filter(
    (c) => c.status === "approved" && c.target_course_id,
  ).length;
  const rejectedCount = courses.filter((c) => c.status === "rejected").length;
  return {
    pending_count: pendingCount,
    approved_with_target_count: approvedWithTargetCount,
    rejected_count: rejectedCount,
    can_approve_parent: pendingCount === 0 && approvedWithTargetCount > 0,
  };
}

async function assertEquivalencyParentCanApprove(requestId: string) {
  const { data: courses, error } = await supabaseAdmin
    .from("equivalency_courses")
    .select("status, target_course_id")
    .eq("equivalency_request_id", requestId);
  if (error) throw new Error(error.message);
  const summary = buildEquivalencySummary((courses ?? []) as EquivalencyCourseRow[]);
  if (summary.pending_count > 0) {
    throw new Error("لا يمكن اعتماد طلب المقاصة قبل إنهاء مراجعة جميع المواد");
  }
  if (summary.approved_with_target_count === 0) {
    throw new Error("يجب اعتماد مادة واحدة على الأقل مع تحديد المقرر المعادَل");
  }
}

type ExtraChanceDetailsRow = {
  academic_year_id: string;
  semester_id: string;
  chance_type: string;
  reason: string;
  chance_applied_at: string | null;
};

async function validateExtraChanceApproval(
  requestId: string,
  studentProfileId: string,
  details: ExtraChanceDetailsRow | null,
): Promise<{ can_approve: boolean; block_reason: string | null }> {
  if (!details) {
    return { can_approve: false, block_reason: "تفاصيل طلب الفرصة غير مكتملة" };
  }
  if (!details.academic_year_id || !details.semester_id) {
    return { can_approve: false, block_reason: "السياق الأكاديمي لطلب الفرصة غير واضح" };
  }
  if (!details.chance_type || !details.reason?.trim()) {
    return { can_approve: false, block_reason: "تفاصيل طلب الفرصة غير مكتملة" };
  }
  if (details.chance_applied_at) {
    return { can_approve: false, block_reason: "تم تطبيق أثر الفرصة على هذا الطلب مسبقاً" };
  }

  const { data: semester, error: semErr } = await supabaseAdmin
    .from("semesters")
    .select("academic_year_id")
    .eq("id", details.semester_id)
    .maybeSingle();
  if (semErr) throw new Error(semErr.message);
  if (!semester || semester.academic_year_id !== details.academic_year_id) {
    return { can_approve: false, block_reason: "الفصل المحدد لا يتبع السنة الأكاديمية في طلب الفرصة" };
  }

  const { data: sas, error: sasErr } = await supabaseAdmin
    .from("student_academic_status")
    .select("enrollment_status")
    .eq("student_profile_id", studentProfileId)
    .eq("academic_year_id", details.academic_year_id)
    .eq("semester_id", details.semester_id)
    .maybeSingle();
  if (sasErr) throw new Error(sasErr.message);
  if (!sas || sas.enrollment_status !== "active") {
    return { can_approve: false, block_reason: "الطالب ليس بحالة قيد نشط للسنة والفصل المحددين" };
  }

  const { data: existing, error: exErr } = await supabaseAdmin
    .from("student_extra_chances")
    .select("id")
    .eq("student_profile_id", studentProfileId)
    .eq("academic_year_id", details.academic_year_id)
    .eq("semester_id", details.semester_id)
    .eq("chance_type", details.chance_type)
    .maybeSingle();
  if (exErr) throw new Error(exErr.message);
  if (existing) {
    return {
      can_approve: false,
      block_reason: "يوجد سجل فرصة مماثل سابقاً لنفس الطالب في هذا الفصل ونوع الفرصة",
    };
  }

  return { can_approve: true, block_reason: null };
}

async function assertExtraChanceCanApprove(requestId: string, studentProfileId: string) {
  const { data: details, error } = await supabaseAdmin
    .from("extra_chance_details")
    .select("academic_year_id, semester_id, chance_type, reason, chance_applied_at")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const summary = await validateExtraChanceApproval(
    requestId,
    studentProfileId,
    (details ?? null) as ExtraChanceDetailsRow | null,
  );
  if (!summary.can_approve) {
    throw new Error(summary.block_reason ?? "لا يمكن اعتماد طلب الفرصة");
  }
}

type TransferDetailsRow = {
  current_program_id: string;
  requested_program_id: string;
  current_department_id: string | null;
  requested_department_id: string | null;
  transfer_reason: string;
};

export type TransferApprovalSummary = {
  can_approve: boolean;
  block_reason: string | null;
  warnings: string[];
};

async function validateTransferApproval(
  studentProfileId: string,
  details: TransferDetailsRow | null,
): Promise<TransferApprovalSummary> {
  const warnings: string[] = [];
  if (!details) {
    return { can_approve: false, block_reason: "تفاصيل طلب التحويل غير مكتملة", warnings };
  }
  if (!details.current_program_id || !details.requested_program_id) {
    return { can_approve: false, block_reason: "تفاصيل طلب التحويل غير مكتملة", warnings };
  }
  if (!details.transfer_reason?.trim()) {
    return { can_approve: false, block_reason: "سبب التحويل مطلوب", warnings };
  }

  const noProgramChange = details.current_program_id === details.requested_program_id;
  const noDeptChange = (details.current_department_id ?? null) === (details.requested_department_id ?? null);
  if (noProgramChange && noDeptChange) {
    return { can_approve: false, block_reason: "لا يوجد تغيير فعلي في البرنامج أو القسم", warnings };
  }

  const { data: profile, error: profErr } = await supabaseAdmin
    .from("student_profiles")
    .select("program_id, department_id, status")
    .eq("id", studentProfileId)
    .maybeSingle();
  if (profErr) throw new Error(profErr.message);
  if (!profile) {
    return { can_approve: false, block_reason: "ملف الطالب غير موجود", warnings };
  }
  if (profile.status !== "active") {
    return { can_approve: false, block_reason: "حالة الطالب لا تسمح بالتحويل", warnings };
  }
  if (profile.program_id && profile.program_id !== details.current_program_id) {
    return {
      can_approve: false,
      block_reason: "البرنامج الحالي في الطلب لا يطابق ملف الطالب — يحتاج تحديث الطلب",
      warnings,
    };
  }

  const { data: sas, error: sasErr } = await supabaseAdmin
    .from("student_academic_status")
    .select("enrollment_status")
    .eq("student_profile_id", studentProfileId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sasErr) throw new Error(sasErr.message);
  if (sas?.enrollment_status === "suspended") {
    return { can_approve: false, block_reason: "الطالب موقوف القيد ولا يمكن اعتماد تحويله", warnings };
  }

  const { data: targetProgram, error: progErr } = await supabaseAdmin
    .from("programs")
    .select("id, is_active")
    .eq("id", details.requested_program_id)
    .maybeSingle();
  if (progErr) throw new Error(progErr.message);
  if (!targetProgram?.is_active) {
    return { can_approve: false, block_reason: "البرنامج المطلوب غير نشط أو غير موجود", warnings };
  }

  const { count: enrollmentCount, error: enrErr } = await supabaseAdmin
    .from("student_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_profile_id", studentProfileId)
    .eq("enrollment_status", "enrolled");
  if (enrErr) throw new Error(enrErr.message);
  if ((enrollmentCount ?? 0) > 0) {
    warnings.push(
      `الطالب مسجّل حالياً في ${enrollmentCount} مقرر(ات) — راجع الآثار على التسجيل والخطة الدراسية`,
    );
  }

  if (
    details.current_department_id
    && details.requested_department_id
    && details.current_department_id !== details.requested_department_id
  ) {
    warnings.push("سيؤدي الاعتماد إلى تغيير قسم الطالب");
  }

  return { can_approve: true, block_reason: null, warnings };
}

async function assertTransferCanApprove(requestId: string, studentProfileId: string) {
  const { data: details, error } = await supabaseAdmin
    .from("transfer_request_details")
    .select("current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const summary = await validateTransferApproval(
    studentProfileId,
    (details ?? null) as TransferDetailsRow | null,
  );
  if (!summary.can_approve) {
    throw new Error(summary.block_reason ?? "لا يمكن اعتماد طلب التحويل");
  }
}

type CourseSectionPreview = {
  section_code: string;
  offering: { course: { code: string; name_ar: string } | null } | null;
} | null;

async function fetchCourseSectionPreview(
  courseSectionId: string | null | undefined,
): Promise<CourseSectionPreview> {
  if (!courseSectionId) return null;
  const { data, error } = await supabaseAdmin
    .from("course_sections")
    .select("section_code, offering:course_offerings(course:courses(code, name_ar))")
    .eq("id", courseSectionId)
    .maybeSingle();
  if (error) throw new Error(`تعذر تحميل مجموعة المقرر: ${error.message}`);
  return data as CourseSectionPreview;
}

async function fetchAbsenceExcuseDetails(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("absence_excuse_details")
    .select("request_id, absence_date, reason_type, course_section_id, record_applied_at")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(`تعذر تحميل تفاصيل عذر الغياب: ${error.message}`);
  if (!data) return null;
  const section = await fetchCourseSectionPreview(data.course_section_id);
  return { ...data, section };
}

async function fetchGradeAppealDetails(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("grade_appeal_details")
    .select("request_id, reason, notes, current_grade_total, current_grade_status, approved_total_score, course_section_id, student_enrollment_id, academic_year:academic_years(name), semester:semesters(name)")
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(`تعذر تحميل تفاصيل التظلم: ${error.message}`);
  if (!data) return { details: null, sectionMax: null as number | null };

  const section = await fetchCourseSectionPreview(data.course_section_id);
  let sectionMax: number | null = null;
  if (data.course_section_id) {
    const { data: comps, error: compErr } = await supabaseAdmin
      .from("grade_components")
      .select("max_score")
      .eq("course_section_id", data.course_section_id);
    if (compErr) throw new Error(compErr.message);
    sectionMax = (comps ?? []).reduce((sum, c) => sum + Number(c.max_score ?? 0), 0);
  }
  return { details: { ...data, section }, sectionMax };
}

function emptyRequestDetailsPayload(attachments: { id: string; request_id: string; file_url: string; file_name: string }[]) {
  return {
    absence_details: null,
    suspension_details: null,
    reinstatement_details: null,
    extra_chance_details: null,
    extra_chance_summary: null,
    transfer_details: null,
    transfer_summary: null as TransferApprovalSummary | null,
    equivalency_details: null,
    equivalency_courses: [] as EquivalencyCourseRow[],
    equivalency_summary: buildEquivalencySummary([]),
    grade_appeal_details: null,
    grade_appeal_section_max: null as number | null,
    official_transcript_details: null,
    attachments,
  };
}

async function fetchRequestAttachments(requestId: string) {
  const { data, error } = await supabaseAdmin
    .from("student_request_attachments")
    .select("id, request_id, file_url, file_name")
    .eq("request_id", requestId);
  if (error) throw new Error(`تعذر تحميل المرفقات: ${error.message}`);
  return data ?? [];
}

export const getStudentRequestLookups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRequestsAdmin(context.userId);
    const [typesRes, progsRes, deptsRes] = await Promise.all([
      supabaseAdmin.from("request_types").select("code, name_ar, is_active").order("sort_order"),
      supabaseAdmin.from("programs").select("id, name_ar").order("name_ar"),
      supabaseAdmin.from("departments").select("id, name_ar").order("name_ar"),
    ]);
    if (typesRes.error) throw new Error(typesRes.error.message);
    if (progsRes.error) throw new Error(progsRes.error.message);
    if (deptsRes.error) throw new Error(deptsRes.error.message);
    return {
      requestTypes: typesRes.data ?? [],
      programs: progsRes.data ?? [],
      departments: deptsRes.data ?? [],
    };
  });

export const listStudentRequestsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRequestsAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("student_requests")
      .select("id, title, description, status, submitted_at, created_at, rejection_reason, student_profile_id, request_type")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    if (list.length === 0) return [];

    const profileIds = [...new Set(list.map((r) => r.student_profile_id))];
    const { data: profiles, error: profileErr } = await supabaseAdmin
      .from("student_profiles")
      .select("id, academic_number, full_name_ar, program_id, department_id, program:programs(name_ar), department:departments(name_ar)")
      .in("id", profileIds);
    if (profileErr) throw new Error(profileErr.message);

    const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
    return list.map((r) => ({
      ...r,
      student: profileById.get(r.student_profile_id) ?? null,
    }));
  });

export const getStudentRequestDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestsAdmin(context.userId);
    const id = data.requestId;

    const { data: reqMeta, error: reqMetaErr } = await supabaseAdmin
      .from("student_requests")
      .select("student_profile_id, request_type")
      .eq("id", id)
      .maybeSingle();
    if (reqMetaErr) throw new Error(reqMetaErr.message);
    if (!reqMeta) throw new Error("الطلب غير موجود");

    const attachments = await fetchRequestAttachments(id);
    const base = emptyRequestDetailsPayload(attachments);
    const requestType = reqMeta.request_type;

    switch (requestType) {
      case "absence_excuse": {
        const absence_details = await fetchAbsenceExcuseDetails(id);
        return { ...base, absence_details };
      }
      case "enrollment_suspension": {
        const { data: suspension_details, error } = await supabaseAdmin
          .from("enrollment_suspension_details")
          .select(ENROLLMENT_SUSPENSION_DETAILS_SELECT)
          .eq("request_id", id)
          .maybeSingle();
        if (error) throw new Error(`تعذر تحميل تفاصيل وقف القيد: ${error.message}`);
        return { ...base, suspension_details: suspension_details ?? null };
      }
      case "enrollment_reinstatement": {
        const { data: reinstatement_details, error } = await supabaseAdmin
          .from("enrollment_reinstatement_details")
          .select(ENROLLMENT_REINSTATEMENT_DETAILS_SELECT)
          .eq("request_id", id)
          .maybeSingle();
        if (error) throw new Error(`تعذر تحميل تفاصيل إعادة القيد: ${error.message}`);
        return { ...base, reinstatement_details: reinstatement_details ?? null };
      }
      case "extra_chance": {
        const { data: extra_chance_details, error } = await supabaseAdmin
          .from("extra_chance_details")
          .select("request_id, academic_year_id, semester_id, chance_type, reason, notes, chance_applied_at, academic_year:academic_years(name), semester:semesters(name)")
          .eq("request_id", id)
          .maybeSingle();
        if (error) throw new Error(`تعذر تحميل تفاصيل الفرصة: ${error.message}`);
        const extra_chance_summary = await validateExtraChanceApproval(
          id,
          reqMeta.student_profile_id,
          (extra_chance_details ?? null) as ExtraChanceDetailsRow | null,
        );
        return { ...base, extra_chance_details: extra_chance_details ?? null, extra_chance_summary };
      }
      case "transfer": {
        const { data: transfer_details, error } = await supabaseAdmin
          .from("transfer_request_details")
          .select("request_id, current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason, notes, current_program:programs!transfer_request_details_current_program_id_fkey(name_ar), requested_program:programs!transfer_request_details_requested_program_id_fkey(name_ar), current_department:departments!transfer_request_details_current_department_id_fkey(name_ar), requested_department:departments!transfer_request_details_requested_department_id_fkey(name_ar)")
          .eq("request_id", id)
          .maybeSingle();
        if (error) throw new Error(`تعذر تحميل تفاصيل التحويل: ${error.message}`);
        const transfer_summary = await validateTransferApproval(
          reqMeta.student_profile_id,
          (transfer_details ?? null) as TransferDetailsRow | null,
        );
        return { ...base, transfer_details: transfer_details ?? null, transfer_summary };
      }
      case "equivalency": {
        const [eqdRes, eqcRes] = await Promise.all([
          supabaseAdmin.from("equivalency_request_details")
            .select("request_id, previous_university_name, previous_program_name, transfer_reference, notes, credits_applied_at")
            .eq("request_id", id)
            .maybeSingle(),
          supabaseAdmin.from("equivalency_courses")
            .select("id, equivalency_request_id, external_course_code, external_course_name, external_credit_hours, status, reviewer_notes, target_course_id, target_course:courses(code, name_ar)")
            .eq("equivalency_request_id", id),
        ]);
        if (eqdRes.error) throw new Error(`تعذر تحميل تفاصيل المقاصة: ${eqdRes.error.message}`);
        if (eqcRes.error) throw new Error(`تعذر تحميل مواد المقاصة: ${eqcRes.error.message}`);
        const equivalencyCourses = eqcRes.data ?? [];
        return {
          ...base,
          equivalency_details: eqdRes.data ?? null,
          equivalency_courses: equivalencyCourses,
          equivalency_summary: buildEquivalencySummary(equivalencyCourses as EquivalencyCourseRow[]),
        };
      }
      case "grade_appeal": {
        const { details, sectionMax } = await fetchGradeAppealDetails(id);
        return {
          ...base,
          grade_appeal_details: details,
          grade_appeal_section_max: sectionMax,
        };
      }
      case "official_transcript": {
        const { data: official_transcript_details, error } = await supabaseAdmin
          .from("official_transcript_request_details")
          .select(OFFICIAL_TRANSCRIPT_DETAILS_SELECT)
          .eq("request_id", id)
          .maybeSingle();
        if (error) throw new Error(`تعذر تحميل تفاصيل طلب السجل: ${error.message}`);
        return { ...base, official_transcript_details: official_transcript_details ?? null };
      }
      default:
        return base;
    }
  });

export const updateStudentRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      status: requestStatusSchema,
      rejectionReason: z.string().trim().max(2000).optional(),
      approvedGradeTotal: z.number().min(0).max(1000).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestsAdmin(context.userId);

    const { data: reqRow, error: reqErr } = await supabaseAdmin
      .from("student_requests")
      .select("request_type, student_profile_id, title")
      .eq("id", data.requestId)
      .maybeSingle();
    if (reqErr) throw new Error(reqErr.message);
    if (!reqRow) throw new Error("الطلب غير موجود");

    if (data.status === "approved" && reqRow.request_type === "grade_appeal") {
      if (data.approvedGradeTotal == null) {
        throw new Error("أدخل الدرجة المعتمدة بعد التظلم");
      }

      const { data: ga, error: gaErr } = await supabaseAdmin
        .from("grade_appeal_details")
        .select("course_section_id")
        .eq("request_id", data.requestId)
        .maybeSingle();
      if (gaErr) throw new Error(gaErr.message);
      if (!ga?.course_section_id) throw new Error("تفاصيل التظلم غير مكتملة");

      const { data: comps, error: compErr } = await supabaseAdmin
        .from("grade_components")
        .select("max_score")
        .eq("course_section_id", ga.course_section_id);
      if (compErr) throw new Error(compErr.message);
      const sectionMax = (comps ?? []).reduce((sum, c) => sum + Number(c.max_score ?? 0), 0);
      if (sectionMax <= 0) throw new Error("لا توجد مكونات درجات لهذه المجموعة");
      if (data.approvedGradeTotal > sectionMax) {
        throw new Error(`الدرجة المعتمدة لا يمكن أن تتجاوز ${sectionMax.toFixed(2)}`);
      }

      const { error: gaPatchErr } = await supabaseAdmin
        .from("grade_appeal_details")
        .update({ approved_total_score: data.approvedGradeTotal })
        .eq("request_id", data.requestId);
      if (gaPatchErr) throw new Error(gaPatchErr.message);
    }

    if (data.status === "approved" && reqRow.request_type === "equivalency") {
      await assertEquivalencyParentCanApprove(data.requestId);
    }

    if (data.status === "approved" && reqRow.request_type === "extra_chance") {
      await assertExtraChanceCanApprove(data.requestId, reqRow.student_profile_id);
    }

    if (data.status === "approved" && reqRow.request_type === "transfer") {
      await assertTransferCanApprove(data.requestId, reqRow.student_profile_id);
    }

    const patch: Record<string, unknown> = {
      status: data.status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.status === "rejected" || data.status === "returned") {
      patch.rejection_reason = data.rejectionReason ?? null;
    }

    const { error } = await context.supabase
      .from("student_requests")
      .update(patch)
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);

    let email: string | null = null;
    let full_name_ar: string | null = null;
    const title = reqRow.title ?? null;
    let document_number: string | null = null;
    let verification_code: string | null = null;
    let document_url: string | null = null;
    let verify_url: string | null = null;

    if (data.status === "approved" || data.status === "rejected") {
      const { data: prof, error: profErr } = await supabaseAdmin
        .from("student_profiles")
        .select("email, full_name_ar")
        .eq("id", reqRow.student_profile_id)
        .maybeSingle();
      if (profErr) throw new Error(profErr.message);
      email = prof?.email ?? null;
      full_name_ar = prof?.full_name_ar ?? null;

      if (data.status === "approved" && reqRow.request_type === "official_transcript") {
        const { data: otr, error: otrErr } = await supabaseAdmin
          .from("official_transcript_request_details")
          .select(OFFICIAL_TRANSCRIPT_DETAILS_SELECT)
          .eq("request_id", data.requestId)
          .maybeSingle();
        if (otrErr) throw new Error(otrErr.message);
        const doc = otr?.official_document as {
          id?: string;
          document_number?: string;
          verification_code?: string;
        } | null;
        if (doc?.id && doc.document_number && doc.verification_code) {
          const base = portalSiteUrl();
          document_number = doc.document_number;
          verification_code = doc.verification_code;
          document_url = `${base}/document-view/${doc.id}`;
          verify_url = `${base}/verify-document?code=${encodeURIComponent(doc.verification_code)}`;
        }
      }
    }

    return {
      ok: true as const,
      email,
      full_name_ar,
      title,
      rejection_reason: data.status === "rejected" ? (data.rejectionReason ?? null) : null,
      document_number,
      verification_code,
      document_url,
      verify_url,
    };
  });

export const updateEquivalencyCourse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      courseId: z.string().uuid(),
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      reviewerNotes: z.string().trim().max(2000).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestsAdmin(context.userId);

    if (data.status === "approved") {
      const { data: row, error: rowErr } = await supabaseAdmin
        .from("equivalency_courses")
        .select("target_course_id")
        .eq("id", data.courseId)
        .maybeSingle();
      if (rowErr) throw new Error(rowErr.message);
      if (!row?.target_course_id) {
        throw new Error("حدّد المقرر المعادَل قبل اعتماد هذه المادة");
      }
    }

    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch.status = data.status;
    if (data.reviewerNotes !== undefined) patch.reviewer_notes = data.reviewerNotes;

    const { error } = await supabaseAdmin
      .from("equivalency_courses")
      .update(patch)
      .eq("id", data.courseId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getStudentRequestAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ path: z.string().min(1).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestsAdmin(context.userId);
    const { data: signed, error } = await supabaseAdmin.storage
      .from("student-request-attachments")
      .createSignedUrl(data.path, 300);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "تعذر فتح المرفق");
    return { signedUrl: signed.signedUrl };
  });

async function fetchRequestEffectMarkers(
  requestId: string,
  requestType: string,
  reviewedAt: string | null,
): Promise<RequestEffectMarkers> {
  switch (requestType) {
    case "absence_excuse": {
      const { data, error } = await supabaseAdmin
        .from("absence_excuse_details")
        .select("record_applied_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { recordAppliedAt: data?.record_applied_at ?? null };
    }
    case "extra_chance": {
      const { data, error } = await supabaseAdmin
        .from("extra_chance_details")
        .select("chance_applied_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { chanceAppliedAt: data?.chance_applied_at ?? null };
    }
    case "equivalency": {
      const { data, error } = await supabaseAdmin
        .from("equivalency_request_details")
        .select("credits_applied_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { creditsAppliedAt: data?.credits_applied_at ?? null };
    }
    case "grade_appeal": {
      const { data, error } = await supabaseAdmin
        .from("grade_appeal_details")
        .select("approved_total_score")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const score = data?.approved_total_score ?? null;
      return {
        gradeAppealApprovedScore: score,
        gradeAppealReviewedAt: score != null ? reviewedAt : null,
      };
    }
    case "official_transcript": {
      const { data, error } = await supabaseAdmin
        .from("official_transcript_request_details")
        .select("document_issued_at")
        .eq("request_id", requestId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { documentIssuedAt: data?.document_issued_at ?? null };
    }
    default:
      return {};
  }
}

async function buildRequestTimeline(
  requestId: string,
  studentView: boolean,
): Promise<StudentRequestTimelineEvent[]> {
  const { data: req, error: reqErr } = await supabaseAdmin
    .from("student_requests")
    .select("request_type, reviewed_at")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) throw new Error(reqErr.message);
  if (!req) throw new Error("الطلب غير موجود");

  const { data: logs, error: logErr } = await supabaseAdmin
    .from("audit_logs")
    .select("id, created_at, action_type, actor_user_id, actor_role, old_values, new_values, notes")
    .eq("entity_type", "student_request")
    .eq("entity_id", requestId)
    .order("created_at", { ascending: true });
  if (logErr) throw new Error(logErr.message);

  const markers = await fetchRequestEffectMarkers(
    requestId,
    req.request_type,
    req.reviewed_at,
  );
  const events = mergeTimelineEvents([
    ...(logs ?? []).map((row) => auditLogToTimelineEvent(row as AuditLogTimelineRow)),
    ...buildEffectTimelineEvents(req.request_type, markers),
  ]);
  return studentView ? sanitizeTimelineForStudent(events) : events;
}

async function assertStudentOwnsRequests(
  userId: string,
  studentProfileId: string,
  requestIds: string[],
) {
  const { data: profile, error } = await supabaseAdmin
    .from("student_profiles")
    .select("id")
    .eq("id", studentProfileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("غير مصرح");

  if (requestIds.length === 0) return;

  const { count, error: countErr } = await supabaseAdmin
    .from("student_requests")
    .select("id", { count: "exact", head: true })
    .in("id", requestIds)
    .eq("student_profile_id", studentProfileId);
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) !== requestIds.length) throw new Error("طلب غير مصرح");
}

export const getStudentRequestTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertRequestsAdmin(context.userId);
    return buildRequestTimeline(data.requestId, false);
  });

export const getMyStudentRequestTimelines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      studentProfileId: z.string().uuid(),
      requestIds: z.array(z.string().uuid()),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertStudentOwnsRequests(
      context.userId,
      data.studentProfileId,
      data.requestIds,
    );
    const entries = await Promise.all(
      data.requestIds.map(async (requestId) => [
        requestId,
        await buildRequestTimeline(requestId, true),
      ] as const),
    );
    return Object.fromEntries(entries) as Record<string, StudentRequestTimelineEvent[]>;
  });
