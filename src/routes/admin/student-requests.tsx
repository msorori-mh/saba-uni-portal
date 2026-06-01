import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, FileWarning, Paperclip, CheckCircle2, XCircle, Eye, ArrowRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as { from: (t: string) => any };

export const Route = createFileRoute("/admin/student-requests")({
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
  approved:     { text: "مقبول",       cls: "bg-emerald-100 text-emerald-800" },
  rejected:     { text: "مرفوض",       cls: "bg-rose-100 text-rose-800" },
  cancelled:    { text: "ملغي",        cls: "bg-zinc-200 text-zinc-800" },
};

type SuspensionDetails = {
  suspension_reason: string;
  suspension_duration_type: string;
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
  transfer_reference: string | null;
  notes: string | null;
};

type EquivalencyCourse = {
  id: string;
  external_course_code: string;
  external_course_name: string;
  external_credit_hours: number | null;
  status: string;
  reviewer_notes: string | null;
  target_course: { code: string; name_ar: string } | null;
};

type AdminReq = {
  id: string; title: string; description: string | null; status: string;
  submitted_at: string | null; created_at: string; rejection_reason: string | null;
  student_profile_id: string; request_type: string;
  student: { academic_number: string; full_name_ar: string; program_id: string | null; department_id: string | null;
             program: { name_ar: string } | null; department: { name_ar: string } | null } | null;
  absence_details: { absence_date: string; reason_type: string; course_section_id: string;
             section: { section_code: string; offering: { course: { code: string; name_ar: string } | null } | null } | null } | null;
  suspension_details: SuspensionDetails | null;
  extra_chance_details: {
    chance_type: string;
    reason: string;
    notes: string | null;
    academic_year: { name: string } | null;
    semester: { name: string } | null;
  } | null;
  transfer_details: TransferDetails | null;
  equivalency_details: EquivalencyDetails | null;
  equivalency_courses: EquivalencyCourse[];
  attachments: { id: string; file_url: string; file_name: string }[];
};


function AdminRequestsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>("");
  const [deptFilter, setDeptFilter] = useState<string>("");
  const [selected, setSelected] = useState<AdminReq | null>(null);

  const { data: requestTypes = [] } = useQuery({
    queryKey: ["admin-request-types-min"],
    queryFn: async () => {
      const { data } = await sb.from("request_types").select("code, name_ar, is_active").order("sort_order");
      return (data ?? []) as { code: string; name_ar: string; is_active: boolean }[];
    },
  });
  const typeLabel = (code: string) => requestTypes.find((t) => t.code === code)?.name_ar ?? code;

  const { data: programs = [] } = useQuery({
    queryKey: ["admin-programs-min"],
    queryFn: async () => {
      const { data } = await supabase.from("programs").select("id, name_ar").order("name_ar");
      return (data ?? []) as { id: string; name_ar: string }[];
    },
  });
  const { data: depts = [] } = useQuery({
    queryKey: ["admin-depts-min"],
    queryFn: async () => {
      const { data } = await supabase.from("departments").select("id, name_ar").order("name_ar");
      return (data ?? []) as { id: string; name_ar: string }[];
    },
  });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async (): Promise<AdminReq[]> => {
      const { data: reqs, error } = await sb.from("student_requests")
        .select("id, title, description, status, submitted_at, created_at, rejection_reason, student_profile_id, request_type, student:student_profiles(academic_number, full_name_ar, program_id, department_id, program:programs(name_ar), department:departments(name_ar))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (reqs ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return [];
      const [absRes, suspRes, ecRes, trRes, eqdRes, eqcRes, attRes] = await Promise.all([
        sb.from("absence_excuse_details")
          .select("request_id, absence_date, reason_type, course_section_id, section:course_sections(section_code, offering:course_offerings(course:courses(code, name_ar)))")
          .in("request_id", ids),
        sb.from("enrollment_suspension_details")
          .select("request_id, suspension_reason, suspension_duration_type, notes, academic_year:academic_years(name), semester:semesters(name)")
          .in("request_id", ids),
        sb.from("extra_chance_details")
          .select("request_id, chance_type, reason, notes, academic_year:academic_years(name), semester:semesters(name)")
          .in("request_id", ids),
        sb.from("transfer_request_details")
          .select("request_id, current_program_id, requested_program_id, current_department_id, requested_department_id, transfer_reason, notes, current_program:programs!transfer_request_details_current_program_id_fkey(name_ar), requested_program:programs!transfer_request_details_requested_program_id_fkey(name_ar), current_department:departments!transfer_request_details_current_department_id_fkey(name_ar), requested_department:departments!transfer_request_details_requested_department_id_fkey(name_ar)")
          .in("request_id", ids),
        sb.from("equivalency_request_details")
          .select("request_id, previous_university_name, previous_program_name, transfer_reference, notes")
          .in("request_id", ids),
        sb.from("equivalency_courses")
          .select("id, equivalency_request_id, external_course_code, external_course_name, external_credit_hours, status, reviewer_notes, target_course:courses(code, name_ar)")
          .in("equivalency_request_id", ids),
        sb.from("student_request_attachments")
          .select("id, request_id, file_url, file_name")
          .in("request_id", ids),
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
        attachments: attMap.get(r.id) ?? [],
      }));

    },
  });

  const filtered = useMemo(() => requests.filter((r) =>
    (!statusFilter || r.status === statusFilter)
    && (!typeFilter || r.request_type === typeFilter)
    && (!programFilter || r.student?.program_id === programFilter)
    && (!deptFilter || r.student?.department_id === deptFilter)
  ), [requests, statusFilter, typeFilter, programFilter, deptFilter]);

  const updateStatus = async (id: string, status: string, rejection_reason?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const patch: Record<string, unknown> = { status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() };
    if (status === "rejected") patch.rejection_reason = rejection_reason ?? null;
    const { error } = await sb.from("student_requests").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return false; }
    toast.success("تم تحديث الحالة");
    qc.invalidateQueries({ queryKey: ["admin-requests"] });
    if (selected?.id === id) setSelected({ ...selected, status, rejection_reason: patch.rejection_reason as string ?? null });
    return true;
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
        <div className="ms-auto text-xs text-muted-foreground self-end">
          {filtered.length} طلب
        </div>
      </div>

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
                        {r.suspension_details.academic_year?.name ?? "—"} • {r.suspension_details.semester?.name ?? "—"} • {DURATION_LABEL[r.suspension_details.suspension_duration_type] ?? r.suspension_details.suspension_duration_type}
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
  const open = async () => {
    const { data, error } = await supabase.storage.from("student-request-attachments").createSignedUrl(path, 300);
    if (error || !data) { toast.error("تعذر فتح المرفق"); return; }
    window.open(data.signedUrl, "_blank");
  };
  return (
    <button onClick={open} className="text-xs inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted">
      <Paperclip className="h-3 w-3" /> {name}
    </button>
  );
}

