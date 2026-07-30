import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  assessDiscussionReadiness,
  type DiscussionReadiness,
} from "../../lib/graduation-projects/domain";
import type {
  AssignableFacultyRole,
  CorrectionInput,
  DiscussionOutcome,
  MilestoneKind,
  ProposalReviewAction,
  ResultOutcome,
  SubmissionReviewAction,
} from "../../lib/graduation-projects/rpc";
import {
  EVENT_LABELS,
  availableProjectActions,
  resolveViewerEvaluation,
  type AssignmentCandidates,
  type EvaluationScoreRow,
  type GraduationProjectDetail,
} from "../../lib/graduation-projects/lifecycle";
import { GraduationProjectStateBadge } from "./GraduationProjectStateBadge";
import { ProposalWorkflowPanel } from "./ProposalWorkflowPanel";
import { MilestonesPanel, type RegisterFileFormInput } from "./MilestonesPanel";
import { AssignmentsPanel } from "./AssignmentsPanel";
import { DiscussionPanel } from "./DiscussionPanel";
import { EvaluationPanel } from "./EvaluationPanel";
import { ResultCorrectionsArchivePanel } from "./ResultCorrectionsArchivePanel";
import { formatGpDateTimeAr } from "./gp-datetime";

export interface GraduationProjectWorkspaceHandlers {
  onSubmitProposal(): void;
  onResubmitProposal(): void;
  onReviewProposal(action: ProposalReviewAction, reason: string | null): void;
  onAddTeamMember(studentProfileId: string): void;
  onAssignFaculty(role: AssignableFacultyRole, facultyProfileId: string): void;
  onEndAssignment(assignmentId: string): void;
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
  onRequestDiscussion(): void;
  onScheduleDiscussion(requestId: string, startsAt: string, venue: string): void;
  onRejectDiscussionRequest(requestId: string, reason: string): void;
  onAssignPanelMember(discussionId: string, assignmentId: string, chair: boolean): void;
  onRecordDiscussionOutcome(discussionId: string, outcome: DiscussionOutcome): void;
  onSaveEvaluation(
    discussionId: string,
    scores: EvaluationScoreRow[],
    comments: string | null,
    submit: boolean,
  ): void;
  onFinalizeEvaluation(evaluationId: string): void;
  onConcludeResult(outcome: ResultOutcome, corrections: CorrectionInput[]): void;
  onCompleteCorrection(correctionId: string): void;
  onAcceptCorrection(correctionId: string): void;
  onArchive(finalFileId: string): void;
}

export interface GraduationProjectWorkspaceProps {
  detail: GraduationProjectDetail;
  readiness: DiscussionReadiness;
  /**
   * auth user id of the current viewer. MEDIUM-1 (review 4982): the own-*
   * evaluation derivation is scoped to this viewer's assignments only.
   */
  viewerUserId: string;
  candidates?: AssignmentCandidates | null;
  busy?: boolean;
  handlers: GraduationProjectWorkspaceHandlers;
}

