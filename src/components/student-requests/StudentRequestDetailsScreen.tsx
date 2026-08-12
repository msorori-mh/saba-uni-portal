import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, Clock, Download, FileText, Loader2, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import {
  getStudentServiceRequestDetails,
  getStudentRequestAttachmentSignedUrl,
  submitStudentServiceRequest,
} from "@/lib/student-affairs.functions";
import {
  getStudentRequestFeeSummaryForStudent,
  getStudentRequestIssuedDocuments,
  getStudentRequestWorkflowTimelineForStudent,
  type StudentFeeSummary,
  type StudentWorkflowTimelineStep,
} from "@/lib/student-requests/student-tracking.functions";
import { getEnrollmentCertificateDocumentSignedUrl } from "@/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions";


const STEP_STATUS_META: Record<
  StudentWorkflowTimelineStep["status"],
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  completed: { label: "مكتملة", className: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  current: { label: "الحالية", className: "text-primary bg-primary/10 border-primary/30", icon: Clock },
  upcoming: { label: "قادمة", className: "text-muted-foreground bg-muted/40 border-border", icon: Circle },
  skipped: { label: "متجاوَزة", className: "text-muted-foreground bg-muted/30 border-border", icon: Circle },
  returned: { label: "مُعادة", className: "text-orange-800 bg-orange-50 border-orange-200", icon: AlertCircle },
  cancelled: { label: "ملغاة", className: "text-rose-700 bg-rose-50 border-rose-200", icon: Circle },
};

