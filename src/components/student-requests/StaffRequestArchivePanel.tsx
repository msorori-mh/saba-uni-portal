import { useRef, useState } from "react";
import { AlertCircle, Archive, Download, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  executeStudentRequestArchiveAction,
  listStudentRequestOfficialDocuments,
} from "@/lib/student-requests/staff-inbox.functions";
import { getEnrollmentCertificateDocumentSignedUrl } from "@/lib/student-requests/enrollment-certificate-pdf-storage-saga.functions";

/**
 * Reusable panel for workflow steps whose config.action_type = 'archive'.
 * Terminal step — RPC `act_on_student_request_step` (p_action='archive')
 * drives the transition; the panel never hard-codes the next step key.
 *
 * The panel NEVER creates official_documents / PDFs. It only reads the
 * documents already issued by document_issuance and offers preview /
 * download via the authorized signed-url helper (which itself checks
 * can_current_user_act_on_step for the archive actor).
 */
const DOCUMENT_TYPE_LABEL: Record<string, string> = {
  enrollment_certificate: "شهادة قيد",
  student_status_certificate: "إفادة بالحالة الدراسية",
  official_transcript: "السجل الأكاديمي الرسمي",
  financial_receipt: "سند مالي رسمي",
};

const DOCUMENT_STATUS_LABEL: Record<string, string> = {
  issued: "صادرة",
  cancelled: "ملغاة",
  draft: "مسودة",
};

export const ARCHIVE_BUTTON_LABEL_AR = "أرشفة الطلب وإغلاق المعاملة";

function DocumentRow({
  requestId,
  doc,
}: {
  requestId: string;
  doc: {
    id: string;
    documentNumber: string;
    documentType: string;
    status: string;
    issuedAt: string | null;
    hasPdf: boolean;
    verificationCode: string | null;
  };
}) {
  const signedUrlFn = useServerFn(getEnrollmentCertificateDocumentSignedUrl);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy || !doc.hasPdf) return;
    setBusy(true);
    try {
      const { signedUrl } = await signedUrlFn({ data: { officialDocumentId: doc.id } });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error((e as Error).message || "تعذر فتح الملف");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="archive-panel-document-row"
      data-request-id={requestId}
      className="rounded-lg border bg-muted/10 p-3 space-y-1.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="font-bold text-primary flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" />
          {DOCUMENT_TYPE_LABEL[doc.documentType] ?? doc.documentType}
        </div>
        <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold bg-secondary text-secondary-foreground">
          {DOCUMENT_STATUS_LABEL[doc.status] ?? doc.status}
        </span>
      </div>
      <div className="font-mono text-[11px]" data-testid="archive-panel-document-number">
        رقم الوثيقة: {doc.documentNumber}
      </div>
      {doc.issuedAt && (
        <div className="text-muted-foreground">
          تاريخ الإصدار: {new Date(doc.issuedAt).toLocaleString("ar-EG")}
        </div>
      )}
      {doc.verificationCode && (
        <div className="text-muted-foreground font-mono text-[10px] break-all">
          رمز التحقق: {doc.verificationCode}
        </div>
      )}
      <div className="pt-1">
        {doc.status === "cancelled" ? (
          <div
            data-testid="archive-panel-document-cancelled-notice"
            className="text-[11px] font-bold text-destructive"
          >
            الوثيقة ملغاة وغير صالحة للاستخدام
          </div>
        ) : doc.status !== "issued" && doc.status !== "archived" ? (
          <div
            data-testid="archive-panel-document-unavailable-notice"
            className="text-[11px] font-bold text-muted-foreground"
          >
            الوثيقة غير متاحة للتنزيل في حالتها الحالية
          </div>
        ) : (
          <button
            type="button"
            disabled={!doc.hasPdf || busy}
            onClick={open}
            data-testid="archive-panel-document-open"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-1 rounded border border-border bg-background hover:bg-muted disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            معاينة / تنزيل مصرّح
          </button>
        )}
      </div>
    </div>
  );
}

export function StaffRequestArchivePanel({
  requestId,
  workflowStepRuntimeId,
  actionType,
  isActionable,
  workflowRuntimeAvailable,
}: {
  requestId: string;
  workflowStepRuntimeId: string | null;
  actionType: string | null;
  isActionable: boolean;
  workflowRuntimeAvailable: boolean;
}) {
  const listFn = useServerFn(listStudentRequestOfficialDocuments);
  const executeFn = useServerFn(executeStudentRequestArchiveAction);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["staff-request-archive-documents", requestId],
    queryFn: () => listFn({ data: { requestId } }),
    enabled: actionType === "archive",
  });

  if (actionType !== "archive") return null;

  const canArchive =
    workflowRuntimeAvailable &&
    isActionable &&
    !!workflowStepRuntimeId &&
    !archiving;

  const gate = !workflowRuntimeAvailable
    ? "تنفيذ الأرشفة غير متاح — دورة الحياة الفعلية غير مطبقة."
    : !isActionable
      ? "لست المُسنَد لهذه الخطوة — لا يمكنك أرشفة الطلب."
      : !workflowStepRuntimeId
        ? "لا يمكن تنفيذ الأرشفة بدون معرّف خطوة تشغيلي."
        : null;

  const handleArchive = async () => {
    if (!canArchive || !workflowStepRuntimeId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setArchiving(true);
    setErrorMsg(null);
    try {
      const result = await executeFn({
        data: {
          requestId,
          workflowStepRuntimeId,
          comment: comment.trim() || null,
        },
      });
      toast.success(
        result.terminal
          ? "تم أرشفة الطلب وإغلاق المعاملة"
          : "تم تنفيذ الأرشفة",
      );
      setComment("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff-inbox-detail", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["staff-inbox"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({
          queryKey: ["staff-request-archive-documents", requestId],
        }),
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      inFlightRef.current = false;
      setArchiving(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-card p-3 space-y-3"
      data-testid="archive-panel"
    >
      <div className="text-xs font-bold text-primary flex items-center gap-1.5">
        <Archive className="h-3.5 w-3.5" /> الأرشفة وإغلاق المعاملة
      </div>

      {gate && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{gate}</span>
        </div>
      )}

      <section className="space-y-2">
        <div className="text-[11px] font-bold text-muted-foreground">
          الوثائق الرسمية المرتبطة بالطلب
        </div>
        {docsLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري تحميل الوثائق...
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            لا توجد وثائق رسمية مرتبطة بهذا الطلب بعد.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {documents.map((doc) => (
              <DocumentRow key={doc.id} requestId={requestId} doc={doc} />
            ))}
          </div>
        )}
      </section>

      <div>
        <label className="text-[11px] font-bold text-muted-foreground block mb-1">
          ملاحظة الأرشفة (اختياري)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="ملاحظة تُرفق مع إجراء الأرشفة..."
          className="w-full rounded border bg-background px-2 py-1.5 text-xs"
        />
      </div>

      <button
        type="button"
        data-testid="execute-archive-action"
        disabled={!canArchive}
        onClick={handleArchive}
        className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {archiving ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Archive className="h-3.5 w-3.5" />
        )}
        {ARCHIVE_BUTTON_LABEL_AR}
      </button>

      <p className="text-[11px] text-muted-foreground">
        الأرشفة تستدعي RPC act_on_student_request_step (p_action='archive') تحت جلسة المستخدم. الخطوة التالية / الحالة النهائية للطلب يُحددها الـ workflow — لا يتم إنشاء أي وثيقة أو PDF من هذه الصفحة.
      </p>

      {errorMsg && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{errorMsg}</p>
      )}
    </div>
  );
}
