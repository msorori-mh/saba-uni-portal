import { useRef, useState } from "react";
import { AlertCircle, Archive, CheckCircle2, FileText, Loader2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { prepareStudentRequestDocumentArchiveAction } from "@/lib/student-requests/staff-inbox.functions";
import {
  DOCUMENT_ARCHIVE_DRY_RUN_SUCCESS_MSG,
  DOCUMENT_ARCHIVE_EXECUTION_UNAVAILABLE_MSG,
  DOCUMENT_ARCHIVE_FOUNDATION_PREVIEW_MSG,
  ENROLLMENT_CERTIFICATE_ISSUE_EXECUTE_DISABLED_MSG,
  getDocumentDefinitionsForRequestType,
  OFFICIAL_TRANSCRIPT_INTEGRATION_NOTE,
  STORAGE_INTEGRATION_NOTE,
  type StudentRequestDocumentArchiveDryRunResult,
  type StudentRequestDocumentArchiveValidationIssue,
  type StudentRequestDocumentDefinition,
  type StudentRequestDocumentFoundationStatus,
  validateDocumentArchiveCapability,
} from "@/lib/student-requests/request-document-archive-contract";
import { PDF_GENERATION_HOLD_CODE } from "@/lib/student-requests/enrollment-certificate-document-issuance-archive-contract";

const FOUNDATION_STATUS_LABELS: Record<StudentRequestDocumentFoundationStatus, string> = {
  not_required: "غير مطلوب",
  pending_generation: "بانتظار الإنشاء",
  generation_ready: "جاهز للإنشاء (نظري)",
  pending_local_signatures: "بانتظار التوقيعات المحلية",
  pending_central_signature: "بانتظار التوقيع المركزي",
  ready_for_issue: "جاهز للإصدار (نظري)",
  ready_for_archive: "جاهز للأرشفة (نظري)",
  archived: "مؤرشف (نظري)",
};

function IssueList({ issues }: { issues: StudentRequestDocumentArchiveValidationIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="space-y-0.5 max-h-36 overflow-y-auto">
      {issues.map((issue, idx) => (
        <li
          key={`${issue.code}-${idx}`}
          className={
            issue.severity === "error"
              ? "text-destructive"
              : issue.severity === "warning"
                ? "text-amber-800"
                : "text-muted-foreground"
          }
        >
          {issue.messageAr}
        </li>
      ))}
    </ul>
  );
}

function DryRunResultPanel({ result }: { result: StudentRequestDocumentArchiveDryRunResult }) {
  return (
    <div className="space-y-2 border rounded-lg p-2.5 bg-muted/20 text-xs">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <span className="font-bold">{result.status}</span>
        <span className="text-muted-foreground">— {result.summaryAr}</span>
      </div>
      {"archiveReady" in result && (
        <div className="text-muted-foreground">
          جاهزية الأرشفة (نظري): {result.archiveReady ? "نعم" : "لا"}
        </div>
      )}
      {"foundationStatus" in result && result.documentType && (
        <div className="text-muted-foreground">
          الحالة التأسيسية: {FOUNDATION_STATUS_LABELS[result.foundationStatus]}
        </div>
      )}
      <IssueList issues={result.issues} />
    </div>
  );
}

function DocumentPreviewCard({ def }: { def: StudentRequestDocumentDefinition }) {
  const localSignatories = def.signatories.filter((s) => s.scope === "local");
  const centralSignatories = def.signatories.filter((s) => s.scope === "central");

  return (
    <div className="border rounded-lg p-2.5 bg-muted/10 space-y-1.5 text-xs">
      <div className="font-bold text-primary">{def.labelAr}</div>
      <div className="text-muted-foreground font-mono text-[10px]">{def.documentType}</div>
      <div className="text-muted-foreground">
        الحالة: {FOUNDATION_STATUS_LABELS[def.foundationStatus]}
      </div>
      {localSignatories.length > 0 && (
        <div>
          <span className="font-bold">توقيعات محلية: </span>
          {localSignatories.map((s) => s.labelAr).join("، ")}
        </div>
      )}
      {centralSignatories.length > 0 && (
        <div>
          <span className="font-bold">توقيعات مركزية: </span>
          {centralSignatories.map((s) => s.labelAr).join("، ")}
        </div>
      )}
      {def.signatories.length === 0 && (
        <div className="text-muted-foreground">لا توقيعات مطلوبة</div>
      )}
      {def.requiresParallelClearance && (
        <div className="text-amber-800">يتطلب إخلاء طرف متوازي</div>
      )}
    </div>
  );
}

export function RequestDocumentArchivePanel({
  requestId,
  requestTypeCode,
}: {
  requestId: string;
  requestTypeCode: string;
}) {
  const dryRunFn = useServerFn(prepareStudentRequestDocumentArchiveAction);
  const capability = validateDocumentArchiveCapability();
  const definitions = getDocumentDefinitionsForRequestType(requestTypeCode);

  const [mode, setMode] = useState<"generation" | "signature" | "archive">("generation");
  const [documentType, setDocumentType] = useState(
    definitions[0]?.documentType ?? "request_decision_document",
  );
  const [signatoryKey, setSignatoryKey] = useState<string>("registrar_general");
  const [parallelClearanceComplete, setParallelClearanceComplete] = useState(false);
  const [finalApprovalComplete, setFinalApprovalComplete] = useState(true);
  const [documentsReady, setDocumentsReady] = useState(true);
  const [signaturesComplete, setSignaturesComplete] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StudentRequestDocumentArchiveDryRunResult | null>(null);
  const inFlightRef = useRef(false);

  const selectedDef = definitions.find((d) => d.documentType === documentType);

  const handleValidate = async () => {
    if (inFlightRef.current || loading) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await dryRunFn({
        data: {
          requestId,
          requestTypeCode,
          mode,
          documentType: mode !== "archive" ? documentType : undefined,
          signatoryKey: mode === "signature" ? signatoryKey : undefined,
          parallelClearanceComplete:
            mode === "archive" ? parallelClearanceComplete : undefined,
          finalApprovalComplete: mode === "archive" ? finalApprovalComplete : undefined,
          documentsReady: mode === "archive" ? documentsReady : undefined,
          signaturesComplete: mode === "archive" ? signaturesComplete : undefined,
        },
      });
      setResult(response);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  if (definitions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-3 text-xs text-muted-foreground">
        لا مستندات متوقعة لهذا النوع في المرحلة التأسيسية.
        <p className="mt-2 text-[10px]">{OFFICIAL_TRANSCRIPT_INTEGRATION_NOTE}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      <div className="text-xs font-bold text-primary flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5" /> المستندات والتوقيعات والأرشفة (معاينة)
      </div>

      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{DOCUMENT_ARCHIVE_FOUNDATION_PREVIEW_MSG}</span>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border rounded-lg p-2.5">
        <Archive className="h-4 w-4 shrink-0 mt-0.5" />
        <span>{DOCUMENT_ARCHIVE_EXECUTION_UNAVAILABLE_MSG}</span>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-bold text-muted-foreground">المستندات المتوقعة</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {definitions.map((def) => (
            <DocumentPreviewCard key={def.documentType} def={def} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-3">
        {(
          [
            ["generation", "التحقق من الإنشاء"],
            ["signature", "التحقق من التوقيع"],
            ["archive", "التحقق من الأرشفة"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
            className={`text-xs font-bold px-3 py-2 rounded border ${
              mode === m ? "ring-2 ring-primary ring-offset-1 bg-secondary" : "bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode !== "archive" && (
        <div>
          <label className="text-[11px] font-bold text-muted-foreground block mb-1">
            نوع المستند
          </label>
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
          >
            {definitions.map((d) => (
              <option key={d.documentType} value={d.documentType}>
                {d.labelAr}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "signature" && selectedDef && (
        <div>
          <label className="text-[11px] font-bold text-muted-foreground block mb-1">
            الموقّع (من السجل — للمعاينة فقط)
          </label>
          <select
            value={signatoryKey}
            onChange={(e) => setSignatoryKey(e.target.value)}
            className="w-full rounded border bg-background px-2 py-1.5 text-xs"
          >
            {selectedDef.signatories.map((s) => (
              <option key={s.signatoryKey} value={s.signatoryKey}>
                {s.labelAr} ({s.scope === "central" ? "مركزي" : "محلي"})
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "archive" && (
        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={finalApprovalComplete}
              onChange={(e) => setFinalApprovalComplete(e.target.checked)}
            />
            الاعتماد النهائي مكتمل
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={documentsReady}
              onChange={(e) => setDocumentsReady(e.target.checked)}
            />
            المستندات جاهزة
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={signaturesComplete}
              onChange={(e) => setSignaturesComplete(e.target.checked)}
            />
            التوقيعات مكتملة
          </label>
          {requestTypeCode === "file_withdrawal" && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={parallelClearanceComplete}
                onChange={(e) => setParallelClearanceComplete(e.target.checked)}
              />
              إخلاء الطرف المتوازي مكتمل
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleValidate}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-secondary text-secondary-foreground disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          التحقق (dry-run)
        </button>
        <button
          type="button"
          disabled
          title={
            requestTypeCode === "enrollment_certificate"
              ? ENROLLMENT_CERTIFICATE_ISSUE_EXECUTE_DISABLED_MSG
              : DOCUMENT_ARCHIVE_EXECUTION_UNAVAILABLE_MSG
          }
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded bg-primary text-primary-foreground opacity-50 cursor-not-allowed"
        >
          {mode === "generation"
            ? "إنشاء المستند"
            : mode === "signature"
              ? "تسجيل التوقيع"
              : "أرشفة الطلب"}
        </button>
      </div>

      <div className="text-[10px] text-muted-foreground space-y-1">
        <p>{DOCUMENT_ARCHIVE_DRY_RUN_SUCCESS_MSG}</p>
        {requestTypeCode === "enrollment_certificate" && (
          <p>
            {ENROLLMENT_CERTIFICATE_ISSUE_EXECUTE_DISABLED_MSG} ({PDF_GENERATION_HOLD_CODE})
          </p>
        )}
        <p>
          canValidate: {String(capability.canValidate)} | canGenerateDocument:{" "}
          {String(capability.canGenerateDocument)} | canRecordSignature:{" "}
          {String(capability.canRecordSignature)} | canIssueDocument:{" "}
          {String(capability.canIssueDocument)} | canArchiveRequest:{" "}
          {String(capability.canArchiveRequest)}
        </p>
        <p>{STORAGE_INTEGRATION_NOTE}</p>
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded p-2">{error}</p>
      )}
      {result && <DryRunResultPanel result={result} />}
    </div>
  );
}
