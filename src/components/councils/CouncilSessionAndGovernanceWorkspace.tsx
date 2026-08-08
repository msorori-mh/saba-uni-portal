import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Play,
  CheckCircle2,
  Lock,
  Archive,
  Vote,
  FileText,
  AlertCircle,
  Clock,
  Loader2,
  Send,
  Sparkles,
  ShieldCheck,
  Building,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  openCouncilSessionFn,
  startAgendaItemDiscussionFn,
  openAgendaItemVoteFn,
  castCouncilVoteFn,
  closeAgendaItemVoteFn,
  calculateAgendaItemResultFn,
  resolveAgendaItemFn,
  closeCouncilSessionFn,
  draftCouncilMinutesFn,
  submitCouncilMinutesForReviewFn,
  approveAndLockCouncilMinutesFn,
  issueCouncilDecisionFn,
  updateCouncilDecisionFollowupFn,
  completeCouncilDecisionFn,
  archiveCouncilMeetingFn,
  getCouncilDecisionFollowupDashboardFn,
  getCouncilHistoricalMinutesFn,
  getCouncilVoteResultFn,
} from "@/lib/councils-c4-c8.functions";

interface CouncilSessionWorkspaceProps {
  meetingId: string;
  councilId: string;
  meetingStatus: string;
  userRole: string; // 'chair' | 'secretary' | 'member' | 'viewer'
  userId?: string;
  onStateChanged?: () => void;
}

