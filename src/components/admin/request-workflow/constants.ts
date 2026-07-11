import type { WorkflowActionType, WorkflowStatus } from "@/lib/admin-request-workflow-rpc";

export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  draft: "مسودة",
  active: "نشط",
  retired: "مُوقوف",
};

export const ACTION_TYPE_OPTIONS: { value: WorkflowActionType; label: string }[] = [
  { value: "review", label: "مراجعة" },
  { value: "approve", label: "موافقة" },
  { value: "reject", label: "رفض" },
  { value: "return_to_student", label: "إرجاع للطالب" },
  { value: "request_attachment", label: "طلب مرفق" },
  { value: "request_payment", label: "طلب دفع" },
  { value: "assess_fee", label: "تقييم رسوم" },
  { value: "confirm_payment", label: "تأكيد دفع" },
  { value: "sign", label: "توقيع" },
  { value: "archive", label: "أرشفة" },
  { value: "issue_document", label: "إصدار وثيقة" },
  { value: "complete", label: "إكمال" },
];

export const ACTION_RESULT_LABEL: Record<string, string> = {
  submit: "إرسال",
  approve: "موافقة",
  reject: "رفض",
  return: "إرجاع",
  request_attachment: "طلب مرفق",
  request_payment: "طلب دفع",
  fee_not_required: "لا رسوم",
  payment_required: "رسوم مطلوبة",
  payment_confirmed: "تم الدفع",
  signed: "موقّع",
  issued: "صادر",
  archived: "مؤرشف",
  skip: "تخطي",
  complete: "إكمال",
  cancel: "إلغاء",
};

export function actionTypeLabel(value: string): string {
  return ACTION_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
