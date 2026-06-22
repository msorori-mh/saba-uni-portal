import { createLazyFileRoute } from "@tanstack/react-router";
import { usePagePerf } from "@/lib/perf-probe";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Loader2, FileWarning, Paperclip, CheckCircle2, XCircle, Eye, ArrowRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { sendNotificationEmail } from "@/lib/email.functions";
import {
  getStudentRequestLookups,
  listStudentRequestsOverview,
  getStudentRequestDetails,
  getStudentRequestTimeline,
  updateStudentRequestStatus,
  updateEquivalencyCourse,
  getStudentRequestAttachmentUrl,
} from "@/lib/admin-student-requests.functions";
import { RequestTimelinePanel } from "@/components/student-requests/RequestTimelinePanel";

export const Route = createLazyFileRoute("/admin/student-requests")({
  component: AdminRequestsPage,
});

const REASON_LABEL: Record<string, string> = {
  medical: "طبي", family: "عائلي", emergency: "طارئ", other: "أخرى",
};
const DURATION_LABEL: Record<string, string> = {
  one_semester: "فصل دراسي",
  full_year: "سنة كاملة",
};
const CHANCE_LABEL: Record<string, string> = {
  final_chance: "فرصة أخيرة",
  additional_chance: "فرصة إضافية",
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

type SuspensionDetails = {
  suspension_reason: string;
  suspension_duration_type: string;
  notes: string | null;
  requested_from_academic_year: { name: string } | null;
  requested_from_semester: { name: string } | null;
};

type ReinstatementDetails = {
  reinstatement_reason: string;
  notes: string | null;
  requested_from_academic_year: { name: string } | null;
  requested_from_semester: { name: string } | null;
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

type TransferSummary = {
  can_approve: boolean;
  block_reason: string | null;
  warnings: string[];
};

type EquivalencyDetails = {
  previous_university_name: string;
  previous_program_name: string;
  transfer_reference: string | null;
  notes: string | null;
  credits_applied_at: string | null;
};

type EquivalencySummary = {
  pending_count: number;
  approved_with_target_count: number;
  rejected_count: number;
  can_approve_parent: boolean;
};

type EquivalencyCourse = {
  id: string;
  external_course_code: string;
  external_course_name: string;
  external_credit_hours: number | null;
  status: string;
  reviewer_notes: string | null;
  target_course_id: string | null;
  target_course: { code: string; name_ar: string } | null;
};

type GradeAppealDetails = {
  reason: string;
  notes: string | null;
  current_grade_total: number | null;
  current_grade_status: string | null;
  approved_total_score: number | null;
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

type ExtraChanceSummary = {
  can_approve: boolean;
  block_reason: string | null;
};

type AdminReq = {
  id: string; title: string; description: string | null; status: string;
  submitted_at: string | null; created_at: string; rejection_reason: string | null;
  student_profile_id: string; request_type: string;
  student: { academic_number: string; full_name_ar: string; program_id: string | null; department_id: string | null;
             program: { name_ar: string } | null; department: { name_ar: string } | null } | null;
  absence_details: { absence_date: string; reason_type: string; course_section_id: string; record_applied_at: string | null;
             section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null } | null;
  suspension_details: SuspensionDetails | null;
  reinstatement_details: ReinstatementDetails | null;
  extra_chance_details: {
    chance_type: string;
    reason: string;
    notes: string | null;
    chance_applied_at: string | null;
    academic_year: { name: string } | null;
    semester: { name: string } | null;
  } | null;
  extra_chance_summary: ExtraChanceSummary | null;
  transfer_details: TransferDetails | null;
  transfer_summary: TransferSummary | null;
  equivalency_details: EquivalencyDetails | null;
  equivalency_courses: EquivalencyCourse[];
  equivalency_summary: EquivalencySummary | null;
  grade_appeal_details: GradeAppealDetails | null;
  grade_appeal_section_max: number | null;
  official_transcript_details: OfficialTranscriptDetails | null;
  official_transcript_summary: ExtraChanceSummary | null;
  attachments: { id: string; file_url: string; file_name: string }[];
  _detailsLoaded?: boolean;
};


function AdminRequestsPage() {
  usePagePerf("/admin/student-requests");
  const qc = useQueryClient();
  const lookupsFn = useServerFn(getStudentRequestLookups);
  const listFn = useServerFn(listStudentRequestsOverview);
  const detailsFn = useServerFn(getStudentRequestDetails);
  const updateStatusFn = useServerFn(updateStudentRequestStatus);
  const sendEmail = useServerFn(sendNotificationEmail);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [selected, setSelected] = useState<AdminReq | null>(null);

  const { data: lookups } = useQuery({
    queryKey: ["admin-request-lookups"],
    queryFn: () => lookupsFn({ data: {} }),
  });
  const requestTypes = lookups?.requestTypes ?? [];
  const programs = lookups?.programs ?? [];
  const depts = lookups?.departments ?? [];
  const typeLabel = (code: string) => requestTypes.find((t) => t.code === code)?.name_ar ?? code;

  const { data: requests = [], isLoading, isError, error: listError, refetch } = useQuery({
    queryKey: ["admin-requests-overview"],
    queryFn: async (): Promise<AdminReq[]> => {
      const reqs = await listFn({ data: {} });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (reqs as any[]).map((r) => ({
        ...r,
        absence_details: null,
        suspension_details: null,
        reinstatement_details: null,
        extra_chance_details: null,
        extra_chance_summary: null,
        transfer_details: null,
        transfer_summary: null,
        equivalency_details: null,
        equivalency_courses: [],
        equivalency_summary: null,
        grade_appeal_details: null,
        grade_appeal_section_max: null,
        official_transcript_details: null,
        official_transcript_summary: null,
        attachments: [],
        _detailsLoaded: false,
      }));
    },
  });

  useEffect(() => {
    if (!selected || selected._detailsLoaded) return;
    const id = selected.id;
    let cancelled = false;
    (async () => {
      const details = await detailsFn({ data: { requestId: id } });
      if (cancelled) return;
      setSelected((prev) =>
        prev && prev.id === id
          ? { ...prev, ...details, _detailsLoaded: true }
          : prev,
      );
    })();
    return () => { cancelled = true; };
  }, [selected, detailsFn]);

  const submittedCount = useMemo(
    () => requests.filter((r) => r.status === "submitted").length,
    [requests],
  );

  const filtered = useMemo(() => requests.filter((r) =>
    (!statusFilter || r.status === statusFilter)
    && (!typeFilter || r.request_type === typeFilter)
    && (!programFilter || r.student?.program_id === programFilter)
    && (!deptFilter || r.student?.department_id === deptFilter)
  ), [requests, statusFilter, typeFilter, programFilter, deptFilter]);

  const updateStatus = async (
    id: string,
    status: string,
    rejection_reason?: string,
    approvedGradeTotal?: number,
  ) => {
    try {
      const result = await updateStatusFn({
        data: {
          requestId: id,
          status: status as "draft" | "submitted" | "under_review" | "returned" | "approved" | "rejected" | "cancelled",
          rejectionReason: rejection_reason,
          approvedGradeTotal,
        },
      });
      toast.success("تم تحديث الحالة");
      qc.invalidateQueries({ queryKey: ["admin-requests-overview"] });
      if (selected?.id === id) {
        setSelected({
          ...selected,
          status,
          rejection_reason: result.rejection_reason ?? null,
          _detailsLoaded: selected._detailsLoaded,
        });
      }

      if ((status === "approved" || status === "rejected") && result.email) {
        sendEmail({
          data: {
            templateKey: status === "approved" ? "request_approved" : "request_rejected",
            recipientEmail: result.email,
            recipientName: result.full_name_ar,
            variables: {
              request_title: result.title ?? "",
              rejection_reason: rejection_reason ?? null,
              document_number: result.document_number ?? null,
              verification_code: result.verification_code ?? null,
              document_url: result.document_url ?? null,
              verify_url: result.verify_url ?? null,
            },
            relatedEntityType: "student_request",
            relatedEntityId: id,
          },
        }).catch(() => undefined);
      }
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  return (
    <div dir="rtl" className="p-4 lg:p-8 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2">
        <FileWarning className="h-5 w-5 text-gold" />
        <h1 className="font-display text-xl font-extrabold text-primary">طلبات الطلاب</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 rounded-lg border bg-card p-3">
        <FilterSelect label="نوع الطلب" value={typeFilter} onChange={setTypeFilter}
          options={requestTypes.map((t) => ({ value: t.code, label: `${t.name_ar}${t.is_active ? "" : " (معطل)"}` }))} />
        <FilterSelect label="الحالة" value={statusFilter} onChange={setStatusFilter}
          options={Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v.text }))} />
        <FilterSelect label="البرنامج" value={programFilter} onChange={setProgramFilter}
          options={programs.map((p) => ({ value: p.id, label: p.name_ar }))} />
        <FilterSelect label="القسم" value={deptFilter} onChange={setDeptFilter}
          options={depts.map((d) => ({ value: d.id, label: d.name_ar }))} />
        <div className="ms-auto text-xs text-muted-foreground self-end flex flex-col items-end gap-0.5">
          <span>{filtered.length} طلب</span>
          {submittedCount > 0 && !statusFilter && (
            <span className="text-blue-700">{submittedCount} مُرسَل بانتظار المراجعة</span>
          )}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between gap-3">
          <span>تعذر تحميل الطلبات: {listError instanceof Error ? listError.message : "خطأ غير معروف"}</span>
          <button type="button" onClick={() => refetch()} className="text-xs font-bold underline shrink-0">إعادة المحاولة</button>
        </div>
      )}

      {statusFilter === "under_review" && submittedCount > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
          يوجد {submittedCount} طلب(ات) بحالة «مُرسَل» لا تظهر مع فلتر «قيد المراجعة». امسح فلتر الحالة أو اختر «مُرسَل».
        </div>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          لا توجد طلبات مطابقة.
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden divide-y">
          {filtered.map((r) => {
            const st = STATUS_LABEL[r.status] ?? { text: r.status, cls: "bg-muted" };
            return (
              <button key={r.id} onClick={() => setSelected(r)} className="w-full text-right p-3 hover:bg-muted/40 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-primary">{r.student?.academic_number ?? "—"}</span>
                    <span className="font-semibold text-sm truncate">{r.student?.full_name_ar ?? "—"}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{typeLabel(r.request_type)}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground truncate">
                    {r.absence_details && (
                      <>
                        {r.absence_details.section?.offering?.course?.code ?? "—"} — {r.absence_details.section?.offering?.course?.name_ar ?? "—"} • {r.absence_details.absence_date} • {REASON_LABEL[r.absence_details.reason_type]}
                      </>
                    )}
                    {r.suspension_details && (
                      <>
                        {r.suspension_details.requested_from_academic_year?.name ?? "—"} • {r.suspension_details.requested_from_semester?.name ?? "—"} • {DURATION_LABEL[r.suspension_details.suspension_duration_type] ?? r.suspension_details.suspension_duration_type}
                      </>
                    )}
                    {r.reinstatement_details && (
                      <>
                        {r.reinstatement_details.requested_from_academic_year?.name ?? "—"} • {r.reinstatement_details.requested_from_semester?.name ?? "—"} • إعادة قيد
                      </>
                    )}
                    {r.extra_chance_details && (
                      <>
                        {r.extra_chance_details.academic_year?.name ?? "—"} • {r.extra_chance_details.semester?.name ?? "—"} • {CHANCE_LABEL[r.extra_chance_details.chance_type] ?? r.extra_chance_details.chance_type}
                      </>
                    )}
                    {r.transfer_details && (
                      <>
                        {r.transfer_details.current_program?.name_ar ?? "—"} ← {r.transfer_details.requested_program?.name_ar ?? "—"}
                      </>
                    )}
                    {r.equivalency_details && (
                      <>
                        {r.equivalency_details.previous_university_name} • {r.equivalency_details.previous_program_name} • {r.equivalency_courses.length} مادة
                      </>
                    )}
                    {r.grade_appeal_details && (
                      <>
                        {r.grade_appeal_details.academic_year?.name ?? "—"} • {r.grade_appeal_details.semester?.name ?? "—"} • {r.grade_appeal_details.section?.offering?.course?.code ?? "—"} — {r.grade_appeal_details.section?.offering?.course?.name_ar ?? "—"}
                        {r.grade_appeal_details.current_grade_total != null && <> • الدرجة: <b>{Number(r.grade_appeal_details.current_grade_total).toFixed(2)}</b></>}
                      </>
                    )}
                  </div>

                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    <Clock className="inline h-3 w-3" /> {new Date(r.created_at).toLocaleString("ar-EG")}
                    {r.attachments.length > 0 && <> • <Paperclip className="inline h-3 w-3" /> {r.attachments.length}</>}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground self-center shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DetailsModal req={selected} onClose={() => setSelected(null)} onUpdateStatus={updateStatus} />
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground block">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded border bg-background px-2 text-sm min-w-[140px]">
        <option value="">الكل</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function SignedAttachment({ path, name }: { path: string; name: string }) {
  const urlFn = useServerFn(getStudentRequestAttachmentUrl);
  const open = async () => {
    try {
      const { signedUrl } = await urlFn({ data: { path } });
      window.open(signedUrl, "_blank");
    } catch {
      toast.error("تعذر فتح المرفق");
    }
  };
  return (
    <button onClick={open} className="text-xs inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted">
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

function DetailsModal({ req, onClose, onUpdateStatus }: {
  req: AdminReq; onClose: () => void;
  onUpdateStatus: (id: string, status: string, rejection_reason?: string, approvedGradeTotal?: number) => Promise<boolean>;
}) {
  const [reason, setReason] = useState(req.rejection_reason ?? "");
  const [approvedGradeTotal, setApprovedGradeTotal] = useState(
    req.grade_appeal_details?.approved_total_score != null
      ? String(req.grade_appeal_details.approved_total_score)
      : req.grade_appeal_details?.current_grade_total != null
        ? String(req.grade_appeal_details.current_grade_total)
        : "",
  );
  const [busy, setBusy] = useState(false);
  const timelineFn = useServerFn(getStudentRequestTimeline);
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ["admin-request-timeline", req.id],
    queryFn: () => timelineFn({ data: { requestId: req.id } }),
  });

  const act = async (status: string) => {
    if ((status === "rejected" || status === "returned") && !reason.trim()) {
      toast.error(status === "returned" ? "أدخل ملاحظات الاستكمال" : "أدخل سبب الرفض");
      return;
    }
    let gradeTotal: number | undefined;
    if (status === "approved" && req.request_type === "grade_appeal") {
      const parsed = Number(approvedGradeTotal);
      if (!Number.isFinite(parsed)) {
        toast.error("أدخل الدرجة المعتمدة بعد التظلم");
        return;
      }
      if (req.grade_appeal_section_max != null && parsed > req.grade_appeal_section_max) {
        toast.error(`الدرجة المعتمدة لا يمكن أن تتجاوز ${req.grade_appeal_section_max.toFixed(2)}`);
        return;
      }
      gradeTotal = parsed;
    }
    if (status === "approved" && req.request_type === "equivalency") {
      if (!req.equivalency_summary?.can_approve_parent) {
        toast.error("أكمل مراجعة المواد واعتمد مادة واحدة على الأقل قبل اعتماد الطلب");
        return;
      }
    }
    if (status === "approved" && req.request_type === "extra_chance") {
      if (!req.extra_chance_details) {
        toast.error("تفاصيل طلب الفرصة غير مكتملة");
        return;
      }
      if (req.extra_chance_summary && !req.extra_chance_summary.can_approve) {
        toast.error(req.extra_chance_summary.block_reason ?? "لا يمكن اعتماد طلب الفرصة");
        return;
      }
    }
    if (status === "approved" && req.request_type === "transfer") {
      if (!req.transfer_details) {
        toast.error("تفاصيل طلب التحويل غير مكتملة");
        return;
      }
      if (req.transfer_summary && !req.transfer_summary.can_approve) {
        toast.error(req.transfer_summary.block_reason ?? "لا يمكن اعتماد طلب التحويل");
        return;
      }
    }
    if (status === "approved" && req.request_type === "official_transcript") {
      if (req.official_transcript_summary && !req.official_transcript_summary.can_approve) {
        toast.error(req.official_transcript_summary.block_reason ?? "لا يمكن اعتماد طلب السجل الأكاديمي");
        return;
      }
    }
    setBusy(true);
    await onUpdateStatus(
      req.id,
      status,
      status === "rejected" || status === "returned" ? reason.trim() : undefined,
      gradeTotal,
    );
    setBusy(false);
  };

  const st = STATUS_LABEL[req.status];
  return (
    <div dir="rtl" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3">
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-primary flex items-center gap-2"><Eye className="h-4 w-4" /> تفاصيل الطلب</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="space-y-2 text-sm">
          <Row label="الطالب" value={`${req.student?.full_name_ar ?? "—"} (${req.student?.academic_number ?? "—"})`} />
          <Row label="البرنامج / القسم" value={`${req.student?.program?.name_ar ?? "—"} • ${req.student?.department?.name_ar ?? "—"}`} />
          {req.absence_details && (
            <>
              <Row label="المقرر" value={`${req.absence_details.section?.offering?.course?.code ?? "—"} — ${req.absence_details.section?.offering?.course?.name_ar ?? "—"} (مجموعة دراسية ${req.absence_details.section?.section_code ?? "—"})`} />
              <Row label="تاريخ الغياب" value={req.absence_details.absence_date} />
              <Row label="نوع العذر" value={REASON_LABEL[req.absence_details.reason_type ?? "other"]} />
              {req.absence_details.record_applied_at && (
                <Row label="تاريخ تسجيل العذر" value={new Date(req.absence_details.record_applied_at).toLocaleString("ar-EG")} />
              )}
            </>
          )}
          {req.suspension_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.suspension_details.requested_from_academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.suspension_details.requested_from_semester?.name ?? "—"} />
              <Row label="مدة الوقف" value={DURATION_LABEL[req.suspension_details.suspension_duration_type] ?? req.suspension_details.suspension_duration_type} />
              <Row label="السبب" value={req.suspension_details.suspension_reason} />
              {req.suspension_details.notes && <Row label="ملاحظات" value={req.suspension_details.notes} />}
            </>
          )}
          {req.reinstatement_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.reinstatement_details.requested_from_academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.reinstatement_details.requested_from_semester?.name ?? "—"} />
              <Row label="سبب إعادة القيد" value={req.reinstatement_details.reinstatement_reason} />
              {req.reinstatement_details.notes && <Row label="ملاحظات" value={req.reinstatement_details.notes} />}
            </>
          )}
          {req.extra_chance_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.extra_chance_details.academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.extra_chance_details.semester?.name ?? "—"} />
              <Row label="نوع الفرصة" value={CHANCE_LABEL[req.extra_chance_details.chance_type] ?? req.extra_chance_details.chance_type} />
              <Row label="السبب" value={req.extra_chance_details.reason} />
              {req.extra_chance_details.notes && <Row label="ملاحظات" value={req.extra_chance_details.notes} />}
              <Row
                label="حالة تطبيق الأثر"
                value={
                  req.extra_chance_details.chance_applied_at
                    ? "تم تسجيل الفرصة"
                    : req.status === "approved"
                      ? "معتمد — بانتظار التسجيل"
                      : "لم يُطبَّق بعد"
                }
              />
              {req.extra_chance_details.chance_applied_at && (
                <Row label="تاريخ منح الفرصة" value={new Date(req.extra_chance_details.chance_applied_at).toLocaleString("ar-EG")} />
              )}
            </>
          )}
          {!req.extra_chance_details && req.request_type === "extra_chance" && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded p-2">
              تفاصيل طلب الفرصة غير مكتملة — لا يمكن الاعتماد.
            </div>
          )}
          {req.transfer_details && (
            <>
              <Row label="البرنامج الحالي" value={req.transfer_details.current_program?.name_ar ?? "—"} />
              <Row label="البرنامج المطلوب" value={req.transfer_details.requested_program?.name_ar ?? "—"} />
              <Row label="القسم الحالي" value={req.transfer_details.current_department?.name_ar ?? "—"} />
              <Row label="القسم المطلوب" value={req.transfer_details.requested_department?.name_ar ?? "—"} />
              <Row label="سبب التحويل" value={req.transfer_details.transfer_reason} />
              {req.transfer_details.notes && <Row label="ملاحظات" value={req.transfer_details.notes} />}
            </>
          )}
          {req.request_type === "transfer" && req.transfer_summary && !req.transfer_summary.can_approve && (
            <div className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded p-2">
              {req.transfer_summary.block_reason ?? "لا يمكن اعتماد طلب التحويل — تحقق من التفاصيل وحالة الطالب."}
            </div>
          )}
          {req.request_type === "transfer" && req.transfer_summary && req.transfer_summary.warnings.length > 0 && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
              <div className="font-bold">تحذيرات قبل الاعتماد</div>
              {req.transfer_summary.warnings.map((w) => (
                <div key={w}>• {w}</div>
              ))}
            </div>
          )}
          {req.equivalency_details && (
            <>
              <Row label="الجامعة السابقة" value={req.equivalency_details.previous_university_name} />
              <Row label="البرنامج السابق" value={req.equivalency_details.previous_program_name} />
              {req.equivalency_details.transfer_reference && <Row label="مرجع التحويل" value={req.equivalency_details.transfer_reference} />}
              {req.equivalency_details.notes && <Row label="ملاحظات" value={req.equivalency_details.notes} />}
              {req.equivalency_details.credits_applied_at && (
                <Row label="تاريخ تطبيق المعادلة" value={new Date(req.equivalency_details.credits_applied_at).toLocaleString("ar-EG")} />
              )}
              {req.equivalency_summary && (
                <div className="text-xs text-muted-foreground">
                  مراجعة المواد: {req.equivalency_summary.approved_with_target_count} معتمدة • {req.equivalency_summary.pending_count} قيد المراجعة • {req.equivalency_summary.rejected_count} مرفوضة
                </div>
              )}
              <EquivalencyCoursesReview requestId={req.id} courses={req.equivalency_courses} />
            </>
          )}
          {req.grade_appeal_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.grade_appeal_details.academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.grade_appeal_details.semester?.name ?? "—"} />
              <Row
                label="المقرر"
                value={`${req.grade_appeal_details.section?.offering?.course?.code ?? "—"} — ${req.grade_appeal_details.section?.offering?.course?.name_ar ?? "—"} (مجموعة ${req.grade_appeal_details.section?.section_code ?? "—"})`}
              />
              <Row
                label="الدرجة الحالية"
                value={
                  req.grade_appeal_details.current_grade_total != null
                    ? `${Number(req.grade_appeal_details.current_grade_total).toFixed(2)} (${req.grade_appeal_details.current_grade_status === "approved" ? "معتمدة" : "قيد الاعتماد"})`
                    : "—"
                }
              />
              <Row label="سبب التظلم" value={req.grade_appeal_details.reason} />
              {req.grade_appeal_details.notes && <Row label="ملاحظات" value={req.grade_appeal_details.notes} />}
              {req.grade_appeal_details.approved_total_score != null && (
                <Row
                  label="الدرجة المعتمدة"
                  value={Number(req.grade_appeal_details.approved_total_score).toFixed(2)}
                />
              )}
            </>
          )}
          {req.official_transcript_details && (
            <>
              {req.official_transcript_details.purpose && (
                <Row label="الغرض من الطلب" value={req.official_transcript_details.purpose} />
              )}
              {req.official_transcript_details.notes && (
                <Row label="ملاحظات" value={req.official_transcript_details.notes} />
              )}
              {req.official_transcript_details.official_document && (
                <>
                  <Row label="رقم الوثيقة" value={req.official_transcript_details.official_document.document_number} />
                  <Row label="تاريخ الإصدار" value={new Date(req.official_transcript_details.official_document.issued_at).toLocaleString("ar-EG")} />
                  <div>
                    <a
                      href={`/document-view/${req.official_transcript_details.official_document.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      عرض السجل الأكاديمي الرسمي
                    </a>
                  </div>
                </>
              )}
            </>
          )}

          <Row label="الحالة" value={<span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>} />
          <Row label="تاريخ الإنشاء" value={new Date(req.created_at).toLocaleString("ar-EG")} />
          {req.submitted_at && <Row label="تاريخ الإرسال" value={new Date(req.submitted_at).toLocaleString("ar-EG")} />}
          {req.description && (
            <div>
              <div className="text-[11px] font-bold text-muted-foreground">السبب التفصيلي</div>
              <div className="mt-1 rounded border bg-muted/20 p-2 text-xs">{req.description}</div>
            </div>
          )}
          {req.attachments.length > 0 && (
            <div>
              <div className="text-[11px] font-bold text-muted-foreground mb-1">المرفقات</div>
              <div className="flex flex-wrap gap-1.5">
                {req.attachments.map((a) => <SignedAttachment key={a.id} path={a.file_url} name={a.file_name} />)}
              </div>
            </div>
          )}

          <div className="mt-3">
            <RequestTimelinePanel events={timeline} loading={timelineLoading} variant="full" />
          </div>
        </div>

        {req.status !== "approved" && req.status !== "rejected" && req.status !== "cancelled" && (
          <div className="mt-4 border-t pt-3 space-y-2">
            <div className="text-[11px] font-bold text-muted-foreground">إجراء</div>
            {req.request_type === "grade_appeal" && req.grade_appeal_details && (
              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  الدرجة المعتمدة بعد التظلم
                  {req.grade_appeal_section_max != null && (
                    <span className="font-normal text-muted-foreground"> (الحد الأقصى {req.grade_appeal_section_max.toFixed(2)})</span>
                  )}
                </label>
                <input
                  type="number"
                  min={0}
                  max={req.grade_appeal_section_max ?? 100}
                  step="0.01"
                  value={approvedGradeTotal}
                  onChange={(e) => setApprovedGradeTotal(e.target.value)}
                  className="w-full h-9 rounded border bg-background px-2 text-sm"
                />
              </div>
            )}
            {req.request_type === "equivalency" && req.equivalency_summary && !req.equivalency_summary.can_approve_parent && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                لا يمكن اعتماد طلب المقاصة قبل إنهاء مراجعة جميع المواد واعتماد مادة واحدة على الأقل مع مقرر معادَل.
              </div>
            )}
            {req.request_type === "extra_chance" && req.extra_chance_summary && !req.extra_chance_summary.can_approve && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                {req.extra_chance_summary.block_reason ?? "لا يمكن اعتماد طلب الفرصة — تحقق من التفاصيل والسياق الأكاديمي."}
              </div>
            )}
            {req.request_type === "official_transcript" && req.official_transcript_summary && !req.official_transcript_summary.can_approve && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                {req.official_transcript_summary.block_reason}
              </div>
            )}
            {req.status === "submitted" && (
              <button disabled={busy} onClick={() => act("under_review")} className="w-full text-xs bg-amber-500 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
                <Clock className="h-3.5 w-3.5" /> بدء المراجعة
              </button>
            )}
            <button disabled={busy} onClick={() => act("returned")} className="w-full text-xs bg-orange-500 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
              إرجاع للاستكمال
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={
                  busy
                  || (req.request_type === "equivalency" && !req.equivalency_summary?.can_approve_parent)
                  || (req.request_type === "extra_chance" && (
                    !req.extra_chance_details
                    || (req.extra_chance_summary != null && !req.extra_chance_summary.can_approve)
                  ))
                  || (req.request_type === "transfer" && (
                    !req.transfer_details
                    || (req.transfer_summary != null && !req.transfer_summary.can_approve)
                  ))
                  || (req.request_type === "official_transcript"
                    && req.official_transcript_summary != null
                    && !req.official_transcript_summary.can_approve)
                }
                onClick={() => act("approved")}
                className="text-xs bg-emerald-600 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> قبول
              </button>
              <button disabled={busy} onClick={() => act("rejected")} className="text-xs bg-rose-600 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
                <XCircle className="h-3.5 w-3.5" /> رفض
              </button>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ملاحظات (مطلوبة عند الرفض أو الإرجاع للاستكمال)..."
              rows={2}
              className="w-full rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
        )}

        {req.rejection_reason && req.status === "rejected" && (
          <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            <b>سبب الرفض:</b> {req.rejection_reason}
          </div>
        )}
        {req.rejection_reason && req.status === "returned" && (
          <div className="mt-3 text-xs text-orange-800 bg-orange-50 border border-orange-200 rounded p-2">
            <b>ملاحظات الاستكمال:</b> {req.rejection_reason}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <div className="text-muted-foreground w-28 shrink-0">{label}:</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

type EqCourseLite = {
  id: string;
  external_course_code: string;
  external_course_name: string;
  external_credit_hours: number | null;
  status: string;
  reviewer_notes: string | null;
  target_course_id: string | null;
  target_course: { code: string; name_ar: string } | null;
};

function EquivalencyCoursesReview({ requestId, courses }: { requestId: string; courses: EqCourseLite[] }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateEquivalencyCourse);
  const [local, setLocal] = useState(courses);
  const [busyId, setBusyId] = useState<string | null>(null);

  const updateCourse = async (id: string, patch: Partial<EqCourseLite>) => {
    setBusyId(id);
    try {
      await updateFn({
        data: {
          courseId: id,
          status: patch.status as "pending" | "approved" | "rejected" | undefined,
          reviewerNotes: patch.reviewer_notes,
        },
      });
      setLocal((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      qc.invalidateQueries({ queryKey: ["admin-requests-overview"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
    void requestId;
  };

  if (local.length === 0) {
    return <div className="text-xs text-muted-foreground">لا توجد مواد.</div>;
  }

  return (
    <div className="mt-2">
      <div className="text-[11px] font-bold text-muted-foreground mb-1">المواد المطلوبة</div>
      <div className="space-y-2">
        {local.map((c) => (
          <div key={c.id} className="rounded border bg-muted/20 p-2 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-xs">
                <b>{c.external_course_code}</b> — {c.external_course_name}
                {c.external_credit_hours != null && <span className="text-muted-foreground"> ({c.external_credit_hours} س)</span>}
              </div>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                c.status === "approved" ? "bg-emerald-100 text-emerald-800"
                : c.status === "rejected" ? "bg-rose-100 text-rose-800"
                : "bg-amber-100 text-amber-800"
              }`}>
                {c.status === "approved" ? "تمت المعادلة" : c.status === "rejected" ? "مرفوضة" : "قيد المراجعة"}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              المعادلة: {c.target_course ? <><b>{c.target_course.code}</b> — {c.target_course.name_ar}</> : "—"}
            </div>
            <input
              defaultValue={c.reviewer_notes ?? ""}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== (c.reviewer_notes ?? "")) updateCourse(c.id, { reviewer_notes: v || null });
              }}
              placeholder="ملاحظات المراجع..."
              className="w-full h-7 rounded border bg-background px-2 text-xs"
            />
            <div className="flex gap-1.5">
              <button
                disabled={busyId === c.id || !c.target_course_id}
                onClick={() => updateCourse(c.id, { status: "approved" })}
                className="text-[11px] bg-emerald-600 text-white px-2 py-0.5 rounded hover:opacity-90 disabled:opacity-50"
              >
                قبول
              </button>
              <button disabled={busyId === c.id} onClick={() => updateCourse(c.id, { status: "rejected" })}
                className="text-[11px] bg-rose-600 text-white px-2 py-0.5 rounded hover:opacity-90">رفض</button>
              <button disabled={busyId === c.id} onClick={() => updateCourse(c.id, { status: "pending" })}
                className="text-[11px] border px-2 py-0.5 rounded hover:bg-muted">إعادة</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