function DetailsModal({ req, onClose, onUpdateStatus }: {
  req: AdminReq; onClose: () => void;
  onUpdateStatus: (id: string, status: string, rejection_reason?: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState(req.rejection_reason ?? "");
  const [busy, setBusy] = useState(false);

  const act = async (status: string) => {
    if (status === "rejected" && !reason.trim()) { toast.error("أدخل سبب الرفض"); return; }
    setBusy(true);
    await onUpdateStatus(req.id, status, status === "rejected" ? reason.trim() : undefined);
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
              <Row label="المقرر" value={`${req.absence_details.section?.offering?.course?.code ?? "—"} — ${req.absence_details.section?.offering?.course?.name_ar ?? "—"} (شعبة ${req.absence_details.section?.section_code ?? "—"})`} />
              <Row label="تاريخ الغياب" value={req.absence_details.absence_date} />
              <Row label="نوع العذر" value={REASON_LABEL[req.absence_details.reason_type ?? "other"]} />
            </>
          )}
          {req.suspension_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.suspension_details.academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.suspension_details.semester?.name ?? "—"} />
              <Row label="مدة الوقف" value={DURATION_LABEL[req.suspension_details.suspension_duration_type] ?? req.suspension_details.suspension_duration_type} />
              <Row label="السبب" value={req.suspension_details.suspension_reason} />
              {req.suspension_details.notes && <Row label="ملاحظات" value={req.suspension_details.notes} />}
            </>
          )}
          {req.extra_chance_details && (
            <>
              <Row label="السنة الأكاديمية" value={req.extra_chance_details.academic_year?.name ?? "—"} />
              <Row label="الفصل" value={req.extra_chance_details.semester?.name ?? "—"} />
              <Row label="نوع الفرصة" value={CHANCE_LABEL[req.extra_chance_details.chance_type] ?? req.extra_chance_details.chance_type} />
              <Row label="السبب" value={req.extra_chance_details.reason} />
              {req.extra_chance_details.notes && <Row label="ملاحظات" value={req.extra_chance_details.notes} />}
            </>
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
        </div>

        {req.status !== "approved" && req.status !== "rejected" && req.status !== "cancelled" && (
          <div className="mt-4 border-t pt-3 space-y-2">
            <div className="text-[11px] font-bold text-muted-foreground">إجراء</div>
            {req.status === "submitted" && (
              <button disabled={busy} onClick={() => act("under_review")} className="w-full text-xs bg-amber-500 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
                <Clock className="h-3.5 w-3.5" /> بدء المراجعة
              </button>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button disabled={busy} onClick={() => act("approved")} className="text-xs bg-emerald-600 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
                <CheckCircle2 className="h-3.5 w-3.5" /> قبول
              </button>
              <button disabled={busy} onClick={() => act("rejected")} className="text-xs bg-rose-600 text-white inline-flex items-center justify-center gap-1 px-3 py-2 rounded hover:opacity-90">
                <XCircle className="h-3.5 w-3.5" /> رفض
              </button>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب الرفض (مطلوب عند الرفض)..."
              rows={2}
              className="w-full rounded border bg-background px-2 py-1.5 text-xs"
            />
          </div>
        )}

        {req.rejection_reason && (
          <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
            <b>سبب الرفض:</b> {req.rejection_reason}
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
