import { useState } from "react";
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
  SECURE_ATTACHMENTS_RUNTIME_AVAILABLE,
  type SecureAttachmentReference,
} from "@/lib/student-requests/secure-attachments-contract";

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

  const addFile = async (file: File) => {
    setState("validating"); setMessage(null);
    if (!props.studentRequestId || !props.studentProfileId || !SECURE_ATTACHMENTS_RUNTIME_AVAILABLE) {
      setState("failed"); setMessage("الخدمة غير جاهزة تقنياً: SECURE_ATTACHMENTS_RUNTIME_NOT_AVAILABLE"); return;
    }
    if (!(SECURE_ATTACHMENT_ALLOWED_MIME as readonly string[]).includes(file.type) || file.size <= 0 || file.size > SECURE_ATTACHMENT_MAX_BYTES || props.value.length >= SECURE_ATTACHMENT_MAX_COUNT) {
      setState("failed"); setMessage("الملف غير مسموح أو يتجاوز 5 ميجابايت أو الحد الأقصى ثلاثة مرفقات."); return;
    }
    try {
      setState("preparing");
      const intent = await prepare({ data: { studentRequestId: props.studentRequestId, fieldKey: "excuse_documents", originalFileName: file.name, mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png", sizeBytes: file.size } });
      setState("uploading");
      const fileBase64 = await new Promise<string>((resolve, rejectRead) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => rejectRead(new Error("تعذر قراءة الملف.")); reader.readAsDataURL(file); });
      await upload({ data: { attachmentId: intent.attachmentId, fileBase64, mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png" } });
      setState("completing");
      const completed = await complete({ data: { attachmentId: intent.attachmentId } }) as unknown as SecureAttachmentReference;
      props.onChange([...props.value, completed]);
      setState("success");
    } catch (error) {
      setState("failed"); setMessage(error instanceof Error ? error.message : "تعذر إكمال رفع المرفق.");
    }
  };

  const remove = async (item: SecureAttachmentReference) => {
    setState("rejecting");
    try {
      await reject({ data: { attachmentId: item.attachmentId, rejectionCode: "REMOVED_BY_STUDENT" } });
      props.onChange(props.value.filter((x) => x.attachmentId !== item.attachmentId)); setState("idle");
    } catch (error) { setState("failed"); setMessage(error instanceof Error ? error.message : "تعذر إزالة المرفق من الطلب."); }
  };

  const busy = ["validating", "preparing", "uploading", "completing", "rejecting"].includes(state);
  return <div className="space-y-2" data-upload-state={state}>
    <label className="block text-xs font-bold text-primary">مستندات العذر (1–3)</label>
    <input type="file" accept="application/pdf,image/jpeg,image/png" disabled={props.disabled || busy || props.value.length >= 3 || !SECURE_ATTACHMENTS_RUNTIME_AVAILABLE}
      onChange={(event) => { const file = event.target.files?.[0]; if (file) void addFile(file); event.currentTarget.value = ""; }} />
    {!SECURE_ATTACHMENTS_RUNTIME_AVAILABLE && <p className="text-xs text-amber-800">الخدمة غير جاهزة تقنياً حتى تطبيق ومراجعة أساس التخزين الآمن.</p>}
    {message && <p role="alert" className="text-xs text-destructive">{message}</p>}
    <ul className="space-y-1">{props.value.map((item) => <li key={item.attachmentId} className="flex items-center justify-between text-xs">
      <span>{item.originalFileName}</span><button type="button" disabled={busy || props.disabled} onClick={() => void remove(item)}>إزالة</button>
    </li>)}</ul>
  </div>;
}
