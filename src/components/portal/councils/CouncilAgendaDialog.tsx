import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  addManualAgendaItem,
  addTopicToAgenda,
  finalizeMeetingAgenda,
  getAvailableTopicsForAgenda,
  reorderAgendaItems,
  transitionCouncilMeeting,
  updateAgendaItem,
  type AvailableTopicForAgenda,
  type CouncilAgendaItem,
} from "@/lib/admin-councils.functions";
import {
  getAgendaItemsForMeeting,
  type CouncilMeetingV2Item,
  type MyCouncilMembershipV2,
} from "@/lib/faculty-councils.functions";
import {
  AGENDA_FINALIZE_REQUIRES_INTAKE_CLOSED_UI,
  AGENDA_FROZEN_NOTICE_UI,
  canFinalizeAgendaAtStatus,
  isAgendaEditable,
  isAgendaFrozen,
} from "@/lib/councils-live";
import {
  AGENDA_LOAD_FAILED_UI,
  AGENDA_WRITE_DENIED_UI,
  CompactEmpty,
  ErrorBlock,
  extractErrorMessage,
  formatDateTime,
  LoadingBlock,
  mapAgendaUiError,
  meetingStatusLabel,
  topicStatusLabel,
} from "./shared";

function swapAgendaOrder(items: CouncilAgendaItem[], itemId: string, direction: "up" | "down") {
  const sorted = [...items].sort((a, b) => a.order_index - b.order_index);
  const index = sorted.findIndex((item) => item.id === itemId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= sorted.length) return items;
  [sorted[index], sorted[swapIndex]] = [sorted[swapIndex], sorted[index]];
  return sorted.map((item, position) => ({ ...item, order_index: position + 1 }));
}

export type CouncilAgendaDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingId: string | null;
  writeMemberships: MyCouncilMembershipV2[];
  upcomingMeetings: CouncilMeetingV2Item[];
  onUpdated: () => void;
};

