import { Badge } from "@/components/ui/badge";
import { PROJECT_STATE_LABELS } from "../../lib/graduation-projects/lifecycle";
import type { ProjectState } from "../../lib/graduation-projects/domain";

export interface GraduationProjectStateBadgeProps {
  state: ProjectState;
  atRisk?: boolean;
}

const STATE_VARIANTS: Record<ProjectState, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  under_review: "secondary",
  revision_required: "destructive",
  approved: "default",
  active: "default",
  discussion_requested: "secondary",
  discussion_scheduled: "secondary",
  evaluating: "secondary",
  corrections_required: "destructive",
  completed: "default",
  archived: "outline",
  rejected: "destructive",
  cancelled: "outline",
};

export function GraduationProjectStateBadge({
  state,
  atRisk = false,
}: GraduationProjectStateBadgeProps) {
  return (
    <span dir="rtl" className="inline-flex items-center gap-1">
      <Badge variant={STATE_VARIANTS[state]}>{PROJECT_STATE_LABELS[state]}</Badge>
      {atRisk ? <Badge variant="destructive">متعثر</Badge> : null}
    </span>
  );
}
