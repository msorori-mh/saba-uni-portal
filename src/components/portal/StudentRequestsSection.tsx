import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, FileWarning, Plus, Send, Trash2, Upload, X, Paperclip, Ban, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

type RequestType = { id: string; code: string; name_ar: string; description_ar: string | null; is_active: boolean };

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
  academic_year: { name: string } | null;
  semester: { name: string } | null;
};

type ExtraChanceDetails = {
  academic_year_id: string;
  semester_id: string;
  chance_type: string;
  reason: string;
  notes: string | null;
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

type RequestRow = {
  id: string; title: string; description: string | null; status: string;
  submitted_at: string | null; rejection_reason: string | null; created_at: string;
  request_type: string;
  absence_details: { absence_date: string; reason_type: string; course_section_id: string } | null;
  suspension_details: SuspensionDetails | null;
  extra_chance_details: ExtraChanceDetails | null;
  transfer_details: TransferDetails | null;
  equivalency_details: EquivalencyDetails | null;
  equivalency_courses: EquivalencyCourseRow[];
  grade_appeal_details: GradeAppealDetails | null;
  attachments: { id: string; file_name: string; file_url: string }[];
};


export function StudentRequestsSection({ studentProfileId }: { studentProfileId: string }) {
  const qc = useQueryClient();
  const [openType, setOpenType] = useState<null | "absence_excuse" | "enrollment_suspension" | "extra_chance" | "transfer" | "equivalency" | "grade_appeal">(null);

  const { data: requestTypes = [] } = useQuery({
    queryKey: ["request-types-active"],
    queryFn: async (): Promise<RequestType[]> => {
      const { data, error } = await sb.from("request_types")
        .select("id, code, name_ar, description_ar, is_active")
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

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["my-requests", studentProfileId],
    queryFn: async (): Promise<RequestRow[]> => {
      const { data: reqs, error } = await sb.from("student_requests")
        .select("id, title, description, status, submitted_at, rejection_reason, created_at, request_type")
        .eq("student_profile_id", studentProfileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (reqs ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return [];
      const [absRes, suspRes, ecRes, trRes, eqdRes, eqcRes, gaRes, attRes] = await Promise.all([
        sb.from("absence_excuse_details").select("request_id, absence_date, reason_type, course_section_id").in("request_id", ids),
        sb.from("enrollment_suspension_details")
          .select("request_id, requested_from_academic_year_id, requested_from_semester_id, suspension_reason, suspension_duration_type, notes, academic_year:academic_years(name), semester:semesters(name)")
          .in("request_id", ids),
        sb.from("extra_chance_details")
          .select("request_id, academic_year_id, semester_id, chance_type, reason, notes, academic_year:academic_years(name), semester:semesters(name)")
          .in("request_id", ids),
        sb.from("transfer_request_details")
          .select("request_id, current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason, notes, current_program:programs!transfer_request_details_current_program_id_fkey(name_ar), requested_program:programs!transfer_request_details_requested_program_id_fkey(name_ar), current_department:departments!transfer_request_details_current_department_id_fkey(name_ar), requested_department:departments!transfer_request_details_requested_department_id_fkey(name_ar)")
          .in("request_id", ids),
        sb.from("equivalency_request_details")
          .select("request_id, previous_university_name, previous_program_name, notes")
          .in("request_id", ids),
        sb.from("equivalency_courses")
          .select("id, equivalency_request_id, external_course_code, external_course_name, external_credit_hours, status, reviewer_notes, target_course:courses(code, name_ar)")
          .in("equivalency_request_id", ids),
        sb.from("grade_appeal_details")
          .select("request_id, reason, notes, current_grade_total, current_grade_status, academic_year:academic_years(name), semester:semesters(name), section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
          .in("request_id", ids),
        sb.from("student_request_attachments").select("id, request_id, file_name, file_url").in("request_id", ids),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const absMap = new Map((absRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const suspMap = new Map((suspRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ecMap = new Map((ecRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const trMap = new Map((trRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eqdMap = new Map((eqdRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gaMap = new Map((gaRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eqcMap = new Map<string, any[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (eqcRes.data ?? []) as any[]) {
        if (!eqcMap.has(c.equivalency_request_id)) eqcMap.set(c.equivalency_request_id, []);
        eqcMap.get(c.equivalency_request_id)!.push(c);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attMap = new Map<string, any[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (attRes.data ?? []) as any[]) {
        if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
        attMap.get(a.request_id)!.push(a);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (reqs as any[]).map((r) => ({
        ...r,
        absence_details: absMap.get(r.id) ?? null,
        suspension_details: suspMap.get(r.id) ?? null,
        extra_chance_details: ecMap.get(r.id) ?? null,
        transfer_details: trMap.get(r.id) ?? null,
        equivalency_details: eqdMap.get(r.id) ?? null,
        equivalency_courses: eqcMap.get(r.id) ?? [],
        grade_appeal_details: gaMap.get(r.id) ?? null,
        attachments: attMap.get(r.id) ?? [],
      }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["my-requests", studentProfileId] });

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

  const SUPPORTED_CODES = new Set(["absence_excuse", "enrollment_suspension", "extra_chance", "transfer", "equivalency", "grade_appeal"]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
          <FileWarning className="h-4 w-4 text-gold" /> الطلبات الطلابية
        </h2>
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {requestTypes.map((t) => {
          const supported = t.is_active && SUPPORTED_CODES.has(t.code);
          return (
            <div key={t.id} className={`rounded-lg border bg-card p-2.5 flex items-center justify-between gap-2 ${!t.is_active ? "opacity-70" : ""}`}>
              <div className="min-w-0">
                <div className="text-sm font-bold text-primary truncate">{t.name_ar}</div>
                {t.description_ar && <div className="text-[11px] text-muted-foreground truncate">{t.description_ar}</div>}
              </div>
              {supported ? (
                <button
                  onClick={() => setOpenType(t.code as "absence_excuse" | "enrollment_suspension" | "extra_chance" | "transfer" | "equivalency" | "grade_appeal")}
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
                    <span>السنة: <b>{r.suspension_details.academic_year?.name ?? "—"}</b></span>
                    <span>• الفصل: <b>{r.suspension_details.semester?.name ?? "—"}</b></span>
                    <span>• المدة: <b>{DURATION_LABEL[r.suspension_details.suspension_duration_type] ?? r.suspension_details.suspension_duration_type}</b></span>
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
                {r.rejection_reason && (
                  <div className="mt-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                    سبب الرفض: {r.rejection_reason}
                  </div>
                )}
                {r.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.attachments.map((a) => (
                      <AttachmentLink key={a.id} path={a.file_url} name={a.file_name} />
                    ))}
                  </div>
                )}
                <div className="mt-2 flex gap-1.5">
                  {r.status === "draft" && (
                    <button onClick={() => deleteDraft(r.id)} className="text-[11px] inline-flex items-center gap-1 border border-rose-300 text-rose-700 px-2 py-0.5 rounded hover:bg-rose-50">
                      <Trash2 className="h-3 w-3" /> حذف
                    </button>
                  )}
                  {r.status !== "approved" && r.status !== "cancelled" && r.status !== "rejected" && (
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
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "enrollment_suspension" && (
        <SuspensionModal
          studentProfileId={studentProfileId}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "extra_chance" && (
        <ExtraChanceModal
          studentProfileId={studentProfileId}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "transfer" && (
        <TransferModal
          studentProfileId={studentProfileId}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "equivalency" && (
        <EquivalencyModal
          studentProfileId={studentProfileId}
          onClose={() => setOpenType(null)}
          onSaved={() => { setOpenType(null); refresh(); }}
        />
      )}
      {openType === "grade_appeal" && (
        <GradeAppealModal
          studentProfileId={studentProfileId}
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
  studentProfileId, enrollments, onClose, onSaved,
}: {
  studentProfileId: string; enrollments: Enrollment[];
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
          <FilePicker file={file} setFile={setFile} />
          <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
        </div>
      )}
    </ModalShell>
  );
}

function SuspensionModal({
  studentProfileId, onClose, onSaved,
}: {
  studentProfileId: string; onClose: () => void; onSaved: () => void;
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
        <FilePicker file={file} setFile={setFile} />
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

function FilePicker({ file, setFile }: { file: File | null; setFile: (f: File | null) => void }) {
  return (
    <div>
      <Label>مرفق (اختياري)</Label>
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
  studentProfileId, onClose, onSaved,
}: {
  studentProfileId: string; onClose: () => void; onSaved: () => void;
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
  const [chanceType, setChanceType] = useState<"final_chance" | "additional_chance">("final_chance");
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
    if (!reason.trim()) { toast.error("أدخل سبب الطلب"); return; }
    setBusy(true);
    try {
      const { data: created, error: e1 } = await sb.from("student_requests").insert({
        student_profile_id: studentProfileId,
        request_type: "extra_chance",
        title: "طلب منح فرصة",
        description: notes || null,
        status: submit ? "submitted" : "draft",
        submitted_at: submit ? new Date().toISOString() : null,
      }).select("id").single();
      if (e1) throw e1;

      const { error: e2 } = await sb.from("extra_chance_details").insert({
        request_id: created.id,
        academic_year_id: yearId,
        semester_id: semId,
        chance_type: chanceType,
        reason: reason.trim(),
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
        <div>
          <Label>نوع الفرصة</Label>
          <div className="flex gap-2">
            {(["final_chance", "additional_chance"] as const).map((d) => (
              <label key={d} className={`flex-1 cursor-pointer border rounded-lg p-2 text-center text-xs font-semibold ${chanceType === d ? "border-primary bg-primary/5 text-primary" : "border-border"}`}>
                <input type="radio" name="chance_type" value={d} checked={chanceType === d} onChange={() => setChanceType(d)} className="sr-only" />
                {CHANCE_LABEL[d]}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>سبب الطلب <span className="text-rose-600">*</span></Label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اذكر السبب..." />
        </div>
        <div>
          <Label>ملاحظات إضافية</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded border bg-background px-2 py-1.5 text-sm" />
        </div>
        <FilePicker file={file} setFile={setFile} />
        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
      </div>
    </ModalShell>
  );
}

function TransferModal({
  studentProfileId, onClose, onSaved,
}: {
  studentProfileId: string; onClose: () => void; onSaved: () => void;
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
        <FilePicker file={file} setFile={setFile} />
        <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
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
  studentProfileId, onClose, onSaved,
}: {
  studentProfileId: string; onClose: () => void; onSaved: () => void;
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
          <Label>المرفقات (كشف درجات، توصيف مقررات، ...)</Label>
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
  studentProfileId, onClose, onSaved,
}: {
  studentProfileId: string; onClose: () => void; onSaved: () => void;
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
          <FilePicker file={file} setFile={setFile} />
          <Actions busy={busy} onDraft={() => save(false)} onSubmit={() => save(true)} />
        </div>
      )}
    </ModalShell>
  );
}

