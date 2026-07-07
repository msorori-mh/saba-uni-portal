import { useMemo } from "react";
import {
  AlertCircle,
  Archive,
  Banknote,
  CheckCircle2,
  FileOutput,
  GitBranch,
  Info,
  Loader2,
} from "lucide-react";
import type {
  DraftWorkflowStep,
  DraftWorkflowTransition,
} from "@/lib/admin-request-workflow-rpc";
import {
  getCanonicalWorkflowPreview,
  getPreviewStepActorLabel,
  hasCanonicalWorkflowPreview,
  buildStaffInboxWorkflowStepsFromPreview,
  WORKFLOW_SCHEMA_UNAVAILABLE_MSG,
  type CanonicalWorkflowStepDef,
} from "@/lib/student-requests/request-workflow-preview-registry";
import {
  summarizeValidationResult,
  validateDraftWorkflowAgainstCanonical,
  type WorkflowValidationIssue,
} from "@/lib/student-requests/request-workflow-validation";
import { StaffRequestWorkflowTimeline } from "@/components/student-requests/StaffRequestWorkflowTimeline";
import type { StaffRequestWorkflowStep } from "@/lib/student-requests/staff-inbox-ui";

type Props = {
  requestTypeCode: string;
  draftSteps?: DraftWorkflowStep[];
  draftTransitions?: DraftWorkflowTransition[];
  showValidation?: boolean;
  loading?: boolean;
  /** When workflow schema/RPC unavailable — static preview still shown. */
  schemaUnavailable?: boolean;
};

function issueIcon(severity: WorkflowValidationIssue["severity"]) {
  switch (severity) {
    case "error":
      return <AlertCircle className="h-3.5 w-3.5 text-rose-600 shrink-0" />;
    case "warning":
      return <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    default:
      return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function issueRowClass(severity: WorkflowValidationIssue["severity"]): string {
  switch (severity) {
    case "error":
      return "border-rose-200 bg-rose-50/80 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100";
    case "warning":
      return "border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function StepBadges({ step }: { step: CanonicalWorkflowStepDef }) {
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {step.requiresFee && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
          <Banknote className="h-3 w-3" /> رسوم
        </span>
      )}
      {step.issuesDocument && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">
          <FileOutput className="h-3 w-3" /> مستند
        </span>
      )}
      {step.isArchiveStep && (
        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 text-zinc-800">
          <Archive className="h-3 w-3" /> أرشفة
        </span>
      )}
      {step.isParallel && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-dashed">
          بالتوازي{step.parallelGroupId ? ` (${step.parallelGroupId})` : ""}
        </span>
      )}
      {step.isCentralSignatory && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800">
          جهة مركزية
        </span>
      )}
    </div>
  );
}

function groupStepsForDisplay(steps: readonly CanonicalWorkflowStepDef[]) {
  const groups: Array<
    | { kind: "sequential"; step: CanonicalWorkflowStepDef; index: number }
    | { kind: "parallel"; groupId: string; steps: CanonicalWorkflowStepDef[]; index: number }
  > = [];
  let i = 0;
  let seqNum = 0;
  while (i < steps.length) {
    const step = steps[i];
    if (step.isParallel && step.parallelGroupId) {
      const gid = step.parallelGroupId;
      const parallel: CanonicalWorkflowStepDef[] = [];
      while (i < steps.length && steps[i].parallelGroupId === gid) {
        parallel.push(steps[i]);
        i += 1;
      }
      seqNum += 1;
      groups.push({ kind: "parallel", groupId: gid, steps: parallel, index: seqNum });
    } else {
      seqNum += 1;
      groups.push({ kind: "sequential", step, index: seqNum });
      i += 1;
    }
  }
  return groups;
}

