import {
  CLEARANCE_APPROVAL_DECISION_LABELS,
  CLEARANCE_APPROVAL_STAGE_LABELS,
  type ClearanceApprovalDecision,
  type ClearanceApprovalStage,
} from "@/lib/academic-clearance";

export interface ClearanceApprovalEntry {
  id: string;
  stage: ClearanceApprovalStage;
  decision: ClearanceApprovalDecision;
  rationale: string;
  createdAt: string;
}

// Read-only approvals provenance (append-only in SQL; ordered by creation).
export function ClearanceApprovalsTimeline(props: {
  entries: readonly ClearanceApprovalEntry[];
}) {
  const ordered = [...props.entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section dir="rtl" className="space-y-3 rounded-lg border p-4" aria-label="سجل الاعتمادات">
      <h2 className="text-base font-semibold">سجل الاعتمادات</h2>
      <ol className="space-y-2 text-sm">
        {ordered.map((entry) => (
          <li key={entry.id} className="rounded-md border p-2">
            <p className="font-medium">
              {CLEARANCE_APPROVAL_STAGE_LABELS[entry.stage]} —{" "}
              {CLEARANCE_APPROVAL_DECISION_LABELS[entry.decision]}
            </p>
            <p className="text-muted-foreground">{entry.rationale}</p>
            <p className="text-xs text-muted-foreground">{entry.createdAt}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
