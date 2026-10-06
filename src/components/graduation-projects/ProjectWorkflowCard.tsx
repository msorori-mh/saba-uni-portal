import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MvpError } from "@/components/graduation-projects/MvpStates";
import {
  addTeamMember,
  describeWorkflowStage,
  fetchProjectWorkflowStatus,
  fetchTeamCandidates,
  headWorkflowKeys,
  submitTeamForApproval,
  supervisorReviewProposal,
} from "@/lib/graduation-projects/head-workflow";

/**
 * Team → head approval → supervisor endorsement strip shown above the project
 * workspace. Offers only the step that belongs to the viewer; every step is
 * authorised again by its RPC. Renders nothing until the workflow is deployed.
 */
export function ProjectWorkflowCard({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [candidate, setCandidate] = useState("");
  const [reason, setReason] = useState("");

  const status = useQuery({
    queryKey: headWorkflowKeys.workflowStatus(projectId),
    queryFn: () => fetchProjectWorkflowStatus(projectId),
    retry: false,
  });
  const data = status.data;
  const leaderForming =
    Boolean(data?.viewer.is_leader) &&
    data?.lifecycle_state === "draft" &&
    !data?.team_approved_at &&
    !data?.team_submitted_at;
  const candidates = useQuery({
    queryKey: headWorkflowKeys.teamCandidates(projectId),
    queryFn: () => fetchTeamCandidates(projectId),
    enabled: leaderForming,
    retry: false,
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["graduation-projects"] });
  };
  const add = useMutation({
    mutationFn: (studentProfileId: string) => addTeamMember(projectId, studentProfileId),
    onSuccess: async () => {
      setCandidate("");
      await refresh();
    },
  });
  const submitTeam = useMutation({
    mutationFn: (version: number) => submitTeamForApproval(projectId, version),
    onSuccess: refresh,
  });
  const review = useMutation({
    mutationFn: (input: { version: number; action: "endorse" | "return" }) =>
      supervisorReviewProposal(
        projectId,
        input.version,
        input.action,
        input.action === "return" ? reason.trim() : null,
      ),
    onSuccess: async () => {
      setReason("");
      await refresh();
    },
  });

  if (!data) return null;

  const busy = add.isPending || submitTeam.isPending || review.isPending;
  const error = add.error ?? submitTeam.error ?? review.error ?? candidates.error;
  const supervisorTurn =
    data.viewer.is_supervisor &&
    data.lifecycle_state === "submitted" &&
    !data.proposal_supervisor_endorsed_at;

  return (
    <Card dir="rtl" data-testid="gp-project-workflow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          <span>الفريق والإشراف</span>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
            {describeWorkflowStage(data)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">أعضاء الفريق</p>
            <ul className="space-y-0.5">
              {data.members.map((m) => (
                <li key={`${m.academic_number}-${m.full_name_ar}`}>
                  {m.full_name_ar ?? "—"}
                  {m.academic_number ? (
                    <span className="text-muted-foreground"> ({m.academic_number})</span>
                  ) : null}
                  {m.is_leader ? (
                    <span className="text-xs font-bold text-primary"> · القائد</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">المشرف</p>
            <p>{data.supervisor_name ?? "يسنده رئيس القسم عند اعتماد الفريق"}</p>
            {data.coordinator_name ? (
              <p className="mt-1 text-xs text-muted-foreground">
                جهة الاعتماد: {data.coordinator_name}
              </p>
            ) : null}
          </div>
        </div>

        {leaderForming ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <label className="block text-xs font-bold" htmlFor={`cand-${projectId}`}>
              إضافة زميل من برنامجك
            </label>
            <div className="flex flex-wrap gap-2">
              <select
                id={`cand-${projectId}`}
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={candidate}
                onChange={(e) => setCandidate(e.target.value)}
                disabled={busy}
              >
                <option value="">
                  {candidates.data?.length
                    ? "اختر طالبًا"
                    : "لا يوجد طلاب متاحون للإضافة حاليًا"}
                </option>
                {(candidates.data ?? []).map((c) => (
                  <option key={c.student_profile_id} value={c.student_profile_id}>
                    {c.full_name_ar ?? "—"}
                    {c.academic_number ? ` (${c.academic_number})` : ""}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !candidate}
                onClick={() => add.mutate(candidate)}
              >
                إضافة
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              يظهر هنا طلاب المستوى الرابع في برنامجك الذين لهم حساب في البوابة وليسوا في فريق
              آخر. بعد إرسال الفريق لا يمكنك تعديله.
            </p>
            <Button size="sm" disabled={busy} onClick={() => submitTeam.mutate(data.version)}>
              إرسال الفريق لاعتماد رئيس القسم
            </Button>
          </div>
        ) : null}

        {data.viewer.is_leader && data.team_submitted_at && !data.team_approved_at ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            أُرسل الفريق إلى رئيس القسم. ستتمكن من تقديم المقترح بعد اعتماد الفريق وإسناد المشرف.
          </p>
        ) : null}

        {supervisorTurn ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs font-bold">مراجعة المشرف لمقترح المشروع</p>
            <p className="text-xs text-muted-foreground">
              بعد موافقتك ينتقل المقترح إلى جهة الاعتماد. إعادته تفتحه للفريق للتعديل.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => review.mutate({ version: data.version, action: "endorse" })}
              >
                الموافقة على المقترح
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="ملاحظات الإعادة للفريق"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={busy}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !reason.trim()}
                onClick={() => review.mutate({ version: data.version, action: "return" })}
              >
                إعادة للتعديل
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <MvpError message={error.message} /> : null}
      </CardContent>
    </Card>
  );
}
