import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { GraduationProjectWorkspace } from "./GraduationProjectWorkspace";
import {
  GraduationProjectsLoading,
  GraduationProjectsNetworkError,
  GraduationProjectsPermissionDenied,
  GraduationProjectsStatusBanner,
  GraduationProjectsUnavailable,
} from "./PortalRuntimeStates";
import { portalStateMessage } from "@/lib/graduation-projects/portal-privacy";
import {
  GRADUATION_PROJECTS_SERVICE_UPDATING_MSG,
  isGraduationProjectsRpcUnavailable,
} from "@/lib/graduation-projects/rpc";
import {
  acceptGraduationProjectCorrection,
  addGraduationProjectSupervisorNote,
  addGraduationProjectTeamMember,
  archiveGraduationProject,
  assignGraduationProjectFaculty,
  assignGraduationProjectPanelMember,
  completeGraduationProjectCorrection,
  concludeGraduationProjectResult,
  endGraduationProjectAssignment,
  finalizeGraduationProjectEvaluation,
  getGraduationProjectDetailView,
  listGraduationProjectAssignmentCandidates,
  recordGraduationProjectDiscussionOutcome,
  rejectGraduationProjectDiscussionRequest,
  requestGraduationProjectDiscussion,
  resolveGraduationProjectSupervisorNote,
  resubmitGraduationProjectProposal,
  reviewGraduationProjectProposal,
  reviewGraduationProjectSubmission,
  saveGraduationProjectEvaluation,
  scheduleGraduationProjectDiscussion,
  setGraduationProjectMilestone,
  submitGraduationProjectDeliverable,
  submitGraduationProjectProposal,
} from "@/lib/graduation-projects/portal.functions";
import type {
  AssignableFacultyRole,
  CorrectionInput,
  DiscussionOutcome,
  MilestoneKind,
  ProposalReviewAction,
  ResultOutcome,
  SubmissionReviewAction,
} from "@/lib/graduation-projects/rpc";
import type { EvaluationScoreRow } from "@/lib/graduation-projects/lifecycle";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "حدث خطأ غير متوقع";
}

function isUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { message?: string; unavailable?: boolean; code?: string };
  if (e.unavailable) return true;
  return (
    isGraduationProjectsRpcUnavailable(e) || e.message === GRADUATION_PROJECTS_SERVICE_UPDATING_MSG
  );
}

function isPermissionError(error: unknown): boolean {
  const msg = errorMessage(error);
  return /تعيين|صلاحية|exact direct|assignment required|not found|المشروع غير موجود/i.test(msg);
}

