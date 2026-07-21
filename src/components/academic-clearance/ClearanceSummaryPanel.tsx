import {
  canFinalizeDepartmentTransfer,
  CLEARANCE_STATUS_LABELS,
  type ClearanceStatus,
} from "@/lib/academic-clearance";
import { ClearanceStatusBadge } from "./ClearanceStatusBadge";

// Staff-facing summary of one clearance case. The transfer-finalization gate
// line is the UI mirror of assert_department_transfer_clearance_approved:
// no transfer completion before a final, documented clearance approval.
export function ClearanceSummaryPanel(props: {
  status: ClearanceStatus;
  targetPlanCredits: number;
  acceptedCredits: number;
  remainingCredits: number;
  proposedLevel: number | null;
  unresolvedCount: number;
  canSubmitDepartmentDecision: boolean;
}) {
  const transferable = canFinalizeDepartmentTransfer(props.status);
  return (
    <section
      dir="rtl"
      className="space-y-3 rounded-lg border p-4"
      aria-label="ملخص المقاصة الأكاديمية"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold">ملخص المقاصة</h2>
        <ClearanceStatusBadge status={props.status} />
      </header>
      <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
        <div>
          <dt className="text-muted-foreground">ساعات الخطة المستهدفة</dt>
          <dd>{props.targetPlanCredits}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">الساعات المعتمدة</dt>
          <dd>{props.acceptedCredits}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">الساعات المتبقية</dt>
          <dd>{props.remainingCredits}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">المستوى المقترح</dt>
          <dd>{props.proposedLevel ?? "اكتملت مقررات الخطة الإلزامية"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">قرارات غير محسومة</dt>
          <dd>{props.unresolvedCount}</dd>
        </div>
      </dl>
      <p className="text-sm" data-testid="clearance-submit-readiness">
        {props.canSubmitDepartmentDecision
          ? "المقارنة مكتملة ويمكن إرسالها إلى الشؤون الأكاديمية."
          : "لا يمكن الإرسال قبل حسم جميع المقررات وتعبئة المسوغات."}
      </p>
      <p className="text-sm font-medium" role="status" data-testid="clearance-transfer-gate">
        {transferable
          ? "المقاصة معتمدة — يجوز إتمام التحويل."
          : `لا يمكن إتمام التحويل قبل اعتماد المقاصة (الحالة الحالية: ${CLEARANCE_STATUS_LABELS[props.status]}).`}
      </p>
    </section>
  );
}
