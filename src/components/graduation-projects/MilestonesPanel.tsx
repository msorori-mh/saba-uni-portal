import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MilestoneKind, SubmissionReviewAction } from "../../lib/graduation-projects/rpc";
import { FILE_KIND_LABELS, PROJECT_FILE_KINDS } from "../../lib/graduation-projects/lifecycle";
import type {
  LifecycleAction,
  MilestoneRow,
  ProjectFileKind,
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
  fileKind: ProjectFileKind;
}

export interface MilestonesPanelProps {
  actions: LifecycleAction[];
  milestones: MilestoneRow[];
  submissions: SubmissionRow[];
  notes: SupervisorNoteRow[];
  files: ProjectFileRow[];
  busy?: boolean;
  onSetMilestone(title: string, kind: MilestoneKind, sequence: number, weight: number): void;
  onSubmitDeliverable(milestoneId: string, summary: string): void;
  onReviewSubmission(
    submissionId: string,
    action: SubmissionReviewAction,
    note: string | null,
  ): void;
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

export function MilestonesPanel({
  actions,
  milestones,
  submissions,
  notes,
  files,
  busy = false,
  onSetMilestone,
  onSubmitDeliverable,
  onReviewSubmission,
  onAddNote,
  onResolveNote,
  onRegisterFile,
}: MilestonesPanelProps) {
  const [summary, setSummary] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [noteText, setNoteText] = useState("");
  const [msTitle, setMsTitle] = useState("");
  const [msKind, setMsKind] = useState<MilestoneKind>("progress");
  const [msSequence, setMsSequence] = useState("");
  const [msWeight, setMsWeight] = useState("");
  const [fileName, setFileName] = useState("");
  const [mediaType, setMediaType] = useState("application/pdf");
  const [byteSize, setByteSize] = useState("");
  const [sha256, setSha256] = useState("");
  const [fileKind, setFileKind] = useState<ProjectFileKind>("attachment");
  const [targetSubmission, setTargetSubmission] = useState<string>("");
  const canDeliver = actions.includes("submit_deliverable");
  const canSetMilestone = actions.includes("set_milestone");
  const canReview = actions.includes("review_submission");
  const canNote = actions.includes("add_note");
  const canResolve = actions.includes("resolve_note");
  const canRegisterFile = actions.includes("register_file");
  const openMilestones = milestones.filter((milestone) =>
    ["pending", "in_progress", "late"].includes(milestone.status),
  );
  const liveSubmissions = submissions.filter((submission) => submission.state === "submitted");
  const openNotes = notes.filter((note) => !note.resolved_at);
  const shaValid = /^[0-9a-f]{64}$/.test(sha256);
  const fileValid =
    fileName.trim() !== "" && mediaType.trim() !== "" && Number(byteSize) > 0 && shaValid;
  const usedSequences = new Set(milestones.map((milestone) => milestone.sequence_no));
  const totalWeight = milestones.reduce((sum, milestone) => sum + Number(milestone.weight), 0);
  const msSequenceNum = Number(msSequence);
  const msWeightNum = Number(msWeight);
  const milestoneValid =
    msTitle.trim() !== "" &&
    Number.isInteger(msSequenceNum) &&
    msSequenceNum > 0 &&
    !usedSequences.has(msSequenceNum) &&
    msWeightNum > 0 &&
    msWeightNum <= 100 &&
    totalWeight + msWeightNum <= 100;
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
                <span className="font-medium">
                  {milestone.sequence_no}. {milestone.title}
                </span>
                <Badge variant="secondary">
                  {MILESTONE_STATUS_LABELS[milestone.status] ?? milestone.status}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  الوزن: {milestone.weight} — الإنجاز: {milestone.completion_percent}%
                </span>
              </li>
            ))}
            {milestones.length === 0 ? <li>لا توجد مراحل بعد.</li> : null}
          </ul>
          {canSetMilestone ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">
                إضافة مرحلة — مجموع الأوزان الحالي: {totalWeight} / 100
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={msTitle}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setMsTitle(event.target.value)
                  }
                  placeholder="عنوان المرحلة"
                  aria-label="عنوان المرحلة"
                />
                <select
                  value={msKind}
                  onChange={(event) => setMsKind(event.target.value as MilestoneKind)}
                  aria-label="نوع المرحلة"
                  className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="progress">مرحلة متابعة</option>
                  <option value="final">مرحلة نهائية</option>
                </select>
                <Input
                  value={msSequence}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setMsSequence(event.target.value)
                  }
                  placeholder="الترتيب (رقم صحيح)"
                  inputMode="numeric"
                  aria-label="ترتيب المرحلة"
                />
                <Input
                  value={msWeight}
                  onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                    setMsWeight(event.target.value)
                  }
                  placeholder="الوزن (1-100)"
                  inputMode="numeric"
                  aria-label="وزن المرحلة"
                />
              </div>
              {msSequence !== "" && usedSequences.has(msSequenceNum) ? (
                <p className="text-sm text-destructive" role="alert">
                  الترتيب مستخدم لمرحلة أخرى.
                </p>
              ) : null}
              {msWeight !== "" && totalWeight + msWeightNum > 100 ? (
                <p className="text-sm text-destructive" role="alert">
                  مجموع الأوزان يتجاوز 100.
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !milestoneValid}
                onClick={() => {
                  onSetMilestone(msTitle.trim(), msKind, msSequenceNum, msWeightNum);
                  setMsTitle("");
                  setMsSequence("");
                  setMsWeight("");
                }}
              >
                تحديد المرحلة
              </Button>
            </div>
          ) : null}
          {canDeliver && openMilestones.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="gp-summary">ملخص التسليم</Label>
              <Textarea
                id="gp-summary"
                value={summary}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setSummary(event.target.value)
                }
                rows={2}
              />
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
              <Textarea
                id="gp-review-note"
                value={reviewNote}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setReviewNote(event.target.value)
                }
                rows={2}
              />
              {liveSubmissions.map((submission) => (
                <div key={submission.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">تسليم v{submission.version_no}</span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      onReviewSubmission(
                        submission.id,
                        "accept",
                        reviewNote.trim() === "" ? null : reviewNote.trim(),
                      )
                    }
                  >
                    قبول
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={busy || reviewNote.trim() === ""}
                    onClick={() =>
                      onReviewSubmission(submission.id, "require_revision", reviewNote.trim())
                    }
                  >
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
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onResolveNote(note.id)}
                  >
                    معالجة
                  </Button>
                ) : null}
              </li>
            ))}
            {notes.length === 0 ? <li>لا توجد ملاحظات.</li> : null}
          </ul>
          {canNote ? (
            <div className="space-y-2">
              <Textarea
                value={noteText}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setNoteText(event.target.value)
                }
                rows={2}
                placeholder="ملاحظة جديدة"
                aria-label="ملاحظة جديدة"
              />
              <Button
                type="button"
                disabled={busy || noteText.trim() === ""}
                onClick={() => onAddNote(noteText.trim(), null)}
              >
                إضافة ملاحظة
              </Button>
              {openNotes.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {openNotes.length} ملاحظة غير مُعالَجة.
                </p>
              ) : null}
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
              رفع المحتوى الثنائي معلَّق حتى اعتماد سياسة التخزين؛ يتم هنا تسجيل بيانات الملف
              الوصفية فقط، ولا تُعرض مفاتيح التخزين في الواجهة إطلاقاً.
            </AlertDescription>
          </Alert>
          <ul className="space-y-1">
            {files.map((file) => (
              <li key={file.id} className="text-sm">
                {file.original_name} —{" "}
                {file.scan_state === "clean" ? "سليم الفحص" : "بانتظار الفحص"}
              </li>
            ))}
            {files.length === 0 ? <li>لا توجد ملفات مسجلة.</li> : null}
          </ul>
          {canRegisterFile ? (
            <div className="grid gap-2">
              <Input
                value={fileName}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setFileName(event.target.value)
                }
                placeholder="اسم الملف الأصلي"
                aria-label="اسم الملف الأصلي"
              />
              <Input
                value={mediaType}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setMediaType(event.target.value)
                }
                placeholder="نوع الوسائط"
                aria-label="نوع الوسائط"
              />
              <Input
                value={byteSize}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setByteSize(event.target.value)
                }
                placeholder="الحجم بالبايت"
                inputMode="numeric"
                aria-label="الحجم بالبايت"
              />
              <Input
                value={sha256}
                onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                  setSha256(event.target.value)
                }
                placeholder="بصمة SHA-256 (64 محرفاً سداسياً)"
                dir="ltr"
                aria-label="بصمة SHA-256"
              />
              <select
                value={fileKind}
                onChange={(event) => setFileKind(event.target.value as ProjectFileKind)}
                aria-label="نوع الملف"
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                {PROJECT_FILE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {FILE_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
              <select
                value={targetSubmission}
                onChange={(event) => setTargetSubmission(event.target.value)}
                aria-label="ربط الملف بتسليم (اختياري)"
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="">بدون ربط بتسليم</option>
                {submissions.map((submission) => (
                  <option key={submission.id} value={submission.id}>
                    تسليم v{submission.version_no}
                  </option>
                ))}
              </select>
              {!shaValid && sha256 !== "" ? (
                <p className="text-sm text-destructive" role="alert">
                  البصمة يجب أن تكون 64 محرفاً سداسياً.
                </p>
              ) : null}
              <Button
                type="button"
                disabled={busy || !fileValid}
                onClick={() =>
                  onRegisterFile({
                    submissionId: targetSubmission.trim() === "" ? null : targetSubmission.trim(),
                    originalName: fileName.trim(),
                    mediaType: mediaType.trim(),
                    byteSize: Number(byteSize),
                    sha256,
                    fileKind,
                  })
                }
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
