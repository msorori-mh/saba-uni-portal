import type { ConfirmationStatus, ExecutionPolicy } from "@/lib/lecture-execution/domain";
import { CONFIRMATION_STATUS_AR } from "@/lib/lecture-execution/domain";

export interface PendingConfirmationRow {
  sessionId: string;
  courseLabel: string;
  weekNo: number;
  stateLabel: string;
  confirmationStatus: ConfirmationStatus;
}

export interface DelegateConfirmationProps {
  policy: ExecutionPolicy;
  delegateActive: boolean;
  pending: readonly PendingConfirmationRow[];
}

/**
 * Delegate (مندوب الدفعة/المستوى) confirmation card (presentational).
 * D-15 (اعتماد المندوبين) is pending: while the policy keeps delegate
 * confirmation disabled, the card explains that dual confirmation is
 * suspended instead of rendering actionable rows — fail closed by design.
 */
export function DelegateConfirmationCard({ policy, delegateActive, pending }: DelegateConfirmationProps) {
  return (
    <section aria-labelledby="delegate-confirmation-title" className="rounded-lg border p-4">
      <h3 id="delegate-confirmation-title" className="font-semibold">
        تأكيد المندوب لتنفيذ المحاضرات
      </h3>

      {!policy.delegateConfirmationEnabled ? (
        <p className="mt-2 text-amber-700" role="status">
          اعتماد المندوبين (D-15) ما يزال معلقاً؛ التأكيد المزدوج موقوف حتى
          تفعيله عبر قرار معتمد، وتبقى سجلات أعضاء هيئة التدريس نهائية مؤقتاً.
        </p>
      ) : !delegateActive ? (
        <p className="mt-2 text-amber-700" role="status">
          لا يوجد تعيين مندوب نشط مرتبط بهذا الحساب ضمن هذا النطاق.
        </p>
      ) : pending.length === 0 ? (
        <p className="mt-2 text-green-700" role="status">
          لا توجد سجلات بانتظار التأكيد.
        </p>
      ) : (
        <ul className="mt-3 space-y-2" aria-label="سجلات بانتظار تأكيد المندوب">
          {pending.map((row) => (
            <li key={row.sessionId} className="rounded border p-2 text-sm">
              <span className="font-medium">{row.courseLabel}</span>
              {" — الأسبوع "}
              {row.weekNo}
              {" — "}
              {row.stateLabel}
              <span className="block text-muted-foreground">
                {CONFIRMATION_STATUS_AR[row.confirmationStatus]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
