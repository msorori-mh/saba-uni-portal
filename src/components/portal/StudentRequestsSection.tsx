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
const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  draft:        { text: "مسودة",       cls: "bg-muted text-foreground" },
  submitted:    { text: "مُرسَل",       cls: "bg-blue-100 text-blue-800" },
  under_review: { text: "قيد المراجعة", cls: "bg-amber-100 text-amber-800" },
  approved:     { text: "مقبول",       cls: "bg-emerald-100 text-emerald-800" },
  rejected:     { text: "مرفوض",       cls: "bg-rose-100 text-rose-800" },
  cancelled:    { text: "ملغي",        cls: "bg-zinc-200 text-zinc-800" },
};

type Enrollment = { id: string; course_section_id: string; section_code: string; course_code: string; course_name: string };

type RequestRow = {
  id: string; title: string; description: string | null; status: string;
  submitted_at: string | null; rejection_reason: string | null; created_at: string;
  details: { absence_date: string; reason_type: string; course_section_id: string } | null;
  attachments: { id: string; file_name: string; file_url: string }[];
};

export function StudentRequestsSection({ studentProfileId }: { studentProfileId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

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
  const absenceActive = requestTypes.find((t) => t.code === "absence_excuse")?.is_active ?? false;



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
        .select("id, title, description, status, submitted_at, rejection_reason, created_at")
        .eq("student_profile_id", studentProfileId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (reqs ?? []).map((r: { id: string }) => r.id);
      if (ids.length === 0) return [];
      const [detRes, attRes] = await Promise.all([
        sb.from("absence_excuse_details").select("request_id, absence_date, reason_type, course_section_id").in("request_id", ids),
        sb.from("student_request_attachments").select("id, request_id, file_name, file_url").in("request_id", ids),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detMap = new Map((detRes.data ?? []).map((d: any) => [d.request_id, d]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attMap = new Map<string, any[]>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of (attRes.data ?? []) as any[]) {
        if (!attMap.has(a.request_id)) attMap.set(a.request_id, []);
        attMap.get(a.request_id)!.push(a);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (reqs as any[]).map((r) => ({ ...r, details: detMap.get(r.id) ?? null, attachments: attMap.get(r.id) ?? [] }));
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

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-display text-base font-bold text-primary flex items-center gap-2">
          <FileWarning className="h-4 w-4 text-gold" /> الطلبات الطلابية
        </h2>
      </div>

      {/* Available request types catalog */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {requestTypes.map((t) => (
          <div key={t.id} className={`rounded-lg border bg-card p-2.5 flex items-center justify-between gap-2 ${!t.is_active ? "opacity-70" : ""}`}>
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary truncate">{t.name_ar}</div>
              {t.description_ar && <div className="text-[11px] text-muted-foreground truncate">{t.description_ar}</div>}
            </div>
            {t.is_active && t.code === "absence_excuse" ? (
              <button
                onClick={() => setOpen(true)}
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
        ))}
        {!absenceActive && requestTypes.length > 0 && (
          <div className="text-[11px] text-muted-foreground col-span-full">خدمة "غياب بعذر" غير مفعلة حالياً.</div>
        )}
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
            const enr = enrollments.find((e) => e.course_section_id === r.details?.course_section_id);
            return (
              <div key={r.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm">{r.title}</div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${st.cls}`}>{st.text}</span>
                </div>
                {r.details && (
                  <div className="mt-1 text-[11px] text-muted-foreground flex flex-wrap gap-2">
                    <span>التاريخ: <b>{r.details.absence_date}</b></span>
                    <span>• النوع: <b>{REASON_LABEL[r.details.reason_type] ?? r.details.reason_type}</b></span>
                    {enr && <span>• المقرر: <b>{enr.course_code} ({enr.section_code})</b></span>}
                  </div>
                )}
                {r.description && <div className="mt-1.5 text-xs">{r.description}</div>}
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

      {open && (
        <NewRequestModal
          studentProfileId={studentProfileId}
          enrollments={enrollments}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); refresh(); }}
        />
      )}
    </div>
  );
}

function AttachmentLink({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string>("");
  const load = async () => {
    const { data } = await supabase.storage.from("student-request-attachments").createSignedUrl(path, 300);
    if (data?.signedUrl) {
      setUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank");
    }
  };
  return (
    <button onClick={load} className="text-[11px] inline-flex items-center gap-1 border bg-muted/30 px-2 py-1 rounded hover:bg-muted">
      <Paperclip className="h-3 w-3" /> {name}
      {url && <span className="sr-only">{url}</span>}
    </button>
  );
}

function NewRequestModal({
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

      if (file) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${created.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage.from("student-request-attachments").upload(path, file);
        if (upErr) throw upErr;
        const { error: attErr } = await sb.from("student_request_attachments").insert({
          request_id: created.id, file_url: path, file_name: file.name, file_type: file.type, uploaded_by: user.id,
        });
        if (attErr) throw attErr;
      }
      toast.success(submit ? "تم إرسال الطلب" : "تم الحفظ كمسودة");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "حدث خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3">
      <div className="bg-card rounded-xl border shadow-2xl w-full max-w-md p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-bold text-primary">طلب غياب بعذر</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {enrollments.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center border border-dashed rounded">
            لا توجد مقررات مسجلة. تواصل مع شؤون الطلاب.
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">المقرر / الشعبة</label>
              <select value={sectionId} onChange={(e) => setSectionId(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
                {enrollments.map((e) => (
                  <option key={e.course_section_id} value={e.course_section_id}>
                    {e.course_code} — {e.course_name} (شعبة {e.section_code})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">تاريخ الغياب</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm" />
              </div>
              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">نوع العذر</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full h-9 rounded border bg-background px-2 text-sm">
                  {Object.entries(REASON_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">السبب التفصيلي</label>
              <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="اكتب تفاصيل العذر..." />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground block mb-1">مرفق (اختياري)</label>
              <label className="flex items-center gap-2 border border-dashed rounded p-2 cursor-pointer hover:bg-muted/30 text-xs">
                <Upload className="h-3.5 w-3.5" />
                <span>{file ? file.name : "اختر ملفاً..."}</span>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="hidden" />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button disabled={busy} onClick={() => save(false)} className="text-xs border px-3 py-1.5 rounded hover:bg-muted">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "حفظ كمسودة"}
              </button>
              <button disabled={busy} onClick={() => save(true)} className="text-xs bg-primary text-primary-foreground inline-flex items-center gap-1 px-3 py-1.5 rounded hover:opacity-90">
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Send className="h-3 w-3" /> إرسال</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
