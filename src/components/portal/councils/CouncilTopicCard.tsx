import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Paperclip, Pencil, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  editCouncilTopic,
  getCouncilTopicAttachmentSignedUrl,
  getCouncilTopicAttachments,
  resubmitCouncilTopic,
  type CouncilTopicAttachmentItem,
  type MyCouncilTopicItem,
} from "@/lib/faculty-councils.functions";
import { formatBytes } from "@/lib/storage-validation";
import {
  extractErrorMessage,
  formatDateTime,
  mapAttachmentError,
  mapEditError,
  mimeLabel,
  topicStatusLabel,
} from "./shared";

type CouncilTopicWithDecision = MyCouncilTopicItem & { decision?: string | null };

export function CouncilTopicCard({
  topic,
  showDescription = false,
  userId = null,
  onUpdated,
}: {
  topic: CouncilTopicWithDecision;
  showDescription?: boolean;
  userId?: string | null;
  onUpdated?: () => void;
}) {
  const doEdit = useServerFn(editCouncilTopic);
  const doResubmit = useServerFn(resubmitCouncilTopic);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [resubmitBusy, setResubmitBusy] = useState(false);

  const canEdit =
    userId != null &&
    topic.submitted_by === userId &&
    (topic.status === "draft" || topic.status === "needs_completion");

  const canResubmit =
    userId != null &&
    topic.submitted_by === userId &&
    topic.status === "needs_completion";

  const openEdit = () => {
    setEditTitle(topic.title);
    setEditDescription(topic.description ?? "");
    setEditOpen(true);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    const title = editTitle.trim();
    if (title.length < 5) {
      toast.error("عنوان الموضوع يجب أن لا يقل عن 5 أحرف");
      return;
    }
    setEditBusy(true);
    try {
      await doEdit({
        data: {
          topic_id: topic.topic_id,
          title,
          description: editDescription.trim() || undefined,
        },
      });
      toast.success("تم تعديل الموضوع بنجاح");
      setEditOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(mapEditError(extractErrorMessage(err)));
    } finally {
      setEditBusy(false);
    }
  };

  const handleResubmit = async () => {
    setResubmitBusy(true);
    try {
      await doResubmit({ data: { topic_id: topic.topic_id } });
      toast.success("تم إعادة تقديم الموضوع");
      onUpdated?.();
    } catch (err) {
      toast.error(mapEditError(extractErrorMessage(err)));
    } finally {
      setResubmitBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-primary">{topic.title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{topic.council_name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[10px]"
              data-testid="councils-topic-edit-button"
              onClick={openEdit}
            >
              <Pencil className="h-3 w-3" />
              تعديل
            </Button>
          ) : null}
          {canResubmit ? (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-8 gap-1 text-[10px]"
              data-testid="councils-topic-resubmit-button"
              disabled={resubmitBusy}
              onClick={() => void handleResubmit()}
            >
              {resubmitBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              إعادة تقديم
            </Button>
          ) : null}
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {topicStatusLabel(topic.status)}
          </Badge>
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">تاريخ التقديم</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {topic.submitted_at
                ? formatDateTime(topic.submitted_at)
                : formatDateTime(topic.created_at)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">آخر تحديث</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatDateTime(topic.updated_at)}
            </dd>
          </div>
        </div>
        {showDescription && topic.description ? (
          <div>
            <dt className="text-muted-foreground">الوصف</dt>
            <dd className="mt-0.5 line-clamp-4 leading-relaxed text-foreground">
              {topic.description}
            </dd>
          </div>
        ) : null}
        {topic.decision ? (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2">
            <dt className="font-medium text-primary">القرار</dt>
            <dd className="mt-0.5 leading-relaxed text-foreground">{topic.decision}</dd>
          </div>
        ) : null}
        {topic.admin_notes ? (
          <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2">
            <dt className="font-medium text-amber-800">ملاحظات الإدارة</dt>
            <dd className="mt-0.5 leading-relaxed text-amber-900">{topic.admin_notes}</dd>
          </div>
        ) : null}
        {topic.agenda_order !== null ? (
          <div>
            <dt className="text-muted-foreground">ترتيب البند في الأجندة</dt>
            <dd className="mt-0.5 font-medium text-foreground">{topic.agenda_order}</dd>
          </div>
        ) : null}
        <TopicAttachmentsList topicId={topic.topic_id} />
      </dl>

      <Dialog open={editOpen} onOpenChange={(open) => !open && !editBusy && setEditOpen(false)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل الموضوع</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                dir="rtl"
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الوصف</label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={4}
                dir="rtl"
                maxLength={8000}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                disabled={editBusy}
                onClick={() => setEditOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </li>
  );
}

export function TopicAttachmentsList({ topicId }: { topicId: string }) {
  const fetchAttachments = useServerFn(getCouncilTopicAttachments);
  const fetchSignedUrl = useServerFn(getCouncilTopicAttachmentSignedUrl);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const attachmentsQuery = useQuery({
    queryKey: ["faculty", "council-topic-attachments", topicId],
    queryFn: () => fetchAttachments({ data: { topic_id: topicId } }),
    staleTime: 30_000,
  });

  const handleOpen = async (attachment: CouncilTopicAttachmentItem) => {
    setOpeningId(attachment.id);
    try {
      const result = await fetchSignedUrl({ data: { attachment_id: attachment.id } });
      window.open(result.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(mapAttachmentError(extractErrorMessage(err)));
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <div className="pt-1">
      <dt className="mb-1.5 text-muted-foreground">المرفقات</dt>
      {attachmentsQuery.isLoading ? (
        <dd className="text-[11px] text-muted-foreground">جاري تحميل المرفقات…</dd>
      ) : attachmentsQuery.isError ? (
        <dd className="text-[11px] text-destructive">تعذّر تحميل المرفقات.</dd>
      ) : (attachmentsQuery.data ?? []).length === 0 ? (
        <dd className="text-[11px] text-muted-foreground">لا توجد مرفقات.</dd>
      ) : (
        <dd>
          <ul className="space-y-2">
            {(attachmentsQuery.data ?? []).map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2"
              >
                <div className="min-w-0 text-[11px]">
                  <p className="truncate font-medium text-foreground">{attachment.file_name}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    {formatBytes(attachment.file_size)} ·{" "}
                    {mimeLabel(attachment.mime_type, attachment.file_ext)} ·{" "}
                    {formatDateTime(attachment.created_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1 text-[10px]"
                  disabled={openingId === attachment.id}
                  onClick={() => void handleOpen(attachment)}
                >
                  {openingId === attachment.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Paperclip className="h-3 w-3" />
                  )}
                  فتح / تحميل
                </Button>
              </li>
            ))}
          </ul>
        </dd>
      )}
    </div>
  );
}
