import type { ExecutionPolicy, ExecutionScope, ExecutionState } from "@/lib/lecture-execution/domain";
import {
  authorizeExecutionAction,
  EXECUTION_STATE_AR,
  EXECUTION_STATES,
  isValidExecutionTransition,
  SESSION_KIND_AR,
  TERMINAL_EXECUTION_STATES,
  type ExecutionAuthority,
  type SessionKind,
} from "@/lib/lecture-execution/domain";

export interface FacultyExecutionLogProps {
  authority: ExecutionAuthority | null;
  scope: ExecutionScope;
  policy: ExecutionPolicy;
  weekNo: number;
  kind: SessionKind;
  courseLabel: string;
  roomLabel?: string | null;
}

/**
 * Faculty-facing execution log card (presentational). It renders the current
 * execution state of one published-schedule slot/week and the transitions the
 * assigned faculty recorder is allowed to record. It performs no data
 * fetching and no client-side authorization decisions beyond display — the
 * locked RPC re-checks everything.
 */
export function FacultyExecutionLogCard({
  authority,
  scope,
  policy,
  weekNo,
  kind,
  courseLabel,
  roomLabel,
}: FacultyExecutionLogProps) {
  const canRecord = authorizeExecutionAction(authority, scope, "record", policy);
  const nextStates = EXECUTION_STATES.filter((state: ExecutionState) =>
    isValidExecutionTransition(scope.state, state),
  );
  const settled = TERMINAL_EXECUTION_STATES.has(scope.state);
  const resubmittable = canRecord && settled && scope.confirmationStatus === "rejected";

  return (
    <section aria-labelledby="faculty-execution-log-title" className="rounded-lg border p-4">
      <h3 id="faculty-execution-log-title" className="font-semibold">
        تسجيل تنفيذ المحاضرة
      </h3>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">المقرر:</dt>
          <dd>{courseLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">الأسبوع:</dt>
          <dd>{weekNo}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">نوع المحاضرة:</dt>
          <dd>{SESSION_KIND_AR[kind]}</dd>
        </div>
        {roomLabel ? (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">القاعة:</dt>
            <dd>{roomLabel}</dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="text-muted-foreground">الحالة الحالية:</dt>
          <dd>{EXECUTION_STATE_AR[scope.state]}</dd>
        </div>
      </dl>

      {canRecord && nextStates.length > 0 ? (
        <ul className="mt-3 list-disc ps-5" aria-label="الحالات المتاحة للتسجيل">
          {nextStates.map((state) => (
            <li key={state}>{EXECUTION_STATE_AR[state]}</li>
          ))}
        </ul>
      ) : resubmittable ? (
        <p className="mt-3 text-amber-700" role="status">
          رفض المندوب هذا التسجيل؛ يمكن إعادة تسجيل الحالة نفسها بعد التصحيح
          لفتح جولة تأكيد جديدة.
        </p>
      ) : (
        <p className="mt-3 text-amber-700" role="status">
          {settled
            ? "اكتملت دورة حالة هذه المحاضرة ولا تقبل تعديلاً."
            : "لا يملك الحساب الحالي تعييناً مباشراً لتسجيل هذه المحاضرة."}
        </p>
      )}
    </section>
  );
}