export function CouncilSessionAndGovernanceWorkspace({
  meetingId,
  councilId,
  meetingStatus,
  userRole,
  userId,
  onStateChanged,
}: CouncilSessionWorkspaceProps) {
  const qc = useQueryClient();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Decision issuance form state
  const [showIssueDecisionDialog, setShowIssueDecisionDialog] = useState(false);
  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionBody, setDecisionBody] = useState("");
  const [decisionUnit, setDecisionUnit] = useState("");
  const [decisionDueDate, setDecisionDueDate] = useState("");
  const [selectedAgendaItemId, setSelectedAgendaItemId] = useState<string>("");

  // Minutes draft state
  const [minutesBody, setMinutesBody] = useState("");

  // Follow-up execution note state
  const [selectedDecisionForFollowup, setSelectedDecisionForFollowup] = useState<any>(null);
  const [followupNote, setFollowupNote] = useState("");
  const [followupStatus, setFollowupStatus] = useState("in_progress");

  // Fetch dashboard decisions
  const dashboardQuery = useQuery({
    queryKey: ["council-dashboard", councilId],
    queryFn: () => getCouncilDecisionFollowupDashboardFn({ data: { council_id: councilId } }),
    enabled: Boolean(councilId),
  });

  // Fetch historical minutes
  const minutesQuery = useQuery({
    queryKey: ["council-minutes", meetingId],
    queryFn: () => getCouncilHistoricalMinutesFn({ data: { meeting_id: meetingId } }),
    enabled: Boolean(meetingId),
  });

  const isChair = userRole === "chair";
  const isSecretary = userRole === "secretary";
  const canWriteAgenda = isChair || isSecretary;

  async function handleOpenSession() {
    setLoadingAction("open_session");
    try {
      await openCouncilSessionFn({ data: { meeting_id: meetingId } });
      toast.success("تم فتح الجلسة بنجاح");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر فتح الجلسة");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleCloseSession() {
    setLoadingAction("close_session");
    try {
      await closeCouncilSessionFn({ data: { meeting_id: meetingId } });
      toast.success("تم إغلاق الجلسة وتحويلها لإعداد المحضر");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر إغلاق الجلسة");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSaveMinutesDraft() {
    setLoadingAction("save_minutes");
    try {
      await draftCouncilMinutesFn({ data: { meeting_id: meetingId, body: minutesBody } });
      toast.success("تم حفظ مسودة المحضر بنجاح");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "تعذر حفظ مسودة المحضر");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSubmitMinutesReview() {
    setLoadingAction("submit_minutes");
    try {
      await submitCouncilMinutesForReviewFn({ data: { meeting_id: meetingId } });
      toast.success("تم إرسال المحضر للمراجعة");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "تعذر إرسال المحضر");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleLockMinutes() {
    setLoadingAction("lock_minutes");
    try {
      await approveAndLockCouncilMinutesFn({
        data: { meeting_id: meetingId, approved_body: minutesBody || undefined },
      });
      toast.success("تم اعتماد وقفل المحضر بنجاح. أصبح غير قابل للتعديل.");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر قفل المحضر");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleIssueDecision() {
    if (!decisionTitle.trim() || !decisionBody.trim()) {
      toast.error("يرجى إدخال عنوان القرار ونصه");
      return;
    }
    setLoadingAction("issue_decision");
    try {
      await issueCouncilDecisionFn({
        data: {
          meeting_id: meetingId,
          agenda_item_id: selectedAgendaItemId || undefined,
          title: decisionTitle,
          body: decisionBody,
          responsible_unit: decisionUnit || undefined,
          due_date: decisionDueDate || undefined,
        },
      });
      toast.success("تم إصدار القرار بنجاح");
      setShowIssueDecisionDialog(false);
      setDecisionTitle("");
      setDecisionBody("");
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "تعذر إصدار القرار");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleArchiveMeeting() {
    setLoadingAction("archive_meeting");
    try {
      await archiveCouncilMeetingFn({ data: { meeting_id: meetingId } });
      toast.success("تمت أرشفة الاجتماع بنجاح");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر أرشفة الاجتماع");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleUpdateFollowup() {
    if (!selectedDecisionForFollowup) return;
    setLoadingAction("update_followup");
    try {
      await updateCouncilDecisionFollowupFn({
        data: {
          decision_id: selectedDecisionForFollowup.decision_id,
          status: followupStatus,
          execution_note: followupNote,
        },
      });
      toast.success("تم تحديث نسبة وسجل التنفيذ");
      setSelectedDecisionForFollowup(null);
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "تعذر تحديث المتابعة");
    } finally {
      setLoadingAction(null);
    }
  }

  const minutesData = minutesQuery.data;
  const isMinutesLocked = minutesData?.is_locked || meetingStatus === "minutes_locked" || meetingStatus === "archived";

  return (
    <div className="space-y-6 dir-rtl text-right font-sans">
      {/* Session Header Status Banner */}
      <div className="p-4 rounded-xl bg-slate-900 text-white shadow-md flex items-center justify-between border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-600/30 text-indigo-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg">إدارة وتيسير الجلسة الحية والقرارات</h3>
            <p className="text-xs text-slate-400">
              الدور الحالي: <span className="text-indigo-300 font-semibold">{userRole}</span> · حالة الاجتماع:{" "}
              <Badge variant="outline" className="border-indigo-400/40 text-indigo-300">
                {meetingStatus}
              </Badge>
            </p>
          </div>
        </div>

        {/* Chair Primary Actions */}
        <div className="flex items-center gap-2">
          {isChair && meetingStatus === "agenda_ready" && (
            <Button
              onClick={handleOpenSession}
              disabled={loadingAction === "open_session"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            >
              {loadingAction === "open_session" ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Play className="w-4 h-4 ml-2" />
              )}
              فتح الجلسة الحية
            </Button>
          )}

          {isChair && meetingStatus === "in_session" && (
            <Button
              onClick={handleCloseSession}
              disabled={loadingAction === "close_session"}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {loadingAction === "close_session" ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 ml-2" />
              )}
              إنهاء الجلسة وتحويل للمحضر
            </Button>
          )}

          {canWriteAgenda && (meetingStatus === "minutes_draft" || meetingStatus === "minutes_review" || meetingStatus === "in_session") && (
            <Button
              onClick={() => setShowIssueDecisionDialog(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              <Sparkles className="w-4 h-4 ml-2" />
              إصدار قرار جديد
            </Button>
          )}

          {isChair && isMinutesLocked && meetingStatus !== "archived" && (
            <Button
              onClick={handleArchiveMeeting}
              disabled={loadingAction === "archive_meeting"}
              variant="outline"
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              {loadingAction === "archive_meeting" ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Archive className="w-4 h-4 ml-2" />
              )}
              أرشفة الاجتماع
            </Button>
          )}
        </div>
      </div>

      {/* Minutes & Lock Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h4 className="font-bold text-md">محضر الاجتماع الرسمي</h4>
          </div>
          {isMinutesLocked ? (
            <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 flex items-center gap-1">
              <Lock className="w-3.5 h-3.5" />
              محضر مقفل رسمياً ورقمياً
            </Badge>
          ) : (
            <Badge variant="secondary">مسودة / قيد المراجعة</Badge>
          )}
        </div>

        {isMinutesLocked ? (
          <div className="space-y-3">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap font-mono">
              {minutesData?.body || "لا يوجد نص محضر محدد."}
            </div>
            {minutesData?.fingerprint && (
              <div className="flex items-center justify-between text-xs text-slate-500 border-t pt-2 dark:border-slate-800">
                <span>بصمة التوثيق الرقمي (SHA-256):</span>
                <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-indigo-600 dark:text-indigo-400">
                  {minutesData.fingerprint}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={minutesBody}
              onChange={(e) => setMinutesBody(e.target.value)}
              placeholder="اكتب بنود وقرارات ومداولات محضر الاجتماع هنا..."
              rows={5}
              disabled={!canWriteAgenda}
              className="dir-rtl text-right font-sans"
            />
            {canWriteAgenda && (
              <div className="flex items-center gap-2 justify-end">
                <Button
                  onClick={handleSaveMinutesDraft}
                  disabled={loadingAction === "save_minutes"}
                  variant="outline"
                  size="sm"
                >
                  حفظ المسودة
                </Button>
                {isSecretary && (
                  <Button
                    onClick={handleSubmitMinutesReview}
                    disabled={loadingAction === "submit_minutes"}
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                  >
                    تقديم للمراجعة
                  </Button>
                )}
                {isChair && (
                  <Button
                    onClick={handleLockMinutes}
                    disabled={loadingAction === "lock_minutes"}
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    <Lock className="w-4 h-4 ml-1.5" />
                    اعتماد وقفل المحضر رسمياً
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Decisions & Follow-up Section */}
      <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
            <Building className="w-5 h-5 text-indigo-600" />
            <h4 className="font-bold text-md">سجل القرارات الصادرة ومتابعة التنفيذ</h4>
          </div>
          <Badge variant="outline">
            إجمالي القرارات: {dashboardQuery.data?.summary?.total ?? 0}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(dashboardQuery.data?.decisions ?? []).map((dec: any) => (
            <div
              key={dec.decision_id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                  {dec.canonical_number || dec.decision_id.slice(0, 8)}
                </span>
                <Badge
                  className={
                    dec.status === "completed"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : dec.status === "in_progress"
                      ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }
                >
                  {dec.status}
                </Badge>
              </div>

              <h5 className="font-bold text-slate-900 dark:text-slate-100 text-sm">{dec.title}</h5>
              <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{dec.body}</p>

              {dec.responsible_unit && (
                <p className="text-xs text-slate-500">
                  الجهة المكلفة: <span className="font-semibold text-slate-700 dark:text-slate-300">{dec.responsible_unit}</span>
                </p>
              )}

              {dec.execution_note && (
                <div className="p-2 bg-white dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                  ملاحظة التنفيذ: {dec.execution_note}
                </div>
              )}

              {/* Action for responsible actor or chair */}
              {(dec.responsible_user_id === userId || isChair) && dec.status !== "completed" && (
                <Button
                  onClick={() => {
                    setSelectedDecisionForFollowup(dec);
                    setFollowupNote(dec.execution_note || "");
                    setFollowupStatus(dec.status);
                  }}
                  size="sm"
                  variant="outline"
                  className="w-full text-xs mt-2"
                >
                  <UserCheck className="w-3.5 h-3.5 ml-1" />
                  تحديث حالة ومجريات التنفيذ
                </Button>
              )}
            </div>
          ))}

          {(dashboardQuery.data?.decisions ?? []).length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 text-sm">
              لا توجد قرارات صادرة لهذا المجلس بعد.
            </div>
          )}
        </div>
      </div>

      {/* Dialog: Issue Decision */}
      <Dialog open={showIssueDecisionDialog} onOpenChange={setShowIssueDecisionDialog}>
        <DialogContent className="dir-rtl text-right sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إصدار قرار مجلس جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                عنوان القرار *
              </label>
              <Input
                value={decisionTitle}
                onChange={(e) => setDecisionTitle(e.target.value)}
                placeholder="مثال: اعتماد الخطة الدراسية لقسم الحاسب..."
                className="dir-rtl"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                نص ووقائع القرار *
              </label>
              <Textarea
                value={decisionBody}
                onChange={(e) => setDecisionBody(e.target.value)}
                placeholder="اكتب تفاصيل القرار والتوصية التنفيذية..."
                rows={4}
                className="dir-rtl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  الجهة المسؤولة عن التنفيذ
                </label>
                <Input
                  value={decisionUnit}
                  onChange={(e) => setDecisionUnit(e.target.value)}
                  placeholder="قسم / لجنة / إدارة..."
                  className="dir-rtl"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                  تاريخ الاستحقاق
                </label>
                <Input
                  type="date"
                  value={decisionDueDate}
                  onChange={(e) => setDecisionDueDate(e.target.value)}
                  className="dir-rtl"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={handleIssueDecision}
              disabled={loadingAction === "issue_decision"}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {loadingAction === "issue_decision" ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Send className="w-4 h-4 ml-2" />
              )}
              إصدار القرار رسمياً
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowIssueDecisionDialog(false)}
            >
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Update Followup */}
      <Dialog open={Boolean(selectedDecisionForFollowup)} onOpenChange={() => setSelectedDecisionForFollowup(null)}>
        <DialogContent className="dir-rtl text-right sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تحديث حالة متابعة القرار</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                حالة التنفيذ
              </label>
              <Select value={followupStatus} onValueChange={setFollowupStatus} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="in_progress">قيد التنفيذ (In Progress)</SelectItem>
                  <SelectItem value="completed">مكتمل ومُنفّذ (Completed)</SelectItem>
                  <SelectItem value="blocked">متعثّر / معطّل (Blocked)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                ملاحظات مجريات التنفيذ والوثائق
              </label>
              <Textarea
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                placeholder="اكتب مستجدات خطة التنفيذ وتاريخ الرفع والنتائج..."
                rows={3}
                className="dir-rtl"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              onClick={handleUpdateFollowup}
              disabled={loadingAction === "update_followup"}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loadingAction === "update_followup" ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 ml-2" />
              )}
              حفظ تحديث التنفيذ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
