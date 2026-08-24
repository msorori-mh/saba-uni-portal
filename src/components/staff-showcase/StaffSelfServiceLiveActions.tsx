import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  FileUp,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  decideStaffServiceRequest,
  listAccessibleStaffServiceRequests,
  submitStaffServiceRequest,
  uploadStaffServiceAttachment,
  type StaffServiceRequestSummary,
} from "@/lib/staff-self-service-live";
import type { StaffServiceType } from "@/lib/staff-self-service-contracts";

export const STAFF_SELF_SERVICE_LIVE_UI_MARKER =
  "PORTAL_STAFF_SELF_SERVICE_LIVE_UI_BINDING_02C";

const SERVICE_OPTIONS: readonly { value: StaffServiceType; label: string }[] = [
  { value: "leave", label: "إجازة" },
  { value: "permission", label: "مغادرة" },
  { value: "custody_transfer", label: "نقل عهدة" },
  { value: "custody_return", label: "إرجاع عهدة" },
  { value: "employment_certificate", label: "إفادة وظيفية" },
  { value: "experience_certificate", label: "شهادة خبرة" },
  { value: "overtime", label: "عمل إضافي" },
  { value: "training", label: "تدريب وتطوير" },
  { value: "promotion_adjustment", label: "ترقية أو تسوية" },
  { value: "clearance", label: "إخلاء طرف" },
];

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  submitted: "مرسل",
  in_review: "قيد الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inclusiveDays(startsOn: string, endsOn: string) {
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  const end = Date.parse(`${endsOn}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("تحقق من تاريخ بداية الطلب ونهايته.");
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}

function serviceLabel(serviceType: string) {
  return SERVICE_OPTIONS.find((item) => item.value === serviceType)?.label ?? serviceType;
}

export function StaffSelfServiceLiveActions({
  variant,
}: {
  variant: "employee" | "approver";
}) {
  const requests = useQuery({
    queryKey: ["staff-self-service-live", variant],
    queryFn: listAccessibleStaffServiceRequests,
    staleTime: 15_000,
  });

  return (
    <section
      className="mb-5 space-y-4 rounded-xl border-2 border-emerald-300 bg-emerald-50/60 p-4 shadow-card print:hidden"
      data-testid={`staff-self-service-live-${variant}`}
      data-runtime-marker={STAFF_SELF_SERVICE_LIVE_UI_MARKER}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-900">
            <ShieldCheck className="h-5 w-5" />
            الطلبات والخدمات
          </div>
          <p className="mt-1 text-xs text-emerald-800">
            قدّم طلباتك وتابعها وفق الصلاحيات ومسار الاعتماد المعتمد.
          </p>
        </div>
        <button
          type="button"
          onClick={() => requests.refetch()}
          disabled={requests.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-bold text-emerald-900 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${requests.isFetching ? "animate-spin" : ""}`} />
          تحديث
        </button>
      </div>

      {variant === "employee" ? (
        <EmployeeSubmission onChanged={() => requests.refetch()} />
      ) : (
        <ApprovalQueue
          requests={requests.data ?? []}
          loading={requests.isLoading}
          onChanged={() => requests.refetch()}
        />
      )}

      {variant === "employee" && (
        <RequestList
          requests={requests.data ?? []}
          loading={requests.isLoading}
          error={requests.error}
        />
      )}
    </section>
  );
}

