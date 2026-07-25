import { useRef, useState } from "react";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import type { B1AttachmentMeta } from "@/lib/student-requests/b1-ui/adapter.types";

type Props = {
  attachments: readonly B1AttachmentMeta[];
  onUpload: (file: File) => Promise<void> | void;
  onRemove: (attachmentId: string) => Promise<void> | void;
  disabled?: boolean;
  /** Comma-separated extensions accepted by the file input. */
  accept?: string;
  maxSizeMB?: number;
  /** True while the adapter is uploading a file. */
  uploading?: boolean;
};

const DEFAULT_ACCEPT = ".pdf,.png,.jpg,.jpeg";
const DEFAULT_MAX_SIZE_MB = 10;

const STATUS_LABELS: Record<B1AttachmentMeta["status"], string> = {
  uploading: "جارٍ الرفع…",
  attached: "مرفق",
  failed: "فشل الرفع",
};

const STATUS_CHIP_CLASSES: Record<B1AttachmentMeta["status"], string> = {
  uploading: "border-blue-200 bg-blue-50 text-blue-900",
  attached: "border-emerald-200 bg-emerald-50 text-emerald-900",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} م.ب`;
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} ك.ب`;
  return `${bytes} بايت`;
}

/**
 * Attachment picker/list for B1 drafts. Shows file name, size and status
 * only — never any storage reference or link. Validation of type/size is a
 * UX pre-check; the backend remains the authority.
 */
export function B1AttachmentUploader({
  attachments,
  onUpload,
  onRemove,
  disabled = false,
  accept = DEFAULT_ACCEPT,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  uploading = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const inputId = "b1-attachment-file-input";
  const controlsDisabled = disabled || uploading;

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file after a failed attempt.
    event.target.value = "";
    if (!file) return;

    const extensions = accept
      .split(",")
      .map((ext) => ext.trim().toLowerCase())
      .filter((ext) => ext.startsWith("."));
    const lowerName = file.name.toLowerCase();
    if (extensions.length > 0 && !extensions.some((ext) => lowerName.endsWith(ext))) {
      const message = `نوع الملف غير مدعوم. الأنواع المسموحة: ${accept}`;
      setLocalError(message);
      toast.error(message);
      return;
    }

    if (file.size > maxSizeMB * 1024 * 1024) {
      const message = `حجم الملف يتجاوز الحد الأقصى المسموح (${maxSizeMB} م.ب).`;
      setLocalError(message);
      toast.error(message);
      return;
    }

    setLocalError(null);
    try {
      await onUpload(file);
    } catch {
      // The adapter surfaces its own safe message; nothing optimistic to roll back here.
    }
  };

  const handleRemove = async (attachmentId: string) => {
    if (controlsDisabled || removingId) return;
    setRemovingId(attachmentId);
    try {
      await onRemove(attachmentId);
    } catch {
      toast.error("تعذر حذف المرفق. أعد المحاولة.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <section dir="rtl" data-testid="b1-attachment-uploader" className="space-y-3">
      <div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          disabled={controlsDisabled}
          onChange={handleFileChange}
          className="sr-only"
          aria-label="اختيار ملف للرفع"
        />
        <label
          htmlFor={inputId}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground ${
            controlsDisabled ? "pointer-events-none opacity-50" : "hover:opacity-90"
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          {uploading ? "جارٍ رفع الملف…" : "إرفاق ملف"}
        </label>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          الأنواع المسموحة: {accept} — الحد الأقصى للحجم: {maxSizeMB} م.ب
        </p>
      </div>

      {uploading && (
        <div
          role="progressbar"
          aria-label="جارٍ رفع الملف"
          className="h-2 w-full overflow-hidden rounded-full bg-primary/10"
        >
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      )}

      {localError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {localError}
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.attachmentId}
              className="flex items-center gap-2.5 rounded-lg border border-border bg-card p-2.5"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-bold">{attachment.fileName}</div>
                <div className="text-[11px] text-muted-foreground">
                  <span dir="ltr" className="font-mono">
                    {formatFileSize(attachment.fileSizeBytes)}
                  </span>
                </div>
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_CHIP_CLASSES[attachment.status]}`}
              >
                {STATUS_LABELS[attachment.status]}
              </span>
              <button
                type="button"
                aria-label={`حذف المرفق ${attachment.fileName}`}
                disabled={controlsDisabled || removingId === attachment.attachmentId}
                onClick={() => void handleRemove(attachment.attachmentId)}
                className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingId === attachment.attachmentId ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
