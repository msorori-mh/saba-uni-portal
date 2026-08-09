import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  getOpenIntakeMeetingsForMember,
  prepareCouncilTopicAttachmentUpload,
  submitCouncilTopic,
  type MyCouncilMembershipV2,
} from "@/lib/faculty-councils.functions";
import { formatBytes, getExt, policyHint, validateUpload } from "@/lib/storage-validation";
import {
  ATTACHMENT_ACCEPT,
  CompactEmpty,
  ErrorBlock,
  LoadingBlock,
  extractErrorMessage,
  formatDate,
  isSessionExpiredError,
  mapSubmitError,
  MAX_TOPIC_ATTACHMENTS,
  mimeLabel,
  PARTIAL_UPLOAD_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from "./shared";

export type SubmitCouncilTopicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Role-gated memberships that may submit; dialog still binds to open intake meetings. */
  eligibleMemberships: MyCouncilMembershipV2[];
};

export function SubmitCouncilTopicDialog({
  open,
  onOpenChange,
  eligibleMemberships,
}: SubmitCouncilTopicDialogProps) {
  const qc = useQueryClient();
  const submitTopic = useServerFn(submitCouncilTopic);
  const prepareUpload = useServerFn(prepareCouncilTopicAttachmentUpload);
  const fetchOpenMeetings = useServerFn(getOpenIntakeMeetingsForMember);

  const openMeetingsQuery = useQuery({
    queryKey: ["faculty", "open-intake-meetings"],
    queryFn: () => fetchOpenMeetings(),
    enabled: open && eligibleMemberships.length > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const openMeetings = openMeetingsQuery.data ?? [];
  const [meetingId, setMeetingId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sessionExpiredHint, setSessionExpiredHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (openMeetings.length > 0 && !openMeetings.some((m) => m.meeting_id === meetingId)) {
      setMeetingId(openMeetings[0].meeting_id);
    }
    if (openMeetings.length === 0) {
      setMeetingId("");
    }
  }, [meetingId, open, openMeetings]);

  const selectedMeeting = openMeetings.find((m) => m.meeting_id === meetingId) ?? null;
  const councilId = selectedMeeting?.council_id ?? "";

  const handleFilesSelected = (e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (incoming.length === 0) return;
    const next = [...selectedFiles];
    for (const file of incoming) {
      if (next.length >= MAX_TOPIC_ATTACHMENTS) {
        toast.error("لا يمكن رفع أكثر من 5 مرفقات للموضوع.");
        break;
      }
      const check = validateUpload(file, "council_topic_attachment");
      if (!check.ok) {
        toast.error(check.message);
        continue;
      }
      next.push(file);
    }
    setSelectedFiles(next);
  };

  const uploadTopicAttachments = async (topicId: string, files: File[]) => {
    if (!councilId) return files.length;
    let failures = 0;
    for (const file of files) {
      try {
        const ext = getExt(file.name);
        const prep = await prepareUpload({
          data: {
            topic_id: topicId,
            council_id: councilId,
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            file_ext: ext,
          },
        });
        const { error: uploadErr } = await supabase.storage
          .from(prep.bucket)
          .upload(prep.file_path, file, {
            contentType: file.type || undefined,
            upsert: false,
          });
        if (uploadErr) failures += 1;
      } catch (err) {
        failures += 1;
        if (isSessionExpiredError(extractErrorMessage(err))) throw err;
      }
    }
    return failures;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 5) {
      toast.error("عنوان الموضوع يجب أن لا يقل عن 5 أحرف");
      return;
    }
    if (!meetingId) {
      toast.error("اختر اجتماعاً مفتوحاً للاستقبال أولاً");
      return;
    }
    if (selectedFiles.length > MAX_TOPIC_ATTACHMENTS) {
      toast.error("لا يمكن رفع أكثر من 5 مرفقات للموضوع.");
      return;
    }
    setBusy(true);
    try {
      const result = await submitTopic({
        data: {
          meeting_id: meetingId,
          title: trimmedTitle,
          description: description.trim() || undefined,
        },
      });
      const uploadFailures =
        selectedFiles.length > 0 ? await uploadTopicAttachments(result.topic_id, selectedFiles) : 0;
      if (uploadFailures > 0) {
        toast.warning(PARTIAL_UPLOAD_MESSAGE);
      } else if (selectedFiles.length > 0) {
        toast.success("تم تقديم الموضوع ورفع المرفقات بنجاح");
      } else {
        toast.success("تم إرسال الموضوع إلى المجلس بنجاح");
      }
      setTitle("");
      setDescription("");
      setSelectedFiles([]);
      setSessionExpiredHint(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["faculty", "my-council-topics"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "council-topic-attachments"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "open-intake-meetings"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "council-topic-review-queue"] }),
      ]);
      onOpenChange(false);
    } catch (err) {
      const raw = extractErrorMessage(err);
      if (isSessionExpiredError(raw)) setSessionExpiredHint(true);
      toast.error(mapSubmitError(raw));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        dir="rtl"
        data-testid="submit-topic-dialog"
        className="max-h-[90vh] max-w-lg overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>تقديم موضوع جديد للمجلس</DialogTitle>
        </DialogHeader>
        {openMeetingsQuery.isLoading ? (
          <LoadingBlock />
        ) : openMeetingsQuery.isError ? (
          <ErrorBlock message="تعذّر تحميل الاجتماعات المفتوحة للاستقبال." />
        ) : openMeetings.length === 0 ? (
          <CompactEmpty text="لا توجد اجتماعات مفتوحة لاستقبال الموضوعات في مجالسك حالياً." />
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {sessionExpiredHint ? (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p>{SESSION_EXPIRED_MESSAGE}</p>
                <Link
                  to="/portal-login"
                  className="inline-flex min-h-8 items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  العودة إلى تسجيل الدخول
                </Link>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">الاجتماع</label>
              <Select value={meetingId} onValueChange={setMeetingId} dir="rtl">
                <SelectTrigger>
                  <SelectValue placeholder="اختر الاجتماع" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {openMeetings.map((meeting) => (
                    <SelectItem key={meeting.meeting_id} value={meeting.meeting_id}>
                      {meeting.council_name} — {meeting.meeting_title} —{" "}
                      {formatDate(meeting.scheduled_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">عنوان الموضوع</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="أدخل عنوان الموضوع (5 أحرف على الأقل)"
                dir="rtl"
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                وصف الموضوع <span className="text-muted-foreground">(اختياري)</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="اشرح الموضوع المقترح للمجلس"
                dir="rtl"
                rows={4}
                maxLength={8000}
              />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-medium text-foreground">
                  المرفقات الداعمة{" "}
                  <span className="text-muted-foreground">
                    (اختياري — حتى {MAX_TOPIC_ATTACHMENTS} ملفات)
                  </span>
                </label>
                <span className="text-[10px] text-muted-foreground">
                  {selectedFiles.length}/{MAX_TOPIC_ATTACHMENTS}
                </span>
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                {policyHint("council_topic_attachment")}
              </p>
              <Input
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                disabled={busy || selectedFiles.length >= MAX_TOPIC_ATTACHMENTS}
                onChange={handleFilesSelected}
                className="cursor-pointer text-xs"
              />
              {selectedFiles.length > 0 ? (
                <ul className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-2">
                  {selectedFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{file.name}</p>
                        <p className="mt-0.5 text-muted-foreground">
                          {formatBytes(file.size)} · {mimeLabel(file.type, getExt(file.name))}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-[10px] text-destructive hover:text-destructive"
                        disabled={busy}
                        onClick={() =>
                          setSelectedFiles((files) => files.filter((_, i) => i !== index))
                        }
                      >
                        <X className="h-3 w-3" />
                        إزالة
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-9"
                disabled={busy}
                onClick={() => onOpenChange(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" className="min-h-9 gap-2" disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال الموضوع
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