export function GraduationProjectWorkspace({
  detail,
  readiness,
  viewerUserId,
  candidates = null,
  busy = false,
  handlers,
}: GraduationProjectWorkspaceProps) {
  const { project } = detail;
  const actions = availableProjectActions(detail.viewer_roles, project.state);
  const readinessAssessment = assessDiscussionReadiness(readiness);
  const heldDiscussion =
    detail.discussions.find((discussion) => discussion.state === "held") ?? null;
  const panelCandidates = detail.assignments.filter(
    (assignment) => assignment.role === "panel_member" && assignment.active,
  );
  // MEDIUM-1 (review 4982): the own-evaluation derivation is scoped to the
  // viewer's own active panel_member assignments (resolveViewerEvaluation),
  // so another member's finalized evaluation can never be mistaken for the
  // viewer's. The full panelCandidates list above stays for DiscussionPanel.
  const ownEvaluation = resolveViewerEvaluation(detail, viewerUserId);
  return (
    <div dir="rtl" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{project.proposal_title}</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-2">
            <GraduationProjectStateBadge state={project.state} atRisk={project.at_risk} />
            <span>النسخة: {project.version}</span>
            <span>جاهزية المناقشة: {readinessAssessment.ready ? "جاهز" : "غير جاهز"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Progress value={project.progress_percent} />
          <p className="text-sm text-muted-foreground">التقدم: {project.progress_percent}%</p>
          {project.proposal_abstract ? (
            <p className="text-sm">{project.proposal_abstract}</p>
          ) : null}
        </CardContent>
      </Card>
      <ProposalWorkflowPanel
        project={project}
        actions={actions}
        busy={busy}
        onSubmitProposal={handlers.onSubmitProposal}
        onResubmitProposal={handlers.onResubmitProposal}
        onReview={handlers.onReviewProposal}
      />
      <Tabs defaultValue="milestones">
        <TabsList>
          <TabsTrigger value="milestones">المراحل</TabsTrigger>
          <TabsTrigger value="team">الفريق والتعيينات</TabsTrigger>
          <TabsTrigger value="discussion">المناقشة</TabsTrigger>
          <TabsTrigger value="evaluation">التقييم</TabsTrigger>
          <TabsTrigger value="result">النتيجة والأرشيف</TabsTrigger>
          <TabsTrigger value="events">السجل</TabsTrigger>
        </TabsList>
        <TabsContent value="milestones">
          <MilestonesPanel
            actions={actions}
            milestones={detail.milestones}
            submissions={detail.submissions}
            notes={detail.notes}
            files={detail.files}
            busy={busy}
            onSetMilestone={handlers.onSetMilestone}
            onSubmitDeliverable={handlers.onSubmitDeliverable}
            onReviewSubmission={handlers.onReviewSubmission}
            onAddNote={handlers.onAddNote}
            onResolveNote={handlers.onResolveNote}
            onRegisterFile={handlers.onRegisterFile}
          />
        </TabsContent>
        <TabsContent value="team">
          <AssignmentsPanel
            actions={actions}
            assignments={detail.assignments}
            candidates={candidates}
            busy={busy}
            onAddTeamMember={handlers.onAddTeamMember}
            onAssignFaculty={handlers.onAssignFaculty}
            onEndAssignment={handlers.onEndAssignment}
          />
        </TabsContent>
        <TabsContent value="discussion">
          <DiscussionPanel
            actions={actions}
            readiness={readiness}
            requests={detail.discussion_requests}
            discussions={detail.discussions}
            panelMembers={detail.panel_members}
            panelCandidates={panelCandidates}
            busy={busy}
            onRequestDiscussion={handlers.onRequestDiscussion}
            onSchedule={handlers.onScheduleDiscussion}
            onRejectRequest={handlers.onRejectDiscussionRequest}
            onAssignPanelMember={handlers.onAssignPanelMember}
            onRecordOutcome={handlers.onRecordDiscussionOutcome}
          />
        </TabsContent>
        <TabsContent value="evaluation">
          <EvaluationPanel
            actions={actions}
            discussionId={heldDiscussion?.id ?? null}
            evaluations={detail.evaluations}
            ownEvaluation={ownEvaluation}
            busy={busy}
            onSave={handlers.onSaveEvaluation}
            onFinalize={handlers.onFinalizeEvaluation}
          />
        </TabsContent>
        <TabsContent value="result">
          <ResultCorrectionsArchivePanel
            project={project}
            actions={actions}
            corrections={detail.corrections}
            files={detail.files}
            archive={detail.archive}
            busy={busy}
            onConclude={handlers.onConcludeResult}
            onCompleteCorrection={handlers.onCompleteCorrection}
            onAcceptCorrection={handlers.onAcceptCorrection}
            onArchive={handlers.onArchive}
          />
        </TabsContent>
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>سجل الأحداث</CardTitle>
              <CardDescription>سجل تدقيق للإضافة فقط.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {detail.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {EVENT_LABELS[event.event_type] ?? event.event_type}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {formatGpDateTimeAr(event.occurred_at)}
                    </span>
                    {event.reason ? <span className="text-sm">{event.reason}</span> : null}
                  </li>
                ))}
                {detail.events.length === 0 ? <li>لا توجد أحداث.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <Separator />
    </div>
  );
}
