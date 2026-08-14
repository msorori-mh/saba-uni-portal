import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Play,
  CheckCircle2,
  Lock,
  Archive,
  Vote,
  FileText,
  Loader2,
  Send,
  Download,
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
  closeCouncilSessionFn,
  draftCouncilMinutesFn,
  submitCouncilMinutesForReviewFn,
  approveAndLockCouncilMinutesFn,
  issueCouncilDecisionFn,
  updateCouncilDecisionFollowupFn,
  archiveCouncilMeetingFn,
  getCouncilDecisionFollowupDashboardFn,
  getCouncilHistoricalMinutesFn,
  exportApprovedCouncilMinutesPdfFn,
} from "@/lib/councils-c4-c8.functions";
import { CouncilVotingControl } from "@/components/councils/CouncilVotingControl";
import { getAgendaItemsForMeeting } from "@/lib/faculty-councils.functions";
import {
  LIVE_SESSION_INTERVAL_MS,
  liveQueryOptions,
  useLivePollInterval,
} from "@/lib/councils-live";
import { useServerFn } from "@tanstack/react-start";


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

  // Minutes draft state. `minutesDirtyRef` guards the saved-text sync so a
  // refetch never overwrites what the user is currently typing.
  const [minutesBody, setMinutesBody] = useState("");
  const minutesDirtyRef = useRef(false);


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

  // Minutes lifecycle stages, mirroring the backend state machine:
  // minutes_draft -> (secretary submits) -> minutes_review -> (chair locks) -> minutes_locked
  const isMinutesDraftStage = meetingStatus === "minutes_draft";
  const isMinutesReviewStage = meetingStatus === "minutes_review";

  // Reset the dirty flag whenever the workspace switches to another meeting.
  useEffect(() => {
    minutesDirtyRef.current = false;
    setMinutesBody("");
  }, [meetingId]);

  // Load the saved draft text once it arrives, without clobbering local edits.
  const savedMinutesBody = (minutesQuery.data?.body as string | undefined) ?? "";
  useEffect(() => {
    if (minutesDirtyRef.current) return;
    if (savedMinutesBody) setMinutesBody(savedMinutesBody);
  }, [savedMinutesBody]);

  /**
   * Never surface raw backend codes. On a lifecycle mismatch (race condition)
   * also resynchronise both the minutes and the meeting status, since
   * `meetingStatus` is owned by the parent.
   */
  function reportMinutesError(err: unknown, fallback: string) {
    const raw = String((err as { message?: string })?.message ?? "");
    let message = fallback;
    let lifecycleMismatch = false;

    if (raw.includes("COUNCIL_MINUTES_LOCK_STATE_INVALID")) {
      message = "لا يمكن اعتماد المحضر الآن. يجب إرسال المسودة للمراجعة أولاً.";
      lifecycleMismatch = true;
    } else if (
      raw.includes("COUNCIL_MINUTES_DRAFT_STATE_INVALID") ||
      raw.includes("COUNCIL_MINUTES_STATE_INVALID")
    ) {
      message = "لا يمكن تعديل المسودة بعد إرسالها للمراجعة.";
      lifecycleMismatch = true;
    } else if (raw.includes("COUNCIL_MINUTES_REVIEW_STATE_INVALID")) {
      message = "لا يمكن إرسال المحضر للمراجعة في الحالة الحالية.";
      lifecycleMismatch = true;
    } else if (raw.includes("COUNCIL_SECRETARY_AUTHORITY_REQUIRED")) {
      message = "إرسال المحضر للمراجعة من صلاحية أمين السر فقط.";
    } else if (raw.includes("COUNCIL_CHAIR_AUTHORITY_REQUIRED")) {
      message = "اعتماد وقفل المحضر من صلاحية رئيس المجلس فقط.";
    } else if (raw.includes("COUNCIL_ACCESS_DENIED")) {
      message = "لا تملك صلاحية تنفيذ هذا الإجراء على المحضر.";
    }

    toast.error(message);
    void minutesQuery.refetch();
    if (lifecycleMismatch) {
      qc.invalidateQueries();
      onStateChanged?.();
    }
  }



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
      minutesDirtyRef.current = false;
      toast.success("تم حفظ مسودة المحضر بنجاح");
      qc.invalidateQueries();
    } catch (err: unknown) {
      reportMinutesError(err, "تعذر حفظ مسودة المحضر");
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleSubmitMinutesReview() {
    setLoadingAction("submit_minutes");
    try {
      await submitCouncilMinutesForReviewFn({ data: { meeting_id: meetingId } });
      minutesDirtyRef.current = false;
      toast.success("تم إرسال المحضر للمراجعة");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: unknown) {
      reportMinutesError(err, "تعذر إرسال المحضر للمراجعة");
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
      minutesDirtyRef.current = false;
      toast.success("تم اعتماد وقفل المحضر بنجاح. أصبح غير قابل للتعديل.");
      qc.invalidateQueries();
      onStateChanged?.();
    } catch (err: unknown) {
      reportMinutesError(err, "تعذر اعتماد وقفل المحضر");
    } finally {
      setLoadingAction(null);
    }
  }


  async function handleExportMinutesPdf() {
    setLoadingAction("export_minutes_pdf");
    try {
      const res = await exportApprovedCouncilMinutesPdfFn({ data: { meeting_id: meetingId } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير المحضر المعتمد بصيغة PDF");
    } catch (err: any) {
      toast.error(err?.message || "تعذر تصدير المحضر");
    } finally {
      setLoadingAction(null);
    }
  }



  async function handleIssueDecision() {
    if (!selectedAgendaItemId.trim()) {
      toast.error("اختر بند جدول الأعمال المرتبط بالقرار.");
      return;
    }
    if (!decisionTitle.trim() || !decisionBody.trim()) {
      toast.error("يرجى إدخال عنوان القرار ونصه");
      return;
    }
    setLoadingAction("issue_decision");
    try {
      await issueCouncilDecisionFn({
        data: {
          meeting_id: meetingId,
          agenda_item_id: selectedAgendaItemId,
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
      setSelectedAgendaItemId("");
      setDecisionUnit("");
      setDecisionDueDate("");
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
  // C8 backend contract: issue_council_decision requires minutes_locked + resolved agenda item.
  const canIssueDecision = canWriteAgenda && meetingStatus === "minutes_locked";

  const followupOptions = (() => {
    const status = selectedDecisionForFollowup?.status as string | undefined;
    if (status === "issued") {
      return [
        { value: "in_progress", label: "قيد التنفيذ" },
        { value: "blocked", label: "متعثّر / معطّل" },
      ];
    }
    if (status === "in_progress") {
      return [
        { value: "in_progress", label: "قيد التنفيذ" },
        { value: "completed", label: "مكتمل ومُنفّذ" },
        { value: "blocked", label: "متعثّر / معطّل" },
      ];
    }
    if (status === "blocked") {
      return [{ value: "in_progress", label: "استئناف التنفيذ" }];
    }
    return [];
  })();

  const fetchAgenda = useServerFn(getAgendaItemsForMeeting);
  // Live session polling: while the meeting is in session the agenda + item
  // states (including "voting_open") refresh every 2s without a page reload.
  const sessionLiveInterval = useLivePollInterval(
    meetingStatus === "in_session",
    LIVE_SESSION_INTERVAL_MS,
  );
  const agendaQuery = useQuery({
    queryKey: ["council-session-agenda", meetingId],
    queryFn: () => fetchAgenda({ data: { meetingId } }),
    // Keep agenda readable at minutes_locked so C8 decision issuance can bind a resolved item.
    enabled:
      Boolean(meetingId) &&
      (meetingStatus === "in_session" ||
        meetingStatus === "agenda_ready" ||
        meetingStatus === "minutes_locked"),
    ...liveQueryOptions(sessionLiveInterval),
  });


  const resolvedAgendaItems = (agendaQuery.data?.items ?? []).filter(
    (item) => item.session_status === "resolved",
  );

  const ROLE_LABELS: Record<string, string> = {
    chair: "رئيس المجلس",
    secretary: "أمين السر",
    member: "عضو",
    viewer: "مطّلع",
  };
  const STATUS_LABELS: Record<string, string> = {
    scheduled: "مجدول",
    intake_open: "فتح استقبال الموضوعات",
    intake_closed: "إغلاق الاستقبال",
    agenda_ready: "جدول الأعمال جاهز",
    in_session: "جلسة منعقدة",
    minutes_draft: "مسودة محضر",
    minutes_review: "مراجعة المحضر",
    minutes_locked: "محضر مقفل",
    archived: "مؤرشف",
    cancelled: "ملغى",
  };

  async function handleStartDiscussion(agendaItemId: string) {
    setLoadingAction(`discuss-${agendaItemId}`);
    try {
      await startAgendaItemDiscussionFn({ data: { agenda_item_id: agendaItemId } });
      toast.success("تم بدء مناقشة البند");
      qc.invalidateQueries({ queryKey: ["council-session-agenda", meetingId] });
      onStateChanged?.();
    } catch (err: any) {
      toast.error(err.message || "تعذر بدء المناقشة");
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Session Header Status Banner */}
      <div className="p-4 rounded-xl bg-slate-900 text-white shadow-md flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-600/30 text-indigo-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-lg">إدارة وتيسير الجلسة الحية والقرارات</h3>
            <p className="text-xs text-slate-400">
              الدور الحالي:{" "}
              <span className="text-indigo-300 font-semibold">
                {ROLE_LABELS[userRole] ?? userRole}
              </span>{" "}
              · حالة الاجتماع:{" "}
              <Badge variant="outline" className="border-indigo-400/40 text-indigo-300">
                {STATUS_LABELS[meetingStatus] ?? meetingStatus}
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

          {canIssueDecision && (
            <Button
              onClick={() => {
                setSelectedAgendaItemId("");
                setShowIssueDecisionDialog(true);
              }}
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

      {/* In-session agenda + voting */}
      {meetingStatus === "in_session" && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Vote className="w-5 h-5 text-indigo-600" />
            <h4 className="font-bold text-md">بنود الجلسة والتصويت</h4>
          </div>
          {agendaQuery.isLoading ? (
            <p className="text-sm text-slate-500">جاري تحميل بنود جدول الأعمال...</p>
          ) : (agendaQuery.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">لا توجد بنود معتمدة لهذا الاجتماع.</p>
          ) : (
            <div className="space-y-4">
              {(agendaQuery.data?.items ?? []).map((item) => {
                const sessionStatus = item.session_status ?? "pending";
                return (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 p-4 space-y-3 bg-slate-50/60"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-bold text-sm text-slate-900">
                          {item.order_index}. {item.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          حالة البند: {sessionStatus}
                        </p>
                      </div>
                      {isChair && sessionStatus === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={loadingAction === `discuss-${item.id}`}
                          onClick={() => void handleStartDiscussion(item.id)}
                        >
                          {loadingAction === `discuss-${item.id}` ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin ml-1" />
                          ) : (
                            <Play className="w-3.5 h-3.5 ml-1" />
                          )}
                          بدء المناقشة
                        </Button>
                      )}
                    </div>
                    {sessionStatus !== "pending" && (
                      <CouncilVotingControl
                        agendaItemId={item.id}
                        sessionStatus={sessionStatus}
                        isChair={isChair}
                        isEligibleMember={
                          userRole === "member" ||
                          userRole === "chair" ||
                          userRole === "secretary"
                        }
                        resolutionText={item.resolution}
                        onStatusChanged={() => {
                          qc.invalidateQueries({ queryKey: ["council-session-agenda", meetingId] });
                          onStateChanged?.();
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
          ) : isMinutesReviewStage ? (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">
              قيد مراجعة رئيس المجلس
            </Badge>
          ) : (
            <Badge variant="secondary">مسودة المحضر</Badge>
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
            <div className="flex justify-end pt-1">
              <Button
                onClick={handleExportMinutesPdf}
                disabled={loadingAction === "export_minutes_pdf"}
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                {loadingAction === "export_minutes_pdf" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                تصدير المحضر المعتمد (PDF)
              </Button>
            </div>
          </div>
        ) : !canWriteAgenda ? (
          <div className="space-y-2" data-testid="council-minutes-readonly">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap">
              {minutesData?.body?.trim()
                ? minutesData.body
                : "لم يُعتمد محضر هذا الاجتماع بعد. سيظهر النص هنا فور اعتماده وقفله رسمياً."}
            </div>
            <p className="text-xs text-slate-500">
              العرض للاطلاع فقط — تحرير المحضر من صلاحية رئيس المجلس وأمين السر.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              value={minutesBody}
              onChange={(e) => setMinutesBody(e.target.value)}
              placeholder="اكتب بنود وقرارات ومداولات محضر الاجتماع هنا..."
              rows={5}
              className="dir-rtl text-right font-sans"
            />
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
                  {dec.status === "completed"
                    ? "مكتمل"
                    : dec.status === "in_progress"
                      ? "قيد التنفيذ"
                      : dec.status === "blocked"
                        ? "متعثّر"
                        : dec.status === "issued"
                          ? "صادر"
                          : dec.status === "assigned"
                            ? "مُسند"
                            : dec.status}
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
                    setFollowupStatus(
                      dec.status === "issued"
                        ? "in_progress"
                        : dec.status === "blocked"
                          ? "in_progress"
                          : dec.status === "in_progress"
                            ? "completed"
                            : dec.status,
                    );
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

      {/* Dialog: Issue Decision — C8 requires resolved agenda_item_id after minutes_locked */}
      <Dialog
        open={showIssueDecisionDialog}
        onOpenChange={(open) => {
          setShowIssueDecisionDialog(open);
          if (!open) setSelectedAgendaItemId("");
        }}
      >
        <DialogContent className="dir-rtl text-right sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إصدار قرار مجلس جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-right">
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
                بند جدول الأعمال المرتبط *
              </label>
              <Select
                value={selectedAgendaItemId || undefined}
                onValueChange={setSelectedAgendaItemId}
                dir="rtl"
              >
                <SelectTrigger aria-label="بند جدول الأعمال المرتبط بالقرار">
                  <SelectValue placeholder="اختر بنداً محسوماً من جدول الأعمال" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {resolvedAgendaItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.order_index}. {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {agendaQuery.isLoading ? (
                <p className="text-xs text-slate-500 mt-1">جاري تحميل البنود المحسومة...</p>
              ) : resolvedAgendaItems.length === 0 ? (
                <p className="text-xs text-amber-700 mt-1">
                  لا توجد بنود محسومة (resolved) لهذا الاجتماع. لا يمكن إصدار قرار دون بند مرتبط.
                </p>
              ) : null}
            </div>

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
              disabled={
                loadingAction === "issue_decision" ||
                !selectedAgendaItemId.trim() ||
                !decisionTitle.trim() ||
                !decisionBody.trim()
              }
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
                <SelectTrigger aria-label="حالة تنفيذ القرار">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {followupOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
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