export function CouncilAgendaDialog({
  open,
  onOpenChange,
  meetingId,
  writeMemberships,
  upcomingMeetings,
  onUpdated,
}: CouncilAgendaDialogProps) {
  const qc = useQueryClient();
  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  const fetchAvailableTopics = useServerFn(getAvailableTopicsForAgenda);
  const addTopic = useServerFn(addTopicToAgenda);
  const addManual = useServerFn(addManualAgendaItem);
  const updateItem = useServerFn(updateAgendaItem);
  const reorderItems = useServerFn(reorderAgendaItems);
  const finalizeAgenda = useServerFn(finalizeMeetingAgenda);
  const transitionMeeting = useServerFn(transitionCouncilMeeting);
  const writeCouncilIds = useMemo(
    () => new Set(writeMemberships.map((membership) => membership.council_id)),
    [writeMemberships],
  );
  const chairCouncilIds = useMemo(
    () =>
      new Set(
        writeMemberships
          .filter((membership) => membership.role === "chair")
          .map((membership) => membership.council_id),
      ),
    [writeMemberships],
  );
  const meeting = upcomingMeetings.find((item) => item.meeting_id === meetingId) ?? null;
  const canWrite = Boolean(meeting && writeCouncilIds.has(meeting.council_id));
  const canFinalize = Boolean(meeting && chairCouncilIds.has(meeting.council_id));

  const [manualTitle, setManualTitle] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [addTopicBusyId, setAddTopicBusyId] = useState<string | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<CouncilAgendaItem | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOrder, setEditOrder] = useState("");
  const [editApproved, setEditApproved] = useState(false);
  const [editBusy, setEditBusy] = useState(false);

  const agendaQuery = useQuery({
    queryKey: ["faculty", "chair-agenda", meetingId],
    queryFn: () => fetchAgenda({ data: { meetingId: meetingId! } }),
    enabled: open && Boolean(meetingId),
    staleTime: 10_000,
  });
  const topicsQuery = useQuery({
    queryKey: ["faculty", "chair-agenda-topics", meetingId],
    queryFn: () => fetchAvailableTopics({ data: { meetingId: meetingId! } }),
    enabled: open && Boolean(meetingId) && canWrite,
    staleTime: 10_000,
  });
  const agendaItems = agendaQuery.data?.items ?? [];
  const availableTopics = topicsQuery.data?.topics ?? [];

  const refreshAgenda = () => {
    if (meetingId) {
      void qc.invalidateQueries({ queryKey: ["faculty", "chair-agenda", meetingId] });
      void qc.invalidateQueries({ queryKey: ["faculty", "chair-agenda-topics", meetingId] });
      void qc.invalidateQueries({ queryKey: ["faculty", "meeting-agenda", meetingId] });
    }
    onUpdated();
  };

  const persistReorder = async (items: CouncilAgendaItem[]) => {
    if (!meetingId || !canWrite) return;
    setReorderBusy(true);
    try {
      await reorderItems({
        data: {
          meetingId,
          items: items.map((item) => ({
            agendaItemId: item.id,
            orderIndex: item.order_index,
          })),
        },
      });
      toast.success("تم حفظ ترتيب جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "reorder"));
    } finally {
      setReorderBusy(false);
    }
  };

  const handleAddTopic = async (topic: AvailableTopicForAgenda) => {
    if (!meetingId || !canWrite) return;
    setAddTopicBusyId(topic.topic_id);
    try {
      await addTopic({ data: { meetingId, topicId: topic.topic_id } });
      toast.success("تمت إضافة الموضوع إلى جدول الأعمال.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setAddTopicBusyId(null);
    }
  };

  const handleManualAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetingId || !canWrite || manualTitle.trim().length < 3) return;
    setManualBusy(true);
    try {
      await addManual({
        data: {
          meetingId,
          title: manualTitle.trim(),
          notes: manualNotes.trim() || undefined,
        },
      });
      toast.success("تمت إضافة البند.");
      setManualTitle("");
      setManualNotes("");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setManualBusy(false);
    }
  };

  const openEdit = (item: CouncilAgendaItem) => {
    setEditTarget(item);
    setEditTitle(item.title);
    setEditNotes(item.notes ?? "");
    setEditOrder(String(item.order_index));
    setEditApproved(item.is_approved);
  };

  const handleEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editTarget || !canWrite || editTitle.trim().length < 3) return;
    const orderNum = Number(editOrder);
    if (!Number.isInteger(orderNum) || orderNum < 1) return;
    setEditBusy(true);
    try {
      await updateItem({
        data: {
          agendaItemId: editTarget.id,
          title: editTitle.trim(),
          notes: editNotes.trim() || null,
          orderIndex: orderNum,
          isApproved: editApproved,
        },
      });
      toast.success("تم تحديث البند.");
      setEditTarget(null);
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "write"));
    } finally {
      setEditBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!meetingId || !canFinalize || !meeting) return;
    setFinalizeBusy(true);
    try {
      await finalizeAgenda({ data: { meetingId } });
      if (meeting.status !== "agenda_ready") {
        try {
          await transitionMeeting({
            data: {
              meetingId,
              expectedStatus: meeting.status as never,
              toStatus: "agenda_ready" as never,
            },
          });
        } catch (transitionErr) {
          toast.warning(
            `تم اعتماد البنود، لكن تعذّر نقل الاجتماع إلى «جدول الأعمال جاهز»: ${extractErrorMessage(transitionErr)}`,
          );
        }
      }
      toast.success("تم اعتماد جدول الأعمال واعتماد موضوعاته.");
      refreshAgenda();
    } catch (err) {
      toast.error(mapAgendaUiError(extractErrorMessage(err), "finalize"));
    } finally {
      setFinalizeBusy(false);
    }
  };

  const approvedCount = agendaItems.filter((item) => item.is_approved).length;
  const allApproved = agendaItems.length > 0 && approvedCount === agendaItems.length;
  const agendaReady = meeting?.status === "agenda_ready";
  const buildSteps = [
    { label: "إضافة بنود/موضوعات إلى الجدول", done: agendaItems.length > 0 },
    { label: "ترتيب البنود بالتسلسل المطلوب", done: agendaItems.length > 0 },
    { label: "اعتماد بنود الجدول", done: allApproved },
    { label: "اعتماد الجدول ونقل الاجتماع إلى «جدول الأعمال جاهز»", done: agendaReady },
  ];

  const anyBusy = manualBusy || Boolean(addTopicBusyId) || reorderBusy || finalizeBusy || editBusy;

  return (
    <Dialog open={open} onOpenChange={(next) => !anyBusy && onOpenChange(next)}>
      <DialogContent
        dir="rtl"
        data-testid="council-agenda-dialog"
        className="max-h-[92vh] max-w-2xl overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>جدول الأعمال</DialogTitle>
        </DialogHeader>
        {!meeting ? (
          <CompactEmpty text="لم يتم العثور على الاجتماع المحدد." />
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="text-sm font-bold text-primary">{meeting.meeting_title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {meeting.council_name} — {formatDateTime(meeting.scheduled_at)} —{" "}
                {meetingStatusLabel(meeting.status)}
              </p>
            </div>
            {!canWrite ? <ErrorBlock message={AGENDA_WRITE_DENIED_UI} /> : null}
            <ol className="space-y-1.5 rounded-lg border border-border p-3 text-xs">
              <li className="text-[11px] font-bold text-primary">خطوات بناء جدول الأعمال</li>
              {buildSteps.map((step, index) => (
                <li key={step.label} className="flex items-center gap-2">
                  {step.done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className={step.done ? "font-bold" : "text-muted-foreground"}>
                    {index + 1}. {step.label}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {agendaItems.length} بند — المعتمد منها {approvedCount}
              </span>
              {canFinalize ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  disabled={finalizeBusy || agendaItems.length === 0 || agendaReady}
                  onClick={() => void handleFinalize()}
                >
                  {finalizeBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  اعتماد جدول الأعمال
                </Button>
              ) : null}
            </div>
            {agendaQuery.isLoading ? (
              <LoadingBlock />
            ) : agendaQuery.isError ? (
              <ErrorBlock message={AGENDA_LOAD_FAILED_UI} />
            ) : agendaItems.length === 0 ? (
              <CompactEmpty text="لا توجد بنود في جدول الأعمال حتى الآن." />
            ) : (
              <ul className="space-y-2">
                {agendaItems.map((item, index) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-border bg-background p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="font-mono font-bold text-primary">
                          {item.order_index}.{" "}
                        </span>
                        <span className="font-bold">{item.title}</span>
                        {item.is_approved ? (
                          <Badge variant="secondary" className="ms-2 text-[9px]">
                            بند معتمد
                          </Badge>
                        ) : null}
                        {item.topic ? (
                          <Badge variant="outline" className="ms-2 text-[9px]">
                            حالة الموضوع: {topicStatusLabel(item.topic.status)}
                          </Badge>
                        ) : null}
                        {item.notes ? (
                          <p className="mt-1 leading-relaxed text-muted-foreground">{item.notes}</p>
                        ) : null}
                      </div>
                      {canWrite ? (
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label="نقل البند للأعلى"
                            disabled={reorderBusy || index === 0}
                            onClick={() =>
                              void persistReorder(swapAgendaOrder(agendaItems, item.id, "up"))
                            }
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-8 w-8"
                            aria-label="نقل البند للأسفل"
                            disabled={reorderBusy || index === agendaItems.length - 1}
                            onClick={() =>
                              void persistReorder(swapAgendaOrder(agendaItems, item.id, "down"))
                            }
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-[10px]"
                            onClick={() => openEdit(item)}
                          >
                            تعديل
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canWrite && topicsQuery.data && availableTopics.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <div className="text-xs font-bold text-primary">موضوعات متاحة</div>
                <ul className="space-y-2">
                  {availableTopics.map((topic) => (
                    <li
                      key={topic.topic_id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span>{topic.title}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 text-[10px]"
                        disabled={addTopicBusyId === topic.topic_id}
                        onClick={() => void handleAddTopic(topic)}
                      >
                        إضافة
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canWrite ? (
              <form
                onSubmit={(e) => void handleManualAdd(e)}
                className="space-y-2 border-t border-border pt-3"
              >
                <div className="text-xs font-bold text-primary">بند يدوي</div>
                <Input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="عنوان البند"
                  dir="rtl"
                />
                <Textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  placeholder="ملاحظات (اختياري)"
                  dir="rtl"
                />
                <Button type="submit" size="sm" disabled={manualBusy} className="h-8 gap-1">
                  {manualBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  إضافة بند
                </Button>
              </form>
            ) : null}
          </div>
        )}

        <Dialog
          open={editTarget !== null}
          onOpenChange={(next) => !next && !editBusy && setEditTarget(null)}
        >
          <DialogContent dir="rtl" className="max-w-md">
            <DialogHeader>
              <DialogTitle>تعديل بند الأجندة</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => void handleEdit(e)} className="space-y-3">
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                dir="rtl"
              />
              <Input
                type="number"
                min={1}
                value={editOrder}
                onChange={(e) => setEditOrder(e.target.value)}
              />
              <label className="flex items-center gap-2 text-xs">
                <Checkbox
                  checked={editApproved}
                  onCheckedChange={(value) => setEditApproved(value === true)}
                />
                معتمد
              </label>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-9"
                  onClick={() => setEditTarget(null)}
                >
                  إلغاء
                </Button>
                <Button type="submit" className="min-h-9" disabled={editBusy}>
                  حفظ
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
