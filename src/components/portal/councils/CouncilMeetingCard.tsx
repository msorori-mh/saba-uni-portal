import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ListChecks, Loader2, Pencil, PlayCircle, Users } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { updateCouncilMeeting } from "@/lib/admin-councils.functions";
import {
  approveCouncilQuorumPolicy,
  evaluateCouncilMeetingQuorum,
  finalizeCouncilAttendance,
  getCouncilAttendanceRoll,
  getCouncilCurrentQuorumPolicy,
  recordCouncilAttendance,
  transitionMyCouncilMeeting,
} from "@/lib/faculty-councils.functions";
import type {
  CouncilAttendanceRollMember,
  CouncilAttendanceRollResult,
  CouncilMeetingV2Item,
  CouncilQuorumPolicyResult,
} from "@/lib/faculty-councils.functions";
import { MeetingAgendaExpandable } from "./MeetingAgendaExpandable";
import {
  extractErrorMessage,
  formatDateTime,
  mapMeetingUiError,
  MEETING_SAVE_FAILED_UI,
  MEETING_STATUS_OPTIONS,
  meetingStatusLabel,
  roleLabel,
  toDatetimeLocalValue,
  toIsoFromDatetimeLocal,
} from "./shared";

/** Chair-driven forward lifecycle step offered per meeting status. */
const NEXT_CHAIR_TRANSITION: Record<string, { to: string; label: string; success: string }> = {
  scheduled: {
    to: "intake_open",
    label: "فتح استقبال الموضوعات",
    success: "تم فتح استقبال الموضوعات لهذا الاجتماع.",
  },
  intake_open: {
    to: "intake_closed",
    label: "إغلاق استقبال الموضوعات",
    success: "تم إغلاق استقبال الموضوعات.",
  },
  intake_closed: {
    to: "agenda_ready",
    label: "اعتماد جدول الأعمال",
    success: "تم اعتماد جدول الأعمال.",
  },
  agenda_ready: {
    to: "in_session",
    label: "بدء الجلسة",
    success: "تم بدء الجلسة.",
  },
};

export type CouncilMeetingCardProps = {
  meeting: CouncilMeetingV2Item;
  variant?: "upcoming" | "previous";
  canEdit: boolean;
  canManageAgenda: boolean;
  canRecordAttendance?: boolean;
  onManageAgenda: (meetingId: string) => void;
  onUpdated: () => void;
  /** Highlights this card when the user navigated to this specific meeting. */
  focused?: boolean;
  /** Opens the inline agenda list immediately for this meeting. */
  autoExpandAgenda?: boolean;
};

