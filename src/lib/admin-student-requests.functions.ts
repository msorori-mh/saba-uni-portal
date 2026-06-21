import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/authz.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const STUDENT_REQUESTS_ADMIN_ROLES = [
  "system_admin",
  "admin",
  "dean",
  "registrar",
  "student_affairs",
] as const;

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
    const { data, error } = await supabaseAdmin
      .from("student_requests")
      .select("id, title, description, status, submitted_at, created_at, rejection_reason, student_profile_id, request_type, student:student_profiles(academic_number, full_name_ar, program_id, department_id, program:programs(name_ar), department:departments(name_ar))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
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

    const [
      absRes, suspRes, reinRes, ecRes, trRes, eqdRes, eqcRes, gaRes, attRes,
    ] = await Promise.all([
      supabaseAdmin.from("absence_excuse_details")
        .select("request_id, absence_date, reason_type, course_section_id, record_applied_at, section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("enrollment_suspension_details")
        .select("request_id, suspension_reason, suspension_duration_type, notes, requested_from_academic_year:academic_years!enrollment_suspension_details_requested_from_academic_year_id_fkey(name), requested_from_semester:semesters!enrollment_suspension_details_requested_from_semester_id_fkey(name)")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("enrollment_reinstatement_details")
        .select("request_id, reinstatement_reason, notes, requested_from_academic_year:academic_years!enrollment_reinstatement_details_requested_from_academic_year_id_fkey(name), requested_from_semester:semesters!enrollment_reinstatement_details_requested_from_semester_id_fkey(name)")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("extra_chance_details")
        .select("request_id, academic_year_id, semester_id, chance_type, reason, notes, chance_applied_at, academic_year:academic_years(name), semester:semesters(name)")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("transfer_request_details")
        .select("request_id, current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason, notes, current_program:programs!transfer_request_details_current_program_id_fkey(name_ar), requested_program:programs!transfer_request_details_requested_program_id_fkey(name_ar), current_department:departments!transfer_request_details_current_department_id_fkey(name_ar), requested_department:departments!transfer_request_details_requested_department_id_fkey(name_ar)")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("equivalency_request_details")
        .select("request_id, previous_university_name, previous_program_name, transfer_reference, notes, credits_applied_at")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("equivalency_courses")
        .select("id, equivalency_request_id, external_course_code, external_course_name, external_credit_hours, status, reviewer_notes, target_course_id, target_course:courses(code, name_ar)")
        .eq("equivalency_request_id", id),
      supabaseAdmin.from("grade_appeal_details")
        .select("request_id, reason, notes, current_grade_total, current_grade_status, approved_total_score, course_section_id, student_enrollment_id, academic_year:academic_years(name), semester:semesters(name), section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
        .eq("request_id", id).maybeSingle(),
      supabaseAdmin.from("student_request_attachments")
        .select("id, request_id, file_url, file_name")
        .eq("request_id", id),
    ]);

    const firstErr = [absRes, suspRes, reinRes, ecRes, trRes, eqdRes, eqcRes, gaRes, attRes]
      .find((r) => r.error)?.error;
    if (firstErr) throw new Error(firstErr.message);

    let gradeAppealSectionMax: number | null = null;
    const ga = gaRes.data as { course_section_id?: string } | null;
    if (ga?.course_section_id) {
      const { data: comps, error: compErr } = await supabaseAdmin
        .from("grade_components")
        .select("max_score")
        .eq("course_section_id", ga.course_section_id);
      if (compErr) throw new Error(compErr.message);
      gradeAppealSectionMax = (comps ?? []).reduce((sum, c) => sum + Number(c.max_score ?? 0), 0);
    }

    const equivalencyCourses = eqcRes.data ?? [];
    const extraChanceSummary = reqMeta.request_type === "extra_chance"
      ? await validateExtraChanceApproval(
          id,
          reqMeta.student_profile_id,
          (ecRes.data ?? null) as ExtraChanceDetailsRow | null,
        )
      : null;
    return {
      absence_details: absRes.data ?? null,
      suspension_details: suspRes.data ?? null,
      reinstatement_details: reinRes.data ?? null,
      extra_chance_details: ecRes.data ?? null,
      extra_chance_summary: extraChanceSummary,
      transfer_details: trRes.data ?? null,
      equivalency_details: eqdRes.data ?? null,
      equivalency_courses: equivalencyCourses,
      equivalency_summary: buildEquivalencySummary(equivalencyCourses as EquivalencyCourseRow[]),
      grade_appeal_details: gaRes.data ?? null,
      grade_appeal_section_max: gradeAppealSectionMax,
      attachments: attRes.data ?? [],
    };
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
      .select("request_type, student_profile_id")
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

    const patch: Record<string, unknown> = {
      status: data.status,
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    };
    if (data.status === "rejected" || data.status === "returned") {
      patch.rejection_reason = data.rejectionReason ?? null;
    }

    const { error } = await supabaseAdmin
      .from("student_requests")
      .update(patch)
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);

    let email: string | null = null;
    let full_name_ar: string | null = null;
    let title: string | null = null;
    if (data.status === "approved" || data.status === "rejected") {
      const { data: req } = await supabaseAdmin
        .from("student_requests")
        .select("title, student:student_profiles(email, full_name_ar)")
        .eq("id", data.requestId)
        .maybeSingle();
      const student = req?.student as { email?: string; full_name_ar?: string } | null;
      email = student?.email ?? null;
      full_name_ar = student?.full_name_ar ?? null;
      title = req?.title ?? null;
    }

    return {
      ok: true as const,
      email,
      full_name_ar,
      title,
      rejection_reason: data.status === "rejected" ? (data.rejectionReason ?? null) : null,
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