export function RequestWorkflowPreview({
  requestTypeCode,
  draftSteps = [],
  draftTransitions = [],
  showValidation = true,
  loading = false,
  schemaUnavailable = false,
}: Props) {
  const preview = useMemo(
    () => getCanonicalWorkflowPreview(requestTypeCode),
    [requestTypeCode],
  );

  const timelineSteps = useMemo((): StaffRequestWorkflowStep[] => {
    const steps = buildStaffInboxWorkflowStepsFromPreview(requestTypeCode);
    return steps.map((s) => ({ ...s, status: "expected" as const, isPreview: true }));
  }, [requestTypeCode]);

  const validation = useMemo(
    () => (showValidation
      ? validateDraftWorkflowAgainstCanonical(requestTypeCode, draftSteps, draftTransitions)
      : null),
    [showValidation, requestTypeCode, draftSteps, draftTransitions],
  );

  const stepGroups = useMemo(
    () => (preview ? groupStepsForDisplay(preview.steps) : []),
    [preview],
  );

  if (loading) {
    return (
      <div className="grid place-items-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!hasCanonicalWorkflowPreview(requestTypeCode)) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
        لا يوجد مسار مرجعي معتمد في المواصفة لهذا النوع. المعاينة والتحقق متاحان للأنواع
        الثمانية الرسمية فقط.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {schemaUnavailable && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-100">
          {WORKFLOW_SCHEMA_UNAVAILABLE_MSG}
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <GitBranch className="h-4 w-4 text-gold" />
              المسار المرجعي المعتمد (معاينة ثابتة)
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {preview?.requestTypeNameAr} — مواصفة §6 — ليس runtime ولا seed.
            </p>
          </div>
          <span className="text-[10px] font-bold px-2 py-1 rounded bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-100">
            PREVIEW ONLY
          </span>
        </div>

        <StaffRequestWorkflowTimeline steps={timelineSteps} isPreview />

        {preview && preview.specNotesAr.length > 0 && (
          <ul className="text-[11px] text-muted-foreground space-y-1 border-t pt-2">
            {preview.specNotesAr.map((note) => (
              <li key={note} className="flex items-start gap-1.5">
                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                {note}
              </li>
            ))}
          </ul>
        )}

        {stepGroups.length > 0 && (
          <div className="rounded border bg-muted/20 p-3 space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground">تفاصيل الخطوات</div>
            {stepGroups.map((group) =>
              group.kind === "parallel" ? (
                <div
                  key={`parallel-${group.groupId}`}
                  className="rounded border border-dashed border-primary/30 bg-background/60 p-2.5"
                >
                  <div className="text-xs font-bold text-primary mb-2">
                    {group.index}. بوابة توازي — {group.groupId}
                  </div>
                  <ul className="space-y-2 ps-2 border-r-2 border-primary/20">
                    {group.steps.map((step) => (
                      <li key={step.key} className="text-xs">
                        <span className="font-semibold">{step.labelAr}</span>
                        <span className="text-muted-foreground"> — {getPreviewStepActorLabel(step)}</span>
                        <StepBadges step={step} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div key={group.step.key} className="text-xs border-b border-border/50 pb-2 last:border-0">
                  <div className="flex flex-wrap gap-x-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{group.index}.</span>
                    <span className="font-semibold">{group.step.labelAr}</span>
                    <span className="text-muted-foreground">— {getPreviewStepActorLabel(group.step)}</span>
                  </div>
                  <StepBadges step={group.step} />
                  {group.step.notesAr && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{group.step.notesAr}</p>
                  )}
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {showValidation && validation && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            {validation.valid ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            )}
            <div>
              <div className="text-sm font-bold text-primary">التحقق من المسودة مقابل المرجع</div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {summarizeValidationResult(validation)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-[10px]">
            <span className="rounded border px-2 py-0.5 bg-background">
              خطوات مرجعية: {validation.canonicalStepCount}
            </span>
            <span className="rounded border px-2 py-0.5 bg-background">
              خطوات المسودة: {validation.draftStepCount}
            </span>
            <span className="rounded border px-2 py-0.5 bg-background">
              متطابقة: {validation.matchedStepCount}
            </span>
          </div>

          {validation.issues.length > 0 ? (
            <ul className="space-y-1.5 max-h-64 overflow-y-auto">
              {validation.issues.map((issue, i) => (
                <li
                  key={`${issue.code}-${issue.stepKey ?? i}`}
                  className={`flex items-start gap-2 rounded border px-2.5 py-2 text-xs ${issueRowClass(issue.severity)}`}
                >
                  {issueIcon(issue.severity)}
                  <span>{issue.messageAr}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground border border-dashed rounded p-2 text-center">
              لا توجد ملاحظات — المسودة فارغة أو مطابقة بالكامل.
            </p>
          )}

          <p className="text-[10px] text-muted-foreground border-t pt-2">
            {WORKFLOW_SCHEMA_UNAVAILABLE_MSG}
          </p>
        </div>
      )}
    </div>
  );
}
