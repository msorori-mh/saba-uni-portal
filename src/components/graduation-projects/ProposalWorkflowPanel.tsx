import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ProposalReviewAction } from "../../lib/graduation-projects/rpc";
import type { LifecycleAction, ProjectDetailProject } from "../../lib/graduation-projects/lifecycle";

export interface ProposalWorkflowPanelProps {
  project: ProjectDetailProject;
  actions: LifecycleAction[];
  busy?: boolean;
  onSubmitProposal(): void;
  onResubmitProposal(): void;
  onReview(action: ProposalReviewAction, reason: string | null): void;
}

const REVIEW_BUTTONS: Array<{
  action: ProposalReviewAction;
  lifecycleAction: LifecycleAction;
  label: string;
  variant: "default" | "secondary" | "destructive";
  needsReason: boolean;
}> = [
  { action: "start_review", lifecycleAction: "start_review", label: "بدء المراجعة", variant: "secondary", needsReason: false },
  { action: "approve", lifecycleAction: "approve_proposal", label: "اعتماد المقترح", variant: "default", needsReason: false },
  { action: "require_revision", lifecycleAction: "require_revision", label: "طلب تعديل", variant: "secondary", needsReason: true },
  { action: "reject", lifecycleAction: "reject_proposal", label: "رفض المقترح", variant: "destructive", needsReason: true },
];

export function ProposalWorkflowPanel({ project, actions, busy = false, onSubmitProposal, onResubmitProposal, onReview }: ProposalWorkflowPanelProps) {
  const [reason, setReason] = useState("");
  const canSubmit = actions.includes("submit_proposal");
  const canResubmit = actions.includes("resubmit_proposal");
  const reviewButtons = REVIEW_BUTTONS.filter((button) => actions.includes(button.lifecycleAction));
  if (!canSubmit && !canResubmit && reviewButtons.length === 0) return null;
  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle>مسار المقترح</CardTitle>
        <CardDescription>النسخة الحالية: {project.version} — تُمرَّر كل القرارات عبر خدمات معتمدة فقط.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canSubmit ? (
          <Button type="button" disabled={busy} onClick={onSubmitProposal}>تقديم المقترح</Button>
        ) : null}
        {canResubmit ? (
          <Button type="button" disabled={busy} onClick={onResubmitProposal}>إعادة تقديم المقترح</Button>
        ) : null}
        {reviewButtons.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="gp-review-reason">سبب القرار (مطلوب للرفض وطلب التعديل)</Label>
              <Textarea
                id="gp-review-reason"
                value={reason}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setReason(event.target.value)}
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {reviewButtons.map((button) => (
                <Button
                  key={button.action}
                  type="button"
                  variant={button.variant}
                  disabled={busy || (button.needsReason && reason.trim() === "")}
                  onClick={() => onReview(button.action, reason.trim() === "" ? null : reason.trim())}
                >
                  {button.label}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
