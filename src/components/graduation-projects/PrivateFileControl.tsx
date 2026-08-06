import { useRef } from "react";
import { Download, FileLock2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { PrivateFile } from "./mvp-ui";

const FILE_STATE = {
  uploading: "جارٍ الرفع",
  processing: "جارٍ التحقق",
  ready: "جاهز",
  rejected: "مرفوض",
} as const;
export function PrivateFileControl({
  label,
  file,
  canUpload,
  busy,
  onUpload,
  onDownload,
}: {
  label: string;
  file?: PrivateFile;
  canUpload: boolean;
  busy?: boolean;
  onUpload?: (file: File) => void;
  onDownload?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="private-file-control">
      <div className="flex flex-wrap items-center gap-2">
        <FileLock2 className="h-4 w-4" />
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">ملف خاص</span>
      </div>
      {file ? (
        <>
          <p className="text-sm">
            {file.name} — {FILE_STATE[file.state]}
          </p>
          {file.state === "uploading" ? <Progress value={file.progress ?? 0} /> : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">لم يرفع ملف بعد.</p>
      )}
      <input
        ref={ref}
        className="sr-only"
        type="file"
        onChange={(event) => {
          const selected = event.target.files?.[0];
          if (selected) onUpload?.(selected);
          event.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        {canUpload ? (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => ref.current?.click()}
          >
            <Upload className="ms-2 h-4 w-4" />
            {file ? "استبدال الملف" : "اختيار ملف"}
          </Button>
        ) : null}
        {file?.downloadable && file.state === "ready" ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={onDownload}>
            <Download className="ms-2 h-4 w-4" />
            تنزيل مصرح
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        لا يُنشأ رابط عام؛ التنزيل عبر رابط مؤقت مصرح فقط.
      </p>
    </div>
  );
}
