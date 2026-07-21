import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { SubmissionReviewAction } from "../../lib/graduation-projects/rpc";
import type {
  LifecycleAction,
  MilestoneRow,
  ProjectFileRow,
  SubmissionRow,
  SupervisorNoteRow,
} from "../../lib/graduation-projects/lifecycle";

export interface RegisterFileFormInput {
  submissionId: string | null;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}

export interface MilestonesPanelProps {
  actions: LifecycleAction[];
  milestones: MilestoneRow[];
  submissions: SubmissionRow[];
  notes: SupervisorNoteRow[];
  files: ProjectFileRow[];
  busy?: boolean;
  onSubmitDeliverable(milestoneId: string, summary: string): void;
  onReviewSubmission(submissionId: string, action: SubmissionReviewAction, note: string | null): void;
  onAddNote(note: string, submissionId: string | null): void;
  onResolveNote(noteId: string): void;
  onRegisterFile(input: RegisterFileFormInput): void;
}

const MILESTONE_STATUS_LABELS: Record<string, string> = {
  pending: "معلَّقة",
  in_progress: "قيد التنفيذ",
  late: "متأخرة",
  submitted: "مُسلَّمة",
  accepted: "مقبولة",
};

export function MilestonesPanel({ actions, milestones, submissions, notes, files, busy = false, onSubmitDeliverable, onReviewSubmission, onAddNote, onResolveNote, onRegisterFile }: MilestonesPanelProps) {
  const [summary, setSummary] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mediaType, setMediaType] = useState("application/pdf");
  const [byteSize, setByteSize] = useState("");
  const [sha256, setSha256] = useState("");
  const [targetSubmission, setTargetSubmission] = useState<string>("");
  const canDeliver = actions.includes("submit_deliverable");
  const canReview = actions.includes("review_submission");
  const canNote = actions.includes("add_note");
  const canResolve = actions.includes("resolve_note");
  const canRegisterFile = actions.includes("register_file");
  const openMilestones = milestones.filter((milestone) => ["pending", "in_progress", "late"].includes(milestone.status));
  const liveSubmissions = submissions.filter((submission) => submission.state === "submitted");
  const openNotes = notes.filter((note) => !note.resolved_at);
  const shaValid = /^[0-9a-f]{64}$/.test(sha256);
  const fileValid = fileName.trim() !== "" && mediaType.trim() !== "" && Number(byteSize) > 0 && shaValid;
  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>المراحل والتسليمات</CardTitle>
          <CardDescription>متابعة تنفيذ المشروع ومراجعة المخرجات.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex flex-wrap items-center gap-2 border-b pb-2">
                <span className="font-medium">{milestone.sequence_no}. {milestone.title}</span>
                <Badge variant="secondary">{MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}</Badge>
                <span className="text-sm text-muted-foreground">الوزن: {milestone.weight} — الإنجاز: {milestone.completion_percent}%</span>
              </li>
            ))}
            {milestones.length === 0 ? <li>لا توجد مراحل بعد.</li> : null}
          </ul>
          {canDeliver && openMilestones.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="gp-summary">ملخص التسليم</Label>
              <Textarea id="gp-summary" value={summary} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSummary(event.target.value)} rows={2} />
              <div className="flex flex-wrap gap-2">
                {openMilestones.map((milestone) => (
                  <Button
                    key={milestone.id}
                    type="button"
                    variant="secondary"
                    disabled={busy || summary.trim() === ""}
                    onClick={() => onSubmitDeliverable(milestone.id, summary.trim())}
                  >
                    تسليم: {milestone.title}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {canReview && liveSubmissions.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="gp-review-note">ملاحظة المراجعة (مطلوبة عند طلب التعديل)</Label>
              <Textarea id="gp-review-note" value={reviewNote} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setReviewNote(event.target.value)} rows={2} />
              {liveSubmissions.map((submission) => (
                <div key={submission.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">تسليم v{submission.version_no}</span>
                  <Button type="button" size="sm" disabled={busy}
                    onClick={() => onReviewSubmission(submission.id, "accept", reviewNote.trim() === "" ? null : reviewNote.trim())}>
                    قبول
                  </Button>
                  <Button type="button" size="sm" variant="destructive" disabled={busy || reviewNote.trim() === ""}
                    onClick={() => onReviewSubmission(submission.id, "require_revision", reviewNote.trim())}>
                    طلب تعديل
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ملاحظات الإشراف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="flex flex-wrap items-center gap-2">
                <span className="text-sm">{note.note}</span>
                {note.resolved_at ? <Badge variant="outline">مُعالَجة</Badge> : null}
                {!note.resolved_at && canResolve ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onResolveNote(note.id)}>
                    معالجة
                  </Button>
                ) : null}
              </li>
            ))}
            {notes.length === 0 ? <li>لا توجد ملاحظات.</li> : null}
          </ul>
          {canNote ? (
            <div className="space-y-2">
              <Textarea value={noteText} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setNoteText(event.target.value)} rows={2} placeholder="ملاحظة جديدة" />
              <Button type="button" disabled={busy || noteText.trim() === ""} onClick={() => onAddNote(noteText.trim(), null)}>
                إضافة ملاحظة
              </Button>
              {openNotes.length > 0 ? <p className="text-sm text-muted-foreground">{openNotes.length} ملاحظة غير مُعالَجة.</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>ملفات المشروع</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>
            <AlertTitle>رفع المحتوى الثنائي معلَّق</AlertTitle>
            <AlertDescription>
              رفع المحتوى الثنائي معلَّق حتى اعتماد سياسة التخزين؛ يتم هنا تسجيل بيانات الملف الوصفية فقط،
              ولا يظهر مفتاح الملف إلا بعد اجتياز الفحص الخارجي.
            </AlertDescription>
          </Alert>
          <ul className="space-y-1">
            {files.map((file) => (
              <li key={file.id} className="text-sm">
                {file.original_name} — {file.scan_state === "clean" ? "سليم الفحص" : "بانتظار الفحص"}
                {file.object_key ? ` — ${file.object_key}` : " — المفتاح محجوب حتى الفحص"}
              </li>
            ))}
            {files.length === 0 ? <li>لا توجد ملفات مسجلة.</li> : null}
          </ul>
          {canRegisterFile ? (
            <div className="grid gap-2">
              <Input value={fileName} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setFileName(event.target.value)} placeholder="اسم الملف الأصلي" />
              <Input value={mediaType} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMediaType(event.target.value)} placeholder="نوع الوسائط" />
              <Input value={byteSize} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setByteSize(event.target.value)} placeholder="الحجم بالبايت" inputMode="numeric" />
              <Input value={sha256} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSha256(event.target.value)} placeholder="بصمة SHA-256 (64 محرفاً سداسياً)" dir="ltr" />
              <Input value={targetSubmission} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTargetSubmission(event.target.value)} placeholder="معرّف التسليم (اختياري)" dir="ltr" />
              {!shaValid && sha256 !== "" ? <p className="text-sm text-destructive">البصمة يجب أن تكون 64 محرفاً سداسياً.</p> : null}
              <Button
                type="button"
                disabled={busy || !fileValid}
                onClick={() => onRegisterFile({
                  submissionId: targetSubmission.trim() === "" ? null : targetSubmission.trim(),
                  originalName: fileName.trim(),
                  mediaType: mediaType.trim(),
                  byteSize: Number(byteSize),
                  sha256,
                })}
              >
                تسجيل ملف (بيانات وصفية)
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
