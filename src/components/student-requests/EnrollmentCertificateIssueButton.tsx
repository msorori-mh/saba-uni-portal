import { useState } from "react";
import { FileCheck2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { executeEnrollmentCertificatePdfStorageSaga } from "@/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions";

/** Blocked pilot request — must never be triggerable from UI. */
const BLOCKED_TRIAL_REQUEST_ID = "93807768-a281-42de-bfb4-0c0c03786b20";

export type EnrollmentCertificateIssueButtonProps = {
  requestId: string;
  requestTypeCode: string;
  currentStep: {
    id: string | null;
    stepKey: string | null;
    status: "current" | "completed" | "upcoming" | "skipped" | null;
    isPreview?: boolean;
  } | null;
  hasActiveOfficialDocument: boolean;
  canActOnIssueDocument: boolean;
};

/** Deterministic idempotency key — same click flow yields the same key. */
export function buildEnrollmentCertificateIdempotencyKey(
  requestId: string,
  stepId: string,
): string {
  return `enrollment-certificate:${requestId}:${stepId}:v1`;
}

export function shouldShowEnrollmentCertificateIssueButton(
  props: EnrollmentCertificateIssueButtonProps,
): boolean {
  if (props.requestId === BLOCKED_TRIAL_REQUEST_ID) return false;
  if (props.requestTypeCode !== "enrollment_certificate") return false;
  if (props.hasActiveOfficialDocument) return false;
  if (!props.canActOnIssueDocument) return false;
  const step = props.currentStep;
  if (!step) return false;
  if (step.isPreview) return false;
  if (step.stepKey !== "document_issuance") return false;
  if (step.status !== "current") return false;
  if (!step.id) return false;
  return true;
}

export function EnrollmentCertificateIssueButton(
  props: EnrollmentCertificateIssueButtonProps,
) {
  const runSaga = useServerFn(executeEnrollmentCertificatePdfStorageSaga);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  if (!shouldShowEnrollmentCertificateIssueButton(props)) return null;
  const stepId = props.currentStep!.id!;
  const idempotencyKey = buildEnrollmentCertificateIdempotencyKey(
    props.requestId,
    stepId,
  );

  const handleClick = async () => {
    if (pending) return;
    const ok = window.confirm(
      "سيتم توليد وإصدار شهادة القيد بصيغة PDF ورفعها للأرشيف الرسمي. متابعة؟",
    );
    if (!ok) return;
    setPending(true);
    try {
      const result = await runSaga({
        data: {
          stepId,
          requestId: props.requestId,
          idempotencyKey,
        },
      });
      if (result.status === "finalized") {
        const num = result.documentNumber ? ` — رقم الوثيقة: ${result.documentNumber}` : "";
        toast.success(`تم إصدار شهادة القيد بنجاح${num}`);
      } else {
        toast.success("تمت معالجة إصدار شهادة القيد");
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-request-detail", props.requestId] }),
        queryClient.invalidateQueries({ queryKey: ["request-document-archive", props.requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر إصدار شهادة القيد";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="text-xs font-bold text-primary flex items-center gap-2">
        <FileCheck2 className="h-4 w-4" /> إصدار شهادة القيد
      </div>
      <p className="text-[11px] text-muted-foreground">
        سيتم توليد ملف PDF من بيانات الطلب الرسمية ورفعه للأرشيف. لا يمكن التراجع بعد الإصدار.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck2 className="h-3.5 w-3.5" />}
        توليد وإصدار شهادة القيد PDF
      </button>
    </div>
  );
}
