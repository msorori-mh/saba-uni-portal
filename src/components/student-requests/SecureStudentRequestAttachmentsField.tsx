import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  completeStudentRequestAttachmentUpload,
  createStudentRequestAttachmentUploadIntent,
  rejectStudentRequestAttachment,
  uploadStudentRequestAttachmentContent,
} from "@/lib/student-requests/secure-attachments.functions";
import {
  SECURE_ATTACHMENT_ALLOWED_MIME,
  SECURE_ATTACHMENT_MAX_BYTES,
  SECURE_ATTACHMENT_MAX_COUNT,
  type SecureAttachmentReference,
} from "@/lib/student-requests/secure-attachments-contract";
import {
  resolveSecureAttachmentsRuntimeAvailable,
  SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR,
} from "@/lib/student-requests/secure-attachments-capability";
import { getB1UiAdapter } from "@/lib/student-requests/b1-ui";

type UiState = "idle" | "validating" | "preparing" | "uploading" | "completing" | "success" | "failed" | "rejecting";

export function SecureStudentRequestAttachmentsField(props: {
  studentRequestId: string | null;
  studentProfileId: string | null;
  value: readonly SecureAttachmentReference[];
  onChange: (value: SecureAttachmentReference[]) => void;
  disabled?: boolean;
}) {
  const prepare = useServerFn(createStudentRequestAttachmentUploadIntent);
  const complete = useServerFn(completeStudentRequestAttachmentUpload);
  const reject = useServerFn(rejectStudentRequestAttachment);
  const upload = useServerFn(uploadStudentRequestAttachmentContent);
  const [state, setState] = useState<UiState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [runtimeAvailable, setRuntimeAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getB1UiAdapter()
      .getB1RuntimeCapability()
      .then((capability) => {
        if (cancelled) return;
        // UI gate uses secure-read capability attachments read; server probes RPCs on upload.
        const resolved = resolveSecureAttachmentsRuntimeAvailable({
          capabilityAvailable: capability.available === true,
          reads: capability.reads,
          rpcPresence: {
            create_intent: capability.reads.includes("attachments"),
            upload: capability.reads.includes("attachments"),
            complete: capability.reads.includes("attachments"),
            download: capability.reads.includes("attachments"),
          },
        });
        setRuntimeAvailable(resolved.available);
      })
      .catch(() => {
        if (!cancelled) setRuntimeAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addFile = async (file: File) => {
    setState("validating");
    setMessage(null);
    if (!props.studentRequestId || !props.studentProfileId || !runtimeAvailable) {
      setState("failed");
      setMessage(SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR);
      return;
    }
    if (
      !(SECURE_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.type) ||
      file.size <= 0 ||
      file.size > SECURE_ATTACHMENT_MAX_BYTES ||
      props.value.length >= SECURE_ATTACHMENT_MAX_COUNT
    ) {
      setState("failed");
      setMessage("الملف غير مسموح أو يتجاوز 5 ميجابايت أو الحد الأقصى ثلاثة مرفقات.");
      return;
    }
    try {
      setState("preparing");
      const intent = await prepare({
        data: {
          studentRequestId: props.studentRequestId,
          fieldKey: "excuse_documents",
          originalFileName: file.name,
          mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
          sizeBytes: file.size,
        },
      });
      setState("uploading");
      const fileBase64 = await new Promise<string>((resolve, rejectRead) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => rejectRead(new Error("تعذر قراءة الملف."));
        reader.readAsDataURL(file);
      });
      await upload({
        data: {
          attachmentId: intent.attachmentId,
          fileBase64,
          mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png",
        },
      });
      setState("completing");
      const completed = (await complete({
        data: { attachmentId: intent.attachmentId },
      })) as unknown as SecureAttachmentReference;
      props.onChange([...props.value, completed]);
      setState("success");
    } catch (error) {
      setState("failed");
      const raw = error instanceof Error ? error.message : "";
      setMessage(
        /SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE|create_intent|upload|complete|download/i.test(raw)
          ? SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR
          : raw || "تعذر إكمال رفع المرفق.",
      );
    }
  };

  const remove = async (item: SecureAttachmentReference) => {
    setState("rejecting");
    try {
      await reject({ data: { attachmentId: item.attachmentId, rejectionCode: "REMOVED_BY_STUDENT" } });
      props.onChange(props.value.filter((x) => x.attachmentId !== item.attachmentId));
      setState("idle");
    } catch (error) {
      setState("failed");
      setMessage(error instanceof Error ? error.message : "تعذر إزالة المرفق من الطلب.");
    }
  };

  const busy = ["validating", "preparing", "uploading", "completing", "rejecting"].includes(state);
  return (
    <div className="space-y-2" data-upload-state={state}>
      <label className="block text-xs font-bold text-primary">مستندات العذر (1–3)</label>
      {runtimeAvailable ? (
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          disabled={props.disabled || busy || props.value.length >= 3}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void addFile(file);
            event.currentTarget.value = "";
          }}
        />
      ) : (
        <p role="alert" className="text-xs font-bold text-destructive">
          {SECURE_ATTACHMENTS_RUNTIME_TECHNICAL_ERROR_AR}
        </p>
      )}
      {message && (
        <p role="alert" className="text-xs text-destructive">
          {message}
        </p>
      )}
      <ul className="space-y-1">
        {props.value.map((item) => (
          <li key={item.attachmentId} className="flex items-center justify-between text-xs">
            <span>{item.originalFileName}</span>
            <button type="button" disabled={busy || props.disabled} onClick={() => void remove(item)}>
              إزالة
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
