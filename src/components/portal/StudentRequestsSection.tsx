/**
 * @deprecated Legacy inline request forms with direct INSERT/UPDATE.
 * Active UI: /student/requests/* — do not mount in student dashboard.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, FileWarning, Plus, Send, Trash2, Upload, X, Paperclip, Ban, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ENROLLMENT_REINSTATEMENT_DETAILS_SELECT,
  ENROLLMENT_SUSPENSION_DETAILS_SELECT,
  OFFICIAL_TRANSCRIPT_DETAILS_SELECT,
  getMyStudentRequestTimelines,
} from "@/lib/admin-student-requests.functions";
import { RequestTimelinePanel } from "@/components/student-requests/RequestTimelinePanel";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

type RequestType = { id: string; code: string; name_ar: string; description_ar: string | null; is_active: boolean; requires_attachment: boolean };

const REASON_LABEL: Record<string, string> = {
  medical: "طبي", family: "عائلي", emergency: "طارئ", other: "أخرى",
};
const DURATION_LABEL: Record<string, string> = {
  one_semester: "فصل دراسي",
  full_year: "سنة كاملة",
};
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft:        { text: "مسودة",       cls: "bg-muted text-foreground" },
  submitted:    { text: "مُرسَل",       cls: "bg-blue-100 text-blue-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  returned:     { text: "يحتاج استكمال", cls: "bg-orange-100 text-orange-800" },
  approved:     { text: "مقبول",       cls: "bg-emerald-100 text-emerald-800" },
  rejected:     { text: "مرفوض",       cls: "bg-rose-100 text-rose-800" },
  cancelled:    { text: "ملغي",        cls: "bg-zinc-200 text-zinc-800" },
};

const CHANCE_LABEL: Record<string, string> = {
  final_chance: "فرصة أخيرة",
  additional_chance: "فرصة إضافية",
};

type Enrollment = { id: string; course_section_id: string; section_code: string; course_code: string; course_name: string };

type SuspensionDetails = {
  requested_from_academic_year_id: string;
  requested_from_semester_id: string;
  suspension_reason: string;
  suspension_duration_type: string;
  notes: string | null;
  requested_from_academic_year: { name: string } | null;
  requested_from_semester: { name: string } | null;
};

type ReinstatementDetails = {
  requested_from_academic_year_id: string;
  requested_from_semester_id: string;
  reinstatement_reason: string;
  notes: string | null;
  requested_from_academic_year: { name: string } | null;
  requested_from_semester: { name: string } | null;
};

type ExtraChanceDetails = {
  academic_year_id: string;
  semester_id: string;
  chance_type: string;
  reason: string;
  notes: string | null;
  chance_applied_at: string | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
};

type TransferDetails = {
  current_program_id: string | null;
  requested_program_id: string | null;
  current_department_id: string | null;
  requested_department_id: string | null;
  transfer_reason: string;
  notes: string | null;
  current_program: { name_ar: string } | null;
  requested_program: { name_ar: string } | null;
  current_department: { name_ar: string } | null;
  requested_department: { name_ar: string } | null;
};

type EquivalencyDetails = {
  previous_university_name: string;
  previous_program_name: string;
  notes: string | null;
};

type EquivalencyCourseRow = {
  id: string;
  external_course_code: string;
  external_course_name: string;
  external_credit_hours: number | null;
  status: string;
  reviewer_notes: string | null;
  target_course: { code: string; name_ar: string } | null;
};

type GradeAppealDetails = {
  reason: string;
  notes: string | null;
  current_grade_total: number | null;
  current_grade_status: string | null;
  academic_year: { name: string } | null;
  semester: { name: string } | null;
  section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null;
};

type OfficialTranscriptDetails = {
  purpose: string | null;
  notes: string | null;
  document_issued_at: string | null;
  official_document_id: string | null;
  official_document: {
    id: string;
    document_number: string;
    verification_code: string;
    status: string;
    issued_at: string;
  } | null;
};

type RequestModalCode =
  | "absence_excuse"
  | "enrollment_suspension"
  | "enrollment_reinstatement"
  | "extra_chance"
  | "transfer"
  | "equivalency"
  | "grade_appeal"
  | "official_transcript";

type RequestRow = {
  id: string; title: string; description: string | null; status: string;
  submitted_at: string | null; rejection_reason: string | null; created_at: string;
  request_type: string;
  absence_details: { absence_date: string; reason_type: string; course_section_id: string; record_applied_at: string | null } | null;
  suspension_details: SuspensionDetails | null;
  reinstatement_details: ReinstatementDetails | null;
  extra_chance_details: ExtraChanceDetails | null;
  transfer_details: TransferDetails | null;
  equivalency_details: EquivalencyDetails | null;
  equivalency_courses: EquivalencyCourseRow[];
  grade_appeal_details: GradeAppealDetails | null;
  official_transcript_details: OfficialTranscriptDetails | null;
  attachments: { id: string; file_name: string; file_url: string }[];
};

function groupRequestIdsByType(reqs: { id: string; request_type: string }[]) {
  const map = new Map<string, string[]>();
  for (const r of reqs) {
    const list = map.get(r.request_type) ?? [];
    list.push(r.id);
    map.set(r.request_type, list);
  }
  return map;
}

type CourseSectionPreview = {
  section_code: string;
  offering: { course: { code: string; name_ar: string } | null } | null;
};

async function fetchCourseSectionPreviews(
  sectionIds: string[],
): Promise<Map<string, CourseSectionPreview>> {
  const map = new Map<string, CourseSectionPreview>();
  if (sectionIds.length === 0) return map;
  const { data, error } = await supabase
    .from("course_sections")
    .select("id, section_code, offering:course_offerings(course:courses(code, name_ar))")
    .in("id", sectionIds);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(row.id, {
      section_code: row.section_code,
      offering: row.offering as CourseSectionPreview["offering"],
    });
  }
  return map;
}

async function loadStudentRequestDetailsMaps(
  reqs: { id: string; request_type: string }[],
): Promise<{
  absMap: Map<string, RequestRow["absence_details"]>;
  suspMap: Map<string, RequestRow["suspension_details"]>;
  reinMap: Map<string, RequestRow["reinstatement_details"]>;
  ecMap: Map<string, RequestRow["extra_chance_details"]>;
  trMap: Map<string, RequestRow["transfer_details"]>;
  eqdMap: Map<string, RequestRow["equivalency_details"]>;
  eqcMap: Map<string, EquivalencyCourseRow[]>;
  gaMap: Map<string, RequestRow["grade_appeal_details"]>;
  otrMap: Map<string, RequestRow["official_transcript_details"]>;
  attMap: Map<string, RequestRow["attachments"]>;
}> {
  const ids = reqs.map((r) => r.id);
  const byType = groupRequestIdsByType(reqs);

  const absMap = new Map<string, RequestRow["absence_details"]>();
  const suspMap = new Map<string, RequestRow["suspension_details"]>();
  const reinMap = new Map<string, RequestRow["reinstatement_details"]>();
  const ecMap = new Map<string, RequestRow["extra_chance_details"]>();
  const trMap = new Map<string, RequestRow["transfer_details"]>();
  const eqdMap = new Map<string, RequestRow["equivalency_details"]>();
  const eqcMap = new Map<string, EquivalencyCourseRow[]>();
  const gaMap = new Map<string, RequestRow["grade_appeal_details"]>();
  const otrMap = new Map<string, RequestRow["official_transcript_details"]>();
  const attMap = new Map<string, RequestRow["attachments"]>();

  const fetches: Promise<void>[] = [];

  fetches.push((async () => {
    const { data, error } = await sb.from("student_request_attachments")
      .select("id, request_id, file_name, file_url")
      .in("request_id", ids);
    if (error) throw error;
    for (const a of data ?? []) {
      if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
      attMap.get(a.request_id)!.push(a);
    }
  })());

  const absenceIds = byType.get("absence_excuse");
  if (absenceIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("absence_excuse_details")
        .select("request_id, absence_date, reason_type, course_section_id, record_applied_at")
        .in("request_id", absenceIds);
      if (error) throw error;
      for (const d of data ?? []) absMap.set(d.request_id, d);
    })());
  }

  const suspensionIds = byType.get("enrollment_suspension");
  if (suspensionIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("enrollment_suspension_details")
        .select(ENROLLMENT_SUSPENSION_DETAILS_SELECT)
        .in("request_id", suspensionIds);
      if (error) throw error;
      for (const d of data ?? []) suspMap.set(d.request_id, d);
    })());
  }

  const reinstatementIds = byType.get("enrollment_reinstatement");
  if (reinstatementIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("enrollment_reinstatement_details")
        .select(ENROLLMENT_REINSTATEMENT_DETAILS_SELECT)
        .in("request_id", reinstatementIds);
      if (error) throw error;
      for (const d of data ?? []) reinMap.set(d.request_id, d);
    })());
  }

  const extraChanceIds = byType.get("extra_chance");
  if (extraChanceIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("extra_chance_details")
        .select("request_id, academic_year_id, semester_id, chance_type, reason, notes, chance_applied_at, academic_year:academic_years(name), semester:semesters(name)")
        .in("request_id", extraChanceIds);
      if (error) throw error;
      for (const d of data ?? []) ecMap.set(d.request_id, d);
    })());
  }

  const transferIds = byType.get("transfer");
  if (transferIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("transfer_request_details")
        .select("request_id, current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason, notes, current_program:programs!transfer_request_details_current_program_id_fkey(name_ar), requested_program:programs!transfer_request_details_requested_program_id_fkey(name_ar), current_department:departments!transfer_request_details_current_department_id_fkey(name_ar), requested_department:departments!transfer_request_details_requested_department_id_fkey(name_ar)")
        .in("request_id", transferIds);
      if (error) throw error;
      for (const d of data ?? []) trMap.set(d.request_id, d);
    })());
  }

  const equivalencyIds = byType.get("equivalency");
  if (equivalencyIds?.length) {
    fetches.push((async () => {
      const [eqdRes, eqcRes] = await Promise.all([
        sb.from("equivalency_request_details")
          .select("request_id, previous_university_name, previous_program_name, notes")
          .in("request_id", equivalencyIds),
        sb.from("equivalency_courses")
          .select("id, equivalency_request_id, external_course_code, external_course_name, external_credit_hours, status, reviewer_notes, target_course:courses(code, name_ar)")
          .in("equivalency_request_id", equivalencyIds),
      ]);
      if (eqdRes.error) throw eqdRes.error;
      if (eqcRes.error) throw eqcRes.error;
      for (const d of eqdRes.data ?? []) eqdMap.set(d.request_id, d);
      for (const c of eqcRes.data ?? []) {
        if (!eqcMap.has(c.equivalency_request_id)) eqcMap.set(c.equivalency_request_id, []);
        eqcMap.get(c.equivalency_request_id)!.push(c);
      }
    })());
  }

  const gradeAppealIds = byType.get("grade_appeal");
  if (gradeAppealIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("grade_appeal_details")
        .select("request_id, reason, notes, current_grade_total, current_grade_status, course_section_id, academic_year:academic_years(name), semester:semesters(name)")
        .in("request_id", gradeAppealIds);
      if (error) throw error;
      const sectionIds = [...new Set(
        (data ?? []).map((d: { course_section_id: string | null }) => d.course_section_id).filter(Boolean),
      )] as string[];
      const sectionMap = await fetchCourseSectionPreviews(sectionIds);
      for (const d of data ?? []) {
        const section = d.course_section_id ? sectionMap.get(d.course_section_id) ?? null : null;
        gaMap.set(d.request_id, { ...d, section });
      }
    })());
  }

  const officialTranscriptIds = byType.get("official_transcript");
  if (officialTranscriptIds?.length) {
    fetches.push((async () => {
      const { data, error } = await sb.from("official_transcript_request_details")
        .select(OFFICIAL_TRANSCRIPT_DETAILS_SELECT)
        .in("request_id", officialTranscriptIds);
      if (error) throw error;
      for (const d of data ?? []) otrMap.set(d.request_id, d);
    })());
  }

  await Promise.all(fetches);

  return { absMap, suspMap, reinMap, ecMap, trMap, eqdMap, eqcMap, gaMap, otrMap, attMap };
}

export function StudentRequestsSection({ studentProfileId }: { studentProfileId: string }) {
  const qc = useQueryClient();
  const timelinesFn = useServerFn(getMyStudentRequestTimelines);
  const [openType, setOpenType] = useState<null | RequestModalCode>(null);

  const { data: enrollmentStatus = "active" } = useQuery({
    queryKey: ["my-enrollment-status", studentProfileId],
    queryFn: async (): Promise<string> => {
      const { data, error } = await sb.from("student_academic_status")
        .select("enrollment_status")
        .eq("student_profile_id", studentProfileId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.enrollment_status as string | undefined) ?? "active";
    },
  });

  const { data: requestTypes = [] } = useQuery({
    queryKey: ["request-types-active"],
    queryFn: async (): Promise<RequestType[]> => {
      const { data, error } = await sb.from("request_types")
        .select("id, code, name_ar, description_ar, is_active, requires_attachment")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RequestType[];
    },
  });

  const typeLabel = (code: string) => requestTypes.find((t) => t.code === code)?.name_ar ?? code;

  const { data: enrollments = [] } = useQuery({
    queryKey: ["my-enrollments-simple", studentProfileId],
    queryFn: async (): Promise<Enrollment[]> => {
      const { data, error } = await supabase
        .from("student_enrollments")
        .select("id, course_section_id, section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
        .eq("student_profile_id", studentProfileId)
        .eq("enrollment_status", "enrolled");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data ?? []) as any[]).map((r) => ({
        id: r.id, course_section_id: r.course_section_id,
        section_code: r.section?.section_code ?? "—",
        course_code: r.section?.offering?.course?.code ?? "—",
        course_name: r.section?.offering?.course?.name_ar ?? "—",
      }));
    },
  });

  const { data: requests = [], isLoading, isError, error: requestsError } = useQuery({
    queryKey: ["my-requests", studentProfileId],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data: reqs, error } = await sb.from("student_requests")
        .select("id, title, description, status, submitted_at, rejection_reason, created_at, request_type")
        .eq("student_profile_id", studentProfileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if ((reqs ?? []).length === 0) return [];
      const {
        absMap, suspMap, reinMap, ecMap, trMap, eqdMap, eqcMap, gaMap, otrMap, attMap,
      } = await loadStudentRequestDetailsMaps(reqs as { id: string; request_type: string }[]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (reqs as any[]).map((r) => ({
        ...r,
        absence_details: absMap.get(r.id) ?? null,
        suspension_details: suspMap.get(r.id) ?? null,
        reinstatement_details: reinMap.get(r.id) ?? null,
        extra_chance_details: ecMap.get(r.id) ?? null,
        transfer_details: trMap.get(r.id) ?? null,
        equivalency_details: eqdMap.get(r.id) ?? null,
        equivalency_courses: eqcMap.get(r.id) ?? [],
        grade_appeal_details: gaMap.get(r.id) ?? null,
        official_transcript_details: otrMap.get(r.id) ?? null,
        attachments: attMap.get(r.id) ?? [],
      }));
    },
  });

  const requestIds = requests.map((r) => r.id);
  const { data: timelines = {} } = useQuery({
    queryKey: ["my-request-timelines", studentProfileId, requestIds.join(",")],
    enabled: requestIds.length > 0,
    queryFn: () => timelinesFn({
      data: { studentProfileId, requestIds },
    }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-requests", studentProfileId] });
    qc.invalidateQueries({ queryKey: ["my-request-timelines", studentProfileId] });
  };

  const cancelRequest = async (id: string) => {
    if (!confirm("هل تريد إلغاء هذا الطلب؟")) return;
    const { error } = await sb.from("student_requests").update({ status: "cancelled" }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الإلغاء"); refresh(); }
  };
  const deleteDraft = async (id: string) => {
    if (!confirm("حذف المسودة نهائياً؟")) return;
    const { error } = await sb.from("student_requests").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("تم الحذف"); refresh(); }
  };

  const requiresAttachment = (code: string) =>
    requestTypes.find((t) => t.code === code)?.requires_attachment === true;

  const submitDraft = async (row: RequestRow) => {
    if (requiresAttachment(row.request_type) && row.attachments.length === 0) {
      toast.error("المرفق مطلوب قبل إرسال هذا الطلب");
      return;
    }
    const { error } = await sb.from("student_requests").update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("تم إرسال الطلب"); refresh(); }
  };

  const resubmitReturned = async (row: RequestRow) => {
    if (requiresAttachment(row.request_type) && row.attachments.length === 0) {
      toast.error("المرفق مطلوب قبل إعادة إرسال هذا الطلب");
      return;
    }
    const { error } = await sb.from("student_requests").update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
    }).eq("id", row.id);
    if (error) toast.error(error.message);
    else { toast.success("تم إعادة إرسال الطلب"); refresh(); }
  };

  const SUPPORTED_CODES = new Set([
    "absence_excuse", "enrollment_suspension", "enrollment_reinstatement",
    "extra_chance", "transfer", "equivalency", "grade_appeal", "official_transcript",
  ]);

  const isTypeAvailable = (code: string) => {
    if (!SUPPORTED_CODES.has(code)) return false;
    if (code === "enrollment_suspension" && enrollmentStatus === "suspended") return false;
    if (code === "enrollment_reinstatement" && enrollmentStatus !== "suspended") return false;
    return true;
  };

  return (
    <div id="student-requests" className="mt-6">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
          <FileWarning className="h-4 w-4 text-gold" /> الخدمات الطلابية
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {requestTypes.map((t) => {
          const supported = t.is_active && isTypeAvailable(t.code);
          return (
            <div key={t.id} className={`rounded-lg border bg-card p-2.5 flex items-center justify-between gap-2 ${!t.is_active ? "opacity-70" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm font-bold text-primary truncate">{t.name_ar}</div>
                {t.description_ar && <div className="text-[11px] text-muted-foreground truncate">{t.description_ar}</div>}
              </div>
              {supported ? (
                <button
                  onClick={() => setOpenType(t.code as RequestModalCode)}
                  className="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2.5 py-1 text-[11px] font-semibold"
                >
                  <Plus className="h-3 w-3" /> طلب جديد
                </button>
              ) : (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                  <Clock className="h-3 w-3" /> قريباً
                </span>
              )}
            </div>
          );
        })}
      </div>


      {isLoading ? (
        <div className="rounded-lg border bg-card p-4 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
      ) : isError ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 text-center">
          تعذر تحميل الطلبات: {requestsError instanceof Error ? requestsError.message : "خطأ غير معروف"}
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-4 text-xs text-muted-foreground text-center">
          لا توجد طلبات حالياً.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => {
            const st = STATUS_LABEL[r.status] ?? { text: r.status, cls: "bg-muted" };
            const enr = enrollments.find((e) => e.course_section_id === r.absence_details?.course_section_id);
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-muted-foreground">{typeLabel(r.request_type)}</div>
                    <div className="font-semibold text-sm">{r.title}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                </div>
                {r.absence_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>التاريخ: <b>{r.absence_details.absence_date}</b></span>
                    <span>• النوع: <b>{REASON_LABEL[r.absence_details.reason_type] ?? r.absence_details.reason_type}</b></span>
                    {enr && <span>• المقرر: <b>{enr.course_code} ({enr.section_code})</b></span>}
                  </div>
                )}
                {r.suspension_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>السنة: <b>{r.suspension_details.requested_from_academic_year?.name ?? "—"}</b></span>
                    <span>• الفصل: <b>{r.suspension_details.requested_from_semester?.name ?? "—"}</b></span>
                    <span>• المدة: <b>{DURATION_LABEL[r.suspension_details.suspension_duration_type] ?? r.suspension_details.suspension_duration_type}</b></span>
                  </div>
                )}
                {r.reinstatement_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>السنة: <b>{r.reinstatement_details.requested_from_academic_year?.name ?? "—"}</b></span>
                    <span>• الفصل: <b>{r.reinstatement_details.requested_from_semester?.name ?? "—"}</b></span>
                  </div>
                )}
                {r.extra_chance_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>السنة: <b>{r.extra_chance_details.academic_year?.name ?? "—"}</b></span>
                    <span>• الفصل: <b>{r.extra_chance_details.semester?.name ?? "—"}</b></span>
                    <span>• نوع الفرصة: <b>{CHANCE_LABEL[r.extra_chance_details.chance_type] ?? r.extra_chance_details.chance_type}</b></span>
                  </div>
                )}
                {r.transfer_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>من: <b>{r.transfer_details.current_program?.name_ar ?? "—"}</b></span>
                    <span>← إلى: <b>{r.transfer_details.requested_program?.name_ar ?? "—"}</b></span>
                  </div>
                )}
                {r.equivalency_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>الجامعة السابقة: <b>{r.equivalency_details.previous_university_name}</b></span>
                    <span>• البرنامج: <b>{r.equivalency_details.previous_program_name}</b></span>
                  </div>
                )}
                {r.equivalency_courses.length > 0 && (
                  <div className="mt-2 rounded border bg-muted/20 p-2">
                    <div className="text-[10px] font-bold text-muted-foreground mb-1">المواد</div>
                    <div className="space-y-1">
                      {r.equivalency_courses.map((c) => {
                        const st = STATUS_LABEL[c.status === "pending" ? "submitted" : c.status === "approved" ? "approved" : "rejected"];
                        const stText = c.status === "pending" ? "قيد المراجعة" : c.status === "approved" ? "تمت المعادلة" : "مرفوضة";
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="min-w-0 truncate">
                              <b>{c.external_course_code}</b> — {c.external_course_name}
                              {c.target_course && <> ← <b>{c.target_course.code}</b></>}
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${st.cls}`}>{stText}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {r.grade_appeal_details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>السنة: <b>{r.grade_appeal_details.academic_year?.name ?? "—"}</b></span>
                    <span>• الفصل: <b>{r.grade_appeal_details.semester?.name ?? "—"}</b></span>
                    <span>• المقرر: <b>{r.grade_appeal_details.section?.offering?.course?.code ?? "—"} — {r.grade_appeal_details.section?.offering?.course?.name_ar ?? "—"}</b></span>
                    {r.grade_appeal_details.current_grade_total != null && (
                      <span>• الدرجة الحالية: <b>{Number(r.grade_appeal_details.current_grade_total).toFixed(2)}</b></span>
                    )}
                  </div>
                )}
                {r.grade_appeal_details?.reason && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">سبب التظلم: </span>{r.grade_appeal_details.reason}
                  </div>
                )}
                {r.description && <div className="mt-1.5 text-xs">{r.description}</div>}
                {r.suspension_details?.suspension_reason && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">السبب: </span>{r.suspension_details.suspension_reason}
                  </div>
                )}
                {r.reinstatement_details?.reinstatement_reason && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">السبب: </span>{r.reinstatement_details.reinstatement_reason}
                  </div>
                )}
                {r.extra_chance_details?.reason && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">السبب: </span>{r.extra_chance_details.reason}
                  </div>
                )}
                {r.transfer_details?.transfer_reason && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">السبب: </span>{r.transfer_details.transfer_reason}
                  </div>
                )}
                {r.official_transcript_details?.purpose && (
                  <div className="mt-1.5 text-xs">
                    <span className="text-muted-foreground">الغرض: </span>{r.official_transcript_details.purpose}
                  </div>
                )}
                {r.status === "approved" && r.request_type === "official_transcript" && r.official_transcript_details?.official_document && (
                  <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2 space-y-1">
                    <div>تم إصدار السجل الأكاديمي الرسمي.</div>
                    <div>رقم الوثيقة: <b>{r.official_transcript_details.official_document.document_number}</b></div>
                    <a
                      href={`/document-view/${r.official_transcript_details.official_document.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-primary hover:underline font-semibold"
                    >
                      عرض الوثيقة
                    </a>
                  </div>
                )}
                {r.status === "approved" && r.request_type === "absence_excuse" && r.absence_details?.record_applied_at && (
                  <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                    تم تسجيل العذر في سجل الغياب بتاريخ {new Date(r.absence_details.record_applied_at).toLocaleString("ar-EG")}
                  </div>
                )}
                {r.status === "approved" && r.request_type === "extra_chance" && r.extra_chance_details?.chance_applied_at && (
                  <div className="mt-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                    تم تسجيل الفرصة الإضافية في سجلك الأكاديمي.
                  </div>
                )}
                {r.rejection_reason && r.status === "rejected" && (
                  <div className="mt-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                    سبب الرفض: {r.rejection_reason}
                  </div>
                )}
                {r.rejection_reason && r.status === "returned" && (
                  <div className="mt-1.5 text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded p-2">
                    ملاحظات الاستكمال: {r.rejection_reason}
                  </div>
                )}
                <RequestTimelinePanel
                  events={timelines[r.id] ?? []}
                  variant="compact"
                  emptyMessage="سيتم عرض مراحل الطلب بعد أول إجراء."
                />
                {r.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.attachments.map((a) => (
                      <AttachmentLink key={a.id} path={a.file_url} name={a.file_name} />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.status === "draft" && (
                    <>
                      <button onClick={() => submitDraft(r)} className="text-[11px] inline-flex items-center gap-1 bg-primary text-primary-foreground px-2 py-0.5 rounded hover:opacity-90">
                        <Send className="h-3 w-3" /> إرسال المسودة
                      </button>
                      <button onClick={() => deleteDraft(r.id)} className="text-[11px] inline-flex items-center gap-1 border border-rose-300 text-rose-700 px-2 py-0.5 rounded hover:bg-rose-50">
                        <Trash2 className="h-3 w-3" /> حذف
                      </button>
                    </>
                  )}
                  {r.status === "returned" && (
                    <button onClick={() => resubmitReturned(r)} className="text-[11px] inline-flex items-center gap-1 bg-primary text-primary-foreground px-2 py-0.5 rounded hover:opacity-90">
                      <Send className="h-3 w-3" /> إعادة الإرسال
                    </button>
                  )}
                  {r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected" && r.status !== "draft" && r.status !== "returned" && (
                    <button onClick={() => cancelRequest(r.id)} className="text-[11px] inline-flex items-center gap-1 border px-2 py-0.5 rounded hover:bg-muted">
                      <Ban className="h-3 w-3" /> إلغاء
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openType === "absence_excuse" && (
        <AbsenceModal
          studentProfileId={studentProfileId}
          enrollments={enrollments}
          attachmentRequired={requiresAttachment("absence_excuse")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "enrollment_suspension" && (
        <SuspensionModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("enrollment_suspension")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "enrollment_reinstatement" && (
        <ReinstatementModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("enrollment_reinstatement")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "extra_chance" && (
        <ExtraChanceModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("extra_chance")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "transfer" && (
        <TransferModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("transfer")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "equivalency" && (
        <EquivalencyModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("equivalency")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "grade_appeal" && (
        <GradeAppealModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("grade_appeal")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "official_transcript" && (
        <OfficialTranscriptModal
          studentProfileId={studentProfileId}
          attachmentRequired={requiresAttachment("official_transcript")}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
    </div>
  );
}

function AttachmentLink({ path, name }: { path: string; name: string }) {
  const open = async () => {
    const { data } = await supabase.storage.from("student-request-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  return (
    <button onClick={open} className="text-[11px] inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted">
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

async function uploadAttachment(requestId: string, file: File) {
  const { validateUpload, safeFileName } = await import("@/lib/storage-validation");
  const check = validateUpload(file, "student_attachment");
  if (!check.ok) throw new Error(check.message);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const safeName = safeFileName(file.name);
  const path = `${user.id}/${requestId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from("student-request-attachments")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { error: attErr } = await sb.from("student_request_attachments").insert({
    request_id: requestId, file_url: path, file_name: file.name, file_type: file.type, uploaded_by: user.id,
  });
  if (attErr) throw attErr;
}

function AbsenceModal({
  studentProfileId, enrollments, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; enrollments: Enrollment[]; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [sectionId, setSectionId] = useState<string>(enrollments[0]?.course_section_id ?? "");
  const [date, setDate] = useState<string>("");
  const [reason, setReason] = useState<string>("medical");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (submit: boolean) => {
    if (!sectionId) { toast.error("اختر المقرر"); return; }
    if (!date) { toast.error("أدخل تاريخ الغياب"); return; }
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const enr = enrollments.find((e) => e.course_section_id === sectionId);
      const title = `طلب غياب بعذر — ${enr?.course_code ?? ""}`;
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "absence_excuse",
        title, description: desc || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("absence_excuse_details").insert({
        request_id: created.id, course_section_id: sectionId,
        absence_date: date, reason_type: reason,
      });
      if (e2) throw e2;

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب غياب بعذر" onClose={onClose}>
      {enrollments.length === 0 ? (
        <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded">
          لا توجد مقررات مسجلة. تواصل مع شؤون الطلاب.
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <Label>المقرر / المجموعات الدراسيةة</Label>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
              {enrollments.map((e) => (
                <option key={e.course_section_id} value={e.course_section_id}>
                  {e.course_code} — {e.course_name} (مجموعة دراسية {e.section_code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>تاريخ الغياب</Label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm" />
            </div>
            <div>
              <Label>نوع العذر</Label>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
                {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div>
            <Label>السبب التفصيلي</Label>
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اكتب تفاصيل العذر..." />
          </div>
          <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
          <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
        </div>
      )}
    </ModalShell>
  );
}

function SuspensionModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { data: years = [] } = useQuery({
    queryKey: ["sus-years"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
      return (data ?? []) as { id: string; name: string; is_current: boolean }[];
    },
  });
  const [yearId, setYearId] = useState<string>("");
  const { data: semesters = [] } = useQuery({
    queryKey: ["sus-sems", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data } = await supabase.from("semesters").select("id, name").eq("academic_year_id", yearId).order("start_date");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [semId, setSemId] = useState<string>("");
  const [duration, setDuration] = useState<"one_semester" | "full_year">("one_semester");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-select current year on first load
  if (!yearId && years.length > 0) {
    const cur = years.find((y) => y.is_current) ?? years[0];
    setYearId(cur.id);
  }
  if (!semId && semesters.length > 0) {
    setSemId(semesters[0].id);
  }

  const save = async (submit: boolean) => {
    if (!yearId) { toast.error("اختر السنة الأكاديمية"); return; }
    if (!semId) { toast.error("اختر الفصل"); return; }
    if (!reason.trim()) { toast.error("أدخل سبب وقف القيد"); return; }
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "enrollment_suspension",
        title: "طلب وقف قيد",
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("enrollment_suspension_details").insert({
        request_id: created.id,
        requested_from_academic_year_id: yearId,
        requested_from_semester_id: semId,
        suspension_reason: reason.trim(),
        suspension_duration_type: duration,
        notes: notes || null,
      });
      if (e2) throw e2;

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب وقف قيد" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>السنة الأكاديمية</Label>
            <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSemId(""); }} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <Label>الفصل</Label>
            <select value={semId} onChange={(e) => setSemId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label>مدة الوقف</Label>
          <div className="flex gap-2">
            {(["one_semester", "full_year"] as const).map((d) => (
              <label key={d} className={`flex-1 cursor-pointer border rounded-lg p-2 text-center text-xs font-semibold ${duration === d ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
                <input type="radio" name="duration" value={d} checked={duration === d} onChange={() => setDuration(d)} className="sr-only" />
                {DURATION_LABEL[d]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>سبب وقف القيد <span className="text-rose-600">*</span></Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اذكر السبب..." />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
      </div>
    </ModalShell>
  );
}

function ReinstatementModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { data: years = [] } = useQuery({
    queryKey: ["rein-years"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
      return (data ?? []) as { id: string; name: string; is_current: boolean }[];
    },
  });
  const [yearId, setYearId] = useState<string>("");
  const { data: semesters = [] } = useQuery({
    queryKey: ["rein-sems", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data } = await supabase.from("semesters").select("id, name").eq("academic_year_id", yearId).order("start_date");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [semId, setSemId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!yearId && years.length > 0) {
    const cur = years.find((y) => y.is_current) ?? years[0];
    setYearId(cur.id);
  }
  if (!semId && semesters.length > 0) {
    setSemId(semesters[0].id);
  }

  const save = async (submit: boolean) => {
    if (!yearId) { toast.error("اختر السنة الأكاديمية"); return; }
    if (!semId) { toast.error("اختر الفصل"); return; }
    if (!reason.trim()) { toast.error("أدخل سبب إعادة القيد"); return; }
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "enrollment_reinstatement",
        title: "طلب إعادة قيد",
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("enrollment_reinstatement_details").insert({
        request_id: created.id,
        requested_from_academic_year_id: yearId,
        requested_from_semester_id: semId,
        reinstatement_reason: reason.trim(),
        notes: notes || null,
      });
      if (e2) throw e2;

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب إعادة قيد" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>السنة الأكاديمية</Label>
            <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSemId(""); }} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <Label>الفصل</Label>
            <select value={semId} onChange={(e) => setSemId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <Label>سبب إعادة القيد <span className="text-rose-600">*</span></Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اذكر السبب..." />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3">
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-md p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-primary">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-bold text-muted-foreground block mb-1">{children}</label>;
}

function FilePicker({ file, setFile, required = false }: { file: File | null; setFile: (f: File | null) => void; required?: boolean }) {
  return (
    <div>
      <Label>مرفق {required ? "(مطلوب)" : "(اختياري)"}</Label>
      <label className="flex items-center gap-2 border border-dashed rounded p-2 cursor-pointer hover:bg-muted/30 text-xs">
        <Upload className="h-3.5 w-3.5" />
        <span>{file ? file.name : "اختر ملفاً..."}</span>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
      </label>
    </div>
  );
}

function Actions({ busy, onDraft, onSubmit }: { busy: boolean; onDraft: () => void; onSubmit: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2 border-t">
      <button disabled={busy} onClick={onDraft} className="text-xs border px-3 py-1.5 rounded hover:bg-muted">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ كمسودة"}
      </button>
      <button disabled={busy} onClick={onSubmit} className="text-xs bg-primary text-primary-foreground inline-flex items-center gap-1 px-3 py-1.5 rounded hover:opacity-90">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3" /> إرسال</>}
      </button>
    </div>
  );
}

function ExtraChanceModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { data: years = [] } = useQuery({
    queryKey: ["ec-years"],
    queryFn: async () => {
      const { data } = await supabase.from("academic_years").select("id, name, is_current").order("start_date", { ascending: false });
      return (data ?? []) as { id: string; name: string; is_current: boolean }[];
    },
  });
  const [yearId, setYearId] = useState<string>("");
  const { data: semesters = [] } = useQuery({
    queryKey: ["ec-sems", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data } = await supabase.from("semesters").select("id, name").eq("academic_year_id", yearId).order("start_date");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [semId, setSemId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  if (!yearId && years.length > 0) {
    const cur = years.find((y) => y.is_current) ?? years[0];
    setYearId(cur.id);
  }
  if (!semId && semesters.length > 0) {
    setSemId(semesters[0].id);
  }

  return (
    <ModalShell title="طلب منح فرصة" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>السنة الأكاديمية</Label>
            <select value={yearId} onChange={(e) => { setYearId(e.target.value); setSemId(""); }} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <Label>الفصل</Label>
            <select value={semId} onChange={(e) => setSemId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
              <option value="">اختر...</option>
              {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          هذا الطلب مخصص حصراً لدخول اختبار مقرر كفرصة نهائية وفق اللوائح والاعتمادات الأكاديمية.
        </div>
        <div>
          <Label>سبب الطلب <span className="text-rose-600">*</span></Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اذكر السبب..." />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          التقديم مغلق مؤقتاً حتى اكتمال مسار تأكيد المالية الآمن. لن تُنشأ مسودة أو عملية دفع داخل البوابة.
        </div>
      </div>
    </ModalShell>
  );
}

function TransferModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { data: profile } = useQuery({
    queryKey: ["transfer-my-profile", studentProfileId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_profiles")
        .select("program_id, department_id, program:programs(name_ar), department:departments(name_ar)")
        .eq("id", studentProfileId)
        .maybeSingle();
      return data as null | {
        program_id: string | null; department_id: string | null;
        program: { name_ar: string } | null; department: { name_ar: string } | null;
      };
    },
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["transfer-programs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("programs")
        .select("id, name_ar, department_id, department:departments(name_ar)")
        .eq("is_active", true)
        .order("name_ar");
      return (data ?? []) as { id: string; name_ar: string; department_id: string | null; department: { name_ar: string } | null }[];
    },
  });

  const [requestedProgramId, setRequestedProgramId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const selectableTargets = programs.filter((p) => p.id !== profile?.program_id);
  const target = programs.find((p) => p.id === requestedProgramId) ?? null;

  const save = async (submit: boolean) => {
    if (!profile?.program_id) { toast.error("لا يمكن تحديد برنامجك الحالي"); return; }
    if (!requestedProgramId) { toast.error("اختر البرنامج المطلوب"); return; }
    if (requestedProgramId === profile.program_id) { toast.error("البرنامج المطلوب مماثل للحالي"); return; }
    if (!reason.trim()) { toast.error("أدخل سبب التحويل"); return; }
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "transfer",
        title: "طلب تحويل داخلي",
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("transfer_request_details").insert({
        request_id: created.id,
        current_program_id: profile.program_id,
        requested_program_id: requestedProgramId,
        current_department_id: profile.department_id,
        requested_department_id: target?.department_id ?? null,
        transfer_reason: reason.trim(),
        notes: notes || null,
      });
      if (e2) throw e2;

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب تحويل داخلي" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded border bg-muted/30 p-2">
          <div className="text-[10px] font-bold text-muted-foreground">برنامجك الحالي</div>
          <div className="text-sm font-semibold">{profile?.program?.name_ar ?? "—"}</div>
          <div className="text-[11px] text-muted-foreground">القسم: {profile?.department?.name_ar ?? "—"}</div>
        </div>
        <div>
          <Label>البرنامج المطلوب <span className="text-rose-600">*</span></Label>
          <select value={requestedProgramId} onChange={(e) => setRequestedProgramId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
            <option value="">اختر...</option>
            {selectableTargets.map((p) => (
              <option key={p.id} value={p.id}>{p.name_ar}</option>
            ))}
          </select>
          {target && (
            <div className="mt-1 text-[11px] text-muted-foreground">القسم المطلوب: <b>{target.department?.name_ar ?? "—"}</b></div>
          )}
        </div>
        <div>
          <Label>سبب التحويل <span className="text-rose-600">*</span></Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اذكر السبب..." />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          التقديم مغلق مؤقتاً حتى اكتمال مسار تأكيد المالية الآمن. لن تُنشأ مسودة أو عملية دفع داخل البوابة.
        </div>
      </div>
    </ModalShell>
  );
}

type EqCourseRow = {
  external_course_code: string;
  external_course_name: string;
  external_credit_hours: string;
  target_course_id: string;
};

function EquivalencyModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const { data: courses = [] } = useQuery({
    queryKey: ["eq-courses-catalog"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, code, name_ar").eq("status", "active").order("code");
      return (data ?? []) as { id: string; code: string; name_ar: string }[];
    },
  });

  const [prevUni, setPrevUni] = useState("");
  const [prevProg, setPrevProg] = useState("");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<EqCourseRow[]>([
    { external_course_code: "", external_course_name: "", external_credit_hours: "", target_course_id: "" },
  ]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const addRow = () => setRows((r) => [...r, { external_course_code: "", external_course_name: "", external_credit_hours: "", target_course_id: "" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<EqCourseRow>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = async (submit: boolean) => {
    if (!prevUni.trim()) { toast.error("أدخل اسم الجامعة السابقة"); return; }
    if (!prevProg.trim()) { toast.error("أدخل اسم البرنامج السابق"); return; }
    const validRows = rows.filter((r) => r.external_course_code.trim() && r.external_course_name.trim());
    if (validRows.length === 0) { toast.error("أضف مادة واحدة على الأقل"); return; }
    if (submit && attachmentRequired && files.length === 0) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "equivalency",
        title: "طلب مقاصة أكاديمية",
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("equivalency_request_details").insert({
        request_id: created.id,
        previous_university_name: prevUni.trim(),
        previous_program_name: prevProg.trim(),
        transfer_reference: ref.trim() || null,
        notes: notes || null,
      });
      if (e2) throw e2;

      const { error: e3 } = await sb.from("equivalency_courses").insert(
        validRows.map((r) => ({
          equivalency_request_id: created.id,
          external_course_code: r.external_course_code.trim(),
          external_course_name: r.external_course_name.trim(),
          external_credit_hours: r.external_credit_hours ? parseInt(r.external_credit_hours, 10) : null,
          target_course_id: r.target_course_id || null,
          status: "pending",
        })),
      );
      if (e3) throw e3;

      for (const f of files) await uploadAttachment(created.id, f);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب مقاصة أكاديمية" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <Label>الجامعة السابقة <span className="text-rose-600">*</span></Label>
          <input value={prevUni} onChange={(e) => setPrevUni(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm" />
        </div>
        <div>
          <Label>البرنامج السابق <span className="text-rose-600">*</span></Label>
          <input value={prevProg} onChange={(e) => setPrevProg(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm" />
        </div>
        <div>
          <Label>رقم/مرجع التحويل (اختياري)</Label>
          <input value={ref} onChange={(e) => setRef(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label>المواد المطلوب معادلتها</Label>
            <button onClick={addRow} type="button" className="text-[11px] inline-flex items-center gap-1 border px-2 py-0.5 rounded hover:bg-muted">
              <Plus className="h-3 w-3" /> إضافة مادة
            </button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="rounded border bg-muted/20 p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-muted-foreground">المادة #{i + 1}</div>
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="text-rose-600 hover:bg-rose-50 rounded p-0.5">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={r.external_course_code} onChange={(e) => updateRow(i, { external_course_code: e.target.value })}
                    placeholder="رمز المادة السابقة" className="h-8 rounded border bg-background px-2 text-xs" />
                  <input value={r.external_credit_hours} onChange={(e) => updateRow(i, { external_credit_hours: e.target.value })}
                    placeholder="الساعات" type="number" min={0} className="h-8 rounded border bg-background px-2 text-xs" />
                </div>
                <input value={r.external_course_name} onChange={(e) => updateRow(i, { external_course_name: e.target.value })}
                  placeholder="اسم المادة السابقة" className="w-full h-8 rounded border bg-background px-2 text-xs" />
                <select value={r.target_course_id} onChange={(e) => updateRow(i, { target_course_id: e.target.value })}
                  className="w-full h-8 rounded border bg-background px-2 text-xs">
                  <option value="">المادة المراد معادلتها (اختياري)...</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name_ar}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label>المرفقات {attachmentRequired ? "(مطلوبة)" : "(اختيارية)"} — كشف درجات، توصيف مقررات، ...</Label>
          <label className="flex items-center gap-2 border border-dashed rounded p-2 cursor-pointer hover:bg-muted/30 text-xs">
            <Upload className="h-3.5 w-3.5" />
            <span>{files.length > 0 ? `تم اختيار ${files.length} ملف` : "اختر ملفات..."}</span>
            <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="hidden" />
          </label>
          {files.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {files.map((f, i) => (
                <span key={i} className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{f.name}</span>
              ))}
            </div>
          )}
        </div>

        <div>
          <Label>ملاحظات</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>

        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// OfficialTranscriptModal — request official academic transcript
// ──────────────────────────────────────────────────────────────────────────────

function OfficialTranscriptModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [purpose, setPurpose] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (submit: boolean) => {
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "official_transcript",
        title: "طلب سجل أكاديمي رسمي",
        description: notes.trim() || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("official_transcript_request_details").insert({
        request_id: created.id,
        purpose: purpose.trim() || null,
        notes: notes.trim() || null,
      });
      if (e2) throw e2;

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب سجل أكاديمي رسمي" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
          سيتم إصدار السجل الأكاديمي الرسمي بعد اعتماد الطلب من شؤون الطلاب.
        </div>
        <div>
          <Label>الغرض من الطلب (اختياري)</Label>
          <input
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="مثال: جهة عمل، سفارة، ..."
            className="w-full h-9 rounded border bg-background px-2 text-sm"
          />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// GradeAppealModal — student selects: Academic Year → Semester → Course (with grade)
// Only enrollments that already have grades recorded are shown.
// ──────────────────────────────────────────────────────────────────────────────

type AppealEnrollment = {
  enrollment_id: string;
  course_section_id: string;
  section_code: string;
  course_code: string;
  course_name: string;
  semester_id: string;
  semester_name: string;
  academic_year_id: string;
  academic_year_name: string;
  total_score: number;
  grade_status: string;
};

function GradeAppealModal({
  studentProfileId, attachmentRequired = false, onClose, onSaved,
}: {
  studentProfileId: string; attachmentRequired?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  // Load all enrollments for student with semester + course info + grades aggregated
  const { data: graded = [], isLoading } = useQuery({
    queryKey: ["my-graded-enrollments", studentProfileId],
    queryFn: async (): Promise<AppealEnrollment[]> => {
      const { data: enrs, error } = await supabase
        .from("student_enrollments")
        .select(`
          id, course_section_id,
          section:course_sections(
            section_code,
            offering:course_offerings(
              course:courses(code, name_ar),
              semester:semesters(id, name, academic_year_id, academic_year:academic_years(id, name))
            )
          )
        `)
        .eq("student_profile_id", studentProfileId)
        .eq("enrollment_status", "enrolled");
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = ((enrs ?? []) as any[]).map((e) => ({
        enrollment_id: e.id as string,
        course_section_id: e.course_section_id as string,
        section_code: e.section?.section_code ?? "—",
        course_code: e.section?.offering?.course?.code ?? "—",
        course_name: e.section?.offering?.course?.name_ar ?? "—",
        semester_id: e.section?.offering?.semester?.id ?? "",
        semester_name: e.section?.offering?.semester?.name ?? "—",
        academic_year_id: e.section?.offering?.semester?.academic_year?.id ?? "",
        academic_year_name: e.section?.offering?.semester?.academic_year?.name ?? "—",
      }));
      if (list.length === 0) return [];

      // Fetch grades for these enrollments (only approved/submitted are "recorded")
      const enrollmentIds = list.map((l) => l.enrollment_id);
      const { data: grades, error: gErr } = await sb
        .from("student_grades")
        .select("student_enrollment_id, score, status")
        .in("student_enrollment_id", enrollmentIds)
        .in("status", ["submitted", "approved"]);
      if (gErr) throw gErr;

      const agg = new Map<string, { total: number; status: string }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const g of ((grades ?? []) as any[])) {
        const cur = agg.get(g.student_enrollment_id) ?? { total: 0, status: "submitted" };
        cur.total += Number(g.score ?? 0);
        // approved wins over submitted
        if (g.status === "approved") cur.status = "approved";
        agg.set(g.student_enrollment_id, cur);
      }

      return list
        .filter((l) => l.academic_year_id && l.semester_id && agg.has(l.enrollment_id))
        .map((l) => ({
          ...l,
          total_score: agg.get(l.enrollment_id)!.total,
          grade_status: agg.get(l.enrollment_id)!.status,
        }));
    },
  });

  const [yearId, setYearId] = useState<string>("");
  const [semId, setSemId] = useState<string>("");
  const [enrollmentId, setEnrollmentId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Unique years from graded enrollments
  const years = Array.from(
    new Map(graded.map((g) => [g.academic_year_id, { id: g.academic_year_id, name: g.academic_year_name }])).values()
  );
  const semesters = Array.from(
    new Map(
      graded.filter((g) => g.academic_year_id === yearId)
        .map((g) => [g.semester_id, { id: g.semester_id, name: g.semester_name }])
    ).values()
  );
  const courses = graded.filter((g) => g.academic_year_id === yearId && g.semester_id === semId);
  const selected = courses.find((c) => c.enrollment_id === enrollmentId) ?? null;

  // Reset cascade
  const onYearChange = (v: string) => { setYearId(v); setSemId(""); setEnrollmentId(""); };
  const onSemChange = (v: string) => { setSemId(v); setEnrollmentId(""); };

  const save = async (submit: boolean) => {
    if (!yearId) { toast.error("اختر السنة الأكاديمية"); return; }
    if (!semId) { toast.error("اختر الفصل الدراسي"); return; }
    if (!enrollmentId || !selected) { toast.error("اختر المقرر"); return; }
    if (!reason.trim() || reason.trim().length < 10) { toast.error("اكتب سبب التظلم (10 أحرف على الأقل)"); return; }
    if (submit && attachmentRequired && !file) {
      toast.error("المرفق مطلوب لهذا النوع من الطلبات");
      return;
    }
    setBusy(true);
    try {
      const title = `تظلم درجات — ${selected.course_code}`;
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "grade_appeal",
        title,
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("grade_appeal_details").insert({
        request_id: created.id,
        student_profile_id: studentProfileId,
        academic_year_id: yearId,
        semester_id: semId,
        course_section_id: selected.course_section_id,
        student_enrollment_id: selected.enrollment_id,
        current_grade_total: selected.total_score,
        current_grade_status: selected.grade_status,
        reason: reason.trim(),
        notes: notes || null,
      });
      if (e2) {
        // Roll back the request if details insert fails (e.g. duplicate appeal trigger)
        await sb.from("student_requests").delete().eq("id", created.id);
        throw e2;
      }

      if (file) await uploadAttachment(created.id, file);
      toast.success(submit ? "تم إرسال التظلم" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally { setBusy(false); }
  };

  return (
    <ModalShell title="طلب تظلم درجات" onClose={onClose}>
      {isLoading ? (
        <div className="text-xs text-center p-4"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
      ) : graded.length === 0 ? (
        <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded">
          لا توجد مقررات بدرجات مسجلة لتقديم تظلم عليها.
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>السنة الأكاديمية <span className="text-rose-600">*</span></Label>
              <select value={yearId} onChange={(e) => onYearChange(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
                <option value="">اختر...</option>
                {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
              </select>
            </div>
            <div>
              <Label>الفصل الدراسي <span className="text-rose-600">*</span></Label>
              <select value={semId} onChange={(e) => onSemChange(e.target.value)} disabled={!yearId} className="w-full h-9 rounded border bg-background px-2 text-sm disabled:opacity-60">
                <option value="">اختر...</option>
                {semesters.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label>المقرر <span className="text-rose-600">*</span></Label>
            <select
              value={enrollmentId}
              onChange={(e) => setEnrollmentId(e.target.value)}
              disabled={!semId}
              className="w-full h-9 rounded border bg-background px-2 text-sm disabled:opacity-60"
            >
              <option value="">اختر مقرراً...</option>
              {courses.map((c) => (
                <option key={c.enrollment_id} value={c.enrollment_id}>
                  {c.course_code} — {c.course_name} (مجموعة {c.section_code})
                </option>
              ))}
            </select>
            {semId && courses.length === 0 && (
              <div className="mt-1 text-[11px] text-amber-700">لا توجد مقررات بدرجات مسجلة في هذا الفصل.</div>
            )}
          </div>

          {selected && (
            <div className="rounded border bg-muted/30 p-2 text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-muted-foreground">المقرر:</span><b>{selected.course_code} — {selected.course_name}</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الدرجة الحالية:</span><b>{selected.total_score.toFixed(2)}</b></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">حالة الدرجة:</span>
                <b>{selected.grade_status === "approved" ? "معتمدة" : "قيد الاعتماد"}</b>
              </div>
            </div>
          )}

          <div>
            <Label>سبب التظلم <span className="text-rose-600">*</span></Label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اشرح سبب التظلم بالتفصيل..." />
          </div>
          <div>
            <Label>ملاحظات إضافية</Label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
          </div>
          <FilePicker file={file} setFile={setFile} required={attachmentRequired} />
          <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
        </div>
      )}
    </ModalShell>
  );
}

