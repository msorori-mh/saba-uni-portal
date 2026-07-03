import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, FileText, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  getStudentServiceRequestDetails,
  getStudentRequestAttachmentSignedUrl,
  submitStudentServiceRequest,
} from "@/lib/student-affairs.functions";

export const Route = createFileRoute("/student/requests/$id")({
  component: StudentRequestDetailsPage,
});

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

function StudentRequestDetailsPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const detailsFn = useServerFn(getStudentServiceRequestDetails);
  const signedUrlFn = useServerFn(getStudentRequestAttachmentSignedUrl);
  const submitFn = useServerFn(submitStudentServiceRequest);
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-affairs", "details", id],
    queryFn: () => detailsFn({ data: { requestId: id } }),
  });

  const openAttachment = async (path: string) => {
    const res = await signedUrlFn({ data: { path } });
    window.open(res.signedUrl, "_blank", "noopener,noreferrer");
  };

  const resubmit = async () => {
    try {
      await submitFn({ data: { requestId: id } });
      toast.success("تمت إعادة الإرسال", { description: "انتقل الطلب إلى: مُرسَل — بانتظار المراجعة." });
      qc.invalidateQueries({ queryKey: ["student-affairs", "details", id] });
    } catch (e) {
      toast.error("تعذر إعادة الإرسال", { description: (e as Error).message });
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
          <button onClick={resubmit} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Send className="h-4 w-4" /> إعادة إرسال بعد الاستكمال
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

      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="font-bold text-primary">{request.title}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{request.student_notes ?? request.description ?? "—"}</p>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-card">
        <h2 className="mb-3 font-bold text-primary">مراحل الطلب</h2>
        <ol className="space-y-2">
          {data.steps.map((step: any) => (
            <li key={step.id} className="rounded-lg border border-border bg-background p-3 text-sm">
              <div className="font-bold">{step.step_index + 1}. {step.step_title_ar}</div>
              <div className="mt-1 text-xs text-muted-foreground">الدور: {step.role_key} — الحالة: {step.status}</div>
              {step.notes && <div className="mt-1 text-xs">{step.notes}</div>}
            </li>
          ))}
        </ol>
      </section>

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