export function CouncilMeetingCard({
  meeting,
  variant = "upcoming",
  canEdit,
  canManageAgenda,
  canRecordAttendance = false,
  onManageAgenda,
  onUpdated,
  focused = false,
  autoExpandAgenda = false,
}: CouncilMeetingCardProps) {
  const updateMeeting = useServerFn(updateCouncilMeeting);
  const transitionMeeting = useServerFn(transitionMyCouncilMeeting);
  const getAttendanceRoll = useServerFn(getCouncilAttendanceRoll);
  const getQuorumPolicy = useServerFn(getCouncilCurrentQuorumPolicy);
  const approveQuorumPolicy = useServerFn(approveCouncilQuorumPolicy);
  const recordAttendance = useServerFn(recordCouncilAttendance);
  const evaluateQuorum = useServerFn(evaluateCouncilMeetingQuorum);
  const finalizeAttendance = useServerFn(finalizeCouncilAttendance);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editIntakeOpensAt, setEditIntakeOpensAt] = useState("");
  const [editIntakeClosesAt, setEditIntakeClosesAt] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("scheduled");
  const [editBusy, setEditBusy] = useState(false);

  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceMembers, setAttendanceMembers] = useState<CouncilAttendanceRollMember[]>([]);
  const [attendanceRollId, setAttendanceRollId] = useState<string | null>(null);
  const [attendanceRollStatus, setAttendanceRollStatus] = useState<string | null>(null);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [latestEvaluation, setLatestEvaluation] = useState<CouncilAttendanceRollResult["latest_evaluation"]>(null);
  const [quorumPolicy, setQuorumPolicy] = useState<CouncilQuorumPolicyResult | null>(null);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [evaluateBusy, setEvaluateBusy] = useState(false);
  const [policyMode, setPolicyMode] = useState<"absolute" | "ratio">("absolute");
  const [policyAbsolute, setPolicyAbsolute] = useState<string>("1");
  const [policyRatioNum, setPolicyRatioNum] = useState<string>("1");
  const [policyRatioDen, setPolicyRatioDen] = useState<string>("2");

  const openEdit = () => {
    setEditTitle(meeting.meeting_title);
    setEditScheduledAt(toDatetimeLocalValue(meeting.scheduled_at));
    setEditLocation(meeting.location ?? "");
    setEditIntakeOpensAt(toDatetimeLocalValue(meeting.intake_opens_at));
    setEditIntakeClosesAt(toDatetimeLocalValue(meeting.intake_closes_at));
    setEditNotes(meeting.notes ?? "");
    setEditStatus(meeting.status);
    setEditOpen(true);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    const scheduledIso = toIsoFromDatetimeLocal(editScheduledAt);
    if (!scheduledIso || editTitle.trim().length < 3) {
      toast.error(MEETING_SAVE_FAILED_UI);
      return;
    }
    setEditBusy(true);
    try {
      await updateMeeting({
        data: {
          meetingId: meeting.meeting_id,
          title: editTitle.trim(),
          scheduledAt: scheduledIso,
          location: editLocation.trim() || null,
          intakeOpensAt: editIntakeOpensAt.trim()
            ? (toIsoFromDatetimeLocal(editIntakeOpensAt) ?? null)
            : null,
          intakeClosesAt: editIntakeClosesAt.trim()
            ? (toIsoFromDatetimeLocal(editIntakeClosesAt) ?? null)
            : null,
          notes: editNotes.trim() || null,
          status: editStatus as (typeof MEETING_STATUS_OPTIONS)[number],
        },
      });
      toast.success("تم تحديث الاجتماع بنجاح");
      setEditOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(mapMeetingUiError(extractErrorMessage(err), "update"));
    } finally {
      setEditBusy(false);
    }
  };

  const nextTransition = NEXT_CHAIR_TRANSITION[meeting.status] ?? null;

  const handleTransition = async () => {
    if (!nextTransition) return;
    setTransitionBusy(true);
    try {
      await transitionMeeting({
        data: {
          meetingId: meeting.meeting_id,
          expectedStatus: meeting.status,
          toStatus: nextTransition.to,
        },
      });
      toast.success(nextTransition.success);
      onUpdated();
    } catch (err) {
      toast.error(extractErrorMessage(err) || MEETING_SAVE_FAILED_UI);
    } finally {
      setTransitionBusy(false);
    }
  };

  const loadAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const [roll, policy] = await Promise.all([
        getAttendanceRoll({ data: { meetingId: meeting.meeting_id } }),
        getQuorumPolicy({ data: { councilId: meeting.council_id } }),
      ]);
      setAttendanceRollId(roll.roll_id);
      setAttendanceRollStatus(roll.status);
      setEligibleCount(roll.eligible_member_count);
      setAttendanceMembers(roll.members);
      setLatestEvaluation(roll.latest_evaluation);
      setQuorumPolicy(policy);
      if (policy) {
        setPolicyMode(policy.threshold_kind as "absolute" | "ratio");
        if (policy.threshold_kind === "absolute" && policy.absolute_count) {
          setPolicyAbsolute(String(policy.absolute_count));
        } else if (policy.threshold_kind === "ratio") {
          setPolicyRatioNum(String(policy.ratio_numerator ?? 1));
          setPolicyRatioDen(String(policy.ratio_denominator ?? 2));
        }
      }
    } catch (err) {
      toast.error(extractErrorMessage(err) || "تعذّر تحميل سجل الحضور.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  useEffect(() => {
    if (attendanceOpen) {
      void loadAttendance();
    }
  }, [attendanceOpen]);

  const handleApprovePolicy = async () => {
    setPolicyBusy(true);
    try {
      await approveQuorumPolicy({
        data: {
          councilId: meeting.council_id,
          thresholdKind: policyMode,
          absoluteCount: policyMode === "absolute" ? Number(policyAbsolute) : null,
          ratioNumerator: policyMode === "ratio" ? Number(policyRatioNum) : null,
          ratioDenominator: policyMode === "ratio" ? Number(policyRatioDen) : null,
        },
      });
      toast.success("تم اعتماد سياسة النصاب.");
      await loadAttendance();
    } catch (err) {
      toast.error(extractErrorMessage(err) || "تعذّر اعتماد سياسة النصاب.");
    } finally {
      setPolicyBusy(false);
    }
  };

  const handleRecordAttendance = async () => {
    setAttendanceLoading(true);
    try {
      const entries = attendanceMembers.map((m) => ({
        membership_id: m.membership_id,
        attendance_state: m.attendance_state as "present" | "present_remote" | "excused" | "absent",
      }));
      await recordAttendance({ data: { meetingId: meeting.meeting_id, entries } });
      toast.success("تم تسجيل حالات الحضور.");
      await loadAttendance();
    } catch (err) {
      toast.error(extractErrorMessage(err) || "تعذّر تسجيل الحضور.");
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleEvaluateQuorum = async () => {
    setEvaluateBusy(true);
    try {
      await evaluateQuorum({ data: { meetingId: meeting.meeting_id } });
      toast.success("تم تقييم النصاب.");
      await loadAttendance();
    } catch (err) {
      toast.error(extractErrorMessage(err) || "تعذّر تقييم النصاب.");
    } finally {
      setEvaluateBusy(false);
    }
  };

  const handleFinalizeAttendance = async () => {
    setFinalizeBusy(true);
    try {
      await finalizeAttendance({ data: { meetingId: meeting.meeting_id } });
      toast.success("تم اعتماد سجل الحضور والنصاب.");
      setAttendanceOpen(false);
      onUpdated();
    } catch (err) {
      toast.error(extractErrorMessage(err) || "تعذّر اعتماد سجل الحضور.");
    } finally {
      setFinalizeBusy(false);
    }
  };

  const presentCount = useMemo(
    () => attendanceMembers.filter((m) => m.attendance_state === "present" || m.attendance_state === "present_remote").length,
    [attendanceMembers],
  );

  const attendanceLocked = attendanceRollStatus === "finalized";
  const canApprovePolicy = canEdit && !quorumPolicy;
  const canRecord = canRecordAttendance && !attendanceLocked;
  const canEvaluate = (canEdit || canRecordAttendance) && attendanceRollId !== null && !attendanceLocked;
  const canFinalize = canEdit && attendanceRollId !== null && !attendanceLocked;

  const displayTitle = meeting.meeting_title?.trim() || meeting.council_name;

  const agendaStatus = meeting.agenda_summary
    ? "جدول الأعمال متوفر"
    : meeting.status === "agenda_ready"
      ? meetingStatusLabel(meeting.status)
      : "لم يُعتمد بعد";

  return (
    <li
      data-testid={`council-meeting-card-${meeting.meeting_id}`}
      className="rounded-lg border border-border bg-background p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-primary">{displayTitle}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{meeting.council_name}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {meetingStatusLabel(meeting.status)}
          </Badge>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[10px]"
              onClick={openEdit}
            >
              <Pencil className="h-3 w-3" />
              تعديل
            </Button>
          ) : null}
          {canEdit && nextTransition ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1 text-[10px]"
              disabled={transitionBusy}
              onClick={() => void handleTransition()}
            >
              {transitionBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {nextTransition.label}
            </Button>
          ) : null}
          {canManageAgenda ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[10px]"
              onClick={() => onManageAgenda(meeting.meeting_id)}
            >
              <ListChecks className="h-3.5 w-3.5" />
              جدول الأعمال
            </Button>
          ) : null}
          {(canRecordAttendance || canEdit) && meeting.status !== "archived" && meeting.status !== "cancelled" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-[10px]"
              onClick={() => setAttendanceOpen(true)}
            >
              <Users className="h-3.5 w-3.5" />
              الحضور والنصاب
            </Button>
          ) : null}

        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">رقم الاجتماع</dt>
          <dd className="mt-0.5 font-medium text-foreground">{meeting.meeting_number}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التاريخ والوقت</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {formatDateTime(meeting.scheduled_at)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">المكان</dt>
          <dd className="mt-0.5 font-medium text-foreground">{meeting.location ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">حالة جدول الأعمال</dt>
          <dd className="mt-0.5 font-medium text-foreground">{agendaStatus}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">فتح استقبال الموضوعات</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {meeting.intake_opens_at ? formatDateTime(meeting.intake_opens_at) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">موعد إغلاق استقبال الموضوعات</dt>
          <dd className="mt-0.5 font-medium text-foreground">
            {meeting.intake_closes_at ? formatDateTime(meeting.intake_closes_at) : "—"}
          </dd>
        </div>
        {meeting.user_membership_role ? (
          <div>
            <dt className="text-muted-foreground">دورك في المجلس</dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {roleLabel(meeting.user_membership_role)}
            </dd>
          </div>
        ) : null}
        {meeting.notes ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملاحظات</dt>
            <dd className="mt-0.5 leading-relaxed text-foreground">{meeting.notes}</dd>
          </div>
        ) : null}
        {meeting.agenda_summary ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملخص الأجندة</dt>
            <dd className="mt-0.5 leading-relaxed text-foreground">{meeting.agenda_summary}</dd>
          </div>
        ) : null}
        {variant === "previous" && meeting.minutes_summary ? (
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">ملخص المحضر</dt>
            <dd className="mt-0.5 leading-relaxed text-foreground">{meeting.minutes_summary}</dd>
          </div>
        ) : null}
      </dl>

      {!canManageAgenda ? (
        <MeetingAgendaExpandable meetingId={meeting.meeting_id} />
      ) : null}

      <Dialog open={editOpen} onOpenChange={(next) => !next && !editBusy && setEditOpen(false)}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل الاجتماع</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => void handleUpdate(e)} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">العنوان</label>
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} dir="rtl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">تاريخ ووقت الاجتماع</label>
              <Input
                type="datetime-local"
                value={editScheduledAt}
                onChange={(e) => setEditScheduledAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">المكان</label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                dir="rtl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">فتح استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeOpensAt}
                onChange={(e) => setEditIntakeOpensAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">إغلاق استقبال الموضوعات</label>
              <Input
                type="datetime-local"
                value={editIntakeClosesAt}
                onChange={(e) => setEditIntakeClosesAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">الحالة</label>
              <Select value={editStatus} onValueChange={setEditStatus} dir="rtl">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {MEETING_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {meetingStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">ملاحظات</label>
              <Textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={2}
                dir="rtl"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-9"
                disabled={editBusy}
                onClick={() => setEditOpen(false)}
              >
                إلغاء
              </Button>
              <Button type="submit" disabled={editBusy} className="min-h-9 gap-1.5">
                {editBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ التعديلات
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">الحضور والنصاب — {displayTitle}</DialogTitle>
          </DialogHeader>
          {attendanceLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل سجل الحضور...
            </div>
          ) : (
            <div className="space-y-4">
              {quorumPolicy ? (
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    سياسة النصاب معتمدة
                  </div>
                  <p className="mt-1 text-xs opacity-90">
                    {quorumPolicy.threshold_kind === "absolute"
                      ? `النصاب المطلق: ${quorumPolicy.absolute_count} من ${eligibleCount} أعضاء`
                      : `النصاب النسبي: ${quorumPolicy.ratio_numerator}/${quorumPolicy.ratio_denominator}`}
                  </p>
                </div>
              ) : canApprovePolicy ? (
                <div className="space-y-3 rounded-md border border-border p-3">
                  <h4 className="text-sm font-medium">اعتماد سياسة النصاب</h4>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`policy-mode-${meeting.meeting_id}`}
                        checked={policyMode === "ratio"}
                        onCheckedChange={(v) => setPolicyMode(v ? "ratio" : "absolute")}
                      />
                      <Label htmlFor={`policy-mode-${meeting.meeting_id}`} className="text-xs">
                        {policyMode === "ratio" ? "نسبي" : "مطلق"}
                      </Label>
                    </div>
                    {policyMode === "absolute" ? (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">عدد الأعضاء المطلوب:</Label>
                        <Input
                          type="number"
                          min={1}
                          value={policyAbsolute}
                          onChange={(e) => setPolicyAbsolute(e.target.value)}
                          className="w-24 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          value={policyRatioNum}
                          onChange={(e) => setPolicyRatioNum(e.target.value)}
                          className="w-16 text-sm"
                        />
                        <span className="text-sm">/</span>
                        <Input
                          type="number"
                          min={1}
                          value={policyRatioDen}
                          onChange={(e) => setPolicyRatioDen(e.target.value)}
                          className="w-16 text-sm"
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={policyBusy}
                    onClick={() => void handleApprovePolicy()}
                  >
                    {policyBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    اعتماد سياسة النصاب
                  </Button>
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
                  لم تُعتمد سياسة النصاب بعد. يجب على رئيس المجلس اعتمادها أولاً.
                </div>
              )}

              {attendanceMembers.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">سجل الحضور</h4>
                    <div className="text-xs text-muted-foreground">
                      الحاضرون: {presentCount} / {eligibleCount}
                    </div>
                  </div>
                  {latestEvaluation && (
                    <div
                      className={`rounded-md border p-2 text-xs ${
                        latestEvaluation.quorum_met
                          ? "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100"
                          : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
                      }`}
                    >
                      آخر تقييم: {latestEvaluation.quorum_met ? "النصاب متحقق" : "النصاب غير متحقق"} —{" "}
                      {latestEvaluation.present_member_count} حاضر من{" "}
                      {latestEvaluation.required_member_count} مطلوب
                    </div>
                  )}
                  <ul className="max-h-64 overflow-y-auto rounded-md border border-border">
                    {attendanceMembers.map((m) => (
                      <li
                        key={m.membership_id}
                        className="flex items-center justify-between border-b border-border px-3 py-2 last:border-b-0"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{roleLabel(m.member_role)}</div>
                          <div className="text-xs text-muted-foreground">{m.user_id.slice(0, 8)}…</div>
                        </div>
                        {canRecord ? (
                          <Select
                            value={m.attendance_state}
                            onValueChange={(v) => {
                              setAttendanceMembers((prev) =>
                                prev.map((x) =>
                                  x.membership_id === m.membership_id ? { ...x, attendance_state: v } : x,
                                ),
                              );
                            }}
                            dir="rtl"
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent dir="rtl">
                              <SelectItem value="present">حاضر</SelectItem>
                              <SelectItem value="present_remote">حاضر عن بعد</SelectItem>
                              <SelectItem value="excused">معذور</SelectItem>
                              <SelectItem value="absent">غائب</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {m.attendance_state === "present"
                              ? "حاضر"
                              : m.attendance_state === "present_remote"
                                ? "حاضر عن بعد"
                                : m.attendance_state === "excused"
                                  ? "معذور"
                                  : m.attendance_state === "absent"
                                    ? "غائب"
                                    : "غير مسجل"}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  {canRecord && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={attendanceLoading}
                      onClick={() => void handleRecordAttendance()}
                    >
                      {attendanceLoading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      حفظ حالات الحضور
                    </Button>
                  )}
                  {canEvaluate && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={evaluateBusy}
                      onClick={() => void handleEvaluateQuorum()}
                    >
                      {evaluateBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                      تقييم النصاب
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-border p-4 text-center text-sm text-muted-foreground">
                  لا يوجد أعضاء مؤهلون للنصاب في هذا المجلس، لذا لا يمكن فتح سجل الحضور.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setAttendanceOpen(false)}>
              إغلاق
            </Button>
            {canFinalize && (
              <Button
                type="button"
                disabled={finalizeBusy || !latestEvaluation?.quorum_met}
                onClick={() => void handleFinalizeAttendance()}
              >
                {finalizeBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                اعتماد سجل الحضور والنصاب
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
