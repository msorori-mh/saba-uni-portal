import { useState, type ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { assessDiscussionReadiness, type DiscussionReadiness } from "../../lib/graduation-projects/domain";
import type { DiscussionOutcome } from "../../lib/graduation-projects/rpc";
import {
  READINESS_BLOCKER_LABELS,
  type AssignmentRow,
  type DiscussionRequestRow,
  type DiscussionRow,
  type LifecycleAction,
  type PanelMemberRow,
} from "../../lib/graduation-projects/lifecycle";

export interface DiscussionPanelProps {
  actions: LifecycleAction[];
  readiness: DiscussionReadiness;
  requests: DiscussionRequestRow[];
  discussions: DiscussionRow[];
  panelMembers: PanelMemberRow[];
  panelCandidates: AssignmentRow[];
  busy?: boolean;
  onRequestDiscussion(): void;
  onSchedule(requestId: string, startsAt: string, venue: string): void;
  onRejectRequest(requestId: string, reason: string): void;
  onAssignPanelMember(discussionId: string, assignmentId: string, chair: boolean): void;
  onRecordOutcome(discussionId: string, outcome: DiscussionOutcome): void;
}

const DISCUSSION_STATE_LABELS: Record<string, string> = {
  scheduled: "مجدولة",
  held: "منعقدة",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
};

export function DiscussionPanel({ actions, readiness, requests, discussions, panelMembers, panelCandidates, busy = false, onRequestDiscussion, onSchedule, onRejectRequest, onAssignPanelMember, onRecordOutcome }: DiscussionPanelProps) {
  const [startsAt, setStartsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [selectedPanelAssignment, setSelectedPanelAssignment] = useState("");
  const assessment = assessDiscussionReadiness(readiness);
  const pendingRequests = requests.filter((request) => request.state === "pending");
  const scheduledDiscussions = discussions.filter((discussion) => ["scheduled", "postponed"].includes(discussion.state));
  const canRequest = actions.includes("request_discussion");
  const canSchedule = actions.includes("schedule_discussion");
  const canReject = actions.includes("reject_discussion_request");
  const canAssignPanel = actions.includes("assign_panel_member");
  const canRecord = actions.includes("record_discussion_outcome");
  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>جاهزية المناقشة</CardTitle>
          <CardDescription>{assessment.ready ? "المشروع جاهز لطلب المناقشة." : "هناك متطلبات غير مكتملة."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {assessment.blockers.map((blocker) => (
            <p key={blocker} className="text-sm text-destructive">{READINESS_BLOCKER_LABELS[blocker] ?? blocker}</p>
          ))}
          {assessment.atRisk ? <Badge variant="destructive">المشروع متعثر</Badge> : null}
          {canRequest ? (
            <Button type="button" disabled={busy} onClick={onRequestDiscussion}>طلب مناقشة</Button>
          ) : null}
        </CardContent>
      </Card>
      {pendingRequests.length > 0 && (canSchedule || canReject) ? (
        <Card>
          <CardHeader><CardTitle>طلبات المناقشة المعلقة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((request) => (
              <div key={request.id} className="space-y-2 border-b pb-3">
                <p className="text-sm">طلب بتاريخ {request.requested_at}</p>
                {canSchedule ? (
                  <div className="grid gap-2">
                    <Label>موعد المناقشة</Label>
                    <Input value={startsAt} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setStartsAt(event.target.value)} placeholder="2026-09-01T10:00:00Z" dir="ltr" />
                    <Label>المكان</Label>
                    <Input value={venue} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVenue(event.target.value)} placeholder="قاعة المناقشات" />
                    <Button type="button" disabled={busy || startsAt.trim() === "" || venue.trim() === ""}
                      onClick={() => onSchedule(request.id, startsAt.trim(), venue.trim())}>
                      جدولة المناقشة
                    </Button>
                  </div>
                ) : null}
                {canReject ? (
                  <div className="grid gap-2">
                    <Textarea value={rejectReason} onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setRejectReason(event.target.value)} rows={2} placeholder="سبب الرفض" />
                    <Button type="button" variant="destructive" disabled={busy || rejectReason.trim() === ""}
                      onClick={() => onRejectRequest(request.id, rejectReason.trim())}>
                      رفض الطلب
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {scheduledDiscussions.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>المناقشات المجدولة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {scheduledDiscussions.map((discussion) => (
              <div key={discussion.id} className="space-y-2 border-b pb-3">
                <p className="text-sm">
                  {discussion.starts_at} — {discussion.venue} — {DISCUSSION_STATE_LABELS[discussion.state] ?? discussion.state}
                </p>
                <p className="text-sm text-muted-foreground">
                  أعضاء اللجنة: {panelMembers.filter((member) => member.discussion_id === discussion.id).length}
                </p>
                {canAssignPanel && discussion.state === "scheduled" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={selectedPanelAssignment}
                      onChange={(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setSelectedPanelAssignment(event.target.value)}
                      placeholder="معرّف تعيين عضو اللجنة"
                      dir="ltr"
                    />
                    <Button type="button" variant="secondary" disabled={busy || selectedPanelAssignment.trim() === ""}
                      onClick={() => onAssignPanelMember(discussion.id, selectedPanelAssignment.trim(), false)}>
                      تعيين عضو لجنة
                    </Button>
                  </div>
                ) : null}
                {canRecord ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" disabled={busy} onClick={() => onRecordOutcome(discussion.id, "held")}>انعقدت</Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => onRecordOutcome(discussion.id, "postponed")}>أُجّلت</Button>
                    <Button type="button" variant="destructive" disabled={busy} onClick={() => onRecordOutcome(discussion.id, "cancelled")}>أُلغيت</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {panelCandidates.length > 0 ? (
              <p className="text-sm text-muted-foreground">تعيينات اللجنة المتاحة: {panelCandidates.length}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