export function GraduationProjectPortalWorkspace({
  projectId,
  queryKeyPrefix,
}: {
  projectId: string;
  queryKeyPrefix: string;
}) {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const detailFn = useServerFn(getGraduationProjectDetailView);
  const candidatesFn = useServerFn(listGraduationProjectAssignmentCandidates);
  const addTeamMemberFn = useServerFn(addGraduationProjectTeamMember);
  const assignFacultyFn = useServerFn(assignGraduationProjectFaculty);
  const endAssignmentFn = useServerFn(endGraduationProjectAssignment);
  const setMilestoneFn = useServerFn(setGraduationProjectMilestone);
  const finalizeEvaluationFn = useServerFn(finalizeGraduationProjectEvaluation);
  const archiveProjectFn = useServerFn(archiveGraduationProject);
  const submitProposalFn = useServerFn(submitGraduationProjectProposal);
  const resubmitProposalFn = useServerFn(resubmitGraduationProjectProposal);
  const reviewProposalFn = useServerFn(reviewGraduationProjectProposal);
  const submitDeliverableFn = useServerFn(submitGraduationProjectDeliverable);
  const reviewSubmissionFn = useServerFn(reviewGraduationProjectSubmission);
  const addNoteFn = useServerFn(addGraduationProjectSupervisorNote);
  const resolveNoteFn = useServerFn(resolveGraduationProjectSupervisorNote);
  const requestDiscussionFn = useServerFn(requestGraduationProjectDiscussion);
  const scheduleDiscussionFn = useServerFn(scheduleGraduationProjectDiscussion);
  const rejectDiscussionFn = useServerFn(rejectGraduationProjectDiscussionRequest);
  const assignPanelFn = useServerFn(assignGraduationProjectPanelMember);
  const recordOutcomeFn = useServerFn(recordGraduationProjectDiscussionOutcome);
  const saveEvaluationFn = useServerFn(saveGraduationProjectEvaluation);
  const concludeFn = useServerFn(concludeGraduationProjectResult);
  const completeCorrectionFn = useServerFn(completeGraduationProjectCorrection);
  const acceptCorrectionFn = useServerFn(acceptGraduationProjectCorrection);

  const detailQuery = useQuery({
    queryKey: [queryKeyPrefix, "detail", projectId],
    queryFn: () => detailFn({ data: { projectId } }),
    retry: 1,
  });

  const candidatesQuery = useQuery({
    queryKey: [queryKeyPrefix, "candidates", projectId],
    queryFn: () => candidatesFn({ data: { projectId } }),
    enabled: detailQuery.isSuccess,
    retry: 1,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [queryKeyPrefix] });
  };

  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onMutate: () => setActionError(null),
    onSuccess: async () => {
      await refresh();
    },
    onError: (error) => {
      setActionError(errorMessage(error));
    },
  });

  if (detailQuery.isLoading) return <GraduationProjectsLoading />;
  if (detailQuery.isError) {
    const err = detailQuery.error;
    if (isUnavailableError(err)) {
      return <GraduationProjectsUnavailable message={errorMessage(err)} />;
    }
    if (isPermissionError(err)) {
      return <GraduationProjectsPermissionDenied message={errorMessage(err)} />;
    }
    return <GraduationProjectsNetworkError message={errorMessage(err)} />;
  }

  const view = detailQuery.data;
  if (!view) return <GraduationProjectsEmptyLike />;

  const { detail, readiness, viewerUserId } = view;
  const version = detail.project.version;
  const busy = action.isPending || detailQuery.isFetching;

  return (
    <div dir="rtl" className="space-y-3">
      <GraduationProjectsStatusBanner message={portalStateMessage(detail.project.state)} />
      {actionError ? (
        <div
          data-testid="gp-action-error"
          className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </div>
      ) : null}
      <GraduationProjectWorkspace
        detail={detail}
        readiness={readiness}
        viewerUserId={viewerUserId}
        candidates={candidatesQuery.data ?? null}
        busy={busy}
        handlers={{
          onAddTeamMember: (studentProfileId: string) =>
            action.mutate(() => addTeamMemberFn({ data: { projectId, studentProfileId } })),
          onAssignFaculty: (role: AssignableFacultyRole, facultyProfileId: string) =>
            action.mutate(() => assignFacultyFn({ data: { projectId, role, facultyProfileId } })),
          onEndAssignment: (assignmentId: string) =>
            action.mutate(() => endAssignmentFn({ data: { projectId, assignmentId } })),
          onSetMilestone: (title: string, kind: MilestoneKind, sequence: number, weight: number) =>
            action.mutate(() =>
              setMilestoneFn({ data: { projectId, title, kind, sequence, weight } }),
            ),
          onFinalizeEvaluation: (evaluationId: string) =>
            action.mutate(() => finalizeEvaluationFn({ data: { evaluationId } })),
          onArchive: (finalFileId: string) =>
            action.mutate(() =>
              archiveProjectFn({ data: { projectId, finalFileId, expectedVersion: version } }),
            ),
          onSubmitProposal: () =>
            action.mutate(() =>
              submitProposalFn({ data: { projectId, expectedVersion: version } }),
            ),
          onResubmitProposal: () =>
            action.mutate(() =>
              resubmitProposalFn({ data: { projectId, expectedVersion: version } }),
            ),
          onReviewProposal: (reviewAction: ProposalReviewAction, reason: string | null) =>
            action.mutate(() =>
              reviewProposalFn({
                data: { projectId, action: reviewAction, reason, expectedVersion: version },
              }),
            ),
          onSubmitDeliverable: (milestoneId: string, summary: string) =>
            action.mutate(() => submitDeliverableFn({ data: { projectId, milestoneId, summary } })),
          onReviewSubmission: (
            submissionId: string,
            reviewAction: SubmissionReviewAction,
            note: string | null,
          ) =>
            action.mutate(() =>
              reviewSubmissionFn({
                data: { projectId, submissionId, action: reviewAction, note },
              }),
            ),
          onAddNote: (note: string, submissionId: string | null) =>
            action.mutate(() => addNoteFn({ data: { projectId, note, submissionId } })),
          onResolveNote: (noteId: string) =>
            action.mutate(() => resolveNoteFn({ data: { projectId, noteId } })),
          onRequestDiscussion: () =>
            action.mutate(() => requestDiscussionFn({ data: { projectId } })),
          onScheduleDiscussion: (requestId: string, startsAt: string, venue: string) =>
            action.mutate(() =>
              scheduleDiscussionFn({ data: { projectId, requestId, startsAt, venue } }),
            ),
          onRejectDiscussionRequest: (requestId: string, reason: string) =>
            action.mutate(() => rejectDiscussionFn({ data: { projectId, requestId, reason } })),
          onAssignPanelMember: (discussionId: string, assignmentId: string, chair: boolean) =>
            action.mutate(() =>
              assignPanelFn({ data: { projectId, discussionId, assignmentId, chair } }),
            ),
          onRecordDiscussionOutcome: (discussionId: string, outcome: DiscussionOutcome) =>
            action.mutate(() => recordOutcomeFn({ data: { projectId, discussionId, outcome } })),
          onSaveEvaluation: (
            discussionId: string,
            scores: EvaluationScoreRow[],
            comments: string | null,
            submit: boolean,
          ) =>
            action.mutate(() =>
              saveEvaluationFn({
                data: {
                  projectId,
                  discussionId,
                  scores,
                  comments,
                  submit,
                  rubricVersion: "v1",
                },
              }),
            ),
          onConcludeResult: (outcome: ResultOutcome, corrections: CorrectionInput[]) =>
            action.mutate(() =>
              concludeFn({
                data: {
                  projectId,
                  outcome,
                  corrections,
                  expectedVersion: version,
                },
              }),
            ),
          onCompleteCorrection: (correctionId: string) =>
            action.mutate(() => completeCorrectionFn({ data: { projectId, correctionId } })),
          onAcceptCorrection: (correctionId: string) =>
            action.mutate(() => acceptCorrectionFn({ data: { projectId, correctionId } })),
        }}
      />
    </div>
  );
}

function GraduationProjectsEmptyLike() {
  return <GraduationProjectsPermissionDenied message="تعذّر تحميل تفاصيل المشروع." />;
}