function formatAmount(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("ar-EG")} ${currency === "YER" ? "ريال يمني" : currency}`;
}

function FeeStatusSection({ fee }: { fee: StudentFeeSummary }) {
  if (fee.status === "no_assessment") {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-primary">
          <Wallet className="h-4 w-4 text-gold" /> حالة الرسوم
        </h2>
        <div className="text-sm text-muted-foreground">لم يتم تقييم رسوم لهذا الطلب بعد.</div>
      </section>
    );
  }

  if (fee.status === "not_required") {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-emerald-800">
          <Wallet className="h-4 w-4" /> حالة الرسوم
        </h2>
        <div className="text-sm font-semibold text-emerald-800">لا توجد رسوم مطلوبة لهذا الطلب.</div>
      </section>
    );
  }

  if (fee.isConfirmed) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-card">
        <h2 className="mb-2 flex items-center gap-2 font-bold text-emerald-800">
          <Wallet className="h-4 w-4" /> حالة الرسوم
        </h2>
        <div className="space-y-1 text-sm text-emerald-900">
          <div>المبلغ: <span className="font-bold">{formatAmount(fee.amount, fee.currency)}</span></div>
          <div className="font-semibold">تم تأكيد السداد.</div>
          {fee.paymentConfirmedAt && (
            <div className="text-xs text-emerald-800/80">
              بتاريخ: {new Date(fee.paymentConfirmedAt).toLocaleString("ar-EG")}
            </div>
          )}
        </div>
      </section>
    );
  }

  // requiresPayment: amount > 0 pending — the prominent alert.
  return (
    <section
      role="alert"
      className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 shadow-card"
    >
      <h2 className="mb-2 flex items-center gap-2 font-display font-extrabold text-orange-900">
        <Wallet className="h-5 w-5" /> مطلوب سداد رسوم الطلب
      </h2>
      <div className="space-y-1 text-sm text-orange-900">
        <div>
          مطلوب سداد مبلغ <span className="font-extrabold">{formatAmount(fee.amount, fee.currency)}</span> خارج البوابة.
        </div>
        <div className="text-xs text-orange-800/90">
          بعد السداد سيقوم موظف المالية بتأكيد الاستلام وسينتقل طلبك تلقائياً إلى الخطوة التالية.
        </div>
      </div>
    </section>
  );
}

function WorkflowTimelineSection({ steps }: { steps: StudentWorkflowTimelineStep[] }) {
  if (steps.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-bold text-primary">مسار الطلب</h2>
        <div className="text-sm text-muted-foreground">لم يبدأ مسار الطلب بعد.</div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-3 font-bold text-primary">مسار الطلب</h2>
      <ol className="space-y-2" data-testid="student-workflow-timeline">
        {steps.map((step) => {
          const meta = STEP_STATUS_META[step.status];
          const Icon = meta.icon;
          return (
            <li
              key={`${step.stepOrder}-${step.stepKey}`}
              className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${meta.className}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-bold">
                    {step.stepOrder}. {step.stepNameAr}
                  </div>
                  <div className="text-[11px] font-bold">{meta.label}</div>
                </div>
                <div className="mt-1 space-y-0.5 text-[11px] opacity-80">
                  {step.enteredAt && (
                    <div>بدأت: {new Date(step.enteredAt).toLocaleString("ar-EG")}</div>
                  )}
                  {step.completedAt && (
                    <div>انتهت: {new Date(step.completedAt).toLocaleString("ar-EG")}</div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}



const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  status_certificate: "شهادة حالة",
  official_transcript: "كشف درجات رسمي",
  financial_receipt: "إيصال مالي",
};

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  issued: "صادرة",
  archived: "مؤرشفة",
  cancelled: "ملغاة",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  submitted: "مُرسل",
  in_review: "قيد المراجعة",
  under_review: "قيد المراجعة",
  returned_for_completion: "عاد للاستكمال",
  returned: "عاد للاستكمال",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
  completed: "مكتمل",
};

export function StudentRequestDetailsScreen({ id }: { id: string }) {
  const qc = useQueryClient();
  const detailsFn = useServerFn(getStudentServiceRequestDetails);
  const signedUrlFn = useServerFn(getStudentRequestAttachmentSignedUrl);
  const submitFn = useServerFn(submitStudentServiceRequest);
  const timelineFn = useServerFn(getStudentRequestWorkflowTimelineForStudent);
  const feeFn = useServerFn(getStudentRequestFeeSummaryForStudent);
  const documentsFn = useServerFn(getStudentRequestIssuedDocuments);
  const documentUrlFn = useServerFn(getEnrollmentCertificateDocumentSignedUrl);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const resubmitInFlightRef = useRef(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-affairs", "details", id],
    queryFn: () => detailsFn({ data: { requestId: id } }),
  });
  const { data: timeline = [] } = useQuery({
    queryKey: ["student-affairs", "timeline", id],
    queryFn: () => timelineFn({ data: { requestId: id } }),
    enabled: !!data,
  });
  const { data: fee } = useQuery({
    queryKey: ["student-affairs", "fee", id],
    queryFn: () => feeFn({ data: { requestId: id } }),
    enabled: !!data,
  });
  const { data: issuedDocuments = [] } = useQuery({
    queryKey: ["student-affairs", "documents", id],
    queryFn: () => documentsFn({ data: { requestId: id } }),
    enabled: !!data,
  });

  const downloadDocument = async (documentId: string) => {
    if (downloadingDocId) return;
    setDownloadingDocId(documentId);
    try {
      const res = await documentUrlFn({ data: { officialDocumentId: documentId } });
      window.open(res.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error("تعذر تنزيل الوثيقة", { description: (e as Error).message });
    } finally {
      setDownloadingDocId(null);
    }
  };

  const openAttachment = async (path: string) => {
    const res = await signedUrlFn({ data: { path } });
    window.open(res.signedUrl, "_blank", "noopener,noreferrer");
  };

  const resubmit = async () => {
    if (resubmitInFlightRef.current || resubmitting) return;
    resubmitInFlightRef.current = true;
    setResubmitting(true);
    try {
      await submitFn({ data: { requestId: id } });
      toast.success("تمت إعادة الإرسال", { description: "انتقل الطلب إلى: مُرسَل — بانتظار المراجعة." });
      qc.invalidateQueries({ queryKey: ["student-affairs", "details", id] });
    } catch (e) {
      toast.error("تعذر إعادة الإرسال", { description: (e as Error).message });
    } finally {
      resubmitInFlightRef.current = false;
      setResubmitting(false);
    }
  };

  if (isLoading) {
    return <div className="grid place-items-center p-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (error || !data) {
    return <div className="rounded border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{(error as Error)?.message ?? "تعذر تحميل الطلب"}</div>;
  }

  const request: any = data.request;
  const canResubmit = request.status === "returned_for_completion" || request.status === "returned";

  // PILOT-MEDIUM-FIX-01 (F-07): surface the latest "return for completion"
  // reason at the top of the page so the student can act without hunting
  // through the timeline.
  const lastReturnEvent = [...(data.events ?? [])]
    .reverse()
    .find((event: any) => {
      const type = String(event.event_type ?? "").toLowerCase();
      return type.includes("return") || type.includes("استكمال") || type === "returned_for_completion";
    });
  const lastReturnReason: string | null = lastReturnEvent?.notes ?? null;
  const showReturnBanner = canResubmit;

  // Detail-page status banners (not creation-time eligibility) —
  // STUDENT-REQUEST-DETAIL-ELIGIBILITY-BANNER-UX-FIX-01.
  const isRejected = request.status === "rejected";
  const isCancelled = request.status === "cancelled";
  const findEventReason = (needle: string): { reason: string | null; at: string | null } => {
    const evt = [...(data.events ?? [])].reverse().find((e: any) =>
      String(e.event_type ?? "").toLowerCase().includes(needle),
    );
    return { reason: evt?.notes ?? null, at: evt?.created_at ?? null };
  };
  const rejectionInfo = isRejected ? findEventReason("reject") : { reason: null, at: null };
  const cancellationInfo = isCancelled ? findEventReason("cancel") : { reason: null, at: null };

  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-primary flex items-center gap-2">
            <FileText className="h-6 w-6 text-gold" /> تفاصيل الطلب
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {request.request_number ?? request.id} — {STATUS_LABEL[request.status] ?? request.status}
          </p>
        </div>
        {canResubmit && (
          <button
            type="button"
            disabled={resubmitting}
            onClick={resubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إعادة إرسال بعد الاستكمال
          </button>
        )}
      </header>

      {showReturnBanner && (
        <div
          role="alert"
          className="rounded-xl border-2 border-orange-300 bg-orange-50 p-4 shadow-card"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-orange-600" />
            <div className="flex-1 space-y-1.5">
              <div className="font-display text-base font-extrabold text-orange-900">
                طلبك أُعيد إليك للاستكمال
              </div>
              <div className="text-sm text-orange-900/90">
                {lastReturnReason
                  ? <>سبب الإرجاع: <span className="font-bold">{lastReturnReason}</span></>
                  : "يرجى مراجعة سجل الحركة أدناه للاطلاع على تفاصيل الإرجاع، ثم إكمال المطلوب وإعادة الإرسال."}
              </div>
              {lastReturnEvent?.created_at && (
                <div className="text-xs text-orange-800/80">
                  بتاريخ: {new Date(lastReturnEvent.created_at).toLocaleString("ar-EG")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isRejected && (
        <div
          role="alert"
          data-testid="student-request-rejected-banner"
          className="rounded-xl border-2 border-rose-300 bg-rose-50 p-4 shadow-card"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-rose-600" />
            <div className="flex-1 space-y-1.5">
              <div className="font-display text-base font-extrabold text-rose-900">
                تم رفض هذا الطلب
              </div>
              <div className="text-sm text-rose-900/90">
                {rejectionInfo.reason
                  ? <>سبب الرفض: <span className="font-bold">{rejectionInfo.reason}</span></>
                  : "يرجى مراجعة سجل الحركة أدناه للاطلاع على تفاصيل الرفض."}
              </div>
              {rejectionInfo.at && (
                <div className="text-xs text-rose-800/80">
                  بتاريخ: {new Date(rejectionInfo.at).toLocaleString("ar-EG")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isCancelled && (
        <div
          role="alert"
          data-testid="student-request-cancelled-banner"
          className="rounded-xl border border-zinc-300 bg-zinc-100 p-4 shadow-card"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-zinc-600" />
            <div className="flex-1 space-y-1.5">
              <div className="font-display text-base font-extrabold text-zinc-900">
                تم إلغاء هذا الطلب
              </div>
              {cancellationInfo.reason && (
                <div className="text-sm text-zinc-800">
                  سبب الإلغاء: <span className="font-bold">{cancellationInfo.reason}</span>
                </div>
              )}
              {cancellationInfo.at && (
                <div className="text-xs text-zinc-700/80">
                  بتاريخ: {new Date(cancellationInfo.at).toLocaleString("ar-EG")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="font-bold text-primary">{request.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.student_notes ?? request.description ?? "—"}</p>
      </section>

      {fee && <FeeStatusSection fee={fee} />}

      <WorkflowTimelineSection steps={timeline} />

      {issuedDocuments.length > 0 && (
        <section
          data-testid="student-request-issued-documents"
          className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-card"
        >
          <h2 className="mb-3 flex items-center gap-2 font-bold text-emerald-900">
            <FileText className="h-4 w-4" /> الوثيقة الصادرة
          </h2>
          <div className="space-y-2">
            {issuedDocuments.map((doc) => (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-background p-3"
              >
                <div className="min-w-0 text-sm">
                  <div className="font-bold text-primary">
                    {DOCUMENT_TYPE_LABEL[doc.documentType] ?? doc.documentType}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">{doc.documentNumber}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}
                    {doc.issuedAt && <> — {new Date(doc.issuedAt).toLocaleString("ar-EG")}</>}
                  </div>
                </div>
                {doc.isDownloadable ? (
                  <button
                    type="button"
                    onClick={() => downloadDocument(doc.id)}
                    disabled={downloadingDocId === doc.id}
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
                  >
                    {downloadingDocId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    تحميل الوثيقة
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    الوثيقة غير متاحة للتنزيل في حالتها الحالية.
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}


      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-bold text-primary">سجل الحركة</h2>
        <div className="space-y-2">
          {data.events.length === 0 ? (
            <div className="text-sm text-muted-foreground">لا توجد أحداث بعد.</div>
          ) : data.events.map((event: any) => (
            <div key={event.id} className="rounded-lg border border-border bg-background p-3 text-xs">
              <div className="font-bold">{event.event_type}</div>
              <div className="text-muted-foreground">{new Date(event.created_at).toLocaleString("ar-EG")}</div>
              {event.notes && <div className="mt-1">{event.notes}</div>}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-bold text-primary">المرفقات</h2>
        {data.attachments.length === 0 ? (
          <div className="text-sm text-muted-foreground">لا توجد مرفقات.</div>
        ) : (
          <div className="space-y-2">
            {data.attachments.map((attachment: any) => (
              <button key={attachment.id} onClick={() => openAttachment(attachment.file_url)}
                className="block rounded border border-border px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">
                {attachment.file_name}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