function EmployeeSubmission({ onChanged }: { onChanged: () => Promise<unknown> }) {
  const [serviceType, setServiceType] = useState<StaffServiceType>("leave");
  const [startsOn, setStartsOn] = useState(todayIso);
  const [endsOn, setEndsOn] = useState(todayIso);
  const [startsAt, setStartsAt] = useState("08:00");
  const [endsAt, setEndsAt] = useState("09:00");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const isLeave = serviceType === "leave";
  const isTimed = serviceType === "permission" || serviceType === "overtime";

  const buildPayload = () => {
    if (isLeave) {
      return {
        leaveType: "annual",
        startsOn,
        endsOn,
        durationDays: inclusiveDays(startsOn, endsOn),
        note: note.trim() || null,
      };
    }
    if (isTimed) {
      return serviceType === "permission"
        ? { permissionDate: startsOn, startsAt, endsAt, reason: note.trim() }
        : { workDate: startsOn, startsAt, endsAt, reason: note.trim() };
    }
    return { note: note.trim() || null };
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if ((isTimed || serviceType !== "leave") && note.trim().length < 3) {
        throw new Error("يرجى إدخال تفاصيل الطلب بوضوح.");
      }
      const created = await submitStaffServiceRequest({
        serviceType,
        payload: buildPayload(),
      });
      if (file) {
        await uploadStaffServiceAttachment({ requestId: created.id, file });
      }
      setFile(null);
      setNote("");
      setMessage({
        tone: "ok",
        text: `تم إرسال الطلب ${created.request_no}${file ? " ورفع المرفق للفحص" : ""}.`,
      });
      await onChanged();
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "تعذر إرسال الطلب.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-extrabold text-primary">تقديم طلب جديد</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <LiveField label="الخدمة">
          <select
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value as StaffServiceType)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {SERVICE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </LiveField>
        <LiveField label={isLeave ? "من تاريخ" : "التاريخ"}>
          <input type="date" required value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </LiveField>
        {isLeave && (
          <LiveField label="إلى تاريخ">
            <input type="date" required min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
          </LiveField>
        )}
        {isTimed && (
          <>
            <LiveField label="من الساعة">
              <input type="time" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </LiveField>
            <LiveField label="إلى الساعة">
              <input type="time" required value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </LiveField>
          </>
        )}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,auto]">
        <LiveField label="التفاصيل أو السبب">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" maxLength={2000} />
        </LiveField>
        <LiveField label="مرفق اختياري">
          <label className="flex min-h-20 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gold bg-gold/5 px-4 text-xs font-bold text-primary">
            <FileUp className="h-4 w-4 text-gold" />
            <span>{file?.name ?? "PDF / JPG / PNG — 10MB"}</span>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </LiveField>
      </div>
      {message && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-bold ${message.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {message.text}
        </div>
      )}
      <button type="submit" disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        إرسال للاعتماد
      </button>
    </form>
  );
}

function ApprovalQueue({ requests, loading, onChanged }: { requests: StaffServiceRequestSummary[]; loading: boolean; onChanged: () => Promise<unknown> }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queue = requests.filter((request) => request.status === "submitted" || request.status === "in_review");

  const decide = async (request: StaffServiceRequestSummary, decision: "approved" | "rejected") => {
    setBusy(`${request.id}:${decision}`);
    setError(null);
    try {
      await decideStaffServiceRequest({
        requestId: request.id,
        decision,
        reason: reasons[request.id]?.trim() || null,
      });
      await onChanged();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل القرار.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Loading />;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-extrabold text-primary">صندوق الاعتمادات ضمن نطاق صلاحيتك</h3>
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">{error}</div>}
      {queue.length === 0 ? (
        <div className="mt-3 rounded-lg bg-secondary p-4 text-center text-xs text-muted-foreground">لا توجد طلبات بانتظار قرارك.</div>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          {queue.map((request) => (
            <article key={request.id} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="font-bold text-primary">{serviceLabel(request.service_type)}</div>
                <span className="font-mono text-[10px] text-muted-foreground">{request.request_no}</span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" />{STATUS_LABELS[request.status]}</div>
              <textarea
                value={reasons[request.id] ?? ""}
                onChange={(event) => setReasons((current) => ({ ...current, [request.id]: event.target.value }))}
                placeholder="ملاحظة القرار — إلزامية عند الرفض"
                maxLength={2000}
                className="mt-3 min-h-16 w-full rounded-lg border border-border px-3 py-2 text-xs"
              />
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(request, "approved")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {busy === `${request.id}:approved` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} اعتماد
                </button>
                <button type="button" disabled={Boolean(busy)} onClick={() => decide(request, "rejected")} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
                  {busy === `${request.id}:rejected` ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} رفض
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestList({ requests, loading, error }: { requests: StaffServiceRequestSummary[]; loading: boolean; error: unknown }) {
  if (loading) return <Loading />;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">تعذر تحميل الطلبات المصرح بها.</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-secondary"><tr>{["الطلب", "الخدمة", "الحالة", "آخر تحديث"].map((heading) => <th key={heading} className="px-3 py-2 text-right text-xs">{heading}</th>)}</tr></thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id} className="border-t border-border">
              <td className="px-3 py-3 font-mono text-xs font-bold text-primary">{request.request_no}</td>
              <td className="px-3 py-3 text-xs">{serviceLabel(request.service_type)}</td>
              <td className="px-3 py-3 text-xs">{STATUS_LABELS[request.status]}</td>
              <td className="px-3 py-3 text-xs">{new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium" }).format(new Date(request.updated_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {requests.length === 0 && <div className="p-5 text-center text-xs text-muted-foreground">لم تُرسل طلبات بعد.</div>}
    </div>
  );
}

function Loading() {
  return <div className="grid min-h-24 place-items-center rounded-xl border border-border bg-card"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
}

function LiveField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-primary">{label}</span>{children}</label>;
}
