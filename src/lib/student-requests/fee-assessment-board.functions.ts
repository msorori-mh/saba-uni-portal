import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userRoles } from "@/lib/authz.server";
import {
  assignmentMatchesIdentity,
  isAssignmentWindowActive,
} from "@/lib/student-requests/processing-assignment-identity.server";

/** Processing role this board is built for. */
export const FEE_ASSESSMENT_ROLE_CODE = "student_affairs_manager";
/** Step this board tracks. */
export const FEE_ASSESSMENT_STEP_KEY = "fee_assessment";

export type FeeAssessmentTaskRow = {
  stepId: string;
  requestId: string;
  requestNumber: string | null;
  requestType: string;
  requestStatus: string;
  studentNameAr: string | null;
  academicNumber: string | null;
  enteredAt: string | null;
  waitingDays: number | null;
  feeAmount: number | null;
  feeCurrency: string | null;
  paymentStatus: string | null;
  stateLabelAr: string;
  nextStepKey: string | null;
  nextStepNameAr: string | null;
  suggestedActionAr: string;
};

export type FeeAssessmentBoardResult = {
  available: boolean;
  messageAr: string | null;
  rows: FeeAssessmentTaskRow[];
  summary: { total: number; awaitingAssessment: number; awaitingPayment: number; readyToAdvance: number };
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export const fetchFeeAssessmentBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeeAssessmentBoardResult> => {
    const empty = { total: 0, awaitingAssessment: 0, awaitingPayment: 0, readyToAdvance: 0 };
    const userId = context.userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const roles = await userRoles(userId);
    const isAdmin = roles.includes("admin") || roles.includes("system_admin");

    if (!isAdmin) {
      // Must hold an ACTIVE processing assignment bound to the manager role.
      const { data: roleRow } = await supabaseAdmin
        .from("request_processing_roles")
        .select("id")
        .eq("code", FEE_ASSESSMENT_ROLE_CODE)
        .maybeSingle();
      if (!roleRow) {
        return { available: false, messageAr: "دور مدير شؤون الطلاب غير مُعرّف في النظام.", rows: [], summary: empty };
      }

      const [staffRes, facultyRes, positionRes] = await Promise.all([
        supabaseAdmin.from("staff_profiles").select("id").eq("user_id", userId),
        supabaseAdmin.from("faculty_profiles").select("id").eq("user_id", userId),
        supabaseAdmin.from("position_assignments").select("id").eq("user_id", userId).eq("is_active", true),
      ]);
      const identity = {
        userId,
        staffProfileIds: (staffRes.data ?? []).map((r) => r.id),
        facultyProfileIds: (facultyRes.data ?? []).map((r) => r.id),
        positionAssignmentIds: (positionRes.data ?? []).map((r) => r.id),
      };

      const { data: assignments } = await supabaseAdmin
        .from("request_processing_assignments")
        .select(
          "id, assignment_type, user_id, staff_profile_id, faculty_profile_id, position_assignment_id, is_active, starts_at, ends_at",
        )
        .eq("is_active", true)
        .eq("role_id", roleRow.id);

      const allowed = (assignments ?? []).some(
        (row) => isAssignmentWindowActive(row) && assignmentMatchesIdentity(row, identity),
      );
      if (!allowed) {
        return {
          available: false,
          messageAr: "هذه اللوحة مخصّصة لمدير شؤون الطلاب — لا يوجد تعيين معالجة نشط لحسابك في هذا الدور.",
          rows: [],
          summary: empty,
        };
      }
    }

    const { data: steps, error } = await supabaseAdmin
      .from("student_request_workflow_steps")
      .select("id, student_request_id, step_key, step_order, entered_at")
      .eq("status", "active")
      .eq("step_key", FEE_ASSESSMENT_STEP_KEY)
      .order("entered_at", { ascending: true });

    if (error) {
      return { available: false, messageAr: `تعذّر تحميل المهام: ${error.message}`, rows: [], summary: empty };
    }

    const list = (steps ?? []) as Array<{
      id: string;
      student_request_id: string;
      step_key: string;
      step_order: number | null;
      entered_at: string | null;
    }>;
    if (list.length === 0) {
      return { available: true, messageAr: null, rows: [], summary: empty };
    }

    const requestIds = [...new Set(list.map((s) => s.student_request_id))];

    const [requestsRes, feesRes, allStepsRes] = await Promise.all([
      supabaseAdmin
        .from("student_requests")
        .select("id, request_number, request_type, status, student_profile_id")
        .in("id", requestIds),
      supabaseAdmin
        .from("student_request_fee_assessments")
        .select("request_id, amount, currency, payment_status")
        .in("request_id", requestIds),
      supabaseAdmin
        .from("student_request_workflow_steps")
        .select("student_request_id, step_key, step_name_ar, step_order, status")
        .in("student_request_id", requestIds),
    ]);

    const requests = new Map(
      ((requestsRes.data ?? []) as Array<{
        id: string;
        request_number: string | null;
        request_type: string;
        status: string;
        student_profile_id: string | null;
      }>).map((r) => [r.id, r]),
    );

    const profileIds = [...new Set([...requests.values()].map((r) => r.student_profile_id).filter(Boolean))] as string[];
    const students = new Map<string, { full_name_ar: string | null; academic_number: string | null }>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("student_profiles")
        .select("id, full_name_ar, academic_number")
        .in("id", profileIds);
      for (const p of (profiles ?? []) as Array<{
        id: string;
        full_name_ar: string | null;
        academic_number: string | null;
      }>) {
        students.set(p.id, { full_name_ar: p.full_name_ar, academic_number: p.academic_number });
      }
    }

    const fees = new Map(
      ((feesRes.data ?? []) as Array<{
        request_id: string;
        amount: number | null;
        currency: string | null;
        payment_status: string | null;
      }>).map((f) => [f.request_id, f]),
    );

    const stepsByRequest = new Map<
      string,
      Array<{ step_key: string; step_name_ar: string | null; step_order: number | null; status: string }>
    >();
    for (const s of (allStepsRes.data ?? []) as Array<{
      student_request_id: string;
      step_key: string;
      step_name_ar: string | null;
      step_order: number | null;
      status: string;
    }>) {
      const arr = stepsByRequest.get(s.student_request_id) ?? [];
      arr.push(s);
      stepsByRequest.set(s.student_request_id, arr);
    }

    const rows: FeeAssessmentTaskRow[] = list.map((step) => {
      const req = requests.get(step.student_request_id);
      const fee = fees.get(step.student_request_id) ?? null;
      const student = req?.student_profile_id ? students.get(req.student_profile_id) ?? null : null;

      const following = (stepsByRequest.get(step.student_request_id) ?? [])
        .filter((s) => (s.step_order ?? 0) > (step.step_order ?? 0) && s.status !== "cancelled")
        .sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0))[0] ?? null;

      let stateLabelAr: string;
      let suggestedActionAr: string;
      if (!fee) {
        stateLabelAr = "بانتظار تقييم الرسوم";
        suggestedActionAr = "حدّد مبلغ الرسوم للخدمة ثم اعتمد الخطوة لإحالة الطلب إلى تأكيد السداد.";
      } else if (fee.payment_status === "confirmed" || fee.payment_status === "paid") {
        stateLabelAr = "السداد مؤكَّد";
        suggestedActionAr = following
          ? `اعتمد الخطوة للانتقال إلى «${following.step_name_ar ?? following.step_key}».`
          : "اعتمد الخطوة لإنهاء المسار.";
      } else {
        stateLabelAr = "تم التقييم — بانتظار السداد";
        suggestedActionAr =
          "الرسوم مُقيَّمة؛ يسدّد الطالب في النظام الجامعي الرئيسي ثم تؤكّد المالية السداد قبل اعتماد الخطوة.";
      }

      return {
        stepId: step.id,
        requestId: step.student_request_id,
        requestNumber: req?.request_number ?? null,
        requestType: req?.request_type ?? "—",
        requestStatus: req?.status ?? "—",
        studentNameAr: student?.full_name_ar ?? null,
        academicNumber: student?.academic_number ?? null,
        enteredAt: step.entered_at,
        waitingDays: daysSince(step.entered_at),
        feeAmount: fee?.amount ?? null,
        feeCurrency: fee?.currency ?? null,
        paymentStatus: fee?.payment_status ?? null,
        stateLabelAr,
        nextStepKey: following?.step_key ?? null,
        nextStepNameAr: following?.step_name_ar ?? null,
        suggestedActionAr,
      };
    });

    return {
      available: true,
      messageAr: null,
      rows,
      summary: {
        total: rows.length,
        awaitingAssessment: rows.filter((r) => r.paymentStatus === null).length,
        awaitingPayment: rows.filter(
          (r) => r.paymentStatus !== null && r.paymentStatus !== "confirmed" && r.paymentStatus !== "paid",
        ).length,
        readyToAdvance: rows.filter(
          (r) => r.paymentStatus === "confirmed" || r.paymentStatus === "paid",
        ).length,
      },
    };
  });
