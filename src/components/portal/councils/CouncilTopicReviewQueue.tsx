import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { reviewCouncilTopic } from "@/lib/admin-councils.functions";
import { isAllowedTopicTransition } from "@/lib/council-topic-lifecycle";
import {
  getCouncilTopicReviewQueue,
  type CouncilTopicReviewQueueItem,
} from "@/lib/faculty-councils.functions";
import {
  CompactEmpty,
  ErrorBlock,
  LoadingBlock,
  SectionShell,
  TOPIC_REVIEW_DENIED_UI,
  TOPIC_REVIEW_FINAL_DENIED_UI,
  extractErrorMessage,
  formatDateTime,
  mapReviewError,
  topicStatusLabel,
} from "./shared";

const REVIEW_QUEUE_STATUS_TABS = [
  { value: "submitted", label: "مقدّم" },
  { value: "under_review", label: "قيد المراجعة" },
  { value: "needs_completion", label: "مطلوب استكمال" },
  { value: "accepted_for_agenda", label: "الموضوعات المقبولة" },
  { value: "rejected", label: "مرفوض" },
] as const;

export function CouncilTopicReviewQueue({
  roleByCouncilId,
  onUpdated,
}: {
  roleByCouncilId: Map<string, string>;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const fetchQueue = useServerFn(getCouncilTopicReviewQueue);
  const reviewTopic = useServerFn(reviewCouncilTopic);

  const queueQuery = useQuery({
    queryKey: ["faculty", "council-topic-review-queue"],
    queryFn: () => fetchQueue(),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const [activeStatus, setActiveStatus] = useState<string>("submitted");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyByTopic, setBusyByTopic] = useState<Record<string, boolean>>({});

  const queue = queueQuery.data?.queue ?? [];
  const filtered = queue.filter((t) => t.status === activeStatus);

  const handleReview = async (
    topic: CouncilTopicReviewQueueItem,
    status: "under_review" | "needs_completion" | "accepted_for_agenda" | "rejected",
  ) => {
    const role = roleByCouncilId.get(topic.council_id);
    const isChair = role === "chair";
    const isSecretary = role === "secretary";

    if (!isChair && !isSecretary) {
      toast.error(TOPIC_REVIEW_DENIED_UI);
      return;
    }
    if ((status === "accepted_for_agenda" || status === "rejected") && !isChair) {
      toast.error(TOPIC_REVIEW_FINAL_DENIED_UI);
      return;
    }

    setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: true }));
    try {
      // Re-read the authoritative status right before acting: the cached queue can be
      // stale, and a stale expectedStatus makes the RPC reject the transition.
      let expectedStatus = topic.status;
      try {
        const fresh = await fetchQueue();
        const freshTopic = fresh?.queue?.find((t) => t.topic_id === topic.topic_id);
        if (freshTopic) expectedStatus = freshTopic.status;
      } catch {
        // fall back to the cached status
      }

      if (expectedStatus === status) {
        toast.info("الموضوع بالفعل في هذه الحالة");
        await qc.refetchQueries({ queryKey: ["faculty", "council-topic-review-queue"] });
        return;
      }

      const result = await reviewTopic({
        data: {
          topicId: topic.topic_id,
          status,
          expectedStatus,
          reviewNote: reviewNotes[topic.topic_id]?.trim() || undefined,
        },
      });

      if (!result?.ok || result.status !== status) {
        toast.error("لم يتم تحديث حالة الموضوع، يرجى إعادة المحاولة");
      } else {
        toast.success("تم تحديث حالة الموضوع");
      }
      setReviewNotes((prev) => ({ ...prev, [topic.topic_id]: "" }));
      await Promise.all([
        qc.refetchQueries({ queryKey: ["faculty", "council-topic-review-queue"] }),
        qc.invalidateQueries({ queryKey: ["faculty", "my-council-topics"] }),
      ]);
      onUpdated();
    } catch (err) {
      toast.error(mapReviewError(extractErrorMessage(err)));
      await qc.refetchQueries({ queryKey: ["faculty", "council-topic-review-queue"] });
    } finally {
      setBusyByTopic((prev) => ({ ...prev, [topic.topic_id]: false }));
    }
  };


  return (
    <SectionShell
      icon={ListChecks}
      title="قائمة مراجعة الموضوعات"
      testId="councils-topic-review-queue"
    >
      {queueQuery.isLoading ? (
        <LoadingBlock />
      ) : queueQuery.isError ? (
        <ErrorBlock message="تعذّر تحميل قائمة مراجعة الموضوعات." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_QUEUE_STATUS_TABS.map((tab) => {
              const count = queue.filter((t) => t.status === tab.value).length;
              return (
                <Button
                  key={tab.value}
                  type="button"
                  size="sm"
                  variant={activeStatus === tab.value ? "default" : "outline"}
                  className="h-8 gap-1 text-[11px]"
                  onClick={() => setActiveStatus(tab.value)}
                >
                  {tab.label}
                  {count > 0 ? (
                    <span className="rounded-full bg-background/20 px-1.5 py-0.5 text-[10px]">
                      {count}
                    </span>
                  ) : null}
                </Button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <CompactEmpty text="لا توجد موضوعات في هذه الحالة حالياً." />
          ) : (
            <ul className="space-y-3">
              {filtered.map((topic) => {
                const role = roleByCouncilId.get(topic.council_id);
                const isChair = role === "chair";
                const isSecretary = role === "secretary";
                const busy = busyByTopic[topic.topic_id] ?? false;
                const note = reviewNotes[topic.topic_id] ?? "";
                return (
                  <li
                    key={topic.topic_id}
                    className="space-y-3 rounded-lg border border-border bg-background p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-primary">{topic.title}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {topic.council_name}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        {topicStatusLabel(topic.status)}
                      </Badge>
                    </div>

                    <dl className="grid gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted-foreground">مقدّم من</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                          {topic.submitted_by_name ?? "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">تاريخ التقديم</dt>
                        <dd className="mt-0.5 font-medium text-foreground">
                          {topic.submitted_at ? formatDateTime(topic.submitted_at) : "—"}
                        </dd>
                      </div>
                    </dl>

                    {topic.admin_notes ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50/80 p-2 text-xs">
                        <span className="font-medium text-amber-800">ملاحظات المراجعة: </span>
                        <span className="text-amber-900">{topic.admin_notes}</span>
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">ملاحظة المراجعة (اختياري)</label>
                      <Textarea
                        value={note}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [topic.topic_id]: e.target.value,
                          }))
                        }
                        rows={2}
                        dir="rtl"
                        maxLength={4000}
                        disabled={busy}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {(isChair || isSecretary) &&
                      isAllowedTopicTransition(topic.status, "under_review") ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          data-testid={`topic-action-under-review-${topic.topic_id}`}
                          disabled={busy}
                          onClick={() => void handleReview(topic, "under_review")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          تحت المراجعة
                        </Button>
                      ) : null}
                      {(isChair || isSecretary) &&
                      isAllowedTopicTransition(topic.status, "needs_completion") ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-[11px]"
                          data-testid={`topic-action-needs-completion-${topic.topic_id}`}
                          disabled={busy}
                          onClick={() => void handleReview(topic, "needs_completion")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          طلب استكمال
                        </Button>
                      ) : null}
                      {isChair && isAllowedTopicTransition(topic.status, "accepted_for_agenda") ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="h-8 text-[11px]"
                          data-testid={`topic-action-accept-${topic.topic_id}`}
                          disabled={busy}
                          onClick={() => void handleReview(topic, "accepted_for_agenda")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          قبول للجدول
                        </Button>
                      ) : null}
                      {isChair && isAllowedTopicTransition(topic.status, "rejected") ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="h-8 text-[11px]"
                          data-testid={`topic-action-reject-${topic.topic_id}`}
                          disabled={busy}
                          onClick={() => void handleReview(topic, "rejected")}
                        >
                          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          رفض
                        </Button>
                      ) : null}
                    </div>

                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </SectionShell>
  );
}
